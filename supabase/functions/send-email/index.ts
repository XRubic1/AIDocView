import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/** Soft ceiling for base64 attachment payload (~35MB raw content budget). */
const MAX_ATTACHMENT_CHARS = 35 * 1024 * 1024

type EmailTemplate =
  | 'client_invite'
  | 'broker_packet'
  | 'broker_remittance_updated'
  | 'admin_enrollment_alert'
  | 'waitlist_signup_alert'
  | 'waitlist_welcome'
  | 'credyx_batch_error'
  | 'carrier_batch_verified'
  | 'carrier_batch_holds'
  | 'carrier_batch_processed'
  | 'broker_rate_verification'
  | 'broker_payment_status_inquiry'
  | 'broker_payment_status_followup'
  | 'calendar_event_notice'
  | 'staff_calendar_digest'
  | 'carrier_document_issue'
  | 'carrier_billing_invoice'
  | 'carrier_sales_outreach'
  | 'auth_signup'
  | 'auth_invite'
  | 'auth_magiclink'
  | 'auth_recovery'
  | 'auth_email_change'
  | 'auth_email_otp'
  | 'auth_reauthentication'
  | 'auth_password_changed'
  | 'auth_email_changed'

interface EmailAttachment {
  filename: string
  content: string
  contentType?: string
  contentId?: string
}

interface SendEmailPayload {
  template: EmailTemplate
  to: string
  data: Record<string, string>
  attachments?: EmailAttachment[]
  isTest?: boolean
  overrideSubject?: string
  overrideHtml?: string
}

const PUBLIC_TEMPLATES = new Set<EmailTemplate>([
  'admin_enrollment_alert',
  'waitlist_signup_alert',
  'waitlist_welcome',
])

/** Internal inbox for anonymous-site alerts (waitlist, enrollment). */
const OPS_ALERT_EMAIL = 'ops@credyx.net'
/** Legacy inline-logo content id — mail apps often list it as an attachment. */
const LOGO_CID = 'credyx-logo'

/**
 * Public templates are callable without a login, so the caller only supplies
 * the form fields. Alerts always go to ops; no custom HTML, From, CC or files.
 */
function lockDownPublicPayload(payload: SendEmailPayload): void {
  const p = payload as SendEmailPayload & { cc?: unknown; fromOverride?: unknown }
  if (payload.template !== 'waitlist_welcome') payload.to = OPS_ALERT_EMAIL
  delete payload.overrideSubject
  delete payload.overrideHtml
  delete payload.isTest
  delete p.cc
  delete p.fromOverride

  payload.attachments = []

  // Drop raw-HTML fields; the logo slot is filled server-side.
  const data: Record<string, string> = {}
  for (const [key, value] of Object.entries(payload.data ?? {})) {
    if (typeof value !== 'string' || key.endsWith('Html')) continue
    data[key] = value.slice(0, 2000)
  }
  payload.data = data
}

/**
 * Never send the logo as a file: drop the inline logo attachment and point every
 * logo reference at the hosted image instead.
 */
function useHostedLogo(payload: SendEmailPayload): void {
  if (payload.attachments?.length) {
    payload.attachments = payload.attachments.filter((a) => a.contentId !== LOGO_CID)
  }
  payload.data = { ...(payload.data ?? {}), companyLogoHtml: defaultCompanyLogoHtml() }
  if (payload.overrideHtml?.includes(`cid:${LOGO_CID}`)) {
    payload.overrideHtml = payload.overrideHtml.split(`cid:${LOGO_CID}`).join(hostedLogoUrl())
  }
}

type FromAudience = 'broker' | 'carrier' | 'admin' | 'default'

/** Map template → audience for From / Reply-To secrets. */
function audienceForTemplate(template: EmailTemplate): FromAudience {
  if (template === 'broker_packet' || template.startsWith('broker_')) return 'broker'
  // Waitlist welcome goes from billing@ (broker From), not ops@.
  if (template === 'waitlist_welcome') return 'broker'
  if (template.startsWith('auth_') || template.startsWith('carrier_') || template === 'client_invite') {
    return 'carrier'
  }
  if (
    template === 'admin_enrollment_alert' ||
    template === 'waitlist_signup_alert' ||
    template === 'staff_calendar_digest' ||
    template.startsWith('credyx_')
  ) {
    return 'admin'
  }
  if (template === 'calendar_event_notice') return 'default'
  return 'default'
}

/**
 * Resolve From (+ optional Reply-To) from platform_settings mailboxes, then Edge secrets.
 * Brokers → billing, carriers → ops, admin → admin/ops, falling back to RESEND_FROM_EMAIL.
 */
type MailboxRow = {
  opsEmail?: string
  billingEmail?: string
  adminEmail?: string
  notificationsEmail?: string
  replyToBroker?: string
  replyToCarrier?: string
  replyToAdmin?: string
}

function formatFrom(display: string, email: string): string {
  return `${display} <${email.trim()}>`
}

function isEmail(value: string | undefined): value is string {
  return Boolean(value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()))
}

async function loadPlatformMailboxes(): Promise<MailboxRow> {
  try {
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const url = Deno.env.get('SUPABASE_URL')
    if (!serviceKey || !url) return {}
    const admin = createClient(url, serviceKey)
    const { data } = await admin
      .from('platform_settings')
      .select('value')
      .eq('key', 'email_mailboxes')
      .maybeSingle()
    return (data?.value as MailboxRow) || {}
  } catch (err) {
    console.warn('[send-email] mailbox settings load failed', err)
    return {}
  }
}

async function resolveFromAddresses(
  template: EmailTemplate
): Promise<{ from: string; replyTo?: string }> {
  const fallback = Deno.env.get('RESEND_FROM_EMAIL') ?? 'Credyx <onboarding@resend.dev>'
  const audience = audienceForTemplate(template)
  const mailboxes = await loadPlatformMailboxes()

  const brokerFromSecret = Deno.env.get('RESEND_FROM_BROKER')?.trim()
  const carrierFromSecret = Deno.env.get('RESEND_FROM_CARRIER')?.trim()
  const adminFromSecret = Deno.env.get('RESEND_FROM_ADMIN')?.trim()

  let from = fallback
  if (audience === 'broker') {
    if (isEmail(mailboxes.billingEmail)) from = formatFrom('Credyx Billing', mailboxes.billingEmail)
    else if (brokerFromSecret) from = brokerFromSecret
  } else if (audience === 'carrier') {
    if (isEmail(mailboxes.opsEmail)) from = formatFrom('Credyx Ops', mailboxes.opsEmail)
    else if (carrierFromSecret) from = carrierFromSecret
  } else if (audience === 'admin') {
    const adminEmail = mailboxes.adminEmail || mailboxes.opsEmail
    if (isEmail(adminEmail)) from = formatFrom('Credyx Ops', adminEmail)
    else if (adminFromSecret) from = adminFromSecret
  } else if (isEmail(mailboxes.notificationsEmail)) {
    from = formatFrom('Credyx', mailboxes.notificationsEmail)
  }

  const replyDefault = Deno.env.get('RESEND_REPLY_TO')?.trim()
  const replyBrokerSecret = Deno.env.get('RESEND_REPLY_TO_BROKER')?.trim()
  const replyCarrierSecret = Deno.env.get('RESEND_REPLY_TO_CARRIER')?.trim()
  const replyAdminSecret = Deno.env.get('RESEND_REPLY_TO_ADMIN')?.trim()

  let replyTo: string | undefined
  if (audience === 'broker') {
    replyTo = isEmail(mailboxes.replyToBroker)
      ? mailboxes.replyToBroker!.trim()
      : replyBrokerSecret || replyDefault
  } else if (audience === 'carrier') {
    replyTo = isEmail(mailboxes.replyToCarrier)
      ? mailboxes.replyToCarrier!.trim()
      : replyCarrierSecret || replyDefault
  } else if (audience === 'admin') {
    replyTo = isEmail(mailboxes.opsEmail)
      ? mailboxes.opsEmail!.trim()
      : replyAdminSecret || replyDefault
  } else {
    replyTo = replyDefault
  }

  return { from, replyTo: replyTo || undefined }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function parseIssueLines(issueList: string): string[] {
  return issueList
    .split(/\n/)
    .map((line) => line.replace(/^[-•*]\s*/, '').trim())
    .filter(Boolean)
}

function buildIssueListHtml(issueList: string): string {
  const items = parseIssueLines(issueList)
  if (items.length === 0) {
    return `<p style="margin:0;font-size:14px;color:#64748b;">No items listed yet.</p>`
  }
  return items
    .map((item, index) => {
      const border = index === items.length - 1 ? 'none' : '1px solid #e2e8f0'
      return `<p style="margin:0;padding:8px 0;border-bottom:${border};font-size:14px;line-height:1.45;color:#0f172a;">
  <span style="display:inline-block;width:8px;height:8px;border-radius:99px;background-color:#1684FE;margin-right:8px;vertical-align:middle;"></span>
  ${escapeHtml(item)}
</p>`
    })
    .join('')
}

function buildMessageHtml(message: string): string {
  const trimmed = message.trim()
  if (!trimmed) return ''
  return `<p style="margin:12px 0 0 0;font-size:14px;line-height:1.55;color:#475569;white-space:pre-wrap;">${escapeHtml(trimmed)}</p>`
}

function renderTemplateString(template: string, data: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key: string) => {
    const raw = data[key] ?? ''
    if (
      key.endsWith('Html') ||
      key === 'holdSection' ||
      key === 'inviteLink' ||
      key === 'setupLink' ||
      key === 'clientNameSuffix' ||
      key === 'confirmation_url' ||
      key === 'paymentUrl'
    ) {
      return raw
    }
    return escapeHtml(raw)
  })
}

function isFullEmailDocument(html: string): boolean {
  const t = html.trim().toLowerCase()
  return t.startsWith('<!doctype') || t.startsWith('<html')
}

/** Hosted Credyx wordmark — served by the public site (credyx.net). */
function hostedLogoUrl(): string {
  const origin = (Deno.env.get('EMAIL_ASSET_ORIGIN') || 'https://credyx.net').replace(/\/$/, '')
  return `${origin}/credyx-logo-white-cred-no-bg.png`
}

function defaultCompanyLogoHtml(): string {
  return `<img src="${hostedLogoUrl()}" alt="Credyx" width="168" style="display:block;border:0;outline:none;text-decoration:none;height:auto;max-width:168px;" />`
}

const EMAIL_SHELL_EYEBROW: Record<string, string> = {
  carrier_batch_processed: 'Batch update',
  carrier_batch_verified: 'Batch verified',
  carrier_batch_holds: 'Holds',
  admin_enrollment_alert: 'Enrollment',
  waitlist_signup_alert: 'Waitlist',
  waitlist_welcome: 'Waitlist',
  credyx_batch_error: 'Batch error',
  broker_payment_status_inquiry: 'Collections',
  broker_payment_status_followup: 'Collections',
  broker_rate_verification: 'Rate check',
  broker_paperwork_status_inquiry: 'Paperwork',
  broker_paperwork_status_followup: 'Paperwork',
  broker_claim_scope: 'Claim',
  carrier_claim_or_hold_notice: 'Invoice update',
  carrier_dispute_opened: 'Dispute',
  calendar_event_notice: 'Calendar',
  staff_calendar_digest: 'Staff calendar',
}

/** Wrap plain HTML snippets in the Credyx branded shell (matches frontend emailLayouts). */
function ensureCredyxEmailShell(bodyHtml: string, templateId?: string): string {
  if (isFullEmailDocument(bodyHtml)) return bodyHtml
  const eyebrow = (templateId && EMAIL_SHELL_EYEBROW[templateId]) || 'Credyx'
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${eyebrow}</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;-webkit-text-size-adjust:100%;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f1f5f9;padding:28px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background-color:#ffffff;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;">
          <tr>
            <td style="background-color:#0f172a;padding:22px 28px;">
              {{companyLogoHtml}}
              <p style="margin:14px 0 0 0;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#94a3b8;">
                ${eyebrow}
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 28px 24px 28px;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;color:#475569;">
              <div style="font-size:14px;line-height:1.6;color:#475569;">
                ${bodyHtml}
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 28px;background-color:#f8fafc;border-top:1px solid #e2e8f0;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
              <p style="margin:0 0 4px 0;font-size:12px;font-weight:600;color:#334155;">Credyx · Paid on time</p>
              <p style="margin:0;font-size:11px;line-height:1.45;color:#64748b;">
                A/R Solutions. If you received this in error, please delete it and notify ops@credyx.net.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

function enrichData(template: EmailTemplate, data: Record<string, string>): Record<string, string> {
  const next = { ...data }

  if (template === 'carrier_document_issue') {
    next.issueListHtml = buildIssueListHtml(data.issueList ?? '')
    next.messageHtml = buildMessageHtml(data.message ?? '')
    if (!next.ctaLabel) next.ctaLabel = 'Upload documents'
    if (!next.portalLink) {
      const origin = 'https://app.credyx.net'
      const inv = (next.invoiceNumber || '').trim()
      next.portalLink = inv
        ? `${origin}/client/invoices/needattention?invoice=${encodeURIComponent(inv)}&upload=1`
        : `${origin}/client/invoices/needattention`
    }
    if (!next.clientName) next.clientName = 'Carrier'
    if (!next.brokerName) next.brokerName = 'the broker'
  }

  if (template === 'carrier_billing_invoice') {
    if (!next.ctaLabel) next.ctaLabel = 'Pay invoice'
    if (!next.clientName) next.clientName = 'Carrier'
    if (!next.messageHtml) next.messageHtml = ''
    if (!next.lineItemsHtml) next.lineItemsHtml = ''
    if (!next.invoiceRowsHtml) next.invoiceRowsHtml = ''
  }

  if (template === 'carrier_batch_processed') {
    const holdCount = Number(data.holdCount ?? '0')
    next.holdSubjectSuffix =
      holdCount > 0 ? ` — ${holdCount} on hold` : ' — paperwork sent to brokers'
    next.holdSection =
      holdCount > 0
        ? `<p><strong>${escapeHtml(String(holdCount))} invoice(s) on hold:</strong></p>
<pre style="white-space:pre-wrap;font-family:sans-serif">${escapeHtml(data.holdList ?? '')}</pre>`
        : `<p>No invoices were placed on hold.</p>`
  }

  if (template === 'credyx_batch_error') {
    next.clientNameSuffix = data.clientName ? ` for ${escapeHtml(data.clientName)}` : ''
  }

  if (template === 'broker_payment_status_inquiry' || template === 'broker_payment_status_followup') {
    next.brokerName = data.brokerName ? ` ${data.brokerName}` : ''
  }

  if (template === 'broker_packet') {
    if (!next.remittanceMessage) {
      next.remittanceMessage =
        'All payments must be sent to the carrier per the remit-to on the attached invoice. Send remittance advice to billing@credyx.net and ops@credyx.net. Credyx does not change payment instructions by email alone.'
    }
    if (!next.message) next.message = ''
    if (!next.partSuffix) next.partSuffix = ''
    if (!next.partNoteHtml) next.partNoteHtml = ''
    if (!next.remittanceChangeNoteHtml) next.remittanceChangeNoteHtml = ''
  }

  if (template === 'broker_remittance_updated') {
    if (!next.message) next.message = ''
    if (!next.effectiveDate) next.effectiveDate = new Date().toISOString().slice(0, 10)
    if (!next.carrierName) next.carrierName = 'the carrier'
  }

  if (template === 'client_invite') {
    if (!next.websiteUrl) next.websiteUrl = 'https://credyx.net'
    if (!next.contactEmail) next.contactEmail = 'ops@credyx.net'
    if (!next.setupLink) next.setupLink = next.inviteLink || next.portalLink || ''
    if (!next.inviteLink) next.inviteLink = next.setupLink
    if (!next.ctaLabel) next.ctaLabel = 'Create your password'
    if (!next.companyLogoHtml) {
      next.companyLogoHtml = defaultCompanyLogoHtml()
    }
  }

  if (!next.contactName) next.contactName = 'there'
  if (!next.loadNumber) next.loadNumber = 'N/A'
  if (!next.companyLogoHtml) {
    next.companyLogoHtml = defaultCompanyLogoHtml()
  }

  if (String(template).startsWith('auth_')) {
    if (!next.companyLogoHtml) {
      next.companyLogoHtml = defaultCompanyLogoHtml()
    }
    const labels: Record<string, string> = {
      auth_signup: 'Confirm email',
      auth_invite: 'Accept invitation',
      auth_magiclink: 'Sign in',
      auth_recovery: 'Choose a new password',
      auth_email_change: 'Confirm email change',
      auth_email_otp: 'Continue',
      auth_reauthentication: 'Continue',
    }
    const href = (next.confirmation_url ?? '').trim()
    const label = labels[template] ?? ''
    next.ctaHtml = href && label
      ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-radius:8px;background-color:#1684FE;"><a href="${escapeHtml(href)}" style="display:inline-block;padding:14px 28px;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;">${escapeHtml(label)}</a></td></tr></table>`
      : ''
    const token = (next.token ?? '').trim()
    next.otpHtml = token
      ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;"><tr><td style="padding:20px;text-align:center;"><p style="margin:0 0 8px;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#64748b;">Your verification code</p><p style="margin:0;font-size:28px;font-weight:700;letter-spacing:0.28em;color:#0f172a;">${escapeHtml(token)}</p></td></tr></table>`
      : ''
  }

  return next
}

/** Built-in fallbacks when DB row is missing. */
function builtInEmail(template: EmailTemplate, data: Record<string, string>) {
  const d = enrichData(template, data)
  switch (template) {
    case 'client_invite':
      return {
        subject: renderTemplateString('Welcome to Credyx — your account is active', d),
        html: renderTemplateString(
          `<p>Hi {{contactName}},</p>
<p>Your Credyx account for <strong>{{clientName}}</strong> is active.</p>
<p>Collection fee: <strong>{{feeTermsLabel}}</strong></p>
<p>Website: <a href="{{websiteUrl}}">{{websiteUrl}}</a></p>
<p>Questions: <a href="mailto:{{contactEmail}}">{{contactEmail}}</a></p>
<p><a href="{{setupLink}}">{{ctaLabel}}</a></p>
<p>Portal: <a href="{{portalLink}}">{{portalLink}}</a></p>
<p>Credyx · Paid on time</p>`,
          d
        ),
      }
    case 'broker_packet':
      return {
        subject: renderTemplateString('Document packet — {{invoiceNumber}} · Load {{loadNumber}}', d),
        html: renderTemplateString(
          `{{companyLogoHtml}}
<div style="font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#0f172a;">
  <h1 style="font-size:18px;margin:0 0 8px;">Paperwork for invoice {{invoiceNumber}}</h1>
  <p style="color:#475569;font-size:14px;">Load {{loadNumber}} · Broker {{brokerName}} · Carrier {{clientName}}</p>
  <p style="font-size:13px;"><strong>Documents:</strong> {{documentList}}</p>
  <p style="background:#fffbeb;border:1px solid #f59e0b;padding:12px;border-radius:8px;font-size:14px;"><strong>Payment:</strong> {{remittanceMessage}}</p>
  {{remittanceChangeNoteHtml}}
  <p style="font-size:14px;color:#475569;">{{message}}</p>
</div>`,
          d
        ),
      }
    case 'broker_remittance_updated':
      return {
        subject: renderTemplateString('Remittance updated — {{carrierName}}', d),
        html: renderTemplateString(
          `{{companyLogoHtml}}
<div style="font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#0f172a;">
  <h1 style="font-size:18px;margin:0 0 8px;">Remittance updated for {{carrierName}}</h1>
  <p style="color:#475569;font-size:14px;">Effective {{effectiveDate}}. Please update AP and verify before paying.</p>
  <p style="background:#fffbeb;border:1px solid #f59e0b;padding:12px;border-radius:8px;font-size:14px;">Pay per remit-to on future invoices. Bank verification attached when available. Remittance advice: billing@credyx.net and ops@credyx.net.</p>
  <p style="font-size:14px;color:#475569;">{{message}}</p>
</div>`,
          d
        ),
      }
    case 'admin_enrollment_alert':
      return {
        subject: renderTemplateString('New enrollment — {{clientName}}', d),
        html: renderTemplateString(
          `<p>A new client enrolled: <strong>{{clientName}}</strong> ({{email}}).</p>
<p>Review in the admin portal.</p>`,
          d
        ),
      }
    case 'waitlist_signup_alert':
      return {
        subject: renderTemplateString('New waitlist signup — {{companyName}}', d),
        html: renderTemplateString(
          `<p>A carrier joined the waitlist:</p>
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
          d
        ),
      }
    case 'waitlist_welcome':
      // Keep in sync with WAITLIST_WELCOME_CONTENT_HTML in src/config/emailTemplateDefaults.ts
      return {
        subject: renderTemplateString("Next steps for onboarding {{companyName}} with Credyx", d),
        html: renderTemplateString(
          ensureCredyxEmailShell(
            `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Onboarding</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;-webkit-text-size-adjust:100%;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f1f5f9;padding:28px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background-color:#ffffff;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;">
          <tr>
            <td style="background-color:#0f172a;padding:22px 28px;">
              {{companyLogoHtml}}
              <p style="margin:14px 0 0 0;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#94a3b8;">
                Onboarding
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 28px 24px 28px;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;color:#475569;">
              <p style="margin:0 0 12px 0;font-size:20px;font-weight:600;line-height:1.35;color:#0f172a;">We'll be in touch to get you onboarded</p>
              <div style="font-size:14px;line-height:1.6;color:#475569;">
                <p>Hi {{contactName}},</p>
<p>Thanks for signing up <strong>{{companyName}}</strong> with <strong>Credyx</strong>. A member of our team will contact you shortly to schedule your onboarding.</p>
<p style="margin:20px 0;">
  <a href="https://credyx.net/tour" style="display:inline-block;background-color:#1684FE;color:#ffffff;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:14px;font-weight:600;text-decoration:none;padding:12px 20px;border-radius:8px;">See how Credyx works</a>
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
<p>Questions? Email <a href="mailto:ops@credyx.net" style="color:#1684FE;text-decoration:none;">ops@credyx.net</a> or call <a href="tel:+15550100199" style="color:#1684FE;text-decoration:none;">(555) 010-0199</a>.</p>
<p>— The Credyx team</p>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 28px;background-color:#f8fafc;border-top:1px solid #e2e8f0;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
              <p style="margin:0 0 4px 0;font-size:12px;font-weight:600;color:#334155;">Credyx · Paid on time</p>
              <p style="margin:0;font-size:11px;line-height:1.45;color:#64748b;">
                A/R Solutions. If you received this in error, please delete it and notify ops@credyx.net.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
            template
          ),
          d
        ),
      }
    case 'credyx_batch_error':
      return {
        subject: renderTemplateString('Batch error — {{batchNumber}} ({{scope}})', d),
        html: renderTemplateString(
          `<p>There was an error with batch <strong>{{batchNumber}}</strong>{{clientNameSuffix}}.</p>
<p><strong>Scope:</strong> {{scope}}</p>
<pre style="white-space:pre-wrap;font-family:sans-serif">{{issueMessage}}</pre>
<p>Please review in the Credyx admin portal.</p>`,
          d
        ),
      }
    case 'carrier_batch_verified':
      return {
        subject: renderTemplateString('Batch {{batchNumber}} verified — no issues found', d),
        html: renderTemplateString(
          `<p>All invoices in batch <strong>{{batchNumber}}</strong> were verified successfully ({{invoiceCount}} invoices).</p>
<pre style="white-space:pre-wrap;font-family:sans-serif">{{ppwSummary}}</pre>`,
          d
        ),
      }
    case 'carrier_batch_holds':
      return {
        subject: renderTemplateString('Batch {{batchNumber}} — {{holdCount}} invoice(s) on hold', d),
        html: renderTemplateString(
          `<p>One or more invoices in batch <strong>{{batchNumber}}</strong> were placed on hold.</p>
<pre style="white-space:pre-wrap;font-family:sans-serif">{{holdList}}</pre>`,
          d
        ),
      }
    case 'carrier_batch_processed':
      return {
        subject: renderTemplateString('Batch {{batchNumber}} processed{{holdSubjectSuffix}}', d),
        html: renderTemplateString(
          `<p>Batch <strong>{{batchNumber}}</strong> has been processed ({{invoiceCount}} invoice(s)).</p>
{{holdSection}}
<p><strong>Paperwork sent to brokers:</strong></p>
<pre style="white-space:pre-wrap;font-family:sans-serif">{{ppwSummary}}</pre>
<p>This is an automatic email. Full details are available in your client portal.</p>`,
          d
        ),
      }
    case 'broker_payment_status_inquiry':
      return {
        subject: renderTemplateString('Payment status inquiry — Invoice {{invoiceNumber}}', d),
        html: renderTemplateString(
          `<p>Hello{{brokerName}},</p>
<p>Please provide the payment status for invoice <strong>{{invoiceNumber}}</strong> (Load {{loadNumber}}, Amount {{amount}}).</p>
<p>— Credyx Collections</p>`,
          d
        ),
      }
    case 'broker_payment_status_followup':
      return {
        subject: renderTemplateString('Follow-up: Payment status — Invoice {{invoiceNumber}}', d),
        html: renderTemplateString(
          `<p>Hello{{brokerName}},</p>
<p>We have not received a response regarding invoice <strong>{{invoiceNumber}}</strong>.</p>
<p>— Credyx Collections</p>`,
          d
        ),
      }
    case 'calendar_event_notice':
      return {
        subject: renderTemplateString('Calendar: {{eventTitle}} — {{whenLabel}}', d),
        html: renderTemplateString(
          `<div style="font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#0f172a;">
  <h1 style="font-size:18px;margin:0 0 8px;">{{eventTitle}}</h1>
  <p style="color:#475569;font-size:14px;">{{eventType}} · {{whenLabel}} · {{clientName}}</p>
  <p style="font-size:14px;">Broker: {{brokerName}} · Invoice: {{invoiceNumber}}</p>
  {{meetingBlock}}
  <p style="font-size:14px;white-space:pre-wrap;color:#334155;">{{message}}</p>
  <p style="margin-top:20px;"><a href="{{portalLink}}" style="display:inline-block;background:#0f172a;color:#fff;padding:10px 14px;border-radius:8px;text-decoration:none;font-size:13px;">Open in Credyx</a></p>
</div>`,
          d
        ),
      }
    case 'staff_calendar_digest':
      return {
        subject: renderTemplateString('Credyx today — {{taskCount}} task(s) · {{whenLabel}}', d),
        html: renderTemplateString(
          `<div style="font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:640px;margin:0 auto;padding:24px;color:#0f172a;">
  <p style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#64748b;">Staff calendar</p>
  <h1 style="font-size:20px;margin:8px 0 4px;">What you need to do today</h1>
  <p style="color:#475569;font-size:14px;margin:0 0 16px;">Hi {{recipientName}} — {{taskCount}} item(s) for {{whenLabel}} from the Credyx calendar.</p>
  {{taskListHtml}}
  <p style="margin-top:24px;"><a href="{{portalLink}}" style="display:inline-block;background:#1684FE;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;font-size:13px;">Open calendar</a></p>
  <p style="margin-top:20px;font-size:12px;color:#94a3b8;">Credyx · Paid on time</p>
</div>`,
          d
        ),
      }
    case 'carrier_document_issue':
      return {
        subject: renderTemplateString(
          'Action needed — invoice {{invoiceNumber}} · Load {{loadNumber}}',
          d
        ),
        html: renderTemplateString(
          `<div style="font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#0f172a;">
  <p style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#64748b;">Document issue</p>
  <h1 style="font-size:20px;margin:8px 0;">Action needed on invoice {{invoiceNumber}}</h1>
  <p style="color:#475569;font-size:14px;">Hi {{contactName}} — paperwork for load {{loadNumber}} ({{brokerName}}) needs the items below.</p>
  {{issueListHtml}}
  {{messageHtml}}
  <p><a href="{{portalLink}}" style="display:inline-block;background:#1684FE;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;">{{ctaLabel}}</a></p>
</div>`,
          d
        ),
      }
    case 'carrier_billing_invoice':
      return {
        subject: renderTemplateString('Credyx invoice — {{periodLabel}} · {{amountDue}}', d),
        html: renderTemplateString(
          `<div style="font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#0f172a;">
  <p>Hi {{contactName}},</p>
  <p>Credyx invoice for <strong>{{clientName}}</strong> — {{periodLabel}}.</p>
  <p>Amount due: <strong>{{amountDue}}</strong> (due {{dueDate}}).</p>
  {{lineItemsHtml}}
  {{invoiceRowsHtml}}
  {{messageHtml}}
  <p><a href="{{paymentUrl}}" style="display:inline-block;background:#1684FE;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;">{{ctaLabel}}</a></p>
</div>`,
          d
        ),
      }
    default:
      if (String(template).startsWith('auth_')) {
        const subjects: Record<string, string> = {
          auth_signup: 'Confirm your Credyx email',
          auth_invite: 'You’re invited to Credyx',
          auth_magiclink: 'Your Credyx sign-in link',
          auth_recovery: 'Reset your Credyx password',
          auth_email_change: 'Confirm your Credyx email change',
          auth_email_otp: 'Your Credyx code: {{token}}',
          auth_reauthentication: 'Your Credyx verification code: {{token}}',
          auth_password_changed: 'Your Credyx password was changed',
          auth_email_changed: 'Your Credyx email was changed',
        }
        return {
          subject: renderTemplateString(subjects[template] ?? 'Credyx account', d),
          html: renderTemplateString(
            `<!DOCTYPE html><html lang="en"><body style="margin:0;padding:0;background-color:#f1f5f9;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9;padding:28px 12px;"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;">
<tr><td style="background-color:#0f172a;padding:22px 28px;">{{companyLogoHtml}}<p style="margin:14px 0 0;font-family:Segoe UI,Arial,sans-serif;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#94a3b8;">Credyx</p></td></tr>
<tr><td style="padding:28px;font-family:Segoe UI,Arial,sans-serif;color:#0f172a;">
<p style="margin:0 0 10px;font-size:20px;font-weight:600;">Hi {{contactName}}</p>
<p style="margin:0;font-size:14px;line-height:1.6;color:#475569;">Use the button or code below to continue with your Credyx account.</p>
<div style="margin-top:16px;">{{ctaHtml}}{{otpHtml}}</div>
</td></tr>
<tr><td style="padding:16px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;font-family:Segoe UI,Arial,sans-serif;">
<p style="margin:0;font-size:12px;font-weight:600;color:#334155;">Credyx · Paid on time</p>
</td></tr>
</table></td></tr></table></body></html>`,
            d
          ),
        }
      }
    case 'broker_rate_verification':
      return {
        subject: renderTemplateString(
          'Rate confirmation — Invoice {{invoiceNumber}} · Load {{loadNumber}}',
          d
        ),
        html: renderTemplateString(
          `<p>Hello {{brokerName}},</p>
<p>Please confirm the rate of <strong>{{amount}}</strong> on invoice <strong>{{invoiceNumber}}</strong> (Load {{loadNumber}}, {{clientName}}).</p>
<p>Are there any advances or deductions on this rate? Reply with <strong>no advances or deductions</strong>, or list them.</p>
<p>— Credyx</p>`,
          d
        ),
      }
      throw new Error('Unknown template')
  }
}

async function resolveEmail(
  template: EmailTemplate,
  data: Record<string, string>,
  overrides?: { subject?: string; html?: string }
): Promise<{ subject: string; html: string }> {
  const enriched = enrichData(template, data)

  if (overrides?.subject && overrides?.html) {
    return {
      subject: renderTemplateString(overrides.subject, enriched),
      html: renderTemplateString(
        ensureCredyxEmailShell(overrides.html, template),
        enriched
      ),
    }
  }

  try {
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const url = Deno.env.get('SUPABASE_URL')
    if (serviceKey && url) {
      const admin = createClient(url, serviceKey)
      const { data: row } = await admin
        .from('email_templates')
        .select('subject, body_html')
        .eq('id', template)
        .maybeSingle()
      if (row?.subject && row?.body_html) {
        return {
          subject: renderTemplateString(row.subject, enriched),
          html: renderTemplateString(
            ensureCredyxEmailShell(row.body_html, template),
            enriched
          ),
        }
      }
    }
  } catch (err) {
    console.warn('[send-email] DB template load failed, using built-in', err)
  }

  const builtIn = builtInEmail(template, data)
  return {
    subject: builtIn.subject,
    html: renderTemplateString(
      ensureCredyxEmailShell(builtIn.html, template),
      enrichData(template, data)
    ),
  }
}

function attachmentPayloadSize(attachments: EmailAttachment[] | undefined): number {
  if (!attachments?.length) return 0
  return attachments.reduce((sum, a) => sum + (a.content?.length ?? 0) + (a.filename?.length ?? 0), 0)
}

/** Pull a readable message out of Resend’s JSON or plain-text error body. */
function formatResendError(errText: string, fromAddress: string): string {
  const trimmed = errText.trim()
  let message = trimmed || 'Resend rejected the send'
  try {
    const parsed = JSON.parse(trimmed) as { message?: string; name?: string }
    if (parsed.message) message = parsed.message
  } catch {
    /* plain text */
  }

  if (/not verified/i.test(message) || /domain mismatch/i.test(message)) {
    return `Resend rejected From “${fromAddress}”. credyx.net must be Verified in Resend → Domains (DKIM/SPF). Until then, set RESEND_FROM_EMAIL back to Credyx <onboarding@resend.dev>.`
  }
  if (/only send testing emails to your own email/i.test(message)) {
    return 'Resend is in test mode — it can only send to the email on your Resend account until credyx.net is verified.'
  }
  return `${message} (From: ${fromAddress})`
}

/** Plain-text sibling for HTML mail — improves inbox placement. */
function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
    .slice(0, 8000)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: userData, error: userError } = await supabase.auth.getUser()
    const role = userData.user?.app_metadata?.role
    const staffRole = userData.user?.app_metadata?.admin_role
    const isAdmin =
      role === 'admin' ||
      staffRole === 'admin' ||
      staffRole === 'super_admin' ||
      staffRole === 'billing'
    const payload = (await req.json()) as SendEmailPayload

    if (PUBLIC_TEMPLATES.has(payload.template)) {
      // allowed without admin
    } else if (userError || !userData.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })
    } else if (payload.template.startsWith('auth_') && !isAdmin) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: corsHeaders })
    } else if (
      !isAdmin &&
      payload.template !== 'client_invite' &&
      !payload.template.startsWith('carrier_')
    ) {
      if (
        payload.template === 'broker_packet' ||
        payload.template.startsWith('broker_') ||
        payload.template.startsWith('credyx_')
      ) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: corsHeaders })
      }
    }

    if (PUBLIC_TEMPLATES.has(payload.template)) {
      lockDownPublicPayload(payload)
      if (!isEmail(payload.to)) {
        return new Response(JSON.stringify({ ok: false, error: 'Invalid recipient' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }
    useHostedLogo(payload)

    const resendKey = Deno.env.get('RESEND_API_KEY')
    let { from, replyTo } = await resolveFromAddresses(payload.template)
    const fromOverride =
      typeof (payload as { fromOverride?: string }).fromOverride === 'string'
        ? (payload as { fromOverride?: string }).fromOverride!.trim()
        : ''
    if (fromOverride) {
      // Only allow verified Credyx-style addresses (display name optional)
      const emailMatch = fromOverride.match(/<([^>]+)>/) || fromOverride.match(/([^\s<>]+@[^\s<>]+)/)
      const addr = (emailMatch?.[1] || fromOverride).trim().toLowerCase()
      if (/^[^\s@]+@credyx\.net$/i.test(addr)) {
        from = fromOverride.includes('<')
          ? fromOverride
          : `Credyx <${addr}>`
        // Keep Reply-To aligned with the chosen From (else carrier templates keep ops@)
        replyTo = addr
      } else {
        console.warn('[send-email] ignoring fromOverride outside @credyx.net', addr)
      }
    }

    if (!resendKey) {
      console.log('[send-email] stub — RESEND_API_KEY not configured', {
        template: payload.template,
        to: payload.to,
        attachmentCount: payload.attachments?.length ?? 0,
      })
      return new Response(
        JSON.stringify({
          ok: false,
          stub: true,
          error:
            'Email not configured. Set RESEND_API_KEY on the send-email function (Supabase → Edge Functions → Secrets).',
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    const size = attachmentPayloadSize(payload.attachments)
    if (size > MAX_ATTACHMENT_CHARS) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: `Attachments too large (${Math.round(size / (1024 * 1024))}MB). Keep total under ~35MB.`,
        }),
        { status: 413, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { subject, html } = await resolveEmail(
      payload.template,
      payload.data ?? {},
      payload.overrideSubject && payload.overrideHtml
        ? { subject: payload.overrideSubject, html: payload.overrideHtml }
        : undefined
    )
    const finalSubject = payload.isTest ? `[TEST] ${subject}` : subject

    const resendBody: Record<string, unknown> = {
      from,
      to: [payload.to.trim()],
      subject: finalSubject,
      html,
      text: htmlToText(html),
    }
    if (replyTo) {
      resendBody.reply_to = replyTo
    }

    const ccRaw = (payload as { cc?: unknown }).cc
    if (Array.isArray(ccRaw) && ccRaw.length) {
      const cc = ccRaw
        .filter((v): v is string => typeof v === 'string')
        .map((v) => v.trim().toLowerCase())
        .filter((v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))
      if (cc.length) resendBody.cc = cc
    }

    if (payload.attachments?.length) {
      resendBody.attachments = payload.attachments.map((a) => ({
        filename: a.filename,
        content: a.content,
        ...(a.contentType ? { content_type: a.contentType } : {}),
        ...(a.contentId ? { content_id: a.contentId } : {}),
      }))
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(resendBody),
    })

    if (!res.ok) {
      const errText = await res.text()
      return new Response(JSON.stringify({ ok: false, error: formatResendError(errText, from) }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const result = await res.json()
    return new Response(JSON.stringify({ ok: true, id: result.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Send failed'
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
