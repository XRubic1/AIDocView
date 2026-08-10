-- BrokerSnapshot cache + Credyx review queue for MC Lookup diffs.

DO $$ BEGIN
  CREATE TYPE broker_snapshot_change_status AS ENUM (
    'pending',
    'applied',
    'dismissed',
    'stale'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS broker_external_snapshots (
  id TEXT PRIMARY KEY,
  broker_id TEXT REFERENCES brokers(id) ON DELETE SET NULL,
  mc_number TEXT NOT NULL,
  mc_digits TEXT NOT NULL,
  dot_number TEXT,
  source TEXT NOT NULL DEFAULT 'brokersnapshot',
  company_id TEXT,
  legal_name TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  insurance_verdict TEXT,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  next_review_at TIMESTAMPTZ NOT NULL,
  lookup_count INT NOT NULL DEFAULT 1,
  last_lookup_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  needs_broker_add BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS broker_external_snapshots_mc_digits_uidx
  ON broker_external_snapshots (mc_digits);

CREATE INDEX IF NOT EXISTS broker_external_snapshots_next_review_idx
  ON broker_external_snapshots (next_review_at);

CREATE INDEX IF NOT EXISTS broker_external_snapshots_broker_id_idx
  ON broker_external_snapshots (broker_id);

COMMENT ON TABLE broker_external_snapshots IS
  'Cached BrokerSnapshot MC lookups. Fresh until next_review_at (30d default, 5d if insurance bad/expiring).';
COMMENT ON COLUMN broker_external_snapshots.next_review_at IS
  'Serve cache until this time; next carrier lookup after expiry refreshes Snapshot.';

CREATE TABLE IF NOT EXISTS broker_snapshot_changes (
  id TEXT PRIMARY KEY,
  snapshot_id TEXT NOT NULL REFERENCES broker_external_snapshots(id) ON DELETE CASCADE,
  broker_id TEXT REFERENCES brokers(id) ON DELETE SET NULL,
  mc_number TEXT,
  field_key TEXT NOT NULL,
  field_label TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  status broker_snapshot_change_status NOT NULL DEFAULT 'pending',
  reviewed_at TIMESTAMPTZ,
  reviewed_by TEXT,
  review_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS broker_snapshot_changes_status_idx
  ON broker_snapshot_changes (status, created_at DESC);

CREATE INDEX IF NOT EXISTS broker_snapshot_changes_broker_id_idx
  ON broker_snapshot_changes (broker_id);

CREATE UNIQUE INDEX IF NOT EXISTS broker_snapshot_changes_pending_field_uidx
  ON broker_snapshot_changes (snapshot_id, field_key)
  WHERE status = 'pending';

COMMENT ON TABLE broker_snapshot_changes IS
  'Field-level Snapshot vs Credyx broker diffs. Admin applies or dismisses each change.';

ALTER TABLE broker_external_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE broker_snapshot_changes ENABLE ROW LEVEL SECURITY;

-- Carriers/admins can read snapshots (MC lookup UX); writes via service role from Edge.
DROP POLICY IF EXISTS broker_external_snapshots_select_authenticated ON broker_external_snapshots;
CREATE POLICY broker_external_snapshots_select_authenticated
  ON broker_external_snapshots FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS broker_snapshot_changes_select_admin ON broker_snapshot_changes;
CREATE POLICY broker_snapshot_changes_select_admin
  ON broker_snapshot_changes FOR SELECT TO authenticated
  USING (
    COALESCE((auth.jwt() -> 'app_metadata' ->> 'role'), '') = 'admin'
  );

DROP POLICY IF EXISTS broker_snapshot_changes_update_admin ON broker_snapshot_changes;
CREATE POLICY broker_snapshot_changes_update_admin
  ON broker_snapshot_changes FOR UPDATE TO authenticated
  USING (
    COALESCE((auth.jwt() -> 'app_metadata' ->> 'role'), '') = 'admin'
  )
  WITH CHECK (
    COALESCE((auth.jwt() -> 'app_metadata' ->> 'role'), '') = 'admin'
  );

-- Admins may update linked brokers when applying changes (existing brokers policies may already allow).
