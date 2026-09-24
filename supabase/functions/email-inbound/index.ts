/**
 * Resend inbound webhook → email_messages + pending email_review_items.
 * Staff confirm in Admin Inbox before holds/disputes.
 *
 * Auth: RESEND_INBOUND_WEBHOOK_SECRET via header `x-webhook-secret` or `?secret=`.
 * Required in production (SUPABASE_URL not localhost).
 *
 * Note: Resend `email.received` webhooks are metadata-only. We fetch body/headers
 * via GET /emails/receiving/:id when RESEND_API_KEY is set.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-webhook-secret',
}

const BODY_MAX = 80_000

function classify(subject: string, body: string) {
  const text = `${subject}\n${body}`.toLowerCase()
  if (
    /missing.{0,48}(pod|bol|docs?|paperwork|lumper|scale)|on hold.{0,40}missing|hold due to|incomplete\s+(packet|paperwork)/.test(
      text
    )
  ) {
    return {
      classification: 'missing_docs',
      proposed_actions: ['hold_invoice', 'add_note', 'notify_carrier', 'notify_credyx'],
      summary: 'Broker indicated a hold or missing paperwork.',
    }
  }
  if (/\bclaim\b|cargo claim|freight claim/.test(text)) {
    return {
      classification: 'claim',
      proposed_actions: ['hold_invoice', 'add_note', 'notify_carrier', 'notify_credyx', 'compose_claim_scope'],
      summary: 'Broker mentioned a claim.',
    }
  }
  if (/paperwork\s+(is\s+)?(good|fine|complete|in order|ok)|packet\s+(is\s+)?(good|complete)/.test(text)) {
    return {
      classification: 'paperwork_ok',
      proposed_actions: ['log_paperwork_good', 'add_note'],
      summary: 'Broker indicated paperwork is in order.',
    }
  }
  if (/will pay|check (was )?mailed|ach (was )?sent|paid on|expect(ed)? pay/.test(text)) {
    return {
      classification: 'payment_ok',
      proposed_actions: ['log_payment_ok', 'add_note'],
      summary: 'Broker indicated payment status.',
    }
  }
  if (/short.?pay|not paying|dispute|deduct|refuse/.test(text)) {
    return {
      classification: 'negative',
      proposed_actions: ['hold_invoice', 'add_note', 'notify_carrier', 'notify_credyx'],
      summary: 'Negative language in broker reply.',
    }
  }
  return {
    classification: 'unclear',
    proposed_actions: ['add_note'],
    summary: '',
  }
}

/** Keep in sync with src/utils/parseResendInboundPayload.ts */
function pickString(v: unknown): string {
  if (typeof v === 'string') return v.trim()
  if (Array.isArray(v)) {
    for (const item of v) {
      const s = pickString(item)
      if (s) return s
    }
    return ''
  }
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>
    if (typeof o.email === 'string') return o.email.trim()
    if (typeof o.address === 'string') return o.address.trim()
  }
  return ''
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Cloudflare → Resend forwards land on *.resend.app; map those to the public test mailbox. */
function normalizeInboundTo(raw: string): string {
  const t = raw.trim()
  if (!t) return ''
  if (/@[\w.-]+\.resend\.app$/i.test(t) || /credyx-inbox@/i.test(t)) {
    return 'system@credyx.net'
  }
  return t
}

/** Prefer Credyx inbound mailboxes when the message was multi-delivered. */
function preferBillingTo(candidates: string[]): string {
  const normalized = candidates.map(normalizeInboundTo).filter(Boolean)
  const system = normalized.find((t) => /system@/i.test(t))
  if (system) return system
  const billing = normalized.find((t) => /billing@/i.test(t))
  if (billing) return billing
  const collections = normalized.find((t) => /collections@|remittance@/i.test(t))
  if (collections) return collections
  return normalized[0] ?? ''
}

function collectToAddresses(data: Record<string, unknown>): string[] {
  const out: string[] = []
  for (const key of ['to', 'to_address', 'recipient', 'recipients', 'received_for']) {
    const raw = data[key]
    if (!raw) continue
    if (typeof raw === 'string') {
      for (const part of raw.split(/[,;]/)) {
        const s = part.trim()
        if (s) out.push(s)
      }
      continue
    }
    if (Array.isArray(raw)) {
      for (const item of raw) {
        const s = pickString(item)
        if (s) out.push(s)
      }
    } else {
      const s = pickString(raw)
      if (s) out.push(s)
    }
  }
  // Headers often keep the original public To after Cloudflare forward
  const headers = data.headers
  if (headers && typeof headers === 'object' && !Array.isArray(headers)) {
    const h = headers as Record<string, unknown>
    for (const key of ['to', 'x-forwarded-to', 'x-original-to', 'delivered-to', 'original-to']) {
      const s = pickString(h[key] ?? h[key.toUpperCase()])
      if (s) {
        for (const part of s.split(/[,;]/)) {
          const p = part.trim()
          if (p) out.push(p)
        }
      }
    }
  }
  return out
}

function bodyFromEmailFields(data: Record<string, unknown>): string {
  if (typeof data.text === 'string' && data.text.trim()) return data.text.trim()
  if (typeof data.body === 'string' && data.body.trim()) return data.body.trim()
  if (typeof data.html === 'string' && data.html.trim()) return stripHtml(data.html)
  if (typeof data.body_text === 'string' && data.body_text.trim()) return data.body_text.trim()
  return ''
}

function parseInboundPayload(payload: Record<string, unknown>): {
  from: string
  to: string
  subject: string
  bodyText: string
  messageId: string
} {
  const data = (payload.data ?? payload.email ?? payload) as Record<string, unknown>
  const from =
    pickString(data.from) ||
    pickString(data.from_address) ||
    pickString(data.sender) ||
    ''
  const toList = collectToAddresses(data)
  const to = preferBillingTo(toList) || 'system@credyx.net'
  const subject = String(data.subject ?? '(no subject)').trim() || '(no subject)'
  const bodyText = bodyFromEmailFields(data)
  const messageId = String(
    data.message_id ?? data.email_id ?? data.id ?? payload.id ?? ''
  ).trim()
  return { from, to, subject, bodyText, messageId }
}

/** Resend webhooks omit body — fetch full received email when we have an id + API key. */
async function fetchResendReceivedEmail(
  emailId: string
): Promise<Record<string, unknown> | null> {
  const apiKey = Deno.env.get('RESEND_API_KEY')?.trim()
  if (!apiKey || !emailId) return null
  try {
    const res = await fetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(emailId)}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    if (!res.ok) {
      console.error('Resend receiving get failed', res.status, await res.text())
      return null
    }
    return (await res.json()) as Record<string, unknown>
  } catch (err) {
    console.error('Resend receiving get error', err)
    return null
  }
}

function mergeFetchedEmail(
  base: ReturnType<typeof parseInboundPayload>,
  full: Record<string, unknown>
): ReturnType<typeof parseInboundPayload> {
  const from =
    pickString(full.from) ||
    pickString(full.from_address) ||
    base.from
  const toList = collectToAddresses(full)
  const to = preferBillingTo(toList) || base.to || 'system@credyx.net'
  const subject =
    (typeof full.subject === 'string' && full.subject.trim()) || base.subject
  let bodyText = bodyFromEmailFields(full) || base.bodyText
  if (bodyText.length > BODY_MAX) bodyText = bodyText.slice(0, BODY_MAX)
  const messageId =
    String(full.message_id ?? full.id ?? base.messageId).trim() || base.messageId
  return { from, to, subject, bodyText, messageId }
}

function isLocalSupabaseUrl(url: string): boolean {
  return /localhost|127\.0\.0\.1/i.test(url)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const webhookSecret = Deno.env.get('RESEND_INBOUND_WEBHOOK_SECRET')
    const provided =
      req.headers.get('x-webhook-secret') || new URL(req.url).searchParams.get('secret')

    if (!webhookSecret && !isLocalSupabaseUrl(supabaseUrl)) {
      return new Response(
        JSON.stringify({ error: 'RESEND_INBOUND_WEBHOOK_SECRET is required' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    if (webhookSecret && provided !== webhookSecret) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const payload = (await req.json()) as Record<string, unknown>
    let parsed = parseInboundPayload(payload)
    const data = (payload.data ?? payload) as Record<string, unknown>
    const emailId = String(data.email_id ?? data.id ?? '').trim()
    if (emailId) {
      const full = await fetchResendReceivedEmail(emailId)
      if (full) parsed = mergeFetchedEmail(parsed, full)
    }
    const { from, to, subject, bodyText, messageId } = parsed

    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    if (!serviceKey) {
      return new Response(JSON.stringify({ error: 'Service role not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const admin = createClient(supabaseUrl, serviceKey)
    const hay = `${subject} ${bodyText}`
    // Broader than INV- only: "Inv# D30-07", "Invoice 1001", "INV-1001"
    const invMatch =
      hay.match(/\bINV[- ]?([A-Za-z0-9][\w-]*)\b/i) ||
      hay.match(/\binv(?:oice)?[#:\s-]+([A-Za-z0-9][\w-]*)\b/i)
    let invoice: {
      id: string
      broker_id: string | null
      client_id: string
      invoice_number: string
      load_number: string | null
      email_lifecycle: Record<string, unknown> | null
    } | null = null
    if (invMatch) {
      const token = invMatch[1]
      const { data: row } = await admin
        .from('invoices')
        .select('id, broker_id, client_id, invoice_number, load_number, email_lifecycle')
        .ilike('invoice_number', `%${token}%`)
        .limit(1)
        .maybeSingle()
      invoice = row
    }
    if (!invoice) {
      const loadMatch = hay.match(/\b(?:load|pro)[#:\s-]+([A-Za-z0-9][\w-]*)\b/i)
      if (loadMatch) {
        const { data: row } = await admin
          .from('invoices')
          .select('id, broker_id, client_id, invoice_number, load_number, email_lifecycle')
          .ilike('load_number', loadMatch[1])
          .limit(1)
          .maybeSingle()
        invoice = row
      }
    }

    const classified = classify(subject, bodyText)
    const now = new Date().toISOString()
    let threadId: string | null = null

    // Tokens for review row when DB match missed (UI can still show a guess)
    const invToken =
      hay.match(/\bINV[- ]?([A-Za-z0-9][\w-]*)\b/i)?.[1] ||
      hay.match(/\binv(?:oice)?[#:\s-]+([A-Za-z0-9][\w-]*)\b/i)?.[1] ||
      null
    const loadToken = hay.match(/\b(?:load|pro)[#:\s-]+([A-Za-z0-9][\w-]*)\b/i)?.[1] || null
    const guessedInvoiceNumber = invoice?.invoice_number ?? (invToken ? (invToken.match(/^inv/i) ? invToken : `INV-${invToken}`) : null)
    const guessedLoadNumber = invoice?.load_number ?? loadToken

    if (invoice) {
      const { data: existing } = await admin
        .from('email_threads')
        .select('id')
        .eq('invoice_id', invoice.id)
        .maybeSingle()
      threadId = existing?.id ?? `thread-${crypto.randomUUID()}`
      if (!existing) {
        await admin.from('email_threads').insert({
          id: threadId,
          invoice_id: invoice.id,
          broker_id: invoice.broker_id,
          client_id: invoice.client_id,
          subject,
          created_at: now,
          updated_at: now,
        })
      } else {
        await admin
          .from('email_threads')
          .update({ updated_at: now, subject })
          .eq('id', threadId)
      }
      await admin.from('email_messages').insert({
        id: `msg-${crypto.randomUUID()}`,
        thread_id: threadId,
        direction: 'inbound',
        from_address: from || 'unknown',
        to_address: to || 'system@credyx.net',
        subject,
        body_text: bodyText,
        message_id: messageId || null,
        sent_at: now,
      })

      // Stamp lastInboundAt on open chase tracks (signal for later When · replied)
      const life = (invoice.email_lifecycle ?? { paperwork_status: 'unknown' }) as Record<
        string,
        unknown
      >
      const paperwork = { ...((life.paperwork as Record<string, unknown>) ?? {}) }
      const payment = { ...((life.payment as Record<string, unknown>) ?? {}) }
      let touched = false
      if (paperwork.firstAskedAt || paperwork.startedAt) {
        paperwork.lastInboundAt = now
        touched = true
      }
      if (payment.firstAskedAt || payment.startedAt) {
        payment.lastInboundAt = now
        touched = true
      }
      if (touched) {
        await admin
          .from('invoices')
          .update({
            email_lifecycle: { ...life, paperwork, payment },
            updated_at: now,
          })
          .eq('id', invoice.id)
      }
    }

    const { error } = await admin.from('email_review_items').insert({
      id: `review-${crypto.randomUUID()}`,
      thread_id: threadId,
      invoice_id: invoice?.id ?? null,
      broker_id: invoice?.broker_id ?? null,
      client_id: invoice?.client_id ?? null,
      status: 'pending_review',
      classification: classified.classification,
      proposed_actions: classified.proposed_actions,
      summary: classified.summary,
      body_text: bodyText,
      from_address: from,
      to_address: to || 'system@credyx.net',
      subject,
      load_number: guessedLoadNumber,
      invoice_number: guessedInvoiceNumber,
      created_at: now,
    })

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(
      JSON.stringify({
        ok: true,
        matched: Boolean(invoice),
        to,
        bodyChars: bodyText.length,
        fetched: Boolean(emailId),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
