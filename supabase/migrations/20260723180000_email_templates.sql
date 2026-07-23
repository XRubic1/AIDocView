-- Admin-editable transactional email templates (Resend send-email reads these).
CREATE TABLE IF NOT EXISTS email_templates (
  id text PRIMARY KEY,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  audience text NOT NULL DEFAULT 'system'
    CHECK (audience IN ('broker', 'carrier', 'admin', 'system')),
  placeholders text NOT NULL DEFAULT '',
  subject text NOT NULL,
  body_html text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);

ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS credyx_email_templates_admin ON email_templates;
CREATE POLICY credyx_email_templates_admin ON email_templates
  FOR ALL
  USING (credyx_is_admin())
  WITH CHECK (credyx_is_admin());

-- Seed defaults (safe to re-run: ON CONFLICT DO NOTHING keeps admin edits).
INSERT INTO email_templates (id, name, description, audience, placeholders, subject, body_html)
VALUES
(
  'broker_packet',
  'Broker paperwork packet',
  'Sent to brokers with invoice documents and broker vault attachments (NOA, etc.).',
  'broker',
  'invoiceNumber, brokerName, clientName, documentList, message',
  'Document packet — {{invoiceNumber}}',
  $html$<p>Please find attached documents for invoice {{invoiceNumber}}.</p>
<p>Broker: {{brokerName}} · Carrier: {{clientName}}</p>
<p>Documents: {{documentList}}</p>
<p>{{message}}</p>$html$
),
(
  'carrier_batch_processed',
  'Carrier — batch processed',
  'Sent to the carrier after Process: holds (if any) and broker paperwork summary.',
  'carrier',
  'batchNumber, invoiceCount, holdCount, holdList, holdSection, holdSubjectSuffix, ppwSummary',
  'Batch {{batchNumber}} processed{{holdSubjectSuffix}}',
  $html$<p>Batch <strong>{{batchNumber}}</strong> has been processed ({{invoiceCount}} invoice(s)).</p>
{{holdSection}}
<p><strong>Paperwork sent to brokers:</strong></p>
<pre style="white-space:pre-wrap;font-family:sans-serif">{{ppwSummary}}</pre>
<p>This is an automatic email. Full details are available in your client portal.</p>$html$
),
(
  'carrier_batch_verified',
  'Carrier — batch verified (legacy)',
  'Legacy template; Process now uses “batch processed”. Kept for compatibility.',
  'carrier',
  'batchNumber, invoiceCount, ppwSummary',
  'Batch {{batchNumber}} verified — no issues found',
  $html$<p>All invoices in batch <strong>{{batchNumber}}</strong> were verified successfully ({{invoiceCount}} invoices). No issues were detected.</p>
<p><strong>Paperwork sent to brokers:</strong></p>
<pre style="white-space:pre-wrap;font-family:sans-serif">{{ppwSummary}}</pre>
<p>This is an automatic email. Full details are available in your client portal.</p>$html$
),
(
  'carrier_batch_holds',
  'Carrier — holds (legacy)',
  'Legacy template; Process now uses “batch processed”. Kept for compatibility.',
  'carrier',
  'batchNumber, holdCount, holdList',
  'Batch {{batchNumber}} — {{holdCount}} invoice(s) on hold',
  $html$<p>One or more invoices in batch <strong>{{batchNumber}}</strong> were placed on hold after verification.</p>
<pre style="white-space:pre-wrap;font-family:sans-serif">{{holdList}}</pre>
<p>This is an automatic email. Full details and next steps are available in your client portal.</p>$html$
),
(
  'client_invite',
  'Client portal invite',
  'Sent when a client account is provisioned.',
  'carrier',
  'contactName, inviteLink',
  'Your Credyx client portal is ready',
  $html$<p>Hi {{contactName}},</p>
<p>Your Credyx account has been activated. Set your password and sign in:</p>
<p><a href="{{inviteLink}}">Activate your account</a></p>
<p>If you did not request this, you can ignore this email.</p>$html$
),
(
  'admin_enrollment_alert',
  'Admin — new enrollment',
  'Notifies Credyx ops when a carrier enrolls.',
  'admin',
  'clientName, email',
  'New enrollment — {{clientName}}',
  $html$<p>A new client enrolled: <strong>{{clientName}}</strong> ({{email}}).</p>
<p>Review in the admin portal.</p>$html$
),
(
  'credyx_batch_error',
  'Admin — batch error',
  'Internal alert when intake or verification fails.',
  'admin',
  'batchNumber, clientName, scope, issueMessage, clientNameSuffix',
  'Batch error — {{batchNumber}} ({{scope}})',
  $html$<p>There was an error with batch <strong>{{batchNumber}}</strong>{{clientNameSuffix}}.</p>
<p><strong>Scope:</strong> {{scope}}</p>
<pre style="white-space:pre-wrap;font-family:sans-serif">{{issueMessage}}</pre>
<p>Please review in the Credyx admin portal (Batches → AI / Ready to Post / Verification).</p>$html$
),
(
  'broker_payment_status_inquiry',
  'Broker — payment status inquiry',
  'Collections chase email to brokers.',
  'broker',
  'brokerName, invoiceNumber, loadNumber, amount',
  'Payment status inquiry — Invoice {{invoiceNumber}}',
  $html$<p>Hello{{brokerName}},</p>
<p>Please provide the payment status for invoice <strong>{{invoiceNumber}}</strong> (Load {{loadNumber}}, Amount {{amount}}).</p>
<p>Reply to this email with the expected payment date or status.</p>
<p>— Credyx Collections</p>$html$
),
(
  'broker_payment_status_followup',
  'Broker — payment status follow-up',
  'Follow-up when a broker has not replied to a status inquiry.',
  'broker',
  'brokerName, invoiceNumber',
  'Follow-up: Payment status — Invoice {{invoiceNumber}}',
  $html$<p>Hello{{brokerName}},</p>
<p>We have not received a response regarding invoice <strong>{{invoiceNumber}}</strong>. Please reply with payment status.</p>
<p>— Credyx Collections</p>$html$
)
ON CONFLICT (id) DO NOTHING;
