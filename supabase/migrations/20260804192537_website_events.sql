-- Anonymous waitlist/marketing site interaction events.
-- Anon can insert; only admins can read.
CREATE TABLE IF NOT EXISTS website_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  path text NOT NULL DEFAULT '/',
  event_name text NOT NULL,
  target text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS website_events_occurred_at_idx
  ON website_events (occurred_at DESC);

CREATE INDEX IF NOT EXISTS website_events_event_name_idx
  ON website_events (event_name);

CREATE INDEX IF NOT EXISTS website_events_target_idx
  ON website_events (target);

CREATE INDEX IF NOT EXISTS website_events_session_id_idx
  ON website_events (session_id);

ALTER TABLE website_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS website_events_anon_insert ON website_events;
CREATE POLICY website_events_anon_insert ON website_events
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS website_events_admin_select ON website_events;
CREATE POLICY website_events_admin_select ON website_events
  FOR SELECT TO authenticated
  USING (credyx_is_admin());

GRANT SELECT ON website_events TO authenticated;
GRANT INSERT ON website_events TO anon, authenticated;
