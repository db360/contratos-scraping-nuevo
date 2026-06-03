import fs from "fs/promises";
import path from "path";
import { upsertContracts } from "../repositories/contractsRepository.js";
import type { ContractRecord, SourceType } from "../types.js";

interface RawHistoricalRecord {
  expediente?: unknown;
  tipo?: unknown;
  objeto?: unknown;
  estado?: unknown;
  fecha?: unknown;
  importe?: unknown;
  adjudicatario?: unknown;
  fechas?: unknown;
}

interface ImportSummary {
  baseDir: string;
  filesProcessed: number;
  fetchedCount: number;
  storedCount: number;
  byType: Record<SourceType, number>;
}

function toCleanString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const clean = value.trim();
  return clean ? clean : null;
}

function toImporte(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== "string") {
    return null;
  }

  const clean = value
    .replace(/EUR|€/gi, "")
    .replace(/\s+/g, "")
    .replace(/[^\d,.-]/g, "")
    .trim();

  if (!clean || !/\d/.test(clean)) {
    return null;
  }

  const lastComma = clean.lastIndexOf(",");
  const lastDot = clean.lastIndexOf(".");

  let decimalSeparator: "," | "." | null = null;
  if (lastComma >= 0 && lastDot >= 0) {
    decimalSeparator = lastComma > lastDot ? "," : ".";
  } else {
    const separator = lastComma >= 0 ? "," : lastDot >= 0 ? "." : null;
    if (separator) {
      const escapedSeparator = separator === "." ? /\./g : /,/g;
      const occurrences = (clean.match(escapedSeparator) || []).length;
      const idx = separator === "," ? lastComma : lastDot;
      const digitsAfter = clean.length - idx - 1;

      if (occurrences === 1 && digitsAfter > 0 && digitsAfter <= 2) {
        decimalSeparator = separator;
      }
    }
  }

  let normalized = clean;
  if (decimalSeparator) {
    const thousandSeparator = decimalSeparator === "," ? /\./g : /,/g;
    normalized = normalized.replace(thousandSeparator, "");
    if (decimalSeparator === ",") {
      normalized = normalized.replace(",", ".");
    }
  } else {
    normalized = normalized.replace(/[.,]/g, "");
  }

  normalized = normalized.replace(/(?!^)-/g, "");

  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : null;
}

function normalizeRow(
  row: RawHistoricalRecord,
  sourceType: SourceType
): ContractRecord | null {
  const expediente = toCleanString(row.expediente);
  if (!expediente) {
    return null;
  }

  if (sourceType === "contrato_menor") {
    const fecha = toCleanString(row.fecha)?.replace(/^Adjudicación:\s*/i, "") || null;

    return {
      sourceType,
      expediente,
      contractType: toCleanString(row.tipo),
      objeto: toCleanString(row.objeto),
      estado: toCleanString(row.estado),
      fechaReferencia: fecha,
      importe: toImporte(row.importe),
      adjudicatario: toCleanString(row.adjudicatario),
      fechas: null,
      sourceUrl: null,
      rawPayload: row,
    };
  }

  return {
    sourceType,
    expediente,
    contractType: toCleanString(row.tipo),
    objeto: toCleanString(row.objeto),
    estado: toCleanString(row.estado),
    fechaReferencia: null,
    importe: toImporte(row.importe),
    adjudicatario: null,
    fechas: toCleanString(row.fechas),
    sourceUrl: null,
    rawPayload: row,
  };
}

async function readContractsFromFile(filePath: string, sourceType: SourceType): Promise<ContractRecord[]> {
  const content = await fs.readFile(filePath, "utf8");
  const rows = JSON.parse(content) as RawHistoricalRecord[];
  if (!Array.isArray(rows)) {
    return [];
  }

  return rows
    .map((row) => normalizeRow(row, sourceType))
    .filter((row): row is ContractRecord => Boolean(row));
}

function detectSourceType(fileName: string): SourceType | null {
  if (fileName.endsWith("_contratos_menores.json")) {
    return "contrato_menor";
  }

  if (fileName.endsWith("_licitaciones.json")) {
    return "licitacion";
  }

  return null;
}

export async function importHistoricalData(baseDir?: string): Promise<ImportSummary> {
  const inputDir = baseDir || process.env.HISTORICAL_DATA_DIR || path.resolve(process.cwd(), "../../nuevos_datos");
  const entries = await fs.readdir(inputDir, { withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile() && entry.name.endsWith(".json"));

  let filesProcessed = 0;
  let fetchedCount = 0;
  let storedCount = 0;
  const byType: Record<SourceType, number> = {
    contrato_menor: 0,
    licitacion: 0,
  };

  for (const file of files) {
    const sourceType = detectSourceType(file.name);
    if (!sourceType) {
      continue;
    }

    const fullPath = path.join(inputDir, file.name);
    const contracts = await readContractsFromFile(fullPath, sourceType);
    if (!contracts.length) {
      filesProcessed += 1;
      continue;
    }

    fetchedCount += contracts.length;
    byType[sourceType] += contracts.length;

    const result = await upsertContracts(contracts);
    storedCount += Number(result.affectedRows || 0);
    filesProcessed += 1;
  }

  return {
    baseDir: inputDir,
    filesProcessed,
    fetchedCount,
    storedCount,
    byType,
  };
}
