import { pool } from "../db.js";

export async function upsertContracts(contracts) {
  if (!contracts.length) {
    return { affectedRows: 0 };
  }

  const sql = `
    INSERT INTO contracts (
      source_type,
      expediente,
      contract_type,
      objeto,
      estado,
      fecha_referencia,
      importe,
      adjudicatario,
      fechas,
      source_url,
      raw_payload,
      first_seen_at,
      last_seen_at
    ) VALUES ?
    ON DUPLICATE KEY UPDATE
      contract_type = VALUES(contract_type),
      objeto = VALUES(objeto),
      estado = VALUES(estado),
      fecha_referencia = VALUES(fecha_referencia),
      importe = VALUES(importe),
      adjudicatario = VALUES(adjudicatario),
      fechas = VALUES(fechas),
      source_url = VALUES(source_url),
      raw_payload = VALUES(raw_payload),
      last_seen_at = VALUES(last_seen_at),
      updated_at = CURRENT_TIMESTAMP
  `;

  const now = new Date();
  const values = contracts.map((item) => [
    item.sourceType,
    item.expediente,
    item.contractType,
    item.objeto,
    item.estado,
    item.fechaReferencia,
    item.importe,
    item.adjudicatario,
    item.fechas,
    item.sourceUrl,
    JSON.stringify(item.rawPayload || {}),
    now,
    now,
  ]);

  const [result] = await pool.query(sql, [values]);
  return result;
}

export async function getContracts({ sourceType, limit, offset }) {
  const filters = [];
  const params = [];

  if (sourceType) {
    filters.push("source_type = ?");
    params.push(sourceType);
  }

  const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

  const sql = `
    SELECT
      id,
      source_type AS sourceType,
      expediente,
      contract_type AS contractType,
      objeto,
      estado,
      fecha_referencia AS fechaReferencia,
      importe,
      adjudicatario,
      fechas,
      source_url AS sourceUrl,
      first_seen_at AS firstSeenAt,
      last_seen_at AS lastSeenAt,
      updated_at AS updatedAt
    FROM contracts
    ${whereClause}
    ORDER BY last_seen_at DESC
    LIMIT ? OFFSET ?
  `;

  params.push(limit, offset);
  const [rows] = await pool.query(sql, params);
  return rows;
}

export async function countContracts({ sourceType }) {
  const filters = [];
  const params = [];

  if (sourceType) {
    filters.push("source_type = ?");
    params.push(sourceType);
  }

  const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  const sql = `SELECT COUNT(*) AS total FROM contracts ${whereClause}`;
  const [rows] = await pool.query(sql, params);
  return Number(rows[0]?.total || 0);
}

export async function insertScrapeRun(run) {
  const sql = `
    INSERT INTO scrape_runs (
      source_type,
      status,
      fetched_count,
      stored_count,
      error_message,
      started_at,
      finished_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `;

  await pool.query(sql, [
    run.sourceType,
    run.status,
    run.fetchedCount,
    run.storedCount,
    run.errorMessage || null,
    run.startedAt,
    run.finishedAt,
  ]);
}
