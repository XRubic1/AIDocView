-- Broker risk review gate: Credyx reviews elevated risk before carriers see it.

DO $$ BEGIN
  CREATE TYPE broker_risk_review_status AS ENUM (
    'auto_published',
    'pending_review',
    'published',
    'cleared'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE broker_risk_profiles
  ADD COLUMN IF NOT EXISTS computed_risk_level broker_risk_level,
  ADD COLUMN IF NOT EXISTS review_status broker_risk_review_status NOT NULL DEFAULT 'auto_published',
  ADD COLUMN IF NOT EXISTS review_note TEXT,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewed_by TEXT;

-- Backfill computed_risk_level from risk_level where missing.
UPDATE broker_risk_profiles
SET computed_risk_level = risk_level
WHERE computed_risk_level IS NULL;

ALTER TABLE broker_risk_profiles
  ALTER COLUMN computed_risk_level SET DEFAULT 'unrated';

UPDATE broker_risk_profiles
SET computed_risk_level = COALESCE(computed_risk_level, 'unrated')
WHERE computed_risk_level IS NULL;

CREATE INDEX IF NOT EXISTS broker_risk_profiles_review_status_idx
  ON broker_risk_profiles (review_status, analyzed_at DESC);

COMMENT ON COLUMN broker_risk_profiles.computed_risk_level IS
  'Engine output before Credyx publish/clear.';
COMMENT ON COLUMN broker_risk_profiles.review_status IS
  'auto_published (low) | pending_review (elevated) | published | cleared';
COMMENT ON COLUMN broker_risk_profiles.risk_level IS
  'Carrier-visible level after review gate (pending_review → treat as unrated in app).';
