-- Phase 0 foundations: broker risk cache, invoice action plans/calendar, job runs.
-- Append-only risk profiles (new row per analysis). Calendar events use obsolete, not delete.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE broker_risk_level AS ENUM ('low', 'medium', 'high', 'unrated');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE broker_risk_confidence AS ENUM ('low', 'medium', 'high');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE broker_risk_trigger AS ENUM ('weekly', 'payment', 'dispute', 'note', 'manual', 'backfill');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE broker_risk_scope AS ENUM ('carrier', 'network');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE broker_risk_evidence_source AS ENUM ('invoice', 'note', 'payment', 'dispute');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE invoice_action_plan_status AS ENUM ('active', 'closed', 'superseded');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE invoice_calendar_event_type AS ENUM (
    'paperwork_check',
    'payment_status_check',
    'reminder',
    'expected_payment',
    'escalate',
    'call'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE invoice_calendar_event_owner AS ENUM ('system', 'user', 'credyx_staff');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE invoice_calendar_event_status AS ENUM ('pending', 'done', 'snoozed', 'obsolete');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE ops_job_kind AS ENUM (
    'broker_risk_weekly',
    'invoice_plan_sync',
    'due_action_notifier',
    'event_reanalysis'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE ops_job_run_status AS ENUM ('running', 'succeeded', 'failed', 'partial');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- broker_risk_profiles (append-only history per carrier+broker)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS broker_risk_profiles (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  broker_id TEXT NOT NULL REFERENCES brokers(id) ON DELETE CASCADE,
  mc_number TEXT,
  risk_level broker_risk_level NOT NULL DEFAULT 'unrated',
  confidence broker_risk_confidence NOT NULL DEFAULT 'low',
  summary_text TEXT NOT NULL DEFAULT '',
  recommendation_text TEXT NOT NULL DEFAULT '',
  metrics JSONB NOT NULL DEFAULT '{}'::JSONB,
  evidence_bullets JSONB NOT NULL DEFAULT '[]'::JSONB,
  analyzed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "trigger" broker_risk_trigger NOT NULL DEFAULT 'weekly',
  model_version TEXT NOT NULL DEFAULT 'rules-v1',
  scope broker_risk_scope NOT NULL DEFAULT 'carrier',
  window_end DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS broker_risk_profiles_client_broker_analyzed_idx
  ON broker_risk_profiles (client_id, broker_id, analyzed_at DESC);

CREATE INDEX IF NOT EXISTS broker_risk_profiles_mc_analyzed_idx
  ON broker_risk_profiles (mc_number, analyzed_at DESC)
  WHERE mc_number IS NOT NULL;

COMMENT ON TABLE broker_risk_profiles IS
  'Cached broker behavioral risk. New row per analysis; UI reads latest by (client_id, broker_id).';

-- ---------------------------------------------------------------------------
-- broker_risk_evidence
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS broker_risk_evidence (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES broker_risk_profiles(id) ON DELETE CASCADE,
  source_type broker_risk_evidence_source NOT NULL,
  source_id TEXT,
  weight NUMERIC(6, 3) NOT NULL DEFAULT 1,
  source_dated_at TIMESTAMPTZ,
  label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS broker_risk_evidence_profile_idx
  ON broker_risk_evidence (profile_id);

COMMENT ON COLUMN broker_risk_evidence.source_dated_at IS
  'Business date of the signal (invoice/payment/note). Age weighting uses this, not fetch time.';

-- ---------------------------------------------------------------------------
-- broker_risk_alerts (Phase 2 push — schema reserved)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS broker_risk_alerts (
  id TEXT PRIMARY KEY,
  broker_id TEXT NOT NULL REFERENCES brokers(id) ON DELETE CASCADE,
  created_by TEXT,
  message TEXT NOT NULL,
  sent_at TIMESTAMPTZ,
  target JSONB NOT NULL DEFAULT '{}'::JSONB,
  acknowledgments JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- invoice_action_plans
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS invoice_action_plans (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  strategy_version TEXT NOT NULL DEFAULT 'rules-v1',
  expected_payment_date DATE,
  expected_payment_confidence broker_risk_confidence NOT NULL DEFAULT 'low',
  status invoice_action_plan_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS invoice_action_plans_one_active_idx
  ON invoice_action_plans (invoice_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS invoice_action_plans_client_status_idx
  ON invoice_action_plans (client_id, status);

-- ---------------------------------------------------------------------------
-- invoice_calendar_events
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS invoice_calendar_events (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL REFERENCES invoice_action_plans(id) ON DELETE CASCADE,
  invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  type invoice_calendar_event_type NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  detail TEXT NOT NULL DEFAULT '',
  due_at TIMESTAMPTZ NOT NULL,
  owner invoice_calendar_event_owner NOT NULL DEFAULT 'user',
  status invoice_calendar_event_status NOT NULL DEFAULT 'pending',
  completed_at TIMESTAMPTZ,
  completion_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS invoice_calendar_events_client_due_idx
  ON invoice_calendar_events (client_id, due_at);

CREATE INDEX IF NOT EXISTS invoice_calendar_events_invoice_status_idx
  ON invoice_calendar_events (invoice_id, status);

CREATE INDEX IF NOT EXISTS invoice_calendar_events_plan_idx
  ON invoice_calendar_events (plan_id);

-- ---------------------------------------------------------------------------
-- invoice_action_notifications
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS invoice_action_notifications (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES invoice_calendar_events(id) ON DELETE CASCADE,
  user_id TEXT,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  channel TEXT NOT NULL DEFAULT 'in_app',
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS invoice_action_notifications_client_idx
  ON invoice_action_notifications (client_id, delivered_at DESC);

-- ---------------------------------------------------------------------------
-- ops_job_runs — health for weekly/nightly skeletons
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ops_job_runs (
  id TEXT PRIMARY KEY,
  kind ops_job_kind NOT NULL,
  status ops_job_run_status NOT NULL DEFAULT 'running',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  success_count INT NOT NULL DEFAULT 0,
  fail_count INT NOT NULL DEFAULT 0,
  skipped_count INT NOT NULL DEFAULT 0,
  detail JSONB NOT NULL DEFAULT '{}'::JSONB,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS ops_job_runs_kind_started_idx
  ON ops_job_runs (kind, started_at DESC);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE broker_risk_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE broker_risk_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE broker_risk_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_action_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_action_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops_job_runs ENABLE ROW LEVEL SECURITY;

-- Carrier/admin read own risk profiles
DROP POLICY IF EXISTS credyx_broker_risk_profiles_select ON broker_risk_profiles;
CREATE POLICY credyx_broker_risk_profiles_select ON broker_risk_profiles
  FOR SELECT TO authenticated
  USING (credyx_can_access_client(client_id));

DROP POLICY IF EXISTS credyx_broker_risk_profiles_write ON broker_risk_profiles;
CREATE POLICY credyx_broker_risk_profiles_write ON broker_risk_profiles
  FOR ALL TO authenticated
  USING (credyx_is_admin())
  WITH CHECK (credyx_is_admin());

DROP POLICY IF EXISTS credyx_broker_risk_evidence_select ON broker_risk_evidence;
CREATE POLICY credyx_broker_risk_evidence_select ON broker_risk_evidence
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM broker_risk_profiles p
      WHERE p.id = profile_id AND credyx_can_access_client(p.client_id)
    )
  );

DROP POLICY IF EXISTS credyx_broker_risk_evidence_write ON broker_risk_evidence;
CREATE POLICY credyx_broker_risk_evidence_write ON broker_risk_evidence
  FOR ALL TO authenticated
  USING (credyx_is_admin())
  WITH CHECK (credyx_is_admin());

-- Alerts: admin-only until Phase 2
DROP POLICY IF EXISTS credyx_broker_risk_alerts_admin ON broker_risk_alerts;
CREATE POLICY credyx_broker_risk_alerts_admin ON broker_risk_alerts
  FOR ALL TO authenticated
  USING (credyx_is_admin())
  WITH CHECK (credyx_is_admin());

DROP POLICY IF EXISTS credyx_invoice_action_plans_select ON invoice_action_plans;
CREATE POLICY credyx_invoice_action_plans_select ON invoice_action_plans
  FOR SELECT TO authenticated
  USING (credyx_can_access_client(client_id));

DROP POLICY IF EXISTS credyx_invoice_action_plans_write ON invoice_action_plans;
CREATE POLICY credyx_invoice_action_plans_write ON invoice_action_plans
  FOR ALL TO authenticated
  USING (credyx_is_admin() OR credyx_can_access_client(client_id))
  WITH CHECK (credyx_is_admin() OR credyx_can_access_client(client_id));

DROP POLICY IF EXISTS credyx_invoice_calendar_events_select ON invoice_calendar_events;
CREATE POLICY credyx_invoice_calendar_events_select ON invoice_calendar_events
  FOR SELECT TO authenticated
  USING (credyx_can_access_client(client_id));

DROP POLICY IF EXISTS credyx_invoice_calendar_events_write ON invoice_calendar_events;
CREATE POLICY credyx_invoice_calendar_events_write ON invoice_calendar_events
  FOR ALL TO authenticated
  USING (credyx_is_admin() OR credyx_can_access_client(client_id))
  WITH CHECK (credyx_is_admin() OR credyx_can_access_client(client_id));

DROP POLICY IF EXISTS credyx_invoice_action_notifications_select ON invoice_action_notifications;
CREATE POLICY credyx_invoice_action_notifications_select ON invoice_action_notifications
  FOR SELECT TO authenticated
  USING (credyx_can_access_client(client_id));

DROP POLICY IF EXISTS credyx_invoice_action_notifications_write ON invoice_action_notifications;
CREATE POLICY credyx_invoice_action_notifications_write ON invoice_action_notifications
  FOR ALL TO authenticated
  USING (credyx_is_admin() OR credyx_can_access_client(client_id))
  WITH CHECK (credyx_is_admin() OR credyx_can_access_client(client_id));

-- Job runs are admin-only
DROP POLICY IF EXISTS credyx_ops_job_runs_admin ON ops_job_runs;
CREATE POLICY credyx_ops_job_runs_admin ON ops_job_runs
  FOR ALL TO authenticated
  USING (credyx_is_admin())
  WITH CHECK (credyx_is_admin());
