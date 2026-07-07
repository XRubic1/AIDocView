-- A/R billing, client suspension, platform settings, admin notifications

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS factoring BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ar_rate_override NUMERIC;

DO $$
BEGIN
  ALTER TYPE client_status ADD VALUE IF NOT EXISTS 'suspended';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS client_bills (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  period TEXT NOT NULL,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  due_at TIMESTAMPTZ NOT NULL,
  amount NUMERIC NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'paid', 'overdue', 'written_off')),
  paid_at TIMESTAMPTZ,
  payoneer_reference TEXT,
  line_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (client_id, period)
);

CREATE INDEX IF NOT EXISTS client_bills_client_period_idx ON client_bills (client_id, period DESC);

ALTER TABLE client_bills ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS credyx_client_bills_tenant ON client_bills;
CREATE POLICY credyx_client_bills_tenant ON client_bills
  FOR ALL TO authenticated
  USING (credyx_is_admin() OR client_id = credyx_current_client_id())
  WITH CHECK (credyx_is_admin() OR client_id = credyx_current_client_id());

CREATE TABLE IF NOT EXISTS platform_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS credyx_platform_settings_admin ON platform_settings;
CREATE POLICY credyx_platform_settings_admin ON platform_settings
  FOR ALL TO authenticated
  USING (credyx_is_admin())
  WITH CHECK (credyx_is_admin());

CREATE TABLE IF NOT EXISTS admin_notifications (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read BOOLEAN NOT NULL DEFAULT FALSE,
  link TEXT,
  link_label TEXT,
  metadata JSONB
);

CREATE INDEX IF NOT EXISTS admin_notifications_timestamp_idx ON admin_notifications (timestamp DESC);

ALTER TABLE admin_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS credyx_admin_notifications ON admin_notifications;
CREATE POLICY credyx_admin_notifications ON admin_notifications
  FOR ALL TO authenticated
  USING (credyx_is_admin())
  WITH CHECK (credyx_is_admin());
