-- Manual billing discounts / invoice-fee reimbursements on the reimbursement account.
-- Credits reduce the next issued bill and never drive the bill below $0.

ALTER TABLE reimbursement_ledger
  ALTER COLUMN payment_id DROP NOT NULL,
  ALTER COLUMN parent_payment_id DROP NOT NULL,
  ALTER COLUMN invoice_id DROP NOT NULL,
  ALTER COLUMN invoice_number DROP NOT NULL,
  ALTER COLUMN short_amount DROP NOT NULL,
  ALTER COLUMN fee_rate_pct DROP NOT NULL;

ALTER TABLE reimbursement_ledger
  ADD COLUMN IF NOT EXISTS credit_type TEXT NOT NULL DEFAULT 'short_payment',
  ADD COLUMN IF NOT EXISTS reason TEXT,
  ADD COLUMN IF NOT EXISTS note TEXT,
  ADD COLUMN IF NOT EXISTS created_by TEXT;

DO $$
BEGIN
  ALTER TABLE reimbursement_ledger
    ADD CONSTRAINT reimbursement_ledger_credit_type_check
    CHECK (credit_type IN ('short_payment', 'invoice_fee_reimbursement', 'manual_discount'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Allow multiple manual credits without a payment_id; keep one row per short payment.
ALTER TABLE reimbursement_ledger DROP CONSTRAINT IF EXISTS reimbursement_ledger_payment_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS reimbursement_ledger_payment_id_unique
  ON reimbursement_ledger (payment_id)
  WHERE payment_id IS NOT NULL;

ALTER TABLE reimbursement_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS credyx_reimbursement_ledger_tenant ON reimbursement_ledger;
CREATE POLICY credyx_reimbursement_ledger_tenant ON reimbursement_ledger
  FOR ALL TO authenticated
  USING (credyx_is_admin() OR client_id = credyx_current_client_id())
  WITH CHECK (credyx_is_admin() OR client_id = credyx_current_client_id());
