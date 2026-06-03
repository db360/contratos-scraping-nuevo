import fs from "fs/promises";
import puppeteer, { type Browser, type Page } from "puppeteer";
import type { ContractRecord, SourceType } from "../types.js";

const PORTAL_URL = "https://contrataciondelestado.es/wps/portal/";
const PERFIL_LISTA_URL =
  "https://contrataciondelestado.es/wps/portal/plataforma/perfil_contratante/lista_perfiles/";
const PERFIL_SEARCH_INPUT_ID =
  "viewns_Z7_AVEQAI930GRPE02BR764FO30G0_:listaperfiles:texoorgano";
const PERFIL_SEARCH_BUTTON_ID =
  "viewns_Z7_AVEQAI930GRPE02BR764FO30G0_:listaperfiles:botonbuscar";
const CONTRATO_MENOR_MIN_DATE_INPUT_ID =
  "viewns_Z7_AVEQAI930GRPE02BR764FO30G0_:form1:textMinFecAnuncioMAQ2";
const CONTRATO_MENOR_MIN_DATE_VALUE = "01-01-2000";

const ENTRY_SELECTORS: Record<SourceType, string[]> = {
  contrato_menor: [
    'input[id="viewns_Z7_AVEQAI930GRPE02BR764FO30G0_:perfilComp:linkPrepContratosMenores"]',
    'input[name="viewns_Z7_AVEQAI930GRPE02BR764FO30G0_:perfilComp:linkPrepContratosMenores"]',
    'input[name*="perfilComp:linkPrepContratosMenores"]',
    'input[id*="perfilComp:linkPrepContratosMenores"]',
    'a[href*="ContratosMenores"]',
  ],
  licitacion: [
    'input[id="viewns_Z7_AVEQAI930GRPE02BR764FO30G0_:perfilComp:linkPrepLic"]',
    'input[name="viewns_Z7_AVEQAI930GRPE02BR764FO30G0_:perfilComp:linkPrepLic"]',
    'input[name*="perfilComp:linkPrepLic"]',
    'input[id*="perfilComp:linkPrepLic"]',
    'a[href*="PrepLic"]',
  ],
};

interface RawRow {
  expediente: string;
  contractType: string | null;
  objeto: string | null;
  estado: string | null;
  fechaReferencia: string | null;
  importeRaw: string | null;
  adjudicatario: string | null;
  fechas: string | null;
}

interface ScrapeOptions {
  sourceType: SourceType;
  profileName: string;
  headless: boolean | "shell";
  userDataDir: string;
  cookiesPath: string;
}

function parseImporte(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const clean = String(value)
    .replace(/EUR|€/gi, "")
    .replace(/\s+/g, "")
    .replace(/[^\d,.-]/g, "");

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

async function maybeLoadCookies(page: Page, cookiesPath: string): Promise<void> {
  try {
    const cookiesString = await fs.readFile(cookiesPath, "utf8");
    const parsed = JSON.parse(cookiesString) as Array<Record<string, unknown>>;
    if (Array.isArray(parsed) && parsed.length) {
      await page.setCookie(...(parsed as never[]));
    }
  } catch {
    // No cookies file yet; first run continues without persisted cookies.
  }
}

async function persistCookies(page: Page, cookiesPath: string): Promise<void> {
  const cookies = await page.cookies();
  await fs.writeFile(cookiesPath, JSON.stringify(cookies, null, 2), "utf8");
}

async function openProfile(page: Page, profileName: string): Promise<void> {
  await page.goto(PORTAL_URL, { waitUntil: "load", timeout: 0 });
  await page.goto(PERFIL_LISTA_URL, { waitUntil: "networkidle2", timeout: 0 });

  const clickProfileFromTable = async (): Promise<boolean> => {
    const nextSelectors = [
      'input[name*="siguienteLink"]',
      'a[title*="Siguiente"]',
      'a[title*="Next"]',
    ];

    for (let pageNumber = 0; pageNumber < 80; pageNumber += 1) {
      await page.waitForSelector("#tableBusquedaPerfilContratante tbody", { timeout: 30000 });

      const clicked = await page.evaluate((wantedName) => {
        const normalize = (value: string) =>
          value
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .trim();

        const target = normalize(wantedName);
        const links = Array.from(
          document.querySelectorAll<HTMLAnchorElement>(
            "#tableBusquedaPerfilContratante tbody tr td span a, #tableBusquedaPerfilContratante tbody tr td a"
          )
        );
        const match = links.find((link) => normalize(link.innerText).includes(target));
        if (!match) {
          return false;
        }

        match.click();
        return true;
      }, profileName);

      if (clicked) {
        await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 0 });
        return true;
      }

      let advanced = false;
      for (const nextSelector of nextSelectors) {
        const nextButton = await page.$(nextSelector);
        if (!nextButton) {
          continue;
        }

        const isDisabled = await nextButton.evaluate((el) => {
          const disabledAttr = (el as HTMLInputElement).disabled;
          const ariaDisabled = el.getAttribute("aria-disabled") === "true";
          const classDisabled = (el.getAttribute("class") || "").toLowerCase().includes("disabled");
          return disabledAttr || ariaDisabled || classDisabled;
        });

        if (isDisabled) {
          continue;
        }

        await Promise.all([
          nextButton.click(),
          page.waitForNavigation({ waitUntil: "networkidle2", timeout: 0 }),
        ]);
        advanced = true;
        break;
      }

      if (!advanced) {
        break;
      }
    }

    return false;
  };

  const tryFormSearch = async (): Promise<boolean> => {
    const searchInputSelector = `input[id="${PERFIL_SEARCH_INPUT_ID}"]`;
    const searchButtonSelector = `input[id="${PERFIL_SEARCH_BUTTON_ID}"]`;
    const searchButton = await page.$(searchButtonSelector);

    if (!searchButton) {
      return false;
    }

    await page.waitForSelector(searchInputSelector, { timeout: 30000 });

    const filled = await page.evaluate(
      ({ wantedName, inputId }) => {
        const input = document.querySelector<HTMLInputElement>(`input[id="${inputId}"]`);
        if (!input) {
          return false;
        }

        input.focus();
        input.value = wantedName;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      },
      { wantedName: profileName, inputId: PERFIL_SEARCH_INPUT_ID }
    );

    if (!filled) {
      return false;
    }

    await Promise.all([
      searchButton.click(),
      page.waitForNavigation({ waitUntil: "networkidle2", timeout: 0 }),
    ]);

    return clickProfileFromTable();
  };

  if (await tryFormSearch()) {
    return;
  }

  if (await clickProfileFromTable()) {
    return;
  }

  throw new Error(`No se pudo localizar el perfil de contratante. URL actual: ${page.url()}`);
}

async function collectRows(page: Page, sourceType: SourceType): Promise<RawRow[]> {
  const tableSelector = "#tableLicitacionesPerfilContratante tbody";
  const isDebug = String(process.env.SCRAPER_DEBUG || "false") === "true";
  const nextButtonSelectors = [
    'input[id="viewns_Z7_AVEQAI930GRPE02BR764FO30G0_:form1:siguienteLink"]',
    'input[name="viewns_Z7_AVEQAI930GRPE02BR764FO30G0_:form1:siguienteLink"]',
    'input[name*="siguienteLink"]',
    'input[id*="siguienteLink"]',
    'a[title*="Siguiente"]',
    'a[title*="Next"]',
    'button[title*="Siguiente"]',
    'button[title*="Next"]',
  ];

  const rows: RawRow[] = [];
  let hasNext = true;
  let pageNumber = 1;

  while (hasNext) {
    await page.waitForSelector(tableSelector, { timeout: 30000 });

    const current = await page.evaluate((type) => {
      const records: RawRow[] = [];
      const trs = Array.from(
        document.querySelectorAll<HTMLTableRowElement>(
          "#tableLicitacionesPerfilContratante tbody tr:not(.footerClass)"
        )
      );

      for (const tr of trs) {
        const tds = Array.from(tr.querySelectorAll<HTMLTableCellElement>("td"));
        if (!tds.length) {
          continue;
        }

        if (type === "contrato_menor") {
          const estadoText = (tds[3]?.innerText || "").trim();
          const parts = estadoText.split("\n").map((part) => part.trim());
          records.push({
            expediente: (tds[0]?.innerText || "").trim(),
            contractType: (tds[1]?.innerText || "").trim() || null,
            objeto: (tds[2]?.innerText || "").trim() || null,
            estado: parts[0] || null,
            fechaReferencia: (parts[1] || "").replace("Adjudicación:", "").trim() || null,
            importeRaw: (tds[4]?.innerText || "").trim() || null,
            adjudicatario: (tds[5]?.innerText || "").trim() || null,
            fechas: null,
          });
        } else {
          records.push({
            expediente: (tds[0]?.innerText || "").trim(),
            contractType: (tds[1]?.innerText || "").trim() || null,
            objeto: (tds[2]?.innerText || "").trim() || null,
            estado: (tds[3]?.innerText || "").trim() || null,
            fechaReferencia: null,
            importeRaw: (tds[4]?.innerText || "").trim() || null,
            adjudicatario: null,
            fechas: (tds[5]?.innerText || "").trim() || null,
          });
        }
      }

      return records;
    }, sourceType);

    rows.push(...current);
    if (isDebug) {
      console.log(`[scraper] ${sourceType} pagina ${pageNumber}: ${current.length} filas`);
    }

    let advanced = false;

    for (const selector of nextButtonSelectors) {
      const nextButton = await page.$(selector);
      if (!nextButton) {
        continue;
      }

      const isDisabled = await nextButton.evaluate((el) => {
        const inputDisabled = (el as HTMLInputElement).disabled;
        const ariaDisabled = el.getAttribute("aria-disabled") === "true";
        const classDisabled = (el.getAttribute("class") || "").toLowerCase().includes("disabled");
        return inputDisabled || ariaDisabled || classDisabled;
      });

      if (isDisabled) {
        continue;
      }

      await Promise.all([
        nextButton.click(),
        page.waitForNavigation({ waitUntil: "networkidle2", timeout: 0 }),
      ]);

      advanced = true;
      pageNumber += 1;
      break;
    }

    if (!advanced) {
      hasNext = false;
    }
  }

  return rows;
}

async function applyContratoMenorMinDateFilter(page: Page): Promise<void> {
  const minDateSelector = `input[id="${CONTRATO_MENOR_MIN_DATE_INPUT_ID}"]`;
  const hasMinDateInput = Boolean(await page.$(minDateSelector));

  if (!hasMinDateInput) {
    return;
  }

  await page.evaluate(
    ({ inputId, value }) => {
      const input = document.querySelector<HTMLInputElement>(`input[id="${inputId}"]`);
      if (!input) {
        return;
      }

      input.focus();
      input.value = value;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));

      const controls = Array.from(
        document.querySelectorAll<HTMLInputElement | HTMLButtonElement>(
          "input[type='submit'], input[type='button'], button"
        )
      );

      const normalize = (raw: string) =>
        raw
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase();

      const submitControl = controls.find((control) => {
        const text = normalize(
          [
            control.getAttribute("id") || "",
            control.getAttribute("name") || "",
            control.getAttribute("value") || "",
            control.getAttribute("title") || "",
            control.textContent || "",
          ].join(" ")
        );

        return text.includes("buscar") || text.includes("filtrar") || text.includes("consultar");
      });

      submitControl?.click();
    },
    {
      inputId: CONTRATO_MENOR_MIN_DATE_INPUT_ID,
      value: CONTRATO_MENOR_MIN_DATE_VALUE,
    }
  );

  await Promise.race([
    page.waitForNavigation({ waitUntil: "networkidle2", timeout: 15000 }),
    page.waitForSelector("#tableLicitacionesPerfilContratante tbody", { timeout: 15000 }),
  ]).catch(() => undefined);
}

export async function scrapePortal(options: ScrapeOptions): Promise<ContractRecord[]> {
  const browser: Browser = await puppeteer.launch({
    headless: options.headless,
    userDataDir: options.userDataDir,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();

  try {
    await page.setViewport({ width: 1440, height: 1080 });
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    );
    await maybeLoadCookies(page, options.cookiesPath);
    try {
      await openProfile(page, options.profileName);
    } catch {
      const currentCookies = await page.cookies();
      if (currentCookies.length) {
        await page.deleteCookie(...currentCookies);
      }
      await openProfile(page, options.profileName);
    }

    const candidates = ENTRY_SELECTORS[options.sourceType];
    let clickedEntry = false;

    for (const selector of candidates) {
      const entry = await page.$(selector);
      if (entry) {
        await Promise.all([
          entry.click(),
          page.waitForNavigation({ waitUntil: "networkidle2", timeout: 0 }),
        ]);
        clickedEntry = true;
        break;
      }
    }

    if (!clickedEntry) {
      const keywords =
        options.sourceType === "contrato_menor"
          ? ["contratos menores", "minor contracts", "menores"]
          : ["licitaciones", "tender", "procurement", "anuncios"];

      const href = await page.evaluate((words) => {
        const nodes = Array.from(
          document.querySelectorAll<HTMLInputElement | HTMLAnchorElement>(
            "a, input[type='submit'], input[type='button'], button"
          )
        );

        const normalize = (value: string) =>
          value
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase();

        const match = nodes.find((node) => {
          const text = normalize(
            [
              node.getAttribute("name") || "",
              node.getAttribute("id") || "",
              node.getAttribute("value") || "",
              node.textContent || "",
              node.getAttribute("title") || "",
            ].join(" ")
          );

          return words.some((word) => text.includes(normalize(word)));
        });

        if (!match) {
          return "";
        }

        if (match instanceof HTMLAnchorElement && match.href) {
          return match.href;
        }

        match.click();
        return "clicked";
      }, keywords);

      if (href && href !== "clicked") {
        await page.goto(href, { waitUntil: "networkidle2", timeout: 0 });
      } else if (href === "clicked") {
        await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 0 });
      } else {
        const controls = await page.evaluate(() => {
          const nodes = Array.from(
            document.querySelectorAll<HTMLElement>("a, input[type='submit'], input[type='button'], button")
          );
          return nodes
            .map((node) =>
              [
                node.getAttribute("id") || "",
                node.getAttribute("name") || "",
                node.getAttribute("value") || "",
                node.textContent || "",
                node.getAttribute("title") || "",
              ]
                .join(" ")
                .replace(/\s+/g, " ")
                .trim()
            )
            .filter(Boolean)
            .slice(0, 40);
        });

        throw new Error(
          `No se encontro acceso a ${options.sourceType} desde el perfil. URL: ${page.url()}. Controles detectados: ${controls.join(" || ")}`
        );
      }
    }

    if (options.sourceType === "contrato_menor") {
      await applyContratoMenorMinDateFilter(page);
    }

    const rawRows = await collectRows(page, options.sourceType);
    const normalizedRows = rawRows.map((row) => ({
      sourceType: options.sourceType,
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

    await persistCookies(page, options.cookiesPath);
    return normalizedRows;
  } finally {
    await browser.close();
  }
}
