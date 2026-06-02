import "./style.css";

interface ContractItem {
  id: number;
  sourceType: "contrato_menor" | "licitacion";
  expediente: string | null;
  contractType: string | null;
  objeto: string | null;
  estado: string | null;
  fechaReferencia: string | null;
  importe: number | null;
  adjudicatario: string | null;
  fechas: string | null;
}

interface ContractsResponse {
  items: ContractItem[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

interface ScrapeStatusResponse {
  running: boolean;
  sourceType: "all" | "contrato_menor" | "licitacion" | null;
  stage: string;
  currentSource: "contrato_menor" | "licitacion" | null;
  totalSources: number;
  processedSources: number;
  fetchedCount: number;
  storedCount: number;
  startedAt: string | null;
  finishedAt: string | null;
  errorMessage: string | null;
  lastResult: unknown;
}

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) || "";

const sourceTypeSelect = document.querySelector("#sourceType") as HTMLSelectElement;
const importBtn = document.querySelector("#importBtn") as HTMLButtonElement;
const scrapeBtn = document.querySelector("#scrapeBtn") as HTMLButtonElement;
const reloadBtn = document.querySelector("#reloadBtn") as HTMLButtonElement;
const resultsEl = document.querySelector("#results") as HTMLElement;
const statsEl = document.querySelector("#stats") as HTMLElement;

async function fetchContracts(): Promise<ContractsResponse> {
  const sourceType = sourceTypeSelect.value;
  const params = new URLSearchParams({ limit: "100", offset: "0" });

  if (sourceType) {
    params.set("sourceType", sourceType);
  }

  const response = await fetch(`${API_BASE}/api/contracts?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Error API: ${response.status}`);
  }

  return (await response.json()) as ContractsResponse;
}

function renderStats(total: number): void {
  statsEl.innerHTML = `
    <article>
      <h2>Total registros</h2>
      <p>${total}</p>
    </article>
  `;
}

function renderRows(items: ContractItem[]): void {
  if (!items.length) {
    resultsEl.innerHTML = '<p class="empty">No hay resultados para este filtro.</p>';
    return;
  }

  resultsEl.innerHTML = items
    .map(
      (item) => {
        const adjudicatarioText =
          item.sourceType === "licitacion"
            ? "No disponible en licitaciones"
            : item.adjudicatario || "-";

        return `
      <article class="card">
        <header>
          <span class="badge">${item.sourceType}</span>
          <span class="expediente">${item.expediente || "Sin expediente"}</span>
        </header>
        <h3>${item.objeto || "Sin objeto"}</h3>
        <ul>
          <li><strong>Tipo:</strong> ${item.contractType || "-"}</li>
          <li><strong>Estado:</strong> ${item.estado || "-"}</li>
          <li><strong>Importe:</strong> ${item.importe ?? "-"}</li>
          <li><strong>Fecha:</strong> ${item.fechaReferencia || item.fechas || "-"}</li>
          <li><strong>Adjudicatario:</strong> ${adjudicatarioText}</li>
        </ul>
      </article>
    `;
      }
    )
    .join("");
}

async function loadData(): Promise<void> {
  reloadBtn.disabled = true;
  reloadBtn.textContent = "Cargando...";

  try {
    const data = await fetchContracts();
    renderStats(data.pagination.total);
    renderRows(data.items);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    resultsEl.innerHTML = `<p class="empty">${message}</p>`;
  } finally {
    reloadBtn.disabled = false;
    reloadBtn.textContent = "Actualizar";
  }
}

async function runHistoricalImport(): Promise<void> {
  importBtn.disabled = true;
  importBtn.textContent = "Importando...";

  try {
    const response = await fetch(`${API_BASE}/api/import/historical`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    if (!response.ok) {
      throw new Error(`Error al importar: ${response.status}`);
    }

    await loadData();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    resultsEl.innerHTML = `<p class="empty">${message}</p>`;
  } finally {
    importBtn.disabled = false;
    importBtn.textContent = "Importar historicos";
  }
}

async function runScrapeNow(): Promise<void> {
  scrapeBtn.disabled = true;
  importBtn.disabled = true;
  reloadBtn.disabled = true;
  scrapeBtn.textContent = "Iniciando...";

  try {
    const response = await fetch(`${API_BASE}/api/scrape/run?async=true`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourceType: "all" }),
    });

    if (!response.ok) {
      throw new Error(`Error al scrapear: ${response.status}`);
    }

    while (true) {
      const statusResponse = await fetch(`${API_BASE}/api/scrape/status`);
      if (!statusResponse.ok) {
        throw new Error(`Error estado scraping: ${statusResponse.status}`);
      }

      const status = (await statusResponse.json()) as ScrapeStatusResponse;
      const currentSourceLabel = status.currentSource || "esperando";
      scrapeBtn.textContent = `Scrapeando ${status.processedSources}/${Math.max(status.totalSources, 1)} · ${currentSourceLabel} · ${status.fetchedCount} filas`;

      if (!status.running) {
        if (status.stage === "error") {
          throw new Error(status.errorMessage || "Error desconocido de scraping");
        }
        break;
      }

      await new Promise((resolve) => {
        setTimeout(resolve, 2000);
      });
    }

    await loadData();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    resultsEl.innerHTML = `<p class="empty">${message}</p>`;
  } finally {
    scrapeBtn.disabled = false;
    importBtn.disabled = false;
    reloadBtn.disabled = false;
    scrapeBtn.textContent = "Ejecutar scraping";
  }
}

reloadBtn.addEventListener("click", () => {
  void loadData();
});
importBtn.addEventListener("click", () => {
  void runHistoricalImport();
});
scrapeBtn.addEventListener("click", () => {
  void runScrapeNow();
});
sourceTypeSelect.addEventListener("change", () => {
  void loadData();
});

void loadData();
