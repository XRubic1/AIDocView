import { BROKER_PACKET_BODY_HTML, BROKER_REMITTANCE_UPDATED_BODY_HTML } from './emailLayouts'

/**
 * Default transactional email templates (subject + HTML body).
 * Placeholders use {{key}} and are filled at send time from template data.
 */
export type EmailTemplateId =
  | 'client_invite'
  | 'broker_packet'
  | 'broker_remittance_updated'
  | 'admin_enrollment_alert'
  | 'waitlist_signup_alert'
  | 'credyx_batch_error'
  | 'carrier_batch_verified'
  | 'carrier_batch_holds'
  | 'carrier_batch_processed'
  | 'broker_payment_status_inquiry'
  | 'broker_payment_status_followup'
  | 'calendar_event_notice'

export interface EmailTemplateDefinition {
  id: EmailTemplateId
  name: string
  description: string
  audience: 'broker' | 'carrier' | 'admin' | 'system'
  /** Comma-separated placeholder keys for the editor help text. */
  placeholders: string
  subject: string
  body_html: string
}

export const EMAIL_TEMPLATE_DEFAULTS: EmailTemplateDefinition[] = [
  {
    id: 'broker_packet',
    name: 'Broker paperwork packet',
    description:
      'Sent to brokers with invoice documents and selected vault attachments. Remittance pointer only — remit-to lives on the invoice PDF / bank proof.',
    audience: 'broker',
    placeholders:
      'companyLogoHtml, invoiceNumber, loadNumber, brokerName, clientName, documentList, remittanceMessage, remittanceChangeNoteHtml, message, partSuffix, partNoteHtml',
    subject: 'Document packet — {{invoiceNumber}} · Load {{loadNumber}}{{partSuffix}}',
    body_html: BROKER_PACKET_BODY_HTML,
  },
  {
    id: 'broker_remittance_updated',
    name: 'Broker — remittance updated',
    description:
      'Bulk notice to brokers when a carrier’s remit-to changes. Attach voided check / bank letter; do not put account numbers in the body.',
    audience: 'broker',
    placeholders: 'companyLogoHtml, carrierName, effectiveDate, message, brokerName',
    subject: 'Remittance updated — {{carrierName}}',
    body_html: BROKER_REMITTANCE_UPDATED_BODY_HTML,
  },
  {
    id: 'carrier_batch_processed',
    name: 'Carrier — batch processed',
    description: 'Sent to the carrier after Process: holds (if any) and broker paperwork summary.',
    audience: 'carrier',
    placeholders: 'batchNumber, invoiceCount, holdCount, holdList, holdSection, holdSubjectSuffix, ppwSummary',
    subject: 'Batch {{batchNumber}} processed{{holdSubjectSuffix}}',
    body_html: `<p>Batch <strong>{{batchNumber}}</strong> has been processed ({{invoiceCount}} invoice(s)).</p>
{{holdSection}}
<p><strong>Paperwork sent to brokers:</strong></p>
<pre style="white-space:pre-wrap;font-family:sans-serif">{{ppwSummary}}</pre>
<p>This is an automatic email. Full details are available in your client portal.</p>`,
  },
  {
    id: 'carrier_batch_verified',
    name: 'Carrier — batch verified (legacy)',
    description: 'Legacy template; Process now uses “batch processed”. Kept for compatibility.',
    audience: 'carrier',
    placeholders: 'batchNumber, invoiceCount, ppwSummary',
    subject: 'Batch {{batchNumber}} verified — no issues found',
    body_html: `<p>All invoices in batch <strong>{{batchNumber}}</strong> were verified successfully ({{invoiceCount}} invoices). No issues were detected.</p>
<p><strong>Paperwork sent to brokers:</strong></p>
<pre style="white-space:pre-wrap;font-family:sans-serif">{{ppwSummary}}</pre>
<p>This is an automatic email. Full details are available in your client portal.</p>`,
  },
  {
    id: 'carrier_batch_holds',
    name: 'Carrier — holds (legacy)',
    description: 'Legacy template; Process now uses “batch processed”. Kept for compatibility.',
    audience: 'carrier',
    placeholders: 'batchNumber, holdCount, holdList',
    subject: 'Batch {{batchNumber}} — {{holdCount}} invoice(s) on hold',
    body_html: `<p>One or more invoices in batch <strong>{{batchNumber}}</strong> were placed on hold after verification.</p>
<pre style="white-space:pre-wrap;font-family:sans-serif">{{holdList}}</pre>
<p>This is an automatic email. Full details and next steps are available in your client portal.</p>`,
  },
  {
    id: 'client_invite',
    name: 'Client portal invite',
    description: 'Sent when a client account is provisioned.',
    audience: 'carrier',
    placeholders: 'contactName, inviteLink',
    subject: 'Your Credyx client portal is ready',
    body_html: `<p>Hi {{contactName}},</p>
<p>Your Credyx account has been activated. Set your password and sign in:</p>
<p><a href="{{inviteLink}}">Activate your account</a></p>
<p>If you did not request this, you can ignore this email.</p>`,
  },
  {
    id: 'admin_enrollment_alert',
    name: 'Admin — new enrollment',
    description: 'Notifies Credyx ops when a carrier enrolls.',
    audience: 'admin',
    placeholders: 'clientName, email',
    subject: 'New enrollment — {{clientName}}',
    body_html: `<p>A new client enrolled: <strong>{{clientName}}</strong> ({{email}}).</p>
<p>Review in the admin portal.</p>`,
  },
  {
    id: 'waitlist_signup_alert',
    name: 'Admin — waitlist signup',
    description: 'Notifies Credyx ops when a carrier joins the waitlist.',
    audience: 'admin',
    placeholders: 'companyName, contactName, email, phone, fleetSize, hearAbout, notes',
    subject: 'New waitlist signup — {{companyName}}',
    body_html: `<p>A carrier joined the waitlist:</p>
<ul>
  <li><strong>Company:</strong> {{companyName}}</li>
  <li><strong>Contact:</strong> {{contactName}}</li>
  <li><strong>Email:</strong> {{email}}</li>
  <li><strong>Phone:</strong> {{phone}}</li>
  <li><strong>Fleet size:</strong> {{fleetSize}}</li>
  <li><strong>Heard about us:</strong> {{hearAbout}}</li>
</ul>
<p><strong>Notes:</strong></p>
<pre style="white-space:pre-wrap;font-family:sans-serif">{{notes}}</pre>`,
  },
  {
    id: 'credyx_batch_error',
    name: 'Admin — batch error',
    description: 'Internal alert when intake or verification fails.',
    audience: 'admin',
    placeholders: 'batchNumber, clientName, scope, issueMessage',
    subject: 'Batch error — {{batchNumber}} ({{scope}})',
    body_html: `<p>There was an error with batch <strong>{{batchNumber}}</strong>{{clientNameSuffix}}.</p>
<p><strong>Scope:</strong> {{scope}}</p>
<pre style="white-space:pre-wrap;font-family:sans-serif">{{issueMessage}}</pre>
<p>Please review in the Credyx admin portal (Batches → AI / Ready to Post / Verification).</p>`,
  },
  {
    id: 'broker_payment_status_inquiry',
    name: 'Broker — payment status inquiry',
    description: 'Collections chase email to brokers.',
    audience: 'broker',
    placeholders: 'brokerName, invoiceNumber, loadNumber, amount',
    subject: 'Payment status inquiry — Invoice {{invoiceNumber}}',
    body_html: `<p>Hello {{brokerName}},</p>
<p>Please provide the payment status for invoice <strong>{{invoiceNumber}}</strong> (Load {{loadNumber}}, Amount {{amount}}).</p>
<p>Reply to this email with the expected payment date or status.</p>
<p>— Credyx Collections</p>`,
  },
  {
    id: 'broker_payment_status_followup',
    name: 'Broker — payment status follow-up',
    description: 'Follow-up when a broker has not replied to a status inquiry.',
    audience: 'broker',
    placeholders: 'brokerName, invoiceNumber',
    subject: 'Follow-up: Payment status — Invoice {{invoiceNumber}}',
    body_html: `<p>Hello {{brokerName}},</p>
<p>We have not received a response regarding invoice <strong>{{invoiceNumber}}</strong>. Please reply with payment status.</p>
<p>— Credyx Collections</p>`,
  },
  {
    id: 'calendar_event_notice',
    name: 'Calendar event notice',
    description:
      'Sent to client and admin when a shared calendar event (meeting, reminder, etc.) is created.',
    audience: 'system',
    placeholders:
      'clientName, eventTitle, eventType, whenLabel, brokerName, invoiceNumber, message, meetingUrl, meetingBlock, portalLink, recipientRole',
    subject: 'Calendar: {{eventTitle}} — {{whenLabel}}',
    body_html: `<p>Hi{{recipientRole}},</p>
<p>A calendar event was added for <strong>{{clientName}}</strong>.</p>
<p><strong>{{eventTitle}}</strong><br/>
Type: {{eventType}} · When: {{whenLabel}}<br/>
Broker: {{brokerName}} · Invoice: {{invoiceNumber}}</p>
{{meetingBlock}}
<p style="white-space:pre-wrap">{{message}}</p>
<p><a href="{{portalLink}}">Open in Credyx</a></p>`,
  },
]

export function getDefaultEmailTemplate(id: string): EmailTemplateDefinition | undefined {
  return EMAIL_TEMPLATE_DEFAULTS.find((t) => t.id === id)
}
