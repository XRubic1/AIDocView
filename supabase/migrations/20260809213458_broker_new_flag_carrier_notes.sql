-- Credyx-marked NEW brokers + carrier-visible notes (separate from admin-only notes).

ALTER TABLE brokers
  ADD COLUMN IF NOT EXISTS is_new BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS carrier_notes TEXT;

COMMENT ON COLUMN brokers.is_new IS
  'Credyx marks broker as NEW for carriers — thin or no payment history; treat as elevated risk.';
COMMENT ON COLUMN brokers.carrier_notes IS
  'Credyx notes visible to carriers (not the same as internal brokers.notes).';
COMMENT ON COLUMN brokers.notes IS
  'Internal Credyx-only notes — never exposed to carriers.';
