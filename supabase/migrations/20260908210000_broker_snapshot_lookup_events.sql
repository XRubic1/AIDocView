-- Per-lookup log so Credyx can see which carriers ran MC Lookup and what they got.

CREATE TABLE IF NOT EXISTS broker_snapshot_lookup_events (
  id TEXT PRIMARY KEY,
  snapshot_id TEXT REFERENCES broker_external_snapshots(id) ON DELETE SET NULL,
  mc_number TEXT,
  mc_digits TEXT NOT NULL,
  client_id TEXT,
  from_cache BOOLEAN NOT NULL DEFAULT false,
  insurance_verdict TEXT,
  legal_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS broker_snapshot_lookup_events_mc_idx
  ON broker_snapshot_lookup_events (mc_digits, created_at DESC);

CREATE INDEX IF NOT EXISTS broker_snapshot_lookup_events_client_idx
  ON broker_snapshot_lookup_events (client_id, created_at DESC);

COMMENT ON TABLE broker_snapshot_lookup_events IS
  'Each carrier (or admin) MC Lookup. Payload lives on broker_external_snapshots.';

ALTER TABLE broker_snapshot_lookup_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS broker_snapshot_lookup_events_select_admin ON broker_snapshot_lookup_events;
CREATE POLICY broker_snapshot_lookup_events_select_admin
  ON broker_snapshot_lookup_events FOR SELECT TO authenticated
  USING (
    COALESCE((auth.jwt() -> 'app_metadata' ->> 'role'), '') = 'admin'
  );
