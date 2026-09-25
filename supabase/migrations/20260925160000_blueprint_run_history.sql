-- Persist step-by-step blueprint run history on each enrollment.

ALTER TABLE blueprint_runs
  ADD COLUMN IF NOT EXISTS history jsonb NOT NULL DEFAULT '[]'::jsonb;
