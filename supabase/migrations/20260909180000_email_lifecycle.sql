-- Email lifecycle: per-broker clocks, invoice track state, inbox tables, templates.

ALTER TABLE brokers
  ADD COLUMN IF NOT EXISTS email_lifecycle JSONB;

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS email_lifecycle JSONB;

COMMENT ON COLUMN brokers.email_lifecycle IS
  'Packet/paperwork/payment email accept flags and optional chase-clock overrides.';
COMMENT ON COLUMN invoices.email_lifecycle IS
  'Paperwork then payment chase tracks (startedAt, asks, inbound).';

CREATE TABLE IF NOT EXISTS email_threads (
  id TEXT PRIMARY KEY,
  invoice_id TEXT REFERENCES invoices(id) ON DELETE CASCADE,
  broker_id TEXT,
  client_id TEXT NOT NULL,
  subject TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS email_messages (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL REFERENCES email_threads(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  from_address TEXT NOT NULL DEFAULT '',
  to_address TEXT NOT NULL DEFAULT '',
  subject TEXT NOT NULL DEFAULT '',
  body_text TEXT NOT NULL DEFAULT '',
  message_id TEXT,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  template_id TEXT
);

CREATE TABLE IF NOT EXISTS email_review_items (
  id TEXT PRIMARY KEY,
  thread_id TEXT REFERENCES email_threads(id) ON DELETE SET NULL,
  invoice_id TEXT,
  broker_id TEXT,
  client_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending_review'
    CHECK (status IN ('pending_review', 'confirmed', 'dismissed')),
  classification TEXT NOT NULL DEFAULT 'unclear',
  proposed_actions JSONB NOT NULL DEFAULT '[]'::jsonb,
  summary TEXT NOT NULL DEFAULT '',
  body_text TEXT NOT NULL DEFAULT '',
  from_address TEXT,
  subject TEXT,
  load_number TEXT,
  invoice_number TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_at TIMESTAMPTZ,
  confirmed_by TEXT
);

CREATE INDEX IF NOT EXISTS email_threads_invoice_idx ON email_threads (invoice_id);
CREATE INDEX IF NOT EXISTS email_threads_client_idx ON email_threads (client_id);
CREATE INDEX IF NOT EXISTS email_messages_thread_idx ON email_messages (thread_id);
CREATE INDEX IF NOT EXISTS email_review_status_idx ON email_review_items (status, created_at DESC);

ALTER TABLE email_threads ENABLE ROW LEVEL SECURITY;
CREATE POLICY credyx_email_threads_tenant ON email_threads
  FOR ALL TO authenticated
  USING (credyx_can_access_client(client_id))
  WITH CHECK (credyx_can_access_client(client_id));

ALTER TABLE email_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY credyx_email_messages_tenant ON email_messages
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM email_threads t
      WHERE t.id = email_messages.thread_id
        AND credyx_can_access_client(t.client_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM email_threads t
      WHERE t.id = email_messages.thread_id
        AND credyx_can_access_client(t.client_id)
    )
  );

ALTER TABLE email_review_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY credyx_email_review_admin ON email_review_items
  FOR ALL TO authenticated
  USING (credyx_is_admin())
  WITH CHECK (credyx_is_admin());

CREATE POLICY credyx_email_review_client_select ON email_review_items
  FOR SELECT TO authenticated
  USING (client_id IS NOT NULL AND credyx_can_access_client(client_id));

INSERT INTO email_templates (id, name, description, audience, placeholders, subject, body_html)
VALUES
(
  'broker_paperwork_status_inquiry',
  'Broker — paperwork status inquiry',
  'Ask the broker if the paperwork packet is in order.',
  'broker',
  'brokerName, invoiceNumber, loadNumber, clientName',
  'Paperwork status — Invoice {{invoiceNumber}} · Load {{loadNumber}}',
  $html$<p>Hello {{brokerName}},</p>
<p>Please confirm the paperwork for invoice <strong>{{invoiceNumber}}</strong> (Load {{loadNumber}}, carrier {{clientName}}) is in order.</p>
<p>— Credyx</p>$html$
),
(
  'broker_paperwork_status_followup',
  'Broker — paperwork status follow-up',
  'Second paperwork-status ask when there is no reply.',
  'broker',
  'brokerName, invoiceNumber, loadNumber',
  'Follow-up: Paperwork status — Invoice {{invoiceNumber}}',
  $html$<p>Hello {{brokerName}},</p>
<p>We have not received confirmation that paperwork is in order for invoice <strong>{{invoiceNumber}}</strong>.</p>
<p>— Credyx</p>$html$
),
(
  'broker_claim_scope',
  'Broker — claim on whole account?',
  'Ask if a claim applies to the whole account with this carrier.',
  'broker',
  'brokerName, invoiceNumber, loadNumber, clientName, message',
  'Claim scope — Invoice {{invoiceNumber}} · {{clientName}}',
  $html$<p>Hello {{brokerName}},</p>
<p>You reported a claim on load {{loadNumber}} (invoice {{invoiceNumber}}, carrier {{clientName}}).</p>
<p><strong>Is the claim on the whole account with this carrier?</strong></p>
<p>{{message}}</p>
<p>— Credyx</p>$html$
),
(
  'carrier_claim_or_hold_notice',
  'Carrier — hold or claim notice',
  'Notify the carrier when a broker reply puts a load on hold or flags a claim.',
  'carrier',
  'contactName, clientName, invoiceNumber, loadNumber, brokerName, summary, portalLink',
  'Update — invoice {{invoiceNumber}} · Load {{loadNumber}}',
  $html$<p>Hi {{contactName}},</p>
<p>Credyx logged an update from {{brokerName}} on invoice <strong>{{invoiceNumber}}</strong>.</p>
<p>{{summary}}</p>
<p><a href="{{portalLink}}">Open in your portal</a></p>
<p>Credyx · Paid on time</p>$html$
),
(
  'carrier_dispute_opened',
  'Carrier — broker dispute opened',
  'Whole-account claim confirmed; broker placed in dispute with this carrier.',
  'carrier',
  'contactName, clientName, brokerName, summary, portalLink, brokerContact',
  'Dispute opened — {{brokerName}}',
  $html$<p>Hi {{contactName}},</p>
<p>Credyx opened a dispute with <strong>{{brokerName}}</strong> for {{clientName}}.</p>
<p>{{summary}}</p>
<p>Broker contact: {{brokerContact}}</p>
<p><a href="{{portalLink}}">See notes and contact in your portal</a>.</p>
<p>Credyx · Paid on time</p>$html$
)
ON CONFLICT (id) DO NOTHING;
