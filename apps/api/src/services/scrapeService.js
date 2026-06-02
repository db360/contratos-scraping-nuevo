import { config } from "../config.js";
import {
  countContracts,
  getContracts,
  insertScrapeRun,
  upsertContracts,
} from "../repositories/contractsRepository.js";
import { scrapePortal } from "../scrapers/portalScraper.js";

const SOURCE_TYPES = ["contrato_menor", "licitacion"];

export async function runScrape(sourceType = "all") {
  const startedAt = new Date();
  let fetchedCount = 0;
  let storedCount = 0;

  try {
    const targets = sourceType === "all" ? SOURCE_TYPES : [sourceType];

    for (const type of targets) {
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
    }

    await insertScrapeRun({
      sourceType,
      status: "ok",
      fetchedCount,
      storedCount,
      startedAt,
      finishedAt: new Date(),
    });

    return {
      sourceType,
      status: "ok",
      fetchedCount,
      storedCount,
      startedAt,
      finishedAt: new Date(),
    };
  } catch (error) {
    await insertScrapeRun({
      sourceType,
      status: "error",
      fetchedCount,
      storedCount,
      errorMessage: error.message,
      startedAt,
      finishedAt: new Date(),
    });

    throw error;
  }
}

export async function listContracts({ sourceType, limit, offset }) {
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
