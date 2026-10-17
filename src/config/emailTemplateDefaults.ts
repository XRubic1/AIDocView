import { AUTH_EMAIL_TEMPLATE_DEFAULTS } from './authEmailTemplates'
import {
  BROKER_PACKET_BODY_HTML,
  BROKER_REMITTANCE_UPDATED_BODY_HTML,
  CARRIER_BILLING_INVOICE_BODY_HTML,
  CARRIER_DOCUMENT_ISSUE_BODY_HTML,
  wrapCredyxEmailBodyHtml,
} from './emailLayouts'

/**
 * Default transactional email templates (subject + HTML body).
 * Placeholders use {{key}} and are filled at send time from template data.
 */
export type EmailTemplateId =
  | 'client_invite'
  | 'client_password_setup'
  | 'broker_packet'
  | 'broker_remittance_updated'
  | 'admin_enrollment_alert'
  | 'waitlist_signup_alert'
  | 'waitlist_welcome'
  | 'credyx_batch_error'
  | 'carrier_batch_verified'
  | 'carrier_batch_holds'
  | 'carrier_batch_processed'
  | 'broker_payment_status_inquiry'
  | 'broker_payment_status_followup'
  | 'calendar_event_notice'
  | 'staff_calendar_digest'
  | 'carrier_document_issue'
  | 'carrier_billing_invoice'
  | 'auth_signup'
  | 'auth_invite'
  | 'auth_magiclink'
  | 'auth_recovery'
  | 'auth_email_change'
  | 'auth_email_otp'
  | 'auth_reauthentication'
  | 'auth_password_changed'
  | 'auth_email_changed'
  | 'broker_rate_verification'
  | 'broker_paperwork_status_inquiry'
  | 'broker_paperwork_status_followup'
  | 'broker_claim_scope'
  | 'carrier_claim_or_hold_notice'
  | 'carrier_dispute_opened'
  /** Sales outreach to carrier leads (subject/body always sent as overrides). */
  | 'carrier_sales_outreach'

export interface EmailTemplateDefinition {
  id: EmailTemplateId
  name: string
  description: string
  audience: 'broker' | 'carrier' | 'admin' | 'system' | 'auth'
  /** Comma-separated placeholder keys for the editor help text. */
  placeholders: string
  subject: string
  body_html: string
}


// TODO: replace the test phone number with the real Credyx line before launch.
const CREDYX_CONTACT_EMAIL = 'ops@credyx.net'
const CREDYX_CONTACT_PHONE = '(555) 010-0199'
const CREDYX_TOUR_URL = 'https://credyx.net/tour'

const EMAIL_BUTTON_STYLE =
  'display:inline-block;background-color:#1684FE;color:#ffffff;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:14px;font-weight:600;text-decoration:none;padding:12px 20px;border-radius:8px;'

/** Documents a carrier uploads to the Document Vault before Credyx can send invoices. */
const DOC_VAULT_CHECKLIST_HTML = `<ul style="margin:0 0 16px 0;padding-left:20px;line-height:1.7;">
  <li>W-9 (signed, current)</li>
  <li>Certificate of Insurance (COI)</li>
  <li>MC operating authority</li>
  <li>DOT registration</li>
  <li>Voided check or bank letter for your payout account</li>
  <li>Notice of Assignment (NOA) — only if you factor your invoices</li>
</ul>`

/** Email 1 of account setup — login details + what happens next. */
export const CLIENT_LOGIN_READY_CONTENT_HTML = `<p>Hi {{contactName}},</p>
<p>Your Credyx login for <strong>{{clientName}}</strong> is ready.</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:16px 0;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;">
  <tr><td style="padding:14px 16px;font-size:14px;line-height:1.7;color:#0f172a;">
    <strong>Login page:</strong> <a href="{{portalLink}}" style="color:#1684FE;text-decoration:none;">{{portalLink}}</a><br/>
    <strong>Username:</strong> {{loginEmail}}<br/>
    <strong>Collection fee:</strong> {{feeTermsLabel}}
  </td></tr>
</table>
<p>{{passwordNote}}</p>
<p style="margin:20px 0;"><a href="{{portalLink}}" style="${EMAIL_BUTTON_STYLE}">{{ctaLabel}}</a></p>
<p style="margin:20px 0 8px 0;"><strong>What happens next</strong></p>
<ol style="margin:0 0 16px 0;padding-left:20px;line-height:1.7;">
  <li>Sign in and upload your documents to the <strong>Document Vault</strong>.</li>
  <li>Credyx reviews and approves them.</li>
  <li>Submit your first invoices and paperwork — we take it from there.</li>
</ol>
<p style="margin:0 0 8px 0;">Documents to upload:</p>
${DOC_VAULT_CHECKLIST_HTML}
<p>Questions? Email <a href="mailto:{{contactEmail}}" style="color:#1684FE;text-decoration:none;">{{contactEmail}}</a> or call <a href="tel:+15550100199" style="color:#1684FE;text-decoration:none;">${CREDYX_CONTACT_PHONE}</a>.</p>
<p>— The Credyx team</p>`

/** Email 2 of account setup — create-password link. */
export const CLIENT_PASSWORD_SETUP_CONTENT_HTML = `<p>Hi {{contactName}},</p>
<p>Create your password to finish setting up the Credyx portal for <strong>{{clientName}}</strong>. Your username is <strong>{{loginEmail}}</strong>.</p>
<p style="margin:20px 0;"><a href="{{setupLink}}" style="${EMAIL_BUTTON_STYLE}">Create your password</a></p>
<p style="color:#475569;font-size:13px;">For security this link expires. If it no longer works, go to <a href="{{portalLink}}" style="color:#1684FE;text-decoration:none;">{{portalLink}}</a> and choose <em>Forgot password</em>.</p>
<p style="color:#475569;font-size:13px;">Didn't expect this email? You can ignore it, or let us know at <a href="mailto:{{contactEmail}}" style="color:#1684FE;text-decoration:none;">{{contactEmail}}</a>.</p>
<p>— The Credyx team</p>`

/** Waitlist welcome body — onboarding contact, tour link, Document Vault checklist. */
export const WAITLIST_WELCOME_CONTENT_HTML = `<p>Hi {{contactName}},</p>
<p>Thanks for signing up <strong>{{companyName}}</strong> with <strong>Credyx</strong>. A member of our team will contact you shortly to schedule your onboarding.</p>
<p style="margin:20px 0;">
  <a href="${CREDYX_TOUR_URL}" style="display:inline-block;background-color:#1684FE;color:#ffffff;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:14px;font-weight:600;text-decoration:none;padding:12px 20px;border-radius:8px;">See how Credyx works</a>
</p>
<p style="margin:20px 0 8px 0;"><strong>Get these documents ready before onboarding</strong><br/>
<span style="color:#475569;">You'll upload them to your Document Vault on day one so we can start sending your invoices right away.</span></p>
<ul style="margin:0 0 16px 0;padding-left:20px;line-height:1.7;">
  <li>W-9 (signed, current)</li>
  <li>Certificate of Insurance (COI)</li>
  <li>MC operating authority</li>
  <li>DOT registration</li>
  <li>Voided check or bank letter for your payout account</li>
  <li>Notice of Assignment (NOA) — only if you factor your invoices</li>
</ul>
<p>Questions? Email <a href="mailto:${CREDYX_CONTACT_EMAIL}" style="color:#1684FE;text-decoration:none;">${CREDYX_CONTACT_EMAIL}</a> or call <a href="tel:+15550100199" style="color:#1684FE;text-decoration:none;">${CREDYX_CONTACT_PHONE}</a>.</p>
<p>— The Credyx team</p>`

export const EMAIL_TEMPLATE_DEFAULTS: EmailTemplateDefinition[] = [
  ...AUTH_EMAIL_TEMPLATE_DEFAULTS.map((t) => ({
    ...t,
    audience: 'auth' as const,
  })),
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
    id: 'carrier_document_issue',
    name: 'Carrier — document issue',
    description:
      'Sent from the admin dashboard when paperwork is missing or unclear. Edit the layout here; fill issues when sending.',
    audience: 'carrier',
    placeholders:
      'companyLogoHtml, contactName, clientName, invoiceNumber, loadNumber, brokerName, issueList, issueListHtml, message, messageHtml, portalLink, ctaLabel',
    subject: 'Action needed — invoice {{invoiceNumber}} · Load {{loadNumber}}',
    body_html: CARRIER_DOCUMENT_ISSUE_BODY_HTML,
  },
  {
    id: 'carrier_billing_invoice',
    name: 'Carrier — monthly invoice',
    description:
      'Sent from Billing with amount due, pay-by date, and a payment URL. Full charge/load details are attached as a PDF.',
    audience: 'carrier',
    placeholders:
      'companyLogoHtml, contactName, clientName, periodLabel, amountDue, dueDate, feeTermsLabel, collectedVolume, paymentUrl, ctaLabel, messageHtml',
    subject: 'Credyx invoice — {{periodLabel}} · {{amountDue}}',
    body_html: CARRIER_BILLING_INVOICE_BODY_HTML,
  },
  {
    id: 'carrier_batch_processed',
    name: 'Carrier — batch processed',
    description: 'Sent to the carrier after Process: holds (if any) and broker paperwork summary.',
    audience: 'carrier',
    placeholders:
      'companyLogoHtml, batchNumber, invoiceCount, holdCount, holdList, holdSection, holdSubjectSuffix, ppwSummary',
    subject: 'Batch {{batchNumber}} processed{{holdSubjectSuffix}}',
    body_html: wrapCredyxEmailBodyHtml({
      eyebrow: 'Batch update',
      contentHtml: `<p>Batch <strong>{{batchNumber}}</strong> has been processed ({{invoiceCount}} invoice(s)).</p>
{{holdSection}}
<p><strong>Paperwork sent to brokers:</strong></p>
<pre style="white-space:pre-wrap;font-family:sans-serif;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px;color:#334155;">{{ppwSummary}}</pre>
<p>This is an automatic email. Full details are available in your client portal.</p>`,
    }),
  },
  {
    id: 'carrier_batch_verified',
    name: 'Carrier — batch verified (legacy)',
    description: 'Legacy template; Process now uses “batch processed”. Kept for compatibility.',
    audience: 'carrier',
    placeholders: 'companyLogoHtml, batchNumber, invoiceCount, ppwSummary',
    subject: 'Batch {{batchNumber}} verified — no issues found',
    body_html: wrapCredyxEmailBodyHtml({
      eyebrow: 'Batch verified',
      contentHtml: `<p>All invoices in batch <strong>{{batchNumber}}</strong> were verified successfully ({{invoiceCount}} invoices). No issues were detected.</p>
<p><strong>Paperwork sent to brokers:</strong></p>
<pre style="white-space:pre-wrap;font-family:sans-serif;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px;color:#334155;">{{ppwSummary}}</pre>
<p>This is an automatic email. Full details are available in your client portal.</p>`,
    }),
  },
  {
    id: 'carrier_batch_holds',
    name: 'Carrier — holds (legacy)',
    description: 'Legacy template; Process now uses “batch processed”. Kept for compatibility.',
    audience: 'carrier',
    placeholders: 'companyLogoHtml, batchNumber, holdCount, holdList',
    subject: 'Batch {{batchNumber}} — {{holdCount}} invoice(s) on hold',
    body_html: wrapCredyxEmailBodyHtml({
      eyebrow: 'Holds',
      contentHtml: `<p>One or more invoices in batch <strong>{{batchNumber}}</strong> were placed on hold after verification.</p>
<pre style="white-space:pre-wrap;font-family:sans-serif;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px;color:#334155;">{{holdList}}</pre>
<p>This is an automatic email. Full details and next steps are available in your client portal.</p>`,
    }),
  },
  {
    id: 'client_invite',
    name: 'Client — login ready',
    description:
      'Email 1 when an account is set up (Waitlist → Set up account, activate, or Send welcome): login page, username, fee and Document Vault checklist.',
    audience: 'carrier',
    placeholders:
      'contactName, clientName, loginEmail, feeTermsLabel, portalLink, contactEmail, passwordNote, ctaLabel, companyLogoHtml',
    subject: 'Your Credyx login is ready',
    body_html: wrapCredyxEmailBodyHtml({
      eyebrow: 'Welcome',
      headline: 'Your login is ready',
      contentHtml: CLIENT_LOGIN_READY_CONTENT_HTML,
    }),
  },
  {
    id: 'client_password_setup',
    name: 'Client — create password',
    description:
      'Email 2 when an account is set up: link to create the portal password. Not sent once the client has a password.',
    audience: 'carrier',
    placeholders: 'contactName, clientName, loginEmail, setupLink, portalLink, contactEmail, companyLogoHtml',
    subject: 'Create your Credyx password',
    body_html: wrapCredyxEmailBodyHtml({
      eyebrow: 'Account setup',
      headline: 'Create your password',
      contentHtml: CLIENT_PASSWORD_SETUP_CONTENT_HTML,
    }),
  },
  {
    id: 'admin_enrollment_alert',
    name: 'Admin — new enrollment',
    description: 'Notifies Credyx ops when a carrier enrolls.',
    audience: 'admin',
    placeholders: 'companyLogoHtml, clientName, email',
    subject: 'New enrollment — {{clientName}}',
    body_html: wrapCredyxEmailBodyHtml({
      eyebrow: 'Enrollment',
      headline: 'New carrier enrollment',
      contentHtml: `<p>A new client enrolled: <strong>{{clientName}}</strong> ({{email}}).</p>
<p>Review in the admin portal.</p>`,
    }),
  },
  {
    id: 'waitlist_signup_alert',
    name: 'Admin — waitlist signup',
    description: 'Notifies Credyx ops when a carrier joins the waitlist.',
    audience: 'admin',
    placeholders:
      'companyLogoHtml, companyName, contactName, email, phone, fleetSize, hearAbout, notes',
    subject: 'New waitlist signup — {{companyName}}',
    body_html: wrapCredyxEmailBodyHtml({
      eyebrow: 'Waitlist',
      headline: 'New waitlist signup',
      contentHtml: `<p>A carrier joined the waitlist:</p>
<ul>
  <li><strong>Company:</strong> {{companyName}}</li>
  <li><strong>Contact:</strong> {{contactName}}</li>
  <li><strong>Email:</strong> {{email}}</li>
  <li><strong>Phone:</strong> {{phone}}</li>
  <li><strong>Fleet size:</strong> {{fleetSize}}</li>
  <li><strong>Heard about us:</strong> {{hearAbout}}</li>
</ul>
<p><strong>Notes:</strong></p>
<pre style="white-space:pre-wrap;font-family:sans-serif;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px;color:#334155;">{{notes}}</pre>`,
    }),
  },
  {
    id: 'waitlist_welcome',
    name: 'Waitlist — thank you',
    description:
      'Sent automatically when a carrier signs up: Credyx will contact them for onboarding, plus the Document Vault checklist.',
    audience: 'carrier',
    placeholders: 'companyLogoHtml, contactName, companyName',
    subject: 'Next steps for onboarding {{companyName}} with Credyx',
    body_html: wrapCredyxEmailBodyHtml({
      eyebrow: 'Onboarding',
      headline: "We'll be in touch to get you onboarded",
      contentHtml: WAITLIST_WELCOME_CONTENT_HTML,
    }),
  },
  {
    id: 'credyx_batch_error',
    name: 'Admin — batch error',
    description: 'Internal alert when intake or verification fails.',
    audience: 'admin',
    placeholders: 'companyLogoHtml, batchNumber, clientName, scope, issueMessage',
    subject: 'Batch error — {{batchNumber}} ({{scope}})',
    body_html: wrapCredyxEmailBodyHtml({
      eyebrow: 'Batch error',
      headline: 'Batch needs attention',
      contentHtml: `<p>There was an error with batch <strong>{{batchNumber}}</strong>{{clientNameSuffix}}.</p>
<p><strong>Scope:</strong> {{scope}}</p>
<pre style="white-space:pre-wrap;font-family:sans-serif;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px;color:#334155;">{{issueMessage}}</pre>
<p>Please review in the Credyx admin portal (Batches → AI / Ready to Post / Verification).</p>`,
    }),
  },
  {
    id: 'broker_payment_status_inquiry',
    name: 'Broker — payment status inquiry',
    description: 'Collections chase email to brokers.',
    audience: 'broker',
    placeholders: 'companyLogoHtml, brokerName, invoiceNumber, loadNumber, amount',
    subject: 'Payment status inquiry — Invoice {{invoiceNumber}}',
    body_html: wrapCredyxEmailBodyHtml({
      eyebrow: 'Collections',
      contentHtml: `<p>Hello {{brokerName}},</p>
<p>Please provide the payment status for invoice <strong>{{invoiceNumber}}</strong> (Load {{loadNumber}}, Amount {{amount}}).</p>
<p>Reply to this email with the expected payment date or status.</p>
<p>— Credyx Collections</p>`,
    }),
  },
  {
    id: 'broker_payment_status_followup',
    name: 'Broker — payment status follow-up',
    description: 'Follow-up when a broker has not replied to a status inquiry.',
    audience: 'broker',
    placeholders: 'companyLogoHtml, brokerName, invoiceNumber',
    subject: 'Follow-up: Payment status — Invoice {{invoiceNumber}}',
    body_html: wrapCredyxEmailBodyHtml({
      eyebrow: 'Collections',
      contentHtml: `<p>Hello {{brokerName}},</p>
<p>We have not received a response regarding invoice <strong>{{invoiceNumber}}</strong>. Please reply with payment status.</p>
<p>— Credyx Collections</p>`,
    }),
  },
  {
    id: 'broker_rate_verification',
    name: 'Broker — rate verification',
    description:
      'Ask the broker to confirm the rate and whether there are advances or deductions. Sent from AI Verification.',
    audience: 'broker',
    placeholders: 'companyLogoHtml, brokerName, invoiceNumber, loadNumber, clientName, amount',
    subject: 'Rate confirmation — Invoice {{invoiceNumber}} · Load {{loadNumber}}',
    body_html: wrapCredyxEmailBodyHtml({
      eyebrow: 'Rate check',
      contentHtml: `<p>Hello {{brokerName}},</p>
<p>Please confirm the rate of <strong>{{amount}}</strong> on invoice <strong>{{invoiceNumber}}</strong> (Load {{loadNumber}}, {{clientName}}).</p>
<p>Are there any advances or deductions on this rate? Reply with <strong>no advances or deductions</strong>, or list them.</p>
<p>— Credyx</p>`,
    }),
  },
  {
    id: 'broker_paperwork_status_inquiry',
    name: 'Broker — paperwork status inquiry',
    description: 'Ask if the paperwork packet is in order.',
    audience: 'broker',
    placeholders: 'companyLogoHtml, brokerName, invoiceNumber, loadNumber, clientName',
    subject: 'Paperwork status — Invoice {{invoiceNumber}}',
    body_html: wrapCredyxEmailBodyHtml({
      eyebrow: 'Paperwork',
      contentHtml: `<p>Hello {{brokerName}},</p>
<p>Please confirm paperwork is in order for invoice <strong>{{invoiceNumber}}</strong> (Load {{loadNumber}}, {{clientName}}).</p>
<p>— Credyx</p>`,
    }),
  },
  {
    id: 'broker_paperwork_status_followup',
    name: 'Broker — paperwork status follow-up',
    description: 'Second paperwork status ask.',
    audience: 'broker',
    placeholders: 'companyLogoHtml, brokerName, invoiceNumber, loadNumber, clientName',
    subject: 'Follow-up: Paperwork status — Invoice {{invoiceNumber}}',
    body_html: wrapCredyxEmailBodyHtml({
      eyebrow: 'Paperwork',
      contentHtml: `<p>Hello {{brokerName}},</p>
<p>Following up on paperwork for invoice <strong>{{invoiceNumber}}</strong> (Load {{loadNumber}}).</p>
<p>— Credyx</p>`,
    }),
  },
  {
    id: 'broker_claim_scope',
    name: 'Broker — claim scope',
    description: 'Ask if a claim is on the whole account.',
    audience: 'broker',
    placeholders: 'companyLogoHtml, brokerName, invoiceNumber, loadNumber, clientName, message',
    subject: 'Claim scope — Invoice {{invoiceNumber}}',
    body_html: wrapCredyxEmailBodyHtml({
      eyebrow: 'Claim',
      contentHtml: `<p>Hello {{brokerName}},</p>
<p>Regarding invoice <strong>{{invoiceNumber}}</strong> (Load {{loadNumber}}, {{clientName}}).</p>
<p>{{message}}</p>
<p>Is this claim on the whole account?</p>
<p>— Credyx</p>`,
    }),
  },
  {
    id: 'carrier_claim_or_hold_notice',
    name: 'Carrier — hold or claim notice',
    description: 'Notify the carrier when a broker reply needs a hold or claim follow-up.',
    audience: 'carrier',
    placeholders:
      'companyLogoHtml, contactName, clientName, invoiceNumber, loadNumber, brokerName, summary, portalLink',
    subject: 'Update — invoice {{invoiceNumber}}',
    body_html: wrapCredyxEmailBodyHtml({
      eyebrow: 'Invoice update',
      contentHtml: `<p>Hi {{contactName}},</p>
<p>{{summary}}</p>
<p>Invoice {{invoiceNumber}} · Load {{loadNumber}} · {{brokerName}}</p>
<p><a href="{{portalLink}}" style="color:#1684FE;font-weight:600;">Open in Credyx</a></p>`,
    }),
  },
  {
    id: 'carrier_dispute_opened',
    name: 'Carrier — account dispute',
    description: 'Carrier notice when a broker is placed in dispute.',
    audience: 'carrier',
    placeholders:
      'companyLogoHtml, contactName, clientName, brokerName, summary, portalLink, brokerContact',
    subject: 'Dispute opened — {{brokerName}}',
    body_html: wrapCredyxEmailBodyHtml({
      eyebrow: 'Dispute',
      contentHtml: `<p>Hi {{contactName}},</p>
<p>A dispute was opened with {{brokerName}} for {{clientName}}.</p>
<p>{{summary}}</p>
<p>Broker contact: {{brokerContact}}</p>
<p><a href="{{portalLink}}" style="color:#1684FE;font-weight:600;">Open in Credyx</a></p>`,
    }),
  },
  {
    id: 'calendar_event_notice',
    name: 'Calendar event notice',
    description:
      'Sent to client and admin when a shared calendar event (meeting, reminder, etc.) is created.',
    audience: 'system',
    placeholders:
      'companyLogoHtml, clientName, eventTitle, eventType, whenLabel, brokerName, invoiceNumber, message, meetingUrl, meetingBlock, portalLink, recipientRole',
    subject: 'Calendar: {{eventTitle}} — {{whenLabel}}',
    body_html: wrapCredyxEmailBodyHtml({
      eyebrow: 'Calendar',
      contentHtml: `<p>Hi{{recipientRole}},</p>
<p>A calendar event was added for <strong>{{clientName}}</strong>.</p>
<p><strong>{{eventTitle}}</strong><br/>
Type: {{eventType}} · When: {{whenLabel}}<br/>
Broker: {{brokerName}} · Invoice: {{invoiceNumber}}</p>
{{meetingBlock}}
<p style="white-space:pre-wrap">{{message}}</p>
<p><a href="{{portalLink}}" style="color:#1684FE;font-weight:600;">Open in Credyx</a></p>`,
    }),
  },
  {
    id: 'staff_calendar_digest',
    name: 'Staff calendar digest',
    description:
      'Daily employee reminder of Credyx calendar tasks due today (due dates, call backs, Will Pay, chase).',
    audience: 'admin',
    placeholders: 'companyLogoHtml, recipientName, whenLabel, taskCount, taskListHtml, portalLink',
    subject: 'Credyx today — {{taskCount}} task(s) · {{whenLabel}}',
    body_html: wrapCredyxEmailBodyHtml({
      eyebrow: 'Staff calendar',
      headline: 'What you need to do today',
      contentHtml: `<p>Hi {{recipientName}} — {{taskCount}} item(s) for {{whenLabel}} from the Credyx calendar.</p>
{{taskListHtml}}
<p style="margin-top:20px;"><a href="{{portalLink}}" style="display:inline-block;background:#1684FE;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;font-size:13px;font-weight:600;">Open calendar</a></p>`,
    }),
  },
]

export function getDefaultEmailTemplate(id: string): EmailTemplateDefinition | undefined {
  return EMAIL_TEMPLATE_DEFAULTS.find((t) => t.id === id)
}
