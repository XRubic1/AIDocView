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
  | 'credyx_batch_error'
  | 'carrier_batch_verified'
  | 'carrier_batch_holds'
  | 'carrier_batch_processed'
  | 'broker_payment_status_inquiry'
  | 'broker_payment_status_followup'
  | 'calendar_event_notice'

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
}

const PUBLIC_TEMPLATES = new Set<EmailTemplate>(['admin_enrollment_alert'])

type FromAudience = 'broker' | 'carrier' | 'admin' | 'default'

/** Map template → audience for From / Reply-To secrets. */
function audienceForTemplate(template: EmailTemplate): FromAudience {
  if (template === 'broker_packet' || template.startsWith('broker_')) return 'broker'
  if (template.startsWith('carrier_') || template === 'client_invite') return 'carrier'
  if (template === 'admin_enrollment_alert' || template.startsWith('credyx_')) return 'admin'
  if (template === 'calendar_event_notice') return 'default'
  return 'default'
}

/**
 * Resolve From (+ optional Reply-To) from Edge secrets.
 * Brokers → RESEND_FROM_BROKER (e.g. billing@), carriers → RESEND_FROM_CARRIER (ops@),
 * falling back to RESEND_FROM_EMAIL.
 */
function resolveFromAddresses(template: EmailTemplate): { from: string; replyTo?: string } {
  const fallback = Deno.env.get('RESEND_FROM_EMAIL') ?? 'Credyx <onboarding@resend.dev>'
  const audience = audienceForTemplate(template)

  const brokerFrom = Deno.env.get('RESEND_FROM_BROKER')?.trim()
  const carrierFrom = Deno.env.get('RESEND_FROM_CARRIER')?.trim()
  const adminFrom = Deno.env.get('RESEND_FROM_ADMIN')?.trim()

  let from = fallback
  if (audience === 'broker' && brokerFrom) from = brokerFrom
  else if (audience === 'carrier' && carrierFrom) from = carrierFrom
  else if (audience === 'admin' && adminFrom) from = adminFrom

  const replyDefault = Deno.env.get('RESEND_REPLY_TO')?.trim()
  const replyBroker = Deno.env.get('RESEND_REPLY_TO_BROKER')?.trim()
  const replyCarrier = Deno.env.get('RESEND_REPLY_TO_CARRIER')?.trim()
  const replyAdmin = Deno.env.get('RESEND_REPLY_TO_ADMIN')?.trim()

  let replyTo: string | undefined
  if (audience === 'broker') replyTo = replyBroker || replyDefault
  else if (audience === 'carrier') replyTo = replyCarrier || replyDefault
  else if (audience === 'admin') replyTo = replyAdmin || replyDefault
  else replyTo = replyDefault

  return { from, replyTo: replyTo || undefined }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function renderTemplateString(template: string, data: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key: string) => {
    const raw = data[key] ?? ''
    if (key.endsWith('Html') || key === 'holdSection' || key === 'inviteLink' || key === 'clientNameSuffix') {
      return raw
    }
    return escapeHtml(raw)
  })
}

function enrichData(template: EmailTemplate, data: Record<string, string>): Record<string, string> {
  const next = { ...data }

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

  if (!next.contactName) next.contactName = 'there'
  if (!next.loadNumber) next.loadNumber = 'N/A'

  return next
}

/** Built-in fallbacks when DB row is missing. */
function builtInEmail(template: EmailTemplate, data: Record<string, string>) {
  const d = enrichData(template, data)
  switch (template) {
    case 'client_invite':
      return {
        subject: 'Your Credyx client portal is ready',
        html: renderTemplateString(
          `<p>Hi {{contactName}},</p>
<p>Your Credyx account has been activated. Set your password and sign in:</p>
<p><a href="{{inviteLink}}">Activate your account</a></p>
<p>If you did not request this, you can ignore this email.</p>`,
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
    default:
      throw new Error('Unknown template')
  }
}

async function resolveEmail(
  template: EmailTemplate,
  data: Record<string, string>
): Promise<{ subject: string; html: string }> {
  const enriched = enrichData(template, data)

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
          html: renderTemplateString(row.body_html, enriched),
        }
      }
    }
  } catch (err) {
    console.warn('[send-email] DB template load failed, using built-in', err)
  }

  return builtInEmail(template, data)
}

function attachmentPayloadSize(attachments: EmailAttachment[] | undefined): number {
  if (!attachments?.length) return 0
  return attachments.reduce((sum, a) => sum + (a.content?.length ?? 0) + (a.filename?.length ?? 0), 0)
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
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: userData, error: userError } = await supabase.auth.getUser()
    const role = userData.user?.app_metadata?.role
    const isAdmin = role === 'admin'
    const payload = (await req.json()) as SendEmailPayload

    if (PUBLIC_TEMPLATES.has(payload.template)) {
      // allowed without admin
    } else if (userError || !userData.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })
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

    const resendKey = Deno.env.get('RESEND_API_KEY')
    const { from, replyTo } = resolveFromAddresses(payload.template)

    if (!resendKey) {
      console.log('[send-email] stub — RESEND_API_KEY not configured', {
        template: payload.template,
        to: payload.to,
        attachmentCount: payload.attachments?.length ?? 0,
      })
      return new Response(JSON.stringify({ ok: false, stub: true, error: 'Email not configured' }), {
        status: 503,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
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

    const { subject, html } = await resolveEmail(payload.template, payload.data ?? {})

    const resendBody: Record<string, unknown> = {
      from,
      to: [payload.to],
      subject,
      html,
    }
    if (replyTo) {
      resendBody.reply_to = replyTo
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
      return new Response(JSON.stringify({ ok: false, error: errText }), {
        status: res.status,
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
