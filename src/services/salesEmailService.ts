/**
 * Sales outreach email: send single or bulk emails to carrier leads and keep every
 * message (sent, failed, and replies filed by email-inbound) in Supabase.
 */
import { requireSupabase } from '../lib/supabase'
import { sendTransactionalEmail } from './emailService'
import { updateSalesLead, type SalesLead } from './salesLeadService'

export interface SalesEmailThread {
  id: string
  lead_id: string | null
  to_address: string
  company_name: string | null
  subject: string
  last_message_at: string
  last_direction: 'inbound' | 'outbound'
  unread: boolean
  last_read_at?: string
  created_at: string
}

export interface SalesEmailMessage {
  id: string
  thread_id: string
  lead_id: string | null
  campaign_id: string | null
  direction: 'inbound' | 'outbound'
  status: 'sent' | 'failed' | 'received'
  from_address: string
  to_address: string
  subject: string
  body_text: string
  provider_message_id: string | null
  error: string | null
  sent_by: string | null
  sent_at: string
  cc?: string[] | null
}

export interface SalesEmailTemplate {
  id: string
  name: string
  subject: string
  body: string
}

/** Placeholders the composer offers; filled per recipient. */
export const SALES_MERGE_FIELDS: { key: string; label: string }[] = [
  { key: 'first_name', label: 'First name' },
  { key: 'company', label: 'Company' },
  { key: 'mc', label: 'MC' },
  { key: 'dot', label: 'DOT' },
  { key: 'trucks', label: 'Trucks' },
]

export const SALES_EMAIL_TEMPLATES: SalesEmailTemplate[] = [
  {
    id: 'intro',
    name: 'Intro',
    subject: 'Quick question, {{first_name}}',
    body: `Hi {{first_name}},

I'm reaching out from Credyx. We run the back office for carriers like {{company}}: we verify your paperwork, invoice your brokers, and follow up until you're paid.

There are no monthly fees or startup fees. You only pay when you get paid.

Would you be open to a 15-minute call this week to see if it's a fit?

Thanks,
The Credyx team`,
  },
  {
    id: 'follow_up',
    name: 'Follow-up',
    subject: 'Following up — Credyx for {{company}}',
    body: `Hi {{first_name}},

Just following up on my last note. Carriers with {{trucks}} trucks usually spend hours a week chasing broker payments. We take that off your plate and keep you updated on every invoice.

Is there a good time to talk this week?

Thanks,
The Credyx team`,
  },
  {
    id: 'blank',
    name: 'Blank',
    subject: '',
    body: '',
  },
]

function firstNameFromOfficer(officer: string | null): string {
  const raw = (officer ?? '').trim()
  if (!raw) return 'there'
  // FMCSA officer names are often "LAST, FIRST" or all caps.
  const parts = raw.includes(',') ? raw.split(',').slice(1).join(' ').trim() : raw
  const first = parts.split(/\s+/)[0] ?? ''
  if (!first) return 'there'
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase()
}

function titleCase(value: string | null): string {
  const raw = (value ?? '').trim()
  if (!raw) return 'your company'
  if (raw !== raw.toUpperCase()) return raw
  return raw
    .toLowerCase()
    .replace(/\b([a-z])/g, (m) => m.toUpperCase())
    .replace(/\bLlc\b/g, 'LLC')
}

export function mergeValuesForLead(lead: SalesLead): Record<string, string> {
  return {
    first_name: firstNameFromOfficer(lead.officer),
    company: titleCase(lead.company_name),
    mc: lead.mc_number || '',
    dot: lead.dot_number != null ? String(lead.dot_number) : '',
    trucks: String(lead.total_trucks ?? lead.total_power_units ?? 'a few'),
  }
}

/** Replace {{field}} placeholders with this lead's values. */
export function renderSalesTemplate(text: string, lead: SalesLead): string {
  const values = mergeValuesForLead(lead)
  return text.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (match, key: string) => values[key] ?? match)
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Plain-text body → simple paragraphs for the Credyx email layout. */
export function plainTextToEmailHtml(text: string): string {
  return text
    .trim()
    .split(/\n{2,}/)
    .map(
      (para) =>
        `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#0f172a;">${escapeHtml(para).replace(/\n/g, '<br>')}</p>`
    )
    .join('')
}

export function isValidEmail(value: string | null | undefined): value is string {
  return Boolean(value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()))
}

/** Split a CC field ("a@x.com, b@y.com") into valid unique addresses. */
export function parseCcList(raw: string): { valid: string[]; invalid: string[] } {
  const parts = raw.split(/[,;\s]+/).map((p) => p.trim().toLowerCase()).filter(Boolean)
  const valid = [...new Set(parts.filter((p) => isValidEmail(p)))]
  return { valid, invalid: parts.filter((p) => !isValidEmail(p)) }
}

/* ── Reads ── */

export async function listSalesEmailThreads(): Promise<SalesEmailThread[]> {
  const supabase = requireSupabase()
  const { data, error } = await supabase
    .from('sales_email_threads')
    .select('*')
    .order('last_message_at', { ascending: false })
  if (error) throw new Error(friendlyTableError(error.message))
  return (data ?? []) as SalesEmailThread[]
}

export async function listSalesEmailMessages(threadId: string): Promise<SalesEmailMessage[]> {
  const supabase = requireSupabase()
  const { data, error } = await supabase
    .from('sales_email_messages')
    .select('*')
    .eq('thread_id', threadId)
    .order('sent_at', { ascending: true })
  if (error) throw new Error(friendlyTableError(error.message))
  return (data ?? []) as SalesEmailMessage[]
}

export async function markSalesThreadRead(threadId: string): Promise<void> {
  const supabase = requireSupabase()
  await supabase
    .from('sales_email_threads')
    .update({ unread: false, last_read_at: new Date().toISOString() })
    .eq('id', threadId)
}

export type SalesThreadActivity = {
  threadId: string
  /** Replies received since the conversation was last opened. */
  unread: number
  /** Last email sent to this carrier (successful sends only). */
  lastEmailedAt: string | null
  /** Most recent reply time, for sorting. */
  lastReplyAt: string | null
}

export type SalesEmailActivity = {
  byThread: Map<string, SalesThreadActivity>
  byLeadId: Map<string, SalesThreadActivity>
  byAddress: Map<string, SalesThreadActivity>
  totalUnread: number
}

/** New-reply counts and last-emailed times for every sales conversation. */
export async function loadSalesEmailActivity(): Promise<SalesEmailActivity> {
  const supabase = requireSupabase()
  const [threadsRes, messagesRes] = await Promise.all([
    supabase.from('sales_email_threads').select('id, lead_id, to_address, last_read_at, unread'),
    supabase.from('sales_email_messages').select('thread_id, direction, status, sent_at'),
  ])
  if (threadsRes.error) throw new Error(friendlyTableError(threadsRes.error.message))
  if (messagesRes.error) throw new Error(friendlyTableError(messagesRes.error.message))

  const byThread = new Map<string, SalesThreadActivity>()
  const readAt = new Map<string, string>()
  for (const t of threadsRes.data ?? []) {
    readAt.set(t.id, t.last_read_at ?? '')
    byThread.set(t.id, { threadId: t.id, unread: 0, lastEmailedAt: null, lastReplyAt: null })
  }
  for (const m of messagesRes.data ?? []) {
    const row = byThread.get(m.thread_id)
    if (!row) continue
    if (m.direction === 'inbound') {
      if (m.sent_at > (readAt.get(m.thread_id) ?? '')) row.unread += 1
      if (!row.lastReplyAt || m.sent_at > row.lastReplyAt) row.lastReplyAt = m.sent_at
    } else if (m.status === 'sent' && (!row.lastEmailedAt || m.sent_at > row.lastEmailedAt)) {
      row.lastEmailedAt = m.sent_at
    }
  }

  const byLeadId = new Map<string, SalesThreadActivity>()
  const byAddress = new Map<string, SalesThreadActivity>()
  let totalUnread = 0
  for (const t of threadsRes.data ?? []) {
    const row = byThread.get(t.id)!
    // Never hide a conversation flagged unread, even if its read time is off.
    if (t.unread && row.unread === 0) row.unread = 1
    totalUnread += row.unread
    if (t.lead_id) byLeadId.set(t.lead_id, row)
    byAddress.set(String(t.to_address).toLowerCase(), row)
  }
  return { byThread, byLeadId, byAddress, totalUnread }
}

function friendlyTableError(message: string): string {
  if (/relation .*sales_email|does not exist|schema cache/i.test(message)) {
    return 'Sales email tables are missing. Apply the 20261016120000_sales_email migration to Supabase.'
  }
  return message
}

/* ── Sending ── */

async function upsertThread(lead: SalesLead | null, to: string, subject: string, at: string) {
  const supabase = requireSupabase()
  const address = to.trim().toLowerCase()
  const { data: existing, error: findError } = await supabase
    .from('sales_email_threads')
    .select('id')
    .eq('to_address', address)
    .maybeSingle()
  if (findError) throw new Error(friendlyTableError(findError.message))

  if (existing?.id) {
    await supabase
      .from('sales_email_threads')
      .update({
        subject,
        last_message_at: at,
        last_direction: 'outbound',
        ...(lead ? { lead_id: lead.id, company_name: lead.company_name } : {}),
      })
      .eq('id', existing.id)
    return existing.id as string
  }

  const { data, error } = await supabase
    .from('sales_email_threads')
    .insert({
      lead_id: lead?.id ?? null,
      to_address: address,
      company_name: lead?.company_name ?? null,
      subject,
      last_message_at: at,
      last_direction: 'outbound',
    })
    .select('id')
    .single()
  if (error) throw new Error(friendlyTableError(error.message))
  return data.id as string
}

export type SalesSendResult = {
  leadId: string | null
  to: string
  ok: boolean
  error?: string
}

export type SalesSendSummary = {
  campaignId: string | null
  sent: number
  failed: number
  results: SalesSendResult[]
}

/** Sales mail goes out from (and replies come back to) the system Inbox. */
export const SALES_FROM_ADDRESS = 'system@credyx.net'
const SALES_FROM = `Credyx <${SALES_FROM_ADDRESS}>`

/** Resend allows ~2 requests/second by default; space sends so bulk runs don't get throttled. */
const SEND_SPACING_MS = 650

/**
 * Send one email per recipient (merge fields filled per lead) and store each message.
 * Bulk sends (2+ recipients) are grouped under a campaign row.
 */
export async function sendSalesEmails(opts: {
  recipients: Array<{ lead: SalesLead | null; to: string }>
  subject: string
  body: string
  sentBy: string
  /** Copied on every email (e.g. your own address). */
  cc?: string[]
  onProgress?: (done: number, total: number, result: SalesSendResult) => void
}): Promise<SalesSendSummary> {
  const supabase = requireSupabase()
  const recipients = opts.recipients.filter((r) => isValidEmail(r.to))
  let campaignId: string | null = null

  if (recipients.length > 1) {
    const { data, error } = await supabase
      .from('sales_email_campaigns')
      .insert({
        subject: opts.subject,
        body_text: opts.body,
        recipient_count: recipients.length,
        created_by: opts.sentBy,
      })
      .select('id')
      .single()
    if (error) throw new Error(friendlyTableError(error.message))
    campaignId = data.id as string
  }

  const results: SalesSendResult[] = []
  let sent = 0
  let failed = 0

  for (let i = 0; i < recipients.length; i++) {
    const { lead, to } = recipients[i]
    const subject = lead ? renderSalesTemplate(opts.subject, lead) : opts.subject
    const body = lead ? renderSalesTemplate(opts.body, lead) : opts.body
    const at = new Date().toISOString()

    const response = await sendTransactionalEmail('carrier_sales_outreach', to.trim(), {}, {
      overrideSubject: subject,
      overrideHtml: plainTextToEmailHtml(body),
      fromOverride: SALES_FROM,
      ...(opts.cc?.length ? { cc: opts.cc } : {}),
    })

    let storeError: string | undefined
    try {
      const threadId = await upsertThread(lead, to, subject, at)
      const { error } = await supabase.from('sales_email_messages').insert({
        thread_id: threadId,
        lead_id: lead?.id ?? null,
        campaign_id: campaignId,
        direction: 'outbound',
        status: response.ok ? 'sent' : 'failed',
        from_address: SALES_FROM_ADDRESS,
        to_address: to.trim().toLowerCase(),
        subject,
        body_text: body,
        provider_message_id: response.id ?? null,
        error: response.ok ? null : response.error ?? 'Send failed',
        sent_by: opts.sentBy,
        sent_at: at,
        ...(opts.cc?.length ? { cc: opts.cc } : {}),
      })
      if (error) storeError = friendlyTableError(error.message)
    } catch (err) {
      storeError = err instanceof Error ? err.message : 'Could not save message'
    }

    if (response.ok && lead && (lead.status === 'new' || lead.status === 'researching')) {
      try {
        await updateSalesLead(lead.id, { status: 'contacted' })
      } catch {
        /* status bump is best-effort */
      }
    }

    const result: SalesSendResult = {
      leadId: lead?.id ?? null,
      to,
      ok: response.ok,
      error: response.ok ? storeError : response.error,
    }
    if (response.ok) sent += 1
    else failed += 1
    results.push(result)
    opts.onProgress?.(i + 1, recipients.length, result)

    if (i < recipients.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, SEND_SPACING_MS))
    }
  }

  if (campaignId) {
    await supabase
      .from('sales_email_campaigns')
      .update({ sent_count: sent, failed_count: failed })
      .eq('id', campaignId)
  }

  return { campaignId, sent, failed, results }
}
