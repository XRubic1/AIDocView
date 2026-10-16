-- Sales outreach email: campaigns (bulk sends), one conversation per lead address, and every message.
-- Admin-only, mirroring sales_leads. Replies are filed here by the email-inbound function.

CREATE TABLE IF NOT EXISTS sales_email_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject text NOT NULL DEFAULT '',
  body_text text NOT NULL DEFAULT '',
  recipient_count integer NOT NULL DEFAULT 0,
  sent_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sales_email_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES sales_leads(id) ON DELETE SET NULL,
  to_address text NOT NULL,
  company_name text,
  subject text NOT NULL DEFAULT '',
  last_message_at timestamptz NOT NULL DEFAULT now(),
  last_direction text NOT NULL DEFAULT 'outbound'
    CHECK (last_direction IN ('inbound', 'outbound')),
  unread boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- One conversation per recipient address.
CREATE UNIQUE INDEX IF NOT EXISTS sales_email_threads_to_uidx
  ON sales_email_threads (lower(to_address));
CREATE INDEX IF NOT EXISTS sales_email_threads_lead_idx ON sales_email_threads (lead_id);
CREATE INDEX IF NOT EXISTS sales_email_threads_last_idx ON sales_email_threads (last_message_at DESC);

CREATE TABLE IF NOT EXISTS sales_email_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES sales_email_threads(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES sales_leads(id) ON DELETE SET NULL,
  campaign_id uuid REFERENCES sales_email_campaigns(id) ON DELETE SET NULL,
  direction text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  status text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'failed', 'received')),
  from_address text NOT NULL DEFAULT '',
  to_address text NOT NULL DEFAULT '',
  subject text NOT NULL DEFAULT '',
  body_text text NOT NULL DEFAULT '',
  provider_message_id text,
  error text,
  sent_by text,
  sent_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sales_email_messages_thread_idx
  ON sales_email_messages (thread_id, sent_at);
CREATE INDEX IF NOT EXISTS sales_email_messages_campaign_idx
  ON sales_email_messages (campaign_id);

ALTER TABLE sales_email_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_email_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_email_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sales_email_campaigns_admin ON sales_email_campaigns;
CREATE POLICY sales_email_campaigns_admin ON sales_email_campaigns
  FOR ALL TO authenticated
  USING (credyx_is_admin())
  WITH CHECK (credyx_is_admin());

DROP POLICY IF EXISTS sales_email_threads_admin ON sales_email_threads;
CREATE POLICY sales_email_threads_admin ON sales_email_threads
  FOR ALL TO authenticated
  USING (credyx_is_admin())
  WITH CHECK (credyx_is_admin());

DROP POLICY IF EXISTS sales_email_messages_admin ON sales_email_messages;
CREATE POLICY sales_email_messages_admin ON sales_email_messages
  FOR ALL TO authenticated
  USING (credyx_is_admin())
  WITH CHECK (credyx_is_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON sales_email_campaigns TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON sales_email_threads TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON sales_email_messages TO authenticated;
