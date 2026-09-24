-- Credyx Blueprints: graphs, live runs, subject assignments (admin-only).

CREATE TABLE IF NOT EXISTS blueprints (
  id text PRIMARY KEY,
  name text NOT NULL,
  priority integer NOT NULL DEFAULT 0,
  nodes jsonb NOT NULL DEFAULT '[]'::jsonb,
  edges jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER blueprints_updated_at
  BEFORE UPDATE ON blueprints
  FOR EACH ROW EXECUTE FUNCTION credyx_set_updated_at();

CREATE TABLE IF NOT EXISTS blueprint_runs (
  id text PRIMARY KEY,
  subject text NOT NULL CHECK (subject IN ('invoice', 'broker', 'batch')),
  subject_id text,
  subject_label text NOT NULL DEFAULT '',
  client_label text NOT NULL DEFAULT '',
  blueprint_id text NOT NULL REFERENCES blueprints(id) ON DELETE CASCADE,
  blueprint_name text NOT NULL DEFAULT '',
  status text NOT NULL CHECK (status IN ('waiting', 'active', 'paused', 'completed', 'stopped')),
  current_step text NOT NULL DEFAULT '',
  current_node_id text,
  wait_until timestamptz,
  started_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS blueprint_runs_status_wait_idx
  ON blueprint_runs (status, wait_until);
CREATE INDEX IF NOT EXISTS blueprint_runs_subject_idx
  ON blueprint_runs (subject, subject_id);
CREATE INDEX IF NOT EXISTS blueprint_runs_blueprint_idx
  ON blueprint_runs (blueprint_id);

CREATE TRIGGER blueprint_runs_updated_at
  BEFORE UPDATE ON blueprint_runs
  FOR EACH ROW EXECUTE FUNCTION credyx_set_updated_at();

CREATE TABLE IF NOT EXISTS invoice_blueprint_assignments (
  invoice_id text PRIMARY KEY REFERENCES invoices(id) ON DELETE CASCADE,
  blueprint_id text NOT NULL REFERENCES blueprints(id) ON DELETE CASCADE,
  blueprint_name text NOT NULL DEFAULT '',
  assigned_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS broker_blueprint_assignments (
  broker_id text PRIMARY KEY REFERENCES brokers(id) ON DELETE CASCADE,
  blueprint_id text NOT NULL REFERENCES blueprints(id) ON DELETE CASCADE,
  blueprint_name text NOT NULL DEFAULT '',
  assigned_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS batch_blueprint_assignments (
  batch_id text PRIMARY KEY REFERENCES batches(id) ON DELETE CASCADE,
  blueprint_id text NOT NULL REFERENCES blueprints(id) ON DELETE CASCADE,
  blueprint_name text NOT NULL DEFAULT '',
  assigned_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE blueprints ENABLE ROW LEVEL SECURITY;
ALTER TABLE blueprint_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_blueprint_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE broker_blueprint_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE batch_blueprint_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS credyx_blueprints_admin ON blueprints;
CREATE POLICY credyx_blueprints_admin ON blueprints
  FOR ALL
  USING (credyx_is_admin())
  WITH CHECK (credyx_is_admin());

DROP POLICY IF EXISTS credyx_blueprint_runs_admin ON blueprint_runs;
CREATE POLICY credyx_blueprint_runs_admin ON blueprint_runs
  FOR ALL
  USING (credyx_is_admin())
  WITH CHECK (credyx_is_admin());

DROP POLICY IF EXISTS credyx_invoice_blueprint_assignments_admin ON invoice_blueprint_assignments;
CREATE POLICY credyx_invoice_blueprint_assignments_admin ON invoice_blueprint_assignments
  FOR ALL
  USING (credyx_is_admin())
  WITH CHECK (credyx_is_admin());

DROP POLICY IF EXISTS credyx_broker_blueprint_assignments_admin ON broker_blueprint_assignments;
CREATE POLICY credyx_broker_blueprint_assignments_admin ON broker_blueprint_assignments
  FOR ALL
  USING (credyx_is_admin())
  WITH CHECK (credyx_is_admin());

DROP POLICY IF EXISTS credyx_batch_blueprint_assignments_admin ON batch_blueprint_assignments;
CREATE POLICY credyx_batch_blueprint_assignments_admin ON batch_blueprint_assignments
  FOR ALL
  USING (credyx_is_admin())
  WITH CHECK (credyx_is_admin());
