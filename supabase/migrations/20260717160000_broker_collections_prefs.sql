-- Broker collections chase prefs + invoice attention flag
ALTER TABLE brokers
  ADD COLUMN IF NOT EXISTS payment_status_inquiry_days INT DEFAULT 15,
  ADD COLUMN IF NOT EXISTS preferred_contact TEXT CHECK (
    preferred_contact IS NULL OR preferred_contact IN ('email', 'phone', 'either')
  );

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS collections_needs_attention BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS collections_last_inquiry_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS collections_followup_at TIMESTAMPTZ;

COMMENT ON COLUMN brokers.payment_status_inquiry_days IS
  'Days after PPW sent before Credyx asks broker for payment status (manual or auto).';
COMMENT ON COLUMN brokers.preferred_contact IS
  'email | phone | either — how Credyx should chase payment status.';
COMMENT ON COLUMN invoices.collections_needs_attention IS
  'True when broker did not respond to status inquiry within follow-up window — Credyx must call.';
