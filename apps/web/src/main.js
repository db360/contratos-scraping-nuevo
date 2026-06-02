import "./style.css";

const API_BASE = "http://localhost:4000";

const sourceTypeSelect = document.querySelector("#sourceType");
const reloadBtn = document.querySelector("#reloadBtn");
const resultsEl = document.querySelector("#results");
const statsEl = document.querySelector("#stats");

async function fetchContracts() {
  const sourceType = sourceTypeSelect.value;
  const params = new URLSearchParams({ limit: "100", offset: "0" });

  if (sourceType) {
    params.set("sourceType", sourceType);
  }

  const response = await fetch(`${API_BASE}/api/contracts?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Error API: ${response.status}`);
  }

  return response.json();
}

function renderStats(total) {
  statsEl.innerHTML = `
    <article>
      <h2>Total registros</h2>
      <p>${total}</p>
    </article>
  `;
}

function renderRows(items) {
  if (!items.length) {
    resultsEl.innerHTML = '<p class="empty">No hay resultados para este filtro.</p>';
    return;
  }

  resultsEl.innerHTML = items
    .map(
      (item) => `
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
          <li><strong>Adjudicatario:</strong> ${item.adjudicatario || "-"}</li>
        </ul>
      </article>
    `
    )
    .join("");
}

async function loadData() {
  reloadBtn.disabled = true;
  reloadBtn.textContent = "Cargando...";

  try {
    const data = await fetchContracts();
    renderStats(data.pagination.total);
    renderRows(data.items);
  } catch (error) {
    resultsEl.innerHTML = `<p class="empty">${error.message}</p>`;
  } finally {
    reloadBtn.disabled = false;
    reloadBtn.textContent = "Actualizar";
  }
}

reloadBtn.addEventListener("click", loadData);
sourceTypeSelect.addEventListener("change", loadData);

loadData();
