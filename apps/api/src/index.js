import cors from "cors";
import cron from "node-cron";
import express from "express";
import { checkDbConnection } from "./db.js";
import { config } from "./config.js";
import { listContracts, runScrape } from "./services/scrapeService.js";

const app = express();
app.use(cors({ origin: config.corsOrigin }));
app.use(express.json());

app.get("/health", async (_req, res) => {
  try {
    await checkDbConnection();
    return res.json({ status: "ok", db: "connected" });
  } catch (error) {
    return res.status(500).json({ status: "error", db: error.message });
  }
});

app.get("/api/contracts", async (req, res) => {
  try {
    const sourceType = req.query.sourceType;
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
    return res.status(500).json({ message: error.message });
  }
});

app.post("/api/scrape/run", async (req, res) => {
  try {
    const sourceType = req.body?.sourceType || "all";
    if (!["all", "contrato_menor", "licitacion"].includes(sourceType)) {
      return res.status(400).json({
        message: "sourceType debe ser all, contrato_menor o licitacion",
      });
    }

    const result = await runScrape(sourceType);
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

if (config.scraper.autorun) {
  cron.schedule(config.scraper.cron, async () => {
    try {
      await runScrape("all");
      console.log("[cron] scrape all finalizado");
    } catch (error) {
      console.error("[cron] error en scrape all", error.message);
    }
  });
}

app.listen(config.port, () => {
  console.log(`API lista en http://localhost:${config.port}`);
});
