const puppeteer = require("puppeteer");
const fs = require("fs/promises");

(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    userDataDir: "./tmp",
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1080 });
  await page.goto("https://contrataciondelestado.es/wps/portal/");

  const cookies = await page.cookies();
  await fs.writeFile("./cookies.json", JSON.stringify(cookies, null, 2));
  const cookiesString = await fs.readFile("./cookies.json");
  const parsedcookies = JSON.parse(cookiesString);
  await page.setCookie(...parsedcookies);

  const url = "https://contrataciondelestado.es/wps/portal/perfilContratante";
  await page.goto(url, { waitUntil: "load", timeout: 0, slowMo: 500 });

  const newInputValue = "Junta de Gobierno del Ayuntamiento de Marbella";
  await page.evaluate(
    (val) => (document.querySelector(".viewns_Z7_AVEQAI930GRPE02BR764FO30G0_:listaperfiles:texoorgano").value = val),
    newInputValue
  );
  await page.evaluate(() => {
    const xpath =
      '//*[@id="viewns_Z7_AVEQAI930GRPE02BR764FO30G0_:listaperfiles:botonbuscar"]';
    const result = document.evaluate(xpath, document, null);
    result.iterateNext().click();
  });

  const contratosLinkSelector = "table tbody tr a";
  await page.waitForSelector(contratosLinkSelector);
  await page.click(contratosLinkSelector);

  await page.waitForSelector(
    'input[name="viewns_Z7_AVEQAI930GRPE02BR764FO30G0_:perfilComp:linkPrepContratosMenores"]'
  );
  await page.click(
    'input[name="viewns_Z7_AVEQAI930GRPE02BR764FO30G0_:perfilComp:linkPrepContratosMenores"]'
  );

  const fileName = "./nuevos_datos/" + Date.now() + "_contratos_menores.json";
  await fs.mkdir("./nuevos_datos", { recursive: true });

  let jsonData = [];
  let isBtnDisabled = false;

  while (!isBtnDisabled) {
    await page.waitForSelector("#tableLicitacionesPerfilContratante tbody");

    const data = await page.evaluate(() => {
      const rows = Array.from(
        document.querySelectorAll(
          "#tableLicitacionesPerfilContratante tbody tr"
        )
      );
      return rows.map((row) => {
        const cells = Array.from(row.querySelectorAll("td"));
        const parseAmount = (raw) => {
          const clean = String(raw || "")
            .replace(/EUR|€/gi, "")
            .replace(/\s+/g, "")
            .replace(/[^\d,.-]/g, "");

          if (!clean || !/\d/.test(clean)) {
            return null;
          }

          const lastComma = clean.lastIndexOf(",");
          const lastDot = clean.lastIndexOf(".");

          let decimalSeparator = null;
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
        };

        // Dividir el campo estado por \n
        const estadoText = cells[3]?.innerText.trim() || "";
        const [estado, fecha] = estadoText
          .split("\n")
          .map((part) => part.trim());

        return {
          expediente: cells[0]?.innerText.trim() || "",
          tipo: cells[1]?.innerText.trim() || "",
          objeto: cells[2]?.innerText.trim().replace(/,/g, ";") || "",
          estado: estado || "", // Guarda la primera parte como estado
          fecha: fecha.replace('Adjudicación:', "") || "", // Guarda la segunda parte como fecha
          importe: parseAmount(cells[4]?.innerText.trim()),
          adjudicatario: cells[5]?.innerText.trim().split(",").join(", ") || "",
        };
      });
    });

    jsonData.push(...data);

    const nextButtonSelector =
      'input[name="viewns_Z7_AVEQAI930GRPE02BR764FO30G0_:form1:siguienteLink"]';
    const nextButton = await page.$(nextButtonSelector);

    if (nextButton && !(await nextButton.evaluate((el) => el.disabled))) {
      await Promise.all([
        nextButton.click(),
        page.waitForNavigation({ waitUntil: "load", timeout: 0 }),
        page.waitForSelector("#tableLicitacionesPerfilContratante tbody"), // Espera a que la tabla se recargue
      ]);
    } else {
      isBtnDisabled = true;
    }
  }

  await fs.writeFile(fileName, JSON.stringify(jsonData, null, 2), "utf8");

  console.log("PROCESO TERMINADO");
  console.log(`Datos guardados en ${fileName}`);
  await browser.close();
})();
