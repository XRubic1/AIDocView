/**
 * Parse Resend Receiving (and loose webhook) payloads into a flat inbound email.
 * Keep in sync with supabase/functions/email-inbound (same field rules).
 */

export type ParsedResendInbound = {
  from: string
  to: string
  subject: string
  bodyText: string
  messageId: string
}

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
  return out
}

/** Normalize Resend / generic webhook JSON → inbound fields. */
export function parseResendInboundPayload(payload: unknown): ParsedResendInbound {
  const root = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>
  const data = (root.data ?? root.email ?? root) as Record<string, unknown>

  const from =
    pickString(data.from) ||
    pickString(data.from_address) ||
    pickString(data.sender) ||
    ''

  const toList = collectToAddresses(data)
  const to = preferBillingTo(toList) || 'system@credyx.net'

  const subject = String(data.subject ?? '(no subject)').trim() || '(no subject)'

  let bodyText = ''
  if (typeof data.text === 'string' && data.text.trim()) bodyText = data.text.trim()
  else if (typeof data.body === 'string' && data.body.trim()) bodyText = data.body.trim()
  else if (typeof data.html === 'string' && data.html.trim()) bodyText = stripHtml(data.html)
  else if (typeof data.body_text === 'string') bodyText = data.body_text.trim()

  const messageId = String(
    data.message_id ?? data.email_id ?? data.id ?? root.id ?? ''
  ).trim()

  return { from, to, subject, bodyText, messageId }
}
