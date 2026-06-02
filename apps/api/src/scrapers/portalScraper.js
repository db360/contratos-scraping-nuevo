import fs from "fs/promises";
import puppeteer from "puppeteer";

const PORTAL_URL = "https://contrataciondelestado.es/wps/portal/";
const PERFIL_URL =
  "https://contrataciondelestado.es/wps/portal/perfilContratante";

const ENTRY_SELECTORS = {
  contrato_menor:
    'input[name="viewns_Z7_AVEQAI930GRPE02BR764FO30G0_:perfilComp:linkPrepContratosMenores"]',
  licitacion:
    'input[name="viewns_Z7_AVEQAI930GRPE02BR764FO30G0_:perfilComp:linkPrepLic"]',
};

function parseImporte(value) {
  if (!value) {
    return null;
  }

  const normalized = String(value)
    .replace(/EUR|€/gi, "")
    .replace(/\./g, "")
    .replace(/,/g, ".")
    .trim();

  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : null;
}

async function maybeLoadCookies(page, cookiesPath) {
  try {
    const cookiesString = await fs.readFile(cookiesPath, "utf8");
    const parsed = JSON.parse(cookiesString);
    if (Array.isArray(parsed) && parsed.length) {
      await page.setCookie(...parsed);
    }
  } catch {
    // No cookies file yet; first run continues without persisted cookies.
  }
}

async function persistCookies(page, cookiesPath) {
  const cookies = await page.cookies();
  await fs.writeFile(cookiesPath, JSON.stringify(cookies, null, 2), "utf8");
}

async function openProfile(page, profileName) {
  await page.goto(PORTAL_URL, { waitUntil: "load", timeout: 0 });
  await page.goto(PERFIL_URL, { waitUntil: "load", timeout: 0 });

  await page.waitForSelector(".width28punto6em", { timeout: 30000 });
  await page.evaluate((val) => {
    const input = document.querySelector(".width28punto6em");
    if (input) {
      input.value = val;
    }
  }, profileName);

  await page.evaluate(() => {
    const xpath =
      '//*[@id="viewns_Z7_AVEQAI930GRPE02BR764FO30G0_:listaperfiles:botonbuscar"]';
    const result = document.evaluate(
      xpath,
      document,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null
    );
    const button = result.singleNodeValue;
    if (button) {
      button.click();
    }
  });

  await page.waitForSelector("table tbody tr a", { timeout: 30000 });
  await page.click("table tbody tr a");
}

async function collectRows(page, sourceType) {
  const tableSelector = "#tableLicitacionesPerfilContratante tbody";
  const nextButtonSelector =
    'input[name="viewns_Z7_AVEQAI930GRPE02BR764FO30G0_:form1:siguienteLink"]';

  const rows = [];
  let hasNext = true;

  while (hasNext) {
    await page.waitForSelector(tableSelector, { timeout: 30000 });

    const current = await page.evaluate((type) => {
      const records = [];
      const trs = Array.from(
        document.querySelectorAll("#tableLicitacionesPerfilContratante tbody tr")
      );

      for (const tr of trs) {
        const tds = Array.from(tr.querySelectorAll("td"));
        if (!tds.length) {
          continue;
        }

        if (type === "contrato_menor") {
          const estadoText = (tds[3]?.innerText || "").trim();
          const parts = estadoText.split("\n").map((part) => part.trim());
          records.push({
            expediente: (tds[0]?.innerText || "").trim(),
            contractType: (tds[1]?.innerText || "").trim(),
            objeto: (tds[2]?.innerText || "").trim(),
            estado: parts[0] || "",
            fechaReferencia: (parts[1] || "").replace("Adjudicación:", "").trim(),
            importeRaw: (tds[4]?.innerText || "").trim(),
            adjudicatario: (tds[5]?.innerText || "").trim(),
            fechas: null,
          });
        } else {
          records.push({
            expediente: (tds[0]?.innerText || "").trim(),
            contractType: (tds[1]?.innerText || "").trim(),
            objeto: (tds[2]?.innerText || "").trim(),
            estado: (tds[3]?.innerText || "").trim(),
            fechaReferencia: null,
            importeRaw: (tds[4]?.innerText || "").trim(),
            adjudicatario: null,
            fechas: (tds[5]?.innerText || "").trim(),
          });
        }
      }

      return records;
    }, sourceType);

    rows.push(...current);

    const nextButton = await page.$(nextButtonSelector);
    if (nextButton && !(await nextButton.evaluate((el) => el.disabled))) {
      await Promise.all([
        nextButton.click(),
        page.waitForNavigation({ waitUntil: "load", timeout: 0 }),
      ]);
    } else {
      hasNext = false;
    }
  }

  return rows;
}

export async function scrapePortal({ sourceType, profileName, headless, userDataDir, cookiesPath }) {
  const browser = await puppeteer.launch({
    headless,
    userDataDir,
  });

  const page = await browser.newPage();

  try {
    await page.setViewport({ width: 1440, height: 1080 });
    await maybeLoadCookies(page, cookiesPath);
    await openProfile(page, profileName);

    const entrySelector = ENTRY_SELECTORS[sourceType];
    if (!entrySelector) {
      throw new Error(`sourceType no soportado: ${sourceType}`);
    }

    await page.waitForSelector(entrySelector, { timeout: 30000 });
    await page.click(entrySelector);

    const rawRows = await collectRows(page, sourceType);
    const normalizedRows = rawRows.map((row) => ({
      sourceType,
      expediente: row.expediente,
      contractType: row.contractType,
      objeto: row.objeto,
      estado: row.estado,
      fechaReferencia: row.fechaReferencia,
      importe: parseImporte(row.importeRaw),
      adjudicatario: row.adjudicatario,
      fechas: row.fechas,
      sourceUrl: page.url(),
      rawPayload: row,
    }));

    await persistCookies(page, cookiesPath);
    return normalizedRows;
  } finally {
    await browser.close();
  }
}
