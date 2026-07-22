-- Lock fee terms onto each issued Credyx bill so reversal reimbursements
-- use the rate that was charged, even if Fee Terms change later.
ALTER TABLE client_bills
  ADD COLUMN IF NOT EXISTS fee_terms_snapshot JSONB;
