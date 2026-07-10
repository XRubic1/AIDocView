-- Short-payment fee reimbursement ledger and client reimbursement account balance

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS reimbursement_balance NUMERIC NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS reimbursement_ledger (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  payment_id TEXT NOT NULL,
  parent_payment_id TEXT NOT NULL,
  invoice_id TEXT NOT NULL,
  invoice_number TEXT NOT NULL,
  short_amount NUMERIC NOT NULL,
  fee_rate_pct NUMERIC NOT NULL,
  fee_credit_amount NUMERIC NOT NULL,
  period TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'applied')),
  applied_to_bill_id TEXT,
  applied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (payment_id)
);

CREATE INDEX IF NOT EXISTS idx_reimbursement_ledger_client_period
  ON reimbursement_ledger (client_id, period);
