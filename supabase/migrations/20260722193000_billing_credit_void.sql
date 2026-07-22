-- Allow voiding pending billing credits / discounts on the reimbursement ledger.

ALTER TABLE reimbursement_ledger
  DROP CONSTRAINT IF EXISTS reimbursement_ledger_status_check;

ALTER TABLE reimbursement_ledger
  ADD CONSTRAINT reimbursement_ledger_status_check
  CHECK (status IN ('pending', 'applied', 'voided'));

ALTER TABLE reimbursement_ledger
  ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS voided_by TEXT,
  ADD COLUMN IF NOT EXISTS void_reason TEXT;
