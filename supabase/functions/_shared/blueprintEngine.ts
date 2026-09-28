/**
 * Server blueprint runner. Enrolls and advances graphs with no admin tab open.
 * Chase emails use the Wait / Then-do rules on the saved blueprint.
 * Broker replied / no reply stay false (reply reading is not in this MVP).
 */
import { STANDARD_CHASE_BLUEPRINTS } from './standardBlueprints.ts'
import { fillBlueprintNoteTokens } from './blueprintNoteTokens.ts'

// Untyped service client — same pattern as the other Credyx edge functions.
// deno-lint-ignore no-explicit-any
type Admin = any

type NodeData = {
  kind?: string
  label?: string
  checkId?: string
  whenMatch?: 'yes' | 'no'
  waitUntilId?: string
  days?: string
  waitUnit?: string
  actionId?: string
  actionIds?: string[]
  actionConfigs?: Record<
    string,
    { message?: string; channel?: string; templateId?: string; fromEmail?: string; fromEmails?: string[] }
  >
  triggerSubject?: string
}

type FlowNode = { id: string; data: NodeData }
type FlowEdge = { source: string; target: string }

type BlueprintRow = {
  id: string
  name: string
  priority: number
  nodes: FlowNode[]
  edges: FlowEdge[]
}

type RunRow = {
  id: string
  subject: string
  subject_id: string | null
  subject_label: string
  client_label: string
  blueprint_id: string
  blueprint_name: string
  status: string
  current_step: string
  current_node_id: string | null
  wait_until: string | null
  started_at: string
  updated_at: string
}

type InvoiceRow = Record<string, unknown>
type BrokerRow = Record<string, unknown>

const TERMINAL = new Set([
  'paid',
  'rejected',
  'written_off',
  'write_off_pending',
  'force_closed',
])

const RULE_BY_TEMPLATE: Record<string, string> = {
  broker_paperwork_status_inquiry: 'broker_paperwork_status_inquiry',
  broker_paperwork_status_followup: 'broker_paperwork_status_followup',
  broker_payment_status_inquiry: 'broker_payment_status_inquiry',
  broker_payment_status_followup: 'broker_payment_status_followup',
  carrier_claim_or_hold_notice: 'carrier_claim_or_hold_notice',
  carrier_batch_processed: 'batch_processed_carrier',
}

export type BlueprintTickResult = {
  ok: true
  advanced: number
  enrolled: number
  sent: number
  actions: number
  details: string[]
}

function parseDays(raw: string | undefined, fallback: number): number {
  const n = Number(raw)
  return Number.isFinite(n) && n >= 0 ? n : fallback
}

function daysFromNow(days: number, now = new Date()): string {
  const d = new Date(now)
  d.setDate(d.getDate() + days)
  d.setHours(9, 0, 0, 0)
  return d.toISOString()
}

function addDaysToYmd(ymd: string, days: number): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd.trim())
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 9, 0, 0, 0)
  d.setDate(d.getDate() + days)
  const y = d.getFullYear()
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${mo}-${day}`
}

function atLocalNine(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd.trim())
  if (!m) return new Date().toISOString()
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 9, 0, 0, 0).toISOString()
}

function clampWake(iso: string, now: Date): string {
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t) || t <= now.getTime()) return now.toISOString()
  return iso
}

function addDaysToIso(iso: string, days: number, now: Date): string {
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return clampWake(daysFromNow(days, now), now)
  d.setDate(d.getDate() + days)
  d.setHours(9, 0, 0, 0)
  return clampWake(d.toISOString(), now)
}

function getActionIds(data: NodeData): string[] {
  if (Array.isArray(data.actionIds) && data.actionIds.length > 0) {
    return data.actionIds.filter(Boolean)
  }
  if (data.actionId) return [data.actionId]
  return []
}

function isWhen(data: NodeData): boolean {
  return data.kind === 'if' || data.kind === 'elseif'
}

function whenPasses(data: NodeData, raw: boolean): boolean {
  return data.whenMatch === 'no' ? !raw : raw
}

function nextNodes(fromId: string, nodes: FlowNode[], edges: FlowEdge[]): FlowNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  return edges
    .filter((e) => e.source === fromId)
    .map((e) => byId.get(e.target))
    .filter((n): n is FlowNode => !!n)
}

function hasCheck(nodes: FlowNode[], checkId: string): boolean {
  return nodes.some((n) => isWhen(n.data) && n.data.checkId === checkId && n.data.whenMatch !== 'no')
}

function waitsOnReply(nodes: FlowNode[]): boolean {
  return nodes.some(
    (n) => isWhen(n.data) && (n.data.checkId === 'broker_replied' || n.data.checkId === 'no_reply')
  )
}

function hasAction(nodes: FlowNode[], actionId: string): boolean {
  return nodes.some((n) => n.data.kind === 'action' && getActionIds(n.data).includes(actionId))
}

function trackOf(bp: BlueprintRow): 'paperwork' | 'payment' | 'hold' | 'batch' | 'packet' | 'ops' | 'dispute' | 'reply' | 'other' {
  if (
    hasCheck(bp.nodes, 'broker_confirmed') ||
    hasCheck(bp.nodes, 'broker_rejected') ||
    hasCheck(bp.nodes, 'broker_unknown')
  ) {
    return 'reply'
  }
  if (hasAction(bp.nodes, 'email_carrier_dispute')) return 'dispute'
  if (hasAction(bp.nodes, 'email_ops_alert') && !hasAction(bp.nodes, 'email_carrier_batch_processed')) {
    return 'ops'
  }
  if (bp.nodes.some((n) => n.data.triggerSubject === 'batches') || hasAction(bp.nodes, 'email_carrier_batch_processed')) {
    return 'batch'
  }
  if (hasCheck(bp.nodes, 'on_hold')) return 'hold'
  if (hasCheck(bp.nodes, 'paperwork_good')) return 'payment'
  if (hasCheck(bp.nodes, 'ppw_sent')) return 'paperwork'
  if (hasAction(bp.nodes, 'email_broker_packet')) return 'packet'
  return 'other'
}

function ppwSentAt(invoice: InvoiceRow): string | null {
  const history = invoice.document_send_history as Array<{ sent_at?: string; status?: string }> | null
  const ok = (history ?? []).filter(
    (h) => (h.status === 'sent' || h.status === 'delivered') && h.sent_at
  )
  if (!ok.length) return null
  return ok.reduce((earliest, h) => {
    const at = String(h.sent_at)
    return at < earliest ? at : earliest
  }, String(ok[0].sent_at))
}

function paperworkGood(invoice: InvoiceRow): boolean {
  const life = (invoice.email_lifecycle ?? {}) as { paperwork_status?: string }
  return life.paperwork_status === 'good'
}

function lifeOf(invoice: InvoiceRow): Record<string, unknown> {
  return (invoice.email_lifecycle ?? { paperwork_status: 'unknown' }) as Record<string, unknown>
}

function trackState(life: Record<string, unknown>, key: 'paperwork' | 'payment'): Record<string, string> {
  return (life[key] ?? {}) as Record<string, string>
}

function brokerEmail(broker: BrokerRow | undefined): string {
  if (!broker) return ''
  const emails = broker.emails as Array<{ email?: string; category?: string }> | undefined
  const accounting = emails?.find((e) => e.category === 'accounting')?.email
  const paperwork = emails?.find((e) => e.category === 'paperwork')?.email
  return String(accounting || paperwork || emails?.[0]?.email || broker.email || '').trim()
}

function ruleEnabled(settings: { rules?: Record<string, { enabled?: boolean }> }, templateId: string): boolean {
  const ruleId = RULE_BY_TEMPLATE[templateId]
  if (!ruleId) return true
  return settings.rules?.[ruleId]?.enabled !== false
}

function logoHtml(): string {
  return `<div style="font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:22px;font-weight:700;letter-spacing:0.02em;line-height:1;"><span style="color:#ffffff;">Cred</span><span style="color:#1684FE;">yx</span></div>`
}

function ensureShell(bodyHtml: string, eyebrow: string): string {
  const t = bodyHtml.trim().toLowerCase()
  if (t.startsWith('<!doctype') || t.startsWith('<html')) return bodyHtml
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8" /></head>
<body style="margin:0;padding:0;background-color:#f1f5f9;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f1f5f9;padding:28px 12px;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background-color:#ffffff;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;">
<tr><td style="background-color:#0f172a;padding:22px 28px;">{{companyLogoHtml}}
<p style="margin:14px 0 0 0;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#94a3b8;">${eyebrow}</p></td></tr>
<tr><td style="padding:28px;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;color:#475569;">${bodyHtml}</td></tr>
<tr><td style="padding:16px 28px;background-color:#f8fafc;border-top:1px solid #e2e8f0;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
<p style="margin:0 0 4px 0;font-size:12px;font-weight:600;color:#334155;">Credyx · Paid on time</p>
<p style="margin:0;font-size:11px;line-height:1.45;color:#64748b;">A/R Solutions.</p>
</td></tr></table></td></tr></table></body></html>`
}

async function sendTemplate(
  admin: Admin,
  templateId: string,
  to: string,
  data: Record<string, string>,
  fromOverride?: string,
  cc?: string[]
): Promise<boolean> {
  const resendKey = Deno.env.get('RESEND_API_KEY')
  if (!resendKey || !to) return false
  const { data: row } = await admin
    .from('email_templates')
    .select('subject, body_html')
    .eq('id', templateId)
    .maybeSingle()
  let subject = String(row?.subject ?? templateId)
  let html = ensureShell(String(row?.body_html ?? `<p>${templateId}</p>`), 'Credyx')
  const merged = { companyLogoHtml: logoHtml(), ...data }
  for (const [k, v] of Object.entries(merged)) {
    subject = subject.replaceAll(`{{${k}}}`, v)
    html = html.replaceAll(`{{${k}}}`, v)
  }
  const from =
    fromOverride ||
    Deno.env.get('RESEND_FROM_BROKER') ||
    Deno.env.get('RESEND_FROM_EMAIL') ||
    'Credyx <billing@credyx.net>'
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: [to],
      ...(cc && cc.length ? { cc } : {}),
      subject,
      html,
    }),
  })
  return res.ok
}

function evaluateWhen(checkId: string | undefined, invoice: InvoiceRow): boolean {
  if (!checkId) return false
  if (checkId === 'on_hold') return invoice.status === 'hold'
  if (checkId === 'payment_posted') {
    return invoice.status === 'paid' || Number(invoice.paid_amount ?? 0) > 0
  }
  if (checkId === 'ppw_sent') return Boolean(ppwSentAt(invoice))
  if (checkId === 'paperwork_good') return paperworkGood(invoice)
  if (checkId === 'invoice_processed') {
    return invoice.status === 'approved' || invoice.status === 'hold' || invoice.status === 'review'
  }
  if (checkId === 'broker_replied' || checkId === 'no_reply') return false
  const reply = String((lifeOf(invoice).last_reply_status as string | undefined) ?? '')
  if (checkId === 'broker_confirmed') return reply === 'confirmed'
  if (checkId === 'broker_rejected') return reply === 'rejected'
  if (checkId === 'broker_unknown') return reply === 'unknown'
  return false
}

function resolveWait(
  node: FlowNode,
  invoice: InvoiceRow,
  broker: BrokerRow | undefined,
  now: Date
): { waitUntil: string; detail: string } {
  const id = node.data.waitUntilId || 'pause_days'
  const cardDays = parseDays(node.data.days, id === 'pause_days' ? 3 : 7)

  if (id === 'after_ppw') {
    const override = Number(broker?.paperwork_status_check_days)
    const days = Number.isFinite(override) && override > 0 ? Math.floor(override) : cardDays
    const sent = ppwSentAt(invoice)
    if (!sent) return { waitUntil: clampWake(daysFromNow(days, now), now), detail: `no PPW — pause ${days}d` }
    return { waitUntil: addDaysToIso(sent, days, now), detail: `PPW + ${days}d` }
  }

  if (id === 'payment_clock') {
    const override = Number(broker?.payment_status_inquiry_days)
    const days = Number.isFinite(override) && override > 0 ? Math.floor(override) : cardDays
    const due = String(invoice.due_date || invoice.expected_payment_date || '').trim()
    const dueMs = due ? Date.parse(`${due.slice(0, 10)}T12:00:00`) : NaN
    if (Number.isFinite(dueMs) && dueMs > now.getTime()) {
      const target = addDaysToYmd(due.slice(0, 10), days)
      if (target) return { waitUntil: clampWake(atLocalNine(target), now), detail: `due + ${days}d` }
    }
    return { waitUntil: clampWake(daysFromNow(days, now), now), detail: `inquiry ${days}d from now` }
  }

  if (id === 'pause_days' || !id) {
    const unit = String(node.data.waitUnit || 'days')
    if (unit === 'minutes' || unit === 'hours') {
      const amount = parseDays(node.data.days, 3)
      const ms = unit === 'minutes' ? amount * 60_000 : amount * 3_600_000
      return {
        waitUntil: clampWake(new Date(now.getTime() + ms).toISOString(), now),
        detail: `Wait ${amount}${unit === 'minutes' ? 'm' : 'h'}`,
      }
    }
    return { waitUntil: clampWake(daysFromNow(cardDays, now), now), detail: `Wait ${cardDays}d` }
  }

  if (id === 'due_plus_late') {
    const due = String(invoice.due_date || invoice.expected_payment_date || '').trim()
    const target = due ? addDaysToYmd(due.slice(0, 10), cardDays) : null
    if (!target) return { waitUntil: clampWake(daysFromNow(cardDays, now), now), detail: 'pause fallback' }
    return { waitUntil: clampWake(atLocalNine(target), now), detail: `due + ${cardDays}` }
  }

  return { waitUntil: clampWake(daysFromNow(cardDays, now), now), detail: `Wait ${cardDays}d` }
}

async function ensureStandardBlueprints(admin: Admin): Promise<void> {
  const rows = STANDARD_CHASE_BLUEPRINTS.map((bp) => ({
    id: bp.id,
    name: bp.name,
    priority: bp.priority,
    nodes: bp.nodes,
    edges: bp.edges,
    updated_at: bp.updatedAt,
  }))
  await admin.from('blueprints').upsert(rows, { onConflict: 'id', ignoreDuplicates: true })
}

function pickBlueprint(invoice: InvoiceRow, blueprints: BlueprintRow[]): BlueprintRow | null {
  const status = String(invoice.status ?? '')
  if (TERMINAL.has(status)) return null
  const candidates = blueprints
    .filter((bp) => !waitsOnReply(bp.nodes))
    .filter((bp) => bp.nodes.some((n) => n.data.triggerSubject === 'invoices' || !n.data.triggerSubject && n.data.kind === 'trigger'))
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))

  if (status === 'hold') {
    return candidates.find((bp) => trackOf(bp) === 'hold') ?? null
  }
  if (status !== 'approved' && status !== 'review') return null
  if (paperworkGood(invoice)) {
    return candidates.find((bp) => trackOf(bp) === 'payment') ?? null
  }
  return candidates.find((bp) => trackOf(bp) === 'paperwork') ?? null
}

async function updateRun(admin: Admin, run: RunRow, patch: Partial<RunRow>): Promise<void> {
  const next = { ...run, ...patch, updated_at: new Date().toISOString() }
  await admin.from('blueprint_runs').upsert(
    {
      id: next.id,
      subject: next.subject,
      subject_id: next.subject_id,
      subject_label: next.subject_label,
      client_label: next.client_label,
      blueprint_id: next.blueprint_id,
      blueprint_name: next.blueprint_name,
      status: next.status,
      current_step: next.current_step,
      current_node_id: next.current_node_id,
      wait_until: next.wait_until,
      started_at: next.started_at,
      updated_at: next.updated_at,
    },
    { onConflict: 'id' }
  )
  Object.assign(run, next)
}

async function appendNote(admin: Admin, invoice: InvoiceRow, note: string): Promise<void> {
  const history = Array.isArray(invoice.notes_history) ? [...(invoice.notes_history as unknown[])] : []
  const now = new Date().toISOString()
  history.push({
    id: `note-${crypto.randomUUID()}`,
    note,
    created_by: 'Credyx Blueprint',
    created_at: now,
    type: 'note',
    visibility: 'internal',
  })
  await admin.from('invoices').update({ notes_history: history, updated_at: now }).eq('id', invoice.id)
  invoice.notes_history = history
}

async function saveLife(admin: Admin, invoice: InvoiceRow, life: Record<string, unknown>, extra: Record<string, unknown> = {}): Promise<void> {
  invoice.email_lifecycle = life
  await admin
    .from('invoices')
    .update({ email_lifecycle: life, updated_at: new Date().toISOString(), ...extra })
    .eq('id', invoice.id)
}

function stampAsk(life: Record<string, unknown>, templateId: string, now: string, channel: 'email' | 'phone'): Record<string, unknown> {
  const next = { ...life }
  if (templateId.includes('paperwork')) {
    const pw = trackState(life, 'paperwork')
    const field = templateId.endsWith('followup') ? 'secondAskedAt' : 'firstAskedAt'
    next.paperwork = { ...pw, startedAt: pw.startedAt || now, [field]: now, lastAskChannel: channel }
  } else if (templateId.includes('payment')) {
    const pay = trackState(life, 'payment')
    const field = templateId.endsWith('followup') ? 'secondAskedAt' : 'firstAskedAt'
    next.payment = { ...pay, startedAt: pay.startedAt || now, [field]: now, lastAskChannel: channel }
  }
  return next
}

function alreadyAsked(invoice: InvoiceRow, templateId: string): boolean {
  const life = lifeOf(invoice)
  if (templateId === 'broker_paperwork_status_inquiry') return Boolean(trackState(life, 'paperwork').firstAskedAt)
  if (templateId === 'broker_paperwork_status_followup') return Boolean(trackState(life, 'paperwork').secondAskedAt)
  if (templateId === 'broker_payment_status_inquiry') return Boolean(trackState(life, 'payment').firstAskedAt)
  if (templateId === 'broker_payment_status_followup') return Boolean(trackState(life, 'payment').secondAskedAt)
  if (templateId === 'carrier_claim_or_hold_notice') return Boolean((life as { holdNoticeAt?: string }).holdNoticeAt)
  return false
}

export async function runBlueprintServerTick(
  admin: Admin,
  opts: { limit?: number } = {}
): Promise<BlueprintTickResult> {
  const now = new Date()
  const nowIso = now.toISOString()
  const limit = Math.min(80, Math.max(1, opts.limit ?? 40))
  const details: string[] = []
  let advanced = 0
  let enrolled = 0
  let sent = 0
  let actions = 0

  await ensureStandardBlueprints(admin)

  const { data: settingsRow } = await admin.from('platform_settings').select('value').eq('key', 'email_lifecycle').maybeSingle()
  const settings = (settingsRow?.value ?? {}) as { rules?: Record<string, { enabled?: boolean }> }

  const { data: bpRows } = await admin.from('blueprints').select('id, name, priority, nodes, edges')
  const blueprints: BlueprintRow[] = (bpRows ?? []).map((row: { id: string; name?: string; priority?: number; nodes?: unknown; edges?: unknown }) => ({
    id: String(row.id),
    name: String(row.name ?? ''),
    priority: Number(row.priority ?? 0),
    nodes: (Array.isArray(row.nodes) ? row.nodes : []) as FlowNode[],
    edges: (Array.isArray(row.edges) ? row.edges : []) as FlowEdge[],
  }))
  const bpById = new Map(blueprints.map((bp) => [bp.id, bp]))

  const { data: openInvoices } = await admin
    .from('invoices')
    .select('id, status, broker_id, client_id, invoice_number, load_number, client_name, broker_name, amount, paid_amount, email_lifecycle, document_send_history, due_date, expected_payment_date, invoice_date, collections_needs_attention, notes_history, updated_at')
    .in('status', ['approved', 'review', 'hold'])
    .limit(200)

  const invoices = (openInvoices ?? []) as InvoiceRow[]
  const invoiceById = new Map(invoices.map((inv) => [String(inv.id), inv]))
  const brokerIds = [...new Set(invoices.map((inv) => String(inv.broker_id ?? '')).filter(Boolean))]
  const { data: brokerRows } = brokerIds.length
    ? await admin
        .from('brokers')
        .select('id, name, email, emails, email_lifecycle, paperwork_status_check_days, payment_status_inquiry_days')
        .in('id', brokerIds)
    : { data: [] }
  const brokerById = new Map<string, BrokerRow>(
    (brokerRows ?? []).map((b: BrokerRow) => [String(b.id), b])
  )

  const { data: liveRuns } = await admin
    .from('blueprint_runs')
    .select('*')
    .in('status', ['waiting', 'active'])
    .limit(400)
  const runs = (liveRuns ?? []) as RunRow[]
  const liveBySubject = new Map<string, RunRow[]>()
  for (const run of runs) {
    if (!run.subject_id) continue
    const key = `${run.subject}:${run.subject_id}`
    const list = liveBySubject.get(key) ?? []
    list.push(run)
    liveBySubject.set(key, list)
  }

  async function queueReview(invoice: InvoiceRow, summary: string): Promise<void> {
    actions += 1
    await admin.from('email_review_items').insert({
      id: `review-${crypto.randomUUID()}`,
      invoice_id: invoice.id,
      broker_id: invoice.broker_id,
      client_id: invoice.client_id,
      status: 'pending_review',
      classification: summary.toLowerCase().includes('payment') ? 'non_response_payment' : 'non_response_paperwork',
      proposed_actions: ['staff_call'],
      summary,
      body_text: '',
      invoice_number: invoice.invoice_number,
      load_number: invoice.load_number,
      created_at: nowIso,
    })
    details.push(`review:${invoice.invoice_number}`)
  }

  async function executeAction(
    bp: BlueprintRow,
    node: FlowNode,
    invoice: InvoiceRow,
    broker: BrokerRow | undefined
  ): Promise<string[]> {
    const lines: string[] = []
    const tag = `(Blueprint: ${bp.name})`
    for (const actionId of getActionIds(node.data)) {
      const cfg = node.data.actionConfigs?.[actionId]
      const templateId = cfg?.templateId?.trim() || defaultTemplate(actionId)
      if (actionId === 'mark_urgent' || actionId === 'create_task' || actionId === 'add_note') {
        const life = lifeOf(invoice)
        const pw = trackState(life, 'paperwork')
        const pay = trackState(life, 'payment')
        const msg = fillBlueprintNoteTokens(
          cfg?.message?.trim() || `Blueprint action: ${actionId}`,
          {
            brokerEmail: brokerEmail(broker),
            brokerName: String(broker?.name ?? invoice.broker_name ?? ''),
            invoiceNumber: String(invoice.invoice_number ?? ''),
            loadNumber: String(invoice.load_number ?? ''),
          }
        )
        await appendNote(admin, invoice, `${msg}\n\n${tag}`)
        if (actionId === 'mark_urgent') {
          const field = paperworkGood(invoice) ? 'payment' : 'paperwork'
          const state = field === 'payment' ? pay : pw
          if (!state.needsAttentionAt) {
            const next = {
              ...life,
              [field]: { ...state, needsAttentionAt: nowIso },
            }
            await saveLife(admin, invoice, next, { collections_needs_attention: true })
          }
          actions += 1
          lines.push('urgent:needs-attention')
        } else {
          lines.push(`note:${actionId}`)
        }
        continue
      }

      if (
        actionId === 'email_followup' ||
        actionId === 'email_payment_status' ||
        actionId === 'notify_carrier'
      ) {
        if (!templateId) {
          lines.push(`skip:${actionId}`)
          continue
        }
        if (alreadyAsked(invoice, templateId)) {
          lines.push(`skip-already:${templateId}`)
          continue
        }
        if (!ruleEnabled(settings, templateId)) {
          lines.push(`skip-disabled:${templateId}`)
          continue
        }
        const accept = (broker?.email_lifecycle as { accept?: { paperworkStatus?: boolean; paymentStatus?: boolean } } | undefined)?.accept
        const noEmail =
          templateId.includes('paperwork')
            ? accept?.paperworkStatus === false
            : templateId.includes('payment')
              ? accept?.paymentStatus === false
              : false
        if (noEmail) {
          await queueReview(
            invoice,
            templateId.includes('payment')
              ? 'Payment follow-up: call broker (no email).'
              : 'Paperwork follow-up: call broker (no email).'
          )
          await saveLife(admin, invoice, stampAsk(lifeOf(invoice), templateId, nowIso, 'phone'))
          lines.push(`review:${templateId}`)
          continue
        }
        let to = brokerEmail(broker)
        if (actionId === 'notify_carrier') {
          const { data: client } = await admin.from('clients').select('email').eq('id', String(invoice.client_id ?? '')).maybeSingle()
          to = String(client?.email ?? '').trim()
        }
        if (!to) {
          await appendNote(admin, invoice, `${actionId}: no email on file.\n\n${tag}`)
          lines.push(`skip-no-email:${templateId}`)
          continue
        }
        const fromList = cfg?.fromEmails?.map((e) => e.trim()).filter(Boolean) ?? []
        const fromEmail = fromList[0] || cfg?.fromEmail?.trim() || ''
        const from = fromEmail ? `Credyx <${fromEmail}>` : undefined
        const cc = fromList.slice(1)
        const noteMessage = fillBlueprintNoteTokens(cfg?.message?.trim() || '', {
          brokerEmail: to,
          brokerName: String(broker?.name ?? invoice.broker_name ?? ''),
          invoiceNumber: String(invoice.invoice_number ?? ''),
          loadNumber: String(invoice.load_number ?? ''),
        })
        const ok = await sendTemplate(
          admin,
          templateId,
          to,
          {
            brokerName: String(broker?.name ?? invoice.broker_name ?? ''),
            invoiceNumber: String(invoice.invoice_number ?? ''),
            loadNumber: String(invoice.load_number ?? 'N/A'),
            amount: String(invoice.amount ?? ''),
            clientName: String(invoice.client_name ?? ''),
            extraNote: noteMessage,
          },
          from,
          cc
        )
        if (ok) {
          sent += 1
          const extra: Record<string, unknown> = {}
          if (templateId === 'broker_payment_status_inquiry') extra.collections_last_inquiry_at = nowIso
          if (templateId === 'broker_payment_status_followup') extra.collections_followup_at = nowIso
          let life = stampAsk(lifeOf(invoice), templateId, nowIso, 'email')
          if (templateId === 'carrier_claim_or_hold_notice') {
            life = { ...life, holdNoticeAt: nowIso }
          }
          life.blueprint_owns_paperwork = true
          life.blueprint_owns_chase = true
          await saveLife(admin, invoice, life, extra)
          await appendNote(
            admin,
            invoice,
            `${noteMessage || `${templateId}: emailed ${to}.`}\n\n${tag}`
          )
          lines.push(`email:${templateId}`)
        } else {
          await appendNote(admin, invoice, `${templateId}: email failed.\n\n${tag}`)
          lines.push(`email-fail:${templateId}`)
        }
        continue
      }

      await appendNote(admin, invoice, `Server runner skipped "${actionId}" (not a chase email).\n\n${tag}`)
      lines.push(`skip:${actionId}`)
    }
    return lines
  }

  async function walk(
    bp: BlueprintRow,
    run: RunRow,
    invoice: InvoiceRow,
    broker: BrokerRow | undefined,
    startNode: FlowNode | null
  ): Promise<void> {
    const byId = new Map(bp.nodes.map((n) => [n.id, n]))
    let current: FlowNode | null =
      startNode ?? (run.current_node_id ? byId.get(run.current_node_id) ?? null : null)
    if (!current) return
    if (current.data.kind === 'wait') {
      current = nextNodes(current.id, bp.nodes, bp.edges)[0] ?? null
    }
    const runDetails: string[] = []
    let guard = 0
    while (current && guard < 40) {
      guard += 1
      const data = current.data
      if (data.kind === 'wait') {
        const resolved = resolveWait(current, invoice, broker, now)
        await updateRun(admin, run, {
          status: 'waiting',
          current_node_id: current.id,
          current_step: `Wait until · ${data.label || data.waitUntilId || 'clock'}`,
          wait_until: resolved.waitUntil,
          blueprint_name: bp.name,
        })
        runDetails.push(resolved.detail)
        break
      }
      if (isWhen(data)) {
        const ok = whenPasses(data, evaluateWhen(data.checkId, invoice))
        if (!ok) {
          await updateRun(admin, run, {
            status: 'waiting',
            current_node_id: current.id,
            current_step: `Waiting · ${data.label || data.checkId || 'When'}`,
            wait_until: null,
          })
          runDetails.push(`park:${data.checkId || 'when'}`)
          break
        }
        const after: FlowNode | null = nextNodes(current.id, bp.nodes, bp.edges)[0] ?? null
        if (!after) {
          await updateRun(admin, run, {
            status: 'completed',
            current_node_id: current.id,
            current_step: 'Done',
            wait_until: null,
          })
          runDetails.push('done')
          break
        }
        current = after
        continue
      }
      if (data.kind === 'action') {
        const lines = await executeAction(bp, current, invoice, broker)
        runDetails.push(...lines)
        if (lines.some((line) => line.startsWith('email-fail'))) {
          await updateRun(admin, run, {
            status: 'waiting',
            current_node_id: current.id,
            current_step: `Retry · ${data.label || 'email'}`,
            wait_until: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
          })
          runDetails.push('retry in 1h')
          break
        }
        const after: FlowNode | null = nextNodes(current.id, bp.nodes, bp.edges)[0] ?? null
        if (!after) {
          await updateRun(admin, run, {
            status: 'completed',
            current_node_id: current.id,
            current_step: 'Done',
            wait_until: null,
          })
          break
        }
        current = after
        continue
      }
      if (data.kind === 'stop' || data.kind === 'trigger') {
        if (data.kind === 'stop') {
          await updateRun(admin, run, {
            status: 'completed',
            current_node_id: current.id,
            current_step: 'Done',
            wait_until: null,
          })
          runDetails.push('done')
          break
        }
        const after: FlowNode | null = nextNodes(current.id, bp.nodes, bp.edges)[0] ?? null
        if (!after) break
        current = after
        continue
      }
      const after: FlowNode | null = nextNodes(current.id, bp.nodes, bp.edges)[0] ?? null
      if (!after) break
      current = after
    }
    advanced += 1
    details.push(`${invoice.invoice_number ?? run.id}: ${runDetails.join('; ') || 'advanced'}`)
  }

  const dueRuns = runs
    .filter((run) => {
      if (run.status !== 'waiting' || !run.subject_id) return false
      if (!run.wait_until) return true
      return new Date(run.wait_until).getTime() <= now.getTime()
    })
    .slice(0, limit)

  for (const run of dueRuns) {
    const bp = bpById.get(run.blueprint_id)
    if (!bp || run.subject !== 'invoice' || !run.subject_id) continue
    const invoice = invoiceById.get(run.subject_id)
    if (!invoice) continue
    if (TERMINAL.has(String(invoice.status))) {
      await updateRun(admin, run, { status: 'stopped', current_step: 'Stopped · invoice closed', wait_until: null })
      continue
    }
    const track = trackOf(bp)
    if (track === 'paperwork' && paperworkGood(invoice)) {
      await updateRun(admin, run, { status: 'stopped', current_step: 'Stopped · paperwork logged good', wait_until: null })
      continue
    }
    if (track === 'hold' && invoice.status !== 'hold') {
      await updateRun(admin, run, { status: 'stopped', current_step: 'Stopped · hold cleared', wait_until: null })
      continue
    }
    const broker = brokerById.get(String(invoice.broker_id ?? ''))
    await walk(bp, run, invoice, broker, null)
  }

  const { data: finished } = await admin
    .from('blueprint_runs')
    .select('subject_id, blueprint_id, status, updated_at')
    .eq('subject', 'invoice')
    .in('status', ['completed', 'stopped'])
    .limit(1000)
  const finishedKey = new Set(
    (finished ?? []).map((row: { blueprint_id?: string; subject_id?: string }) => `${row.blueprint_id}:${row.subject_id}`)
  )

  let enrolls = 0
  for (const invoice of invoices) {
    if (enrolls >= limit) break
    const id = String(invoice.id)
    const live = (liveBySubject.get(`invoice:${id}`) ?? []).filter((run) => run.status === 'waiting' || run.status === 'active')
    if (live.length) continue
    const bp = pickBlueprint(invoice, blueprints)
    if (!bp) continue
    if (finishedKey.has(`${bp.id}:${id}`)) continue
    const run: RunRow = {
      id: `run-${crypto.randomUUID()}`,
      subject: 'invoice',
      subject_id: id,
      subject_label: String(invoice.invoice_number ?? id),
      client_label: String(invoice.client_name ?? ''),
      blueprint_id: bp.id,
      blueprint_name: bp.name,
      status: 'active',
      current_step: 'Start',
      current_node_id: bp.nodes.find((n) => n.data.kind === 'trigger')?.id ?? null,
      wait_until: null,
      started_at: nowIso,
      updated_at: nowIso,
    }
    await updateRun(admin, run, {})
    await admin.from('invoice_blueprint_assignments').upsert(
      {
        invoice_id: id,
        blueprint_id: bp.id,
        blueprint_name: bp.name,
        assigned_at: nowIso,
      },
      { onConflict: 'invoice_id' }
    )
    const life = lifeOf(invoice)
    await saveLife(admin, invoice, {
      ...life,
      blueprint_owns_paperwork: true,
      blueprint_owns_chase: true,
    })
    const start = bp.nodes.find((n) => n.data.kind === 'trigger') ?? null
    await walk(bp, run, invoice, brokerById.get(String(invoice.broker_id ?? '')), start)
    finishedKey.add(`${bp.id}:${id}`)
    enrolls += 1
    enrolled += 1
  }

  try {
    await enrollRecentBatches(admin, blueprints, now, details, settings)
  } catch (err) {
    details.push(`batch-skip:${err instanceof Error ? err.message : String(err)}`)
  }

  return { ok: true, advanced, enrolled, sent, actions, details }
}

function defaultTemplate(actionId: string): string {
  if (actionId === 'email_payment_status') return 'broker_payment_status_inquiry'
  if (actionId === 'notify_carrier') return 'carrier_claim_or_hold_notice'
  return ''
}

async function enrollRecentBatches(
  admin: Admin,
  blueprints: BlueprintRow[],
  now: Date,
  details: string[],
  settings: { rules?: Record<string, { enabled?: boolean }> }
): Promise<void> {
  const batchBp = blueprints
    .filter((bp) => trackOf(bp) === 'batch' && hasAction(bp.nodes, 'email_carrier_batch_processed'))
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))[0]
  if (!batchBp) return
  const since = new Date(now.getTime() - 36 * 60 * 60 * 1000).toISOString()
  const { data: batches } = await admin
    .from('batches')
    .select('id, batch_number, client_id, client_name, status, submitted_at')
    .eq('status', 'submitted')
    .gte('submitted_at', since)
    .limit(20)
  for (const batch of batches ?? []) {
    const { data: existing } = await admin
      .from('blueprint_runs')
      .select('id')
      .eq('subject', 'batch')
      .eq('subject_id', batch.id)
      .eq('blueprint_id', batchBp.id)
      .limit(1)
    if (existing && existing.length) continue
    const { data: priorMail } = await admin
      .from('email_messages')
      .select('id')
      .eq('template_id', 'carrier_batch_processed')
      .ilike('subject', `%${batch.batch_number}%`)
      .limit(1)
    const nowIso = now.toISOString()
    const run: RunRow = {
      id: `run-${crypto.randomUUID()}`,
      subject: 'batch',
      subject_id: String(batch.id),
      subject_label: String(batch.batch_number ?? batch.id),
      client_label: String(batch.client_name ?? ''),
      blueprint_id: batchBp.id,
      blueprint_name: batchBp.name,
      status: 'completed',
      current_step: priorMail?.length ? 'Done · carrier notice already sent' : 'Done · carrier notice',
      current_node_id: null,
      wait_until: null,
      started_at: nowIso,
      updated_at: nowIso,
    }
    if (!priorMail?.length && ruleEnabled(settings, 'carrier_batch_processed')) {
      const { data: client } = await admin.from('clients').select('email').eq('id', batch.client_id).maybeSingle()
      const to = String(client?.email ?? '').trim()
      const { count } = await admin.from('invoices').select('id', { count: 'exact', head: true }).eq('batch_id', batch.id)
      if (to) {
        await sendTemplate(admin, 'carrier_batch_processed', to, {
          batchNumber: String(batch.batch_number ?? ''),
          invoiceCount: String(count ?? 0),
          holdCount: '0',
          holdList: 'None',
          ppwSummary: 'See the portal for paperwork results.',
          clientName: String(batch.client_name ?? ''),
          extraNote: '',
        })
      }
    }
    await admin.from('blueprint_runs').upsert({
      id: run.id,
      subject: run.subject,
      subject_id: run.subject_id,
      subject_label: run.subject_label,
      client_label: run.client_label,
      blueprint_id: run.blueprint_id,
      blueprint_name: run.blueprint_name,
      status: run.status,
      current_step: run.current_step,
      current_node_id: run.current_node_id,
      wait_until: run.wait_until,
      started_at: run.started_at,
      updated_at: run.updated_at,
    })
    details.push(`batch:${batch.batch_number}`)
  }
}
