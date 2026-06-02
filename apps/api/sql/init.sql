CREATE DATABASE IF NOT EXISTS contratos_publicos CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE contratos_publicos;

CREATE TABLE IF NOT EXISTS contracts (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  source_type ENUM('contrato_menor', 'licitacion') NOT NULL,
  expediente VARCHAR(255) NOT NULL,
  contract_type VARCHAR(255) NULL,
  objeto TEXT NULL,
  estado VARCHAR(255) NULL,
  fecha_referencia VARCHAR(255) NULL,
  importe DECIMAL(15,2) NULL,
  adjudicatario VARCHAR(255) NULL,
  fechas TEXT NULL,
  source_url TEXT NULL,
  raw_payload JSON NULL,
  first_seen_at DATETIME NOT NULL,
  last_seen_at DATETIME NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_contract_source_expediente (source_type, expediente),
  KEY idx_contract_source_type (source_type),
  KEY idx_contract_last_seen (last_seen_at)
);

CREATE TABLE IF NOT EXISTS scrape_runs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  source_type ENUM('contrato_menor', 'licitacion', 'all') NOT NULL,
  status ENUM('ok', 'error') NOT NULL,
  fetched_count INT UNSIGNED NOT NULL DEFAULT 0,
  stored_count INT UNSIGNED NOT NULL DEFAULT 0,
  error_message TEXT NULL,
  started_at DATETIME NOT NULL,
  finished_at DATETIME NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_scrape_runs_source_created (source_type, created_at)
);
