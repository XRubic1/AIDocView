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
import { beginPaymentChaseAfterConfirm } from '../_shared/blueprintEngine.ts'
import { readRateVerificationReply } from '../_shared/rateVerificationReply.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-webhook-secret',
}

const BODY_MAX = 80_000

function outboundKind(
  templateId: string,
  subject: string,
  body: string
): 'paperwork' | 'payment' | 'other' | 'rate_verification' {
  const template = templateId.toLowerCase()
  if (template.includes('rate_verification')) return 'rate_verification'
  if (template.includes('payment')) return 'payment'
  if (template.includes('paperwork') || template.includes('packet')) return 'paperwork'
  const text = `${subject} ${body}`.toLowerCase()
  if (/payment status|when will you pay|remit|pay date/.test(text)) return 'payment'
  if (/paperwork|ppw|packet|pod|bol|rate con/.test(text)) return 'paperwork'
  return 'other'
}

function readReply(subject: string, body: string, kind: 'paperwork' | 'payment' | 'other' | 'rate_verification') {
  const text = `${subject}\n${body}`
  const rejected =
    /not\s+received|did\s*n[o']t\s+receive|never\s+received|missing|lumper|missing\s+pages?|incomplete|short\s*pay|will\s+not\s+pay|not\s+paying/i.test(
      text
    )
  const confirmed =
    /good\s+to\s+go|\bg2g\b|all\s+set|looks\s+good|paperwork\s+(is\s+)?(good|ok|okay|complete|received)|will\s+pay|check\s+(was\s+)?mailed|ach\s+(sent|processed)/i.test(
      text
    ) || /^\s*\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\s*$/.test(body.trim())
  const dateInReply = /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/.test(text)
  const status = rejected
    ? 'rejected'
    : confirmed || (kind === 'payment' && dateInReply)
      ? 'confirmed'
      : 'unknown'
  const asked = kind === 'paperwork' ? 'paperwork status' : kind === 'payment' ? 'payment status' : 'a Credyx email'
  const label = status === 'confirmed' ? 'Confirmed' : status === 'rejected' ? 'Rejected' : 'Unknown'
  const classification =
    status === 'unknown'
      ? 'unclear'
      : status === 'rejected'
        ? 'missing_docs'
        : kind === 'payment'
          ? 'payment_ok'
          : 'paperwork_ok'
  const proposed_actions =
    status === 'confirmed'
      ? kind === 'payment'
        ? ['log_payment_ok', 'add_note']
        : ['log_paperwork_good', 'add_note']
      : status === 'rejected'
        ? ['hold_invoice', 'add_note', 'notify_carrier']
        : ['add_note']
  const date = text.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b/)
  let payDate: string | null = null
  if (date) {
    const year = date[3].length === 2 ? `20${date[3]}` : date[3]
    payDate = `${year}-${date[1].padStart(2, '0')}-${date[2].padStart(2, '0')}`
  }
  return {
    status,
    kind,
    classification,
    proposed_actions,
    summary: `${label} · Credyx asked ${asked}.`,
    payDate,
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
      status?: string | null
      notes?: string | null
      notes_history?: unknown
    } | null = null
    if (invMatch) {
      const token = invMatch[1]
      const { data: row } = await admin
        .from('invoices')
        .select('id, broker_id, client_id, invoice_number, load_number, email_lifecycle, status, notes, notes_history')
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
          .select('id, broker_id, client_id, invoice_number, load_number, email_lifecycle, status, notes, notes_history')
          .ilike('load_number', loadMatch[1])
          .limit(1)
          .maybeSingle()
        invoice = row
      }
    }

    const now = new Date().toISOString()
    let threadId: string | null = null
    let classified = readReply(subject, bodyText, 'other')

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

      const { data: outbound } = await admin
        .from('email_messages')
        .select('subject, body_text, template_id')
        .eq('thread_id', threadId)
        .eq('direction', 'outbound')
        .order('sent_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      const kind = outboundKind(
        String(outbound?.template_id ?? ''),
        String(outbound?.subject ?? ''),
        String(outbound?.body_text ?? '')
      )
      if (kind === 'rate_verification') {
        const rate = readRateVerificationReply(subject, bodyText)
        const note = `${rate.summary}\n\n(Blueprint: Rate verification)`
        const history = Array.isArray(invoice.notes_history) ? [...invoice.notes_history] : []
        history.push({
          id: `note-${crypto.randomUUID()}`,
          note,
          created_by: 'Credyx',
          created_at: now,
          type: rate.outcome === 'hold' ? 'hold_reason' : 'note',
          visibility: 'internal',
        })
        const patch: Record<string, unknown> = {
          notes_history: history,
          verification_status: 'Email',
          updated_at: now,
          email_lifecycle: {
            ...((invoice.email_lifecycle ?? {}) as Record<string, unknown>),
            last_reply_status: rate.outcome === 'ok' ? 'confirmed' : rate.outcome === 'hold' ? 'rejected' : 'unknown',
          },
        }
        const open = !invoice.status || ['pending', 'review', 'approved', 'hold'].includes(invoice.status)
        if (rate.outcome === 'ok' && open) {
          patch.status = 'approved'
          patch.approved_by = 'Credyx'
          patch.approved_at = now
          patch.hold_reason = null
        } else if (rate.outcome === 'hold' && open) {
          patch.status = 'hold'
          patch.hold_reason = rate.summary
        }
        await admin.from('invoices').update(patch).eq('id', invoice.id)
        const { error: runErr } = await admin.from('blueprint_runs').insert({
          id: `run-rate-${invoice.id}-${Date.now()}`,
          subject: 'invoice',
          subject_id: invoice.id,
          subject_label: invoice.invoice_number,
          client_label: '',
          blueprint_id: 'bp-standard-rate-verification',
          blueprint_name: 'Rate verification',
          status: 'completed',
          current_step: `Done · ${rate.outcome}`,
          current_node_id: 'n-done',
          wait_until: null,
          started_at: now,
          updated_at: now,
        })
        if (runErr) console.warn('[email-inbound] rate verification run', runErr.message)
        classified = {
          status: rate.outcome === 'ok' ? 'confirmed' : rate.outcome === 'hold' ? 'rejected' : 'unknown',
          kind,
          classification: rate.outcome === 'hold' ? 'negative' : rate.outcome === 'ok' ? 'paperwork_ok' : 'unclear',
          proposed_actions: rate.outcome === 'hold' ? ['hold_invoice', 'add_note'] : ['add_note'],
          summary: rate.summary,
          payDate: null,
        }
      } else {
      const reading = readReply(subject, bodyText, kind)
      const life = (invoice.email_lifecycle ?? { paperwork_status: 'unknown' }) as Record<string, unknown>
      const paperwork = { ...((life.paperwork as Record<string, unknown>) ?? {}) }
      const payment = { ...((life.payment as Record<string, unknown>) ?? {}) }
      if (paperwork.firstAskedAt || paperwork.startedAt) paperwork.lastInboundAt = now
      if (payment.firstAskedAt || payment.startedAt) payment.lastInboundAt = now
      const nextLife: Record<string, unknown> = {
        ...life,
        paperwork,
        payment,
        last_reply_status: reading.status,
      }
      const invoicePatch: Record<string, unknown> = {
        email_lifecycle: nextLife,
        updated_at: now,
      }
      if (reading.status === 'confirmed' && reading.classification === 'paperwork_ok') {
        nextLife.paperwork_status = 'good'
      }
      if (reading.status === 'confirmed' && reading.payDate) {
        invoicePatch.collection_status = 'W/P'
        invoicePatch.collection_date = reading.payDate
      }
      if (reading.status === 'rejected') {
        nextLife.paperwork_status = 'issue'
        invoicePatch.status = 'hold'
        invoicePatch.hold_reason = reading.summary
      }
      await admin.from('invoices').update(invoicePatch).eq('id', invoice.id)
      const paperworkConfirmed = reading.status === 'confirmed' && reading.classification === 'paperwork_ok'
      if (paperworkConfirmed) {
        try {
          await beginPaymentChaseAfterConfirm(admin, String(invoice.id))
        } catch (err) {
          console.error('[email-inbound] payment chase handoff', err)
          await admin
            .from('blueprint_runs')
            .update({
              status: 'stopped',
              current_step: 'Stopped · broker confirmed',
              wait_until: null,
              updated_at: now,
            })
            .eq('subject', 'invoice')
            .eq('subject_id', invoice.id)
            .in('status', ['waiting', 'active'])
        }
      } else if (reading.status === 'confirmed' || reading.status === 'rejected') {
        await admin
          .from('blueprint_runs')
          .update({
            status: 'stopped',
            current_step: `Stopped · broker ${reading.status}`,
            wait_until: null,
            updated_at: now,
          })
          .eq('subject', 'invoice')
          .eq('subject_id', invoice.id)
          .in('status', ['waiting', 'active'])
      }
      classified = reading
      }
    }

    const { error } = await admin.from('email_review_items').insert({
      id: `review-${crypto.randomUUID()}`,
      thread_id: threadId,
      invoice_id: invoice?.id ?? null,
      broker_id: invoice?.broker_id ?? null,
      client_id: invoice?.client_id ?? null,
      status: classified.status === 'unknown' ? 'pending_review' : 'confirmed',
      classification: classified.classification,
      proposed_actions: classified.proposed_actions,
      summary: classified.summary || 'Unknown · Could not read this reply.',
      body_text: bodyText,
      from_address: from,
      to_address: to || 'system@credyx.net',
      subject,
      load_number: guessedLoadNumber,
      invoice_number: guessedInvoiceNumber,
      created_at: now,
      confirmed_at: classified.status === 'unknown' ? null : now,
      confirmed_by: classified.status === 'unknown' ? null : 'Reply reader',
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
