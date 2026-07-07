-- Write-off approval + payment lifecycle extensions

ALTER TYPE invoice_status ADD VALUE IF NOT EXISTS 'write_off_pending';
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS write_off_request JSONB;

-- Payment status: add rejected + reversed; tracking columns
DO $$
BEGIN
  ALTER TYPE payment_status ADD VALUE IF NOT EXISTS 'rejected';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TYPE payment_status ADD VALUE IF NOT EXISTS 'reversed';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS posted_source TEXT,
  ADD COLUMN IF NOT EXISTS posted_by TEXT,
  ADD COLUMN IF NOT EXISTS confirmed_by TEXT,
  ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reversed_by TEXT,
  ADD COLUMN IF NOT EXISTS reversal_reason TEXT,
  ADD COLUMN IF NOT EXISTS reversal_type TEXT,
  ADD COLUMN IF NOT EXISTS moved_to_payment_id TEXT,
  ADD COLUMN IF NOT EXISTS moved_from_payment_id TEXT;
