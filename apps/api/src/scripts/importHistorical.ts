import { importHistoricalData } from "../services/importHistoricalService.js";

async function run() {
  try {
    const summary = await importHistoricalData();
    console.log("Importacion historica completada:");
    console.log(JSON.stringify(summary, null, 2));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    console.error("Error en importacion historica:", message);
    process.exitCode = 1;
  }
}

void run();
