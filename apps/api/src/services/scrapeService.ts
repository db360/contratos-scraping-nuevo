import { config } from "../config.js";
import {
  countContracts,
  getContracts,
  insertScrapeRun,
  upsertContracts,
} from "../repositories/contractsRepository.js";
import { scrapePortal } from "../scrapers/portalScraper.js";
import type { RunSourceType, SourceType } from "../types.js";

const SOURCE_TYPES: SourceType[] = ["contrato_menor", "licitacion"];

export interface ScrapeProgress {
  stage: "started" | "source_started" | "source_finished" | "finished" | "error";
  sourceType: RunSourceType;
  currentSource?: SourceType;
  totalSources: number;
  processedSources: number;
  fetchedCount: number;
  storedCount: number;
  errorMessage?: string;
}

export async function runScrape(
  sourceType: RunSourceType = "all",
  onProgress?: (progress: ScrapeProgress) => void
) {
  const startedAt = new Date();
  let fetchedCount = 0;
  let storedCount = 0;

  try {
    const targets = sourceType === "all" ? SOURCE_TYPES : [sourceType];
    onProgress?.({
      stage: "started",
      sourceType,
      totalSources: targets.length,
      processedSources: 0,
      fetchedCount,
      storedCount,
    });

    for (let index = 0; index < targets.length; index += 1) {
      const type = targets[index];
      onProgress?.({
        stage: "source_started",
        sourceType,
        currentSource: type,
        totalSources: targets.length,
        processedSources: index,
        fetchedCount,
        storedCount,
      });

      const contracts = await scrapePortal({
        sourceType: type,
        profileName: config.scraper.profileName,
        headless: config.scraper.headless,
        userDataDir: config.scraper.userDataDir,
        cookiesPath: config.scraper.cookiesPath,
      });

      fetchedCount += contracts.length;
      const result = await upsertContracts(contracts);
      storedCount += Number(result.affectedRows || 0);

      onProgress?.({
        stage: "source_finished",
        sourceType,
        currentSource: type,
        totalSources: targets.length,
        processedSources: index + 1,
        fetchedCount,
        storedCount,
      });
    }

    const finishedAt = new Date();
    await insertScrapeRun({
      sourceType,
      status: "ok",
      fetchedCount,
      storedCount,
      startedAt,
      finishedAt,
    });

    onProgress?.({
      stage: "finished",
      sourceType,
      totalSources: targets.length,
      processedSources: targets.length,
      fetchedCount,
      storedCount,
    });

    return {
      sourceType,
      status: "ok",
      fetchedCount,
      storedCount,
      startedAt,
      finishedAt,
    };
  } catch (error) {
    const finishedAt = new Date();
    await insertScrapeRun({
      sourceType,
      status: "error",
      fetchedCount,
      storedCount,
      errorMessage: error instanceof Error ? error.message : "Error desconocido",
      startedAt,
      finishedAt,
    });

    const targets = sourceType === "all" ? SOURCE_TYPES : [sourceType];
    onProgress?.({
      stage: "error",
      sourceType,
      totalSources: targets.length,
      processedSources: 0,
      fetchedCount,
      storedCount,
      errorMessage: error instanceof Error ? error.message : "Error desconocido",
    });

    throw error;
  }
}

interface ListContractsParams {
  sourceType?: SourceType;
  limit: number;
  offset: number;
}

export async function listContracts({ sourceType, limit, offset }: ListContractsParams) {
  const [items, total] = await Promise.all([
    getContracts({ sourceType, limit, offset }),
    countContracts({ sourceType }),
  ]);

  return {
    items,
    pagination: {
      total,
      limit,
      offset,
      hasMore: offset + items.length < total,
    },
  };
}
