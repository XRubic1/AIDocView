-- Managed client payment receipt confirmation and dispute workflow

DO $$ BEGIN
  ALTER TYPE payment_status ADD VALUE IF NOT EXISTS 'awaiting_receipt';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE payment_status ADD VALUE IF NOT EXISTS 'disputed';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS client_confirmation_deadline timestamptz,
  ADD COLUMN IF NOT EXISTS client_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS client_confirmed_by text,
  ADD COLUMN IF NOT EXISTS dispute jsonb;
