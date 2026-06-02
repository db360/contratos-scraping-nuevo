import fs from "fs/promises";
import path from "path";
import { config } from "../config.js";
import { scrapePortal } from "../scrapers/portalScraper.js";
import type { SourceType } from "../types.js";

interface CliOptions {
  sourceType: SourceType;
  headless: boolean | "shell";
  profileName: string;
}

function parseBooleanLike(input: string): boolean {
  return ["1", "true", "yes", "y", "on"].includes(input.toLowerCase());
}

function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  const options: Record<string, string> = {};

  for (const arg of args) {
    if (!arg.startsWith("--")) {
      continue;
    }

    const [key, value] = arg.slice(2).split("=");
    if (key && value !== undefined) {
      options[key] = value;
    }
  }

  const sourceTypeRaw = (
    options.type ||
    options.sourceType ||
    process.env.SOURCE_TYPE ||
    "contrato_menor"
  ).trim();
  if (sourceTypeRaw !== "contrato_menor" && sourceTypeRaw !== "licitacion") {
    throw new Error("Parametro --type invalido. Usa contrato_menor o licitacion.");
  }

  const headlessRaw = (
    options.headless ||
    process.env.SCRAPER_HEADLESS ||
    String(config.scraper.headless)
  )
    .trim()
    .toLowerCase();
  const headless: boolean | "shell" =
    headlessRaw === "shell" ? "shell" : parseBooleanLike(headlessRaw);

  const profileName = (
    options.profile ||
    process.env.SCRAPER_PROFILE_NAME ||
    config.scraper.profileName
  ).trim();
  if (!profileName) {
    throw new Error("El perfil no puede estar vacio. Usa --profile='Nombre del perfil'.");
  }

  return {
    sourceType: sourceTypeRaw,
    headless,
    profileName,
  };
}

function printUsage(): void {
  console.log("Uso:");
  console.log("  npm run scrape:standalone:dev -- --type=contrato_menor --headless=false");
  console.log("  npm run scrape:standalone:dev -- --type=licitacion --headless=shell");
  console.log("Opcionales:");
  console.log("  --profile=Junta de Gobierno del Ayuntamiento de Marbella");
}

async function writeDebugDump(filePrefix: string, payload: unknown): Promise<string> {
  const outDir = path.resolve(process.cwd(), "debug");
  await fs.mkdir(outDir, { recursive: true });
  const filePath = path.join(outDir, `${Date.now()}_${filePrefix}.json`);
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2), "utf8");
  return filePath;
}

async function run(): Promise<void> {
  if (process.argv.includes("--help")) {
    printUsage();
    return;
  }

  const options = parseArgs();
  const started = Date.now();

  console.log("[standalone] Iniciando scraper...");
  console.log(
    JSON.stringify(
      {
        sourceType: options.sourceType,
        headless: options.headless,
        profileName: options.profileName,
      },
      null,
      2
    )
  );

  try {
    const rows = await scrapePortal({
      sourceType: options.sourceType,
      profileName: options.profileName,
      headless: options.headless,
      userDataDir: config.scraper.userDataDir,
      cookiesPath: config.scraper.cookiesPath,
    });

    const elapsedMs = Date.now() - started;
    console.log(`[standalone] OK. Filas: ${rows.length}. Tiempo: ${elapsedMs}ms`);

    const outputPath = await writeDebugDump(`scrape_${options.sourceType}`, {
      meta: {
        sourceType: options.sourceType,
        elapsedMs,
        count: rows.length,
      },
      sample: rows.slice(0, 10),
    });

    console.log(`[standalone] Muestra guardada en: ${outputPath}`);
  } catch (error) {
    const elapsedMs = Date.now() - started;
    const message = error instanceof Error ? error.message : "Error desconocido";
    console.error(`[standalone] ERROR tras ${elapsedMs}ms: ${message}`);

    const debugPath = await writeDebugDump("scrape_error", {
      elapsedMs,
      sourceType: options.sourceType,
      message,
      stack: error instanceof Error ? error.stack : null,
    });

    console.error(`[standalone] Dump de error: ${debugPath}`);
    process.exitCode = 1;
  }
}

void run();
