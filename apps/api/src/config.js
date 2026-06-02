import dotenv from "dotenv";

dotenv.config();

export const config = {
  port: Number(process.env.PORT || 4000),
  corsOrigin: process.env.CORS_ORIGIN || "http://localhost:5173",
  db: {
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "contratos_publicos",
  },
  scraper: {
    profileName:
      process.env.SCRAPER_PROFILE_NAME ||
      "Junta de Gobierno del Ayuntamiento de Marbella",
    headless: String(process.env.SCRAPER_HEADLESS || "true") === "true",
    userDataDir: process.env.SCRAPER_USER_DATA_DIR || "./tmp",
    cookiesPath: process.env.SCRAPER_COOKIES_PATH || "./cookies.json",
    cron: process.env.SCRAPER_CRON || "0 */6 * * *",
    autorun: String(process.env.SCRAPER_AUTORUN || "true") === "true",
  },
};
