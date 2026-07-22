-- Lock fee terms on batches and invoices so trial / rate changes do not rewrite history.
-- Client Fee Terms remain the source for NEW batches only.

ALTER TABLE batches
  ADD COLUMN IF NOT EXISTS fee_terms JSONB;

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS fee_terms JSONB;

COMMENT ON COLUMN batches.fee_terms IS
  'Locked fee terms at batch create (or manual batch edit). Cascades to invoices.';
COMMENT ON COLUMN invoices.fee_terms IS
  'Locked fee terms inherited from batch. Trial invoices are not charged on Credyx bills.';
