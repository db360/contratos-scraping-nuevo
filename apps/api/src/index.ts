import cors from "cors";
import cron from "node-cron";
import express, { type Request, type Response } from "express";
import { checkDbConnection } from "./db.js";
import { config } from "./config.js";
import { listContracts, runScrape } from "./services/scrapeService.js";
import { importHistoricalData } from "./services/importHistoricalService.js";
import type { RunSourceType, SourceType } from "./types.js";

interface ScrapeRuntimeStatus {
  running: boolean;
  sourceType: RunSourceType | null;
  stage: string;
  currentSource: SourceType | null;
  totalSources: number;
  processedSources: number;
  fetchedCount: number;
  storedCount: number;
  startedAt: string | null;
  finishedAt: string | null;
  errorMessage: string | null;
  lastResult: unknown;
}

const scrapeStatus: ScrapeRuntimeStatus = {
  running: false,
  sourceType: null,
  stage: "idle",
  currentSource: null,
  totalSources: 0,
  processedSources: 0,
  fetchedCount: 0,
  storedCount: 0,
  startedAt: null,
  finishedAt: null,
  errorMessage: null,
  lastResult: null,
};

function applyProgress(progress: {
  stage: string;
  sourceType: RunSourceType;
  currentSource?: SourceType;
  totalSources: number;
  processedSources: number;
  fetchedCount: number;
  storedCount: number;
  errorMessage?: string;
}) {
  scrapeStatus.stage = progress.stage;
  scrapeStatus.sourceType = progress.sourceType;
  scrapeStatus.currentSource = progress.currentSource || null;
  scrapeStatus.totalSources = progress.totalSources;
  scrapeStatus.processedSources = progress.processedSources;
  scrapeStatus.fetchedCount = progress.fetchedCount;
  scrapeStatus.storedCount = progress.storedCount;
  scrapeStatus.errorMessage = progress.errorMessage || null;
}

function startScrapeInBackground(sourceType: RunSourceType): void {
  scrapeStatus.running = true;
  scrapeStatus.sourceType = sourceType;
  scrapeStatus.stage = "queued";
  scrapeStatus.currentSource = null;
  scrapeStatus.totalSources = sourceType === "all" ? 2 : 1;
  scrapeStatus.processedSources = 0;
  scrapeStatus.fetchedCount = 0;
  scrapeStatus.storedCount = 0;
  scrapeStatus.startedAt = new Date().toISOString();
  scrapeStatus.finishedAt = null;
  scrapeStatus.errorMessage = null;

  void runScrape(sourceType, applyProgress)
    .then((result) => {
      scrapeStatus.running = false;
      scrapeStatus.stage = "finished";
      scrapeStatus.finishedAt = new Date().toISOString();
      scrapeStatus.lastResult = result;
    })
    .catch((error) => {
      scrapeStatus.running = false;
      scrapeStatus.stage = "error";
      scrapeStatus.finishedAt = new Date().toISOString();
      scrapeStatus.errorMessage = error instanceof Error ? error.message : "unknown";
      scrapeStatus.lastResult = null;
    });
}

const app = express();
app.use(cors({ origin: config.corsOrigin }));
app.use(express.json());

app.get("/health", async (_req: Request, res: Response) => {
  try {
    await checkDbConnection();
    return res.json({ status: "ok", db: "connected" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    return res.status(500).json({ status: "error", db: message });
  }
});

app.get("/api/contracts", async (req: Request, res: Response) => {
  try {
    const sourceType = req.query.sourceType as SourceType | undefined;
    const limit = Math.min(Number(req.query.limit || 50), 200);
    const offset = Math.max(Number(req.query.offset || 0), 0);

    if (sourceType && !["contrato_menor", "licitacion"].includes(sourceType)) {
      return res.status(400).json({
        message: "sourceType debe ser contrato_menor o licitacion",
      });
    }

    const result = await listContracts({ sourceType, limit, offset });
    return res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    return res.status(500).json({ message });
  }
});

app.get("/api/scrape/status", (_req: Request, res: Response) => {
  return res.json(scrapeStatus);
});

app.post("/api/scrape/run", async (req: Request, res: Response) => {
  try {
    const sourceType = (req.body?.sourceType || "all") as RunSourceType;
    const asyncMode =
      String(req.query.async || "false") === "true" || req.body?.async === true;

    if (!["all", "contrato_menor", "licitacion"].includes(sourceType)) {
      return res.status(400).json({
        message: "sourceType debe ser all, contrato_menor o licitacion",
      });
    }

    if (asyncMode) {
      if (scrapeStatus.running) {
        return res.status(409).json({
          message: "Ya hay un scraping en ejecucion",
          status: scrapeStatus,
        });
      }

      startScrapeInBackground(sourceType);
      return res.status(202).json({
        message: "Scraping iniciado",
        status: scrapeStatus,
      });
    }

    const result = await runScrape(sourceType);
    scrapeStatus.lastResult = result;
    scrapeStatus.finishedAt = new Date().toISOString();
    scrapeStatus.stage = "finished";
    scrapeStatus.errorMessage = null;
    return res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    scrapeStatus.errorMessage = message;
    scrapeStatus.stage = "error";
    scrapeStatus.running = false;
    scrapeStatus.finishedAt = new Date().toISOString();
    return res.status(500).json({ message });
  }
});

app.post("/api/import/historical", async (_req: Request, res: Response) => {
  try {
    const result = await importHistoricalData();
    return res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    return res.status(500).json({ message });
  }
});

if (config.scraper.autorun) {
  cron.schedule(config.scraper.cron, async () => {
    try {
      if (scrapeStatus.running) {
        console.log("[cron] scrape saltado, ya hay una ejecucion en curso");
        return;
      }

      startScrapeInBackground("all");
      console.log("[cron] scrape all lanzado");
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown";
      console.error("[cron] error en scrape all", message);
    }
  });
}

app.listen(config.port, () => {
  console.log(`API lista en http://localhost:${config.port}`);
});
