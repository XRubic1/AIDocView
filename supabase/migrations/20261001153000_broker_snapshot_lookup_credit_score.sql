-- Freeze the credit score from the MC Check that produced this history row.

ALTER TABLE public.broker_snapshot_lookup_events
  ADD COLUMN IF NOT EXISTS credit_score TEXT;

COMMENT ON COLUMN public.broker_snapshot_lookup_events.credit_score IS
  'Credit score shown on the MC Check that created this row. Older checks have no score.';
