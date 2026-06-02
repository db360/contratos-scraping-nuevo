export type SourceType = "contrato_menor" | "licitacion";
export type RunSourceType = SourceType | "all";

export interface ContractRecord {
  sourceType: SourceType;
  expediente: string;
  contractType: string | null;
  objeto: string | null;
  estado: string | null;
  fechaReferencia: string | null;
  importe: number | null;
  adjudicatario: string | null;
  fechas: string | null;
  sourceUrl: string | null;
  rawPayload: unknown;
}

export interface ScrapeRunInsert {
  sourceType: RunSourceType;
  status: "ok" | "error";
  fetchedCount: number;
  storedCount: number;
  errorMessage?: string;
  startedAt: Date;
  finishedAt: Date;
}
