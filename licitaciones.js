const puppeteer = require("puppeteer");
const fs = require("fs/promises");

const { default: tableParser } = require("puppeteer-table-parser");

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
  // Pagina Perfil Contratante
  await page.goto(url, { waitUntil: "load", timeout: 0, slowMo: 500 });

  // Insertar Valor 'Marbella' y Click en buscar
  const newInputValue = "Junta de Gobierno del Ayuntamiento de Marbella";

  // eslint-disable-next-line no-return-assign
  await page.evaluate(
    (val) => (document.querySelector(".width28punto6em").value = val),
    newInputValue
  );
  await page.evaluate(() => {
    const xpath =
      '//*[@id="viewns_Z7_AVEQAI930GRPE02BR764FO30G0_:listaperfiles:botonbuscar"]';
    const result = document.evaluate(xpath, document, null);

    result.iterateNext().click();
  });
  // Click en el boton de "Junta de Gobierno del Ayuntamiento de Marbella".
  const contratosLinkSelector = "table tbody tr a";
  await page.waitForSelector(contratosLinkSelector);
  await page.click(contratosLinkSelector);

  // Click Licitaciones
  await page.waitForSelector(
    'input[name="viewns_Z7_AVEQAI930GRPE02BR764FO30G0_:perfilComp:linkPrepLic"]'
  );
  await page.click(
    'input[name="viewns_Z7_AVEQAI930GRPE02BR764FO30G0_:perfilComp:linkPrepLic"]'
  );

  let isBtnDisabled = false;

  function obtenerFechaFormateada() {
    const fecha = new Date();

    // Obtiene los componentes de la fecha y hora
    const dia = String(fecha.getDate()).padStart(2, "0"); // Día del mes, con dos dígitos
    const mes = String(fecha.getMonth() + 1).padStart(2, "0"); // Mes, con dos dígitos (getMonth() devuelve un valor de 0 a 11)
    const año = fecha.getFullYear(); // Año
    const hora = String(fecha.getHours()).padStart(2, "0"); // Hora, con dos dígitos

    // Formatea la fecha y hora en el formato deseado
    const fechaFormateada = `${dia}-${mes}-${año}-${hora}`;

    return fechaFormateada;
  }

  const fileName =
    "./nuevos_datos/" + obtenerFechaFormateada() + "_licitaciones.csv";

  // Escribir la cabecera en el archivo CSV
  const headers = "expediente,tipo,objeto,estado,importe,fechas\n";
  await fs.appendFile(fileName, headers, "utf8");

  while (!isBtnDisabled) {
    await page.waitForSelector("#tableLicitacionesPerfilContratante tbody");

    const data = await tableParser(page, {
      selector: "#tableLicitacionesPerfilContratante",
      csvSeparator: ",",
      withHeader: false,
      allowedColNames: {
        Expediente: "expediente",
        Tipo: "tipo",
        "Objeto del contrato": "objcontrato",
        Estado: "estado",
        Importe: "importe",
        Fechas: "fechas",
      },

      rowTransform: (row, getColumnIndex) => {

        const fechas = getColumnIndex("fechas");
        const importe = getColumnIndex("importe");
        const objcontrato = getColumnIndex("objcontrato");

        row[objcontrato] = row[objcontrato].replace(/,/g, ";");
        row[importe] = row[importe]
          .replace(".", "")
          .replace(".", "")
          .replace(",", ".");

        if (fechas !== -1 && row[fechas]) {
          const fechasFormatted = row[fechas]
            .replace(/\s+/g, "")
            .split(";")
            .join("; ");
          row[fechas] = fechasFormatted;
        }

              // Envolver cada campo con comillas dobles
            return row.map(value => `"${value.replace(/"/g, '""')}"`);
      },
    });

    fs.appendFile(fileName, data + "\n", (err) => {
      if (err) throw err;
      console.log('The "data to append" was appended to file!');
    });

    // Verificar si el botón de siguiente página está habilitado
    const nextButtonSelector = 'input[name="viewns_Z7_AVEQAI930GRPE02BR764FO30G0_:form1:siguienteLink"]';
    const nextButtonDisabled = (await page.$(nextButtonSelector)) === null;

    isBtnDisabled = nextButtonDisabled;

    if (!isBtnDisabled) {
      await Promise.all([
        page.click(
          'input[name="viewns_Z7_AVEQAI930GRPE02BR764FO30G0_:form1:siguienteLink"]'
        ),
        page.waitForNavigation({ waitUntil: "load" }),
      ]);
    }
  } // end of while

  console.log("PROCESO TERMINADO");
  browser.close();
})();
