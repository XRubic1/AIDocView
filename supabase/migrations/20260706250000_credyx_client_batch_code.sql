-- Per-client 4-letter batch code (e.g. ABCL) used in BATCH-2026-001-ABCL

ALTER TABLE clients ADD COLUMN IF NOT EXISTS batch_code TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS clients_batch_code_uidx
  ON clients (UPPER(batch_code))
  WHERE batch_code IS NOT NULL;
