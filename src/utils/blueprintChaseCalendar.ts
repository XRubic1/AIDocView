/**
 * Project every chase email a blueprint will send for an invoice,
 * on the day the server runner will send it.
 */
import type { AssistantCalendarEvent, AssistantCalendarEventType } from '../types/assistant'
import type { Broker } from '../types/broker'
import type { Invoice } from '../types/invoice'
import type { SavedBlueprint } from '../types/blueprintGraph'
import { STANDARD_CHASE_BLUEPRINTS } from '../../supabase/functions/_shared/standardBlueprints'
import { listSavedBlueprints } from '../components/blueprints/blueprintStore'
import { getActionIds } from '../components/blueprints/blueprintSubject'
import { getEffectiveInvoiceDueDate } from './invoiceAging'
import { hasPpwBeenSent, getPpwSentAt } from './ppwSent'
import { formatCurrency } from './format'

const CHASE_ACTIONS = new Set(['email_followup', 'email_payment_status'])

type FlowNode = SavedBlueprint['nodes'][number]

function savedOrStandard(): SavedBlueprint[] {
  try {
    const saved = listSavedBlueprints()
    if (saved.length > 0) return saved
  } catch {
    /* calendar tests have no localStorage */
  }
  return STANDARD_CHASE_BLUEPRINTS as unknown as SavedBlueprint[]
}

function hasCheck(nodes: FlowNode[], checkId: string): boolean {
  return nodes.some(
    (n) =>
      (n.data.kind === 'if' || n.data.kind === 'elseif') &&
      n.data.checkId === checkId &&
      n.data.whenMatch !== 'no'
  )
}

function hasAction(nodes: FlowNode[], actionId: string): boolean {
  return nodes.some((n) => n.data.kind === 'action' && getActionIds(n.data).includes(actionId))
}

function waitsOnReply(nodes: FlowNode[]): boolean {
  return nodes.some(
    (n) =>
      (n.data.kind === 'if' || n.data.kind === 'elseif') &&
      (n.data.checkId === 'broker_replied' || n.data.checkId === 'no_reply')
  )
}

function trackOf(bp: SavedBlueprint): 'paperwork' | 'payment' | 'hold' | 'other' {
  if (hasCheck(bp.nodes, 'on_hold')) return 'hold'
  if (hasCheck(bp.nodes, 'paperwork_good')) return 'payment'
  if (hasCheck(bp.nodes, 'ppw_sent')) return 'paperwork'
  if (hasAction(bp.nodes, 'email_payment_status') && !hasCheck(bp.nodes, 'ppw_sent')) return 'payment'
  return 'other'
}

function isInvoiceBlueprint(bp: SavedBlueprint): boolean {
  return bp.nodes.some((n) => n.data.kind === 'trigger' && n.data.triggerSubject === 'invoices')
}

/** Same winner the server cron uses: one live chase graph per invoice. */
export function pickChaseBlueprint(invoice: Invoice, blueprints = savedOrStandard()): SavedBlueprint | null {
  const status = invoice.status
  if (status === 'paid' || status === 'rejected' || status === 'written_off' || status === 'write_off_pending' || status === 'force_closed') {
    return null
  }
  const candidates = blueprints
    .filter((bp) => isInvoiceBlueprint(bp) && !waitsOnReply(bp.nodes))
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))

  if (status === 'hold') return candidates.find((bp) => trackOf(bp) === 'hold') ?? null
  if (status !== 'approved' && status !== 'review') return null
  if (invoice.email_lifecycle?.paperwork_status === 'good') {
    return candidates.find((bp) => trackOf(bp) === 'payment') ?? null
  }
  return candidates.find((bp) => trackOf(bp) === 'paperwork') ?? null
}

function toDateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function formatShortDate(dateKey: string): string {
  const [y, m, day] = dateKey.split('-').map(Number)
  return new Date(y, m - 1, day, 12, 0, 0, 0).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}

function parseDays(raw: string | undefined, fallback: number): number {
  const n = Number(raw)
  return Number.isFinite(n) && n >= 0 ? n : fallback
}

function addDays(base: Date, days: number): Date {
  const d = new Date(base)
  d.setDate(d.getDate() + days)
  d.setHours(9, 0, 0, 0)
  return d
}

function notBefore(when: Date, asOf: Date): Date {
  return when.getTime() <= asOf.getTime() ? new Date(asOf) : when
}

function whenPasses(invoice: Invoice, checkId: string | undefined, matchNo: boolean): boolean {
  let raw = false
  if (checkId === 'ppw_sent') raw = hasPpwBeenSent(invoice)
  else if (checkId === 'paperwork_good') raw = invoice.email_lifecycle?.paperwork_status === 'good'
  else if (checkId === 'on_hold') raw = invoice.status === 'hold'
  else if (checkId === 'invoice_processed') {
    raw = invoice.status === 'approved' || invoice.status === 'review' || invoice.status === 'hold'
  } else if (checkId === 'payment_posted') raw = invoice.status === 'paid'
  return matchNo ? !raw : raw
}

function sentStamp(invoice: Invoice, templateId: string): string | null {
  const life = invoice.email_lifecycle
  if (templateId === 'broker_paperwork_status_inquiry') return life?.paperwork?.firstAskedAt ?? null
  if (templateId === 'broker_paperwork_status_followup') return life?.paperwork?.secondAskedAt ?? null
  if (templateId === 'broker_payment_status_inquiry') return life?.payment?.firstAskedAt ?? null
  if (templateId === 'broker_payment_status_followup') return life?.payment?.secondAskedAt ?? null
  return null
}

function emailFace(templateId: string, label: string): { title: string; type: AssistantCalendarEventType } {
  if (templateId === 'broker_paperwork_status_inquiry') {
    return { title: 'PPW chase email', type: 'paperwork_check' }
  }
  if (templateId === 'broker_paperwork_status_followup') {
    return { title: 'PPW chase follow-up', type: 'paperwork_check' }
  }
  if (templateId === 'broker_payment_status_inquiry') {
    return { title: 'Payment chase email', type: 'payment_status_check' }
  }
  if (templateId === 'broker_payment_status_followup') {
    return { title: 'Payment chase follow-up', type: 'payment_status_check' }
  }
  return { title: label || 'Chase email', type: 'reminder' }
}

function advanceWait(
  node: FlowNode,
  invoice: Invoice,
  broker: Broker | undefined,
  clock: Date,
  asOf: Date
): Date | null {
  const id = node.data.waitUntilId || 'pause_days'
  const cardDays = parseDays(node.data.days, id === 'pause_days' ? 3 : 7)

  if (id === 'after_ppw') {
    const override = broker?.paperwork_status_check_days
    const days = typeof override === 'number' && override > 0 ? Math.floor(override) : cardDays
    const sent = getPpwSentAt(invoice)
    if (!sent) return null
    return notBefore(addDays(new Date(sent), days), asOf)
  }

  if (id === 'payment_clock' || id === 'due_plus_late') {
    const override = id === 'payment_clock' ? broker?.payment_status_inquiry_days : undefined
    const days = typeof override === 'number' && override > 0 ? Math.floor(override) : cardDays
    const due = (getEffectiveInvoiceDueDate(invoice) || invoice.due_date || '').slice(0, 10)
    const dueMs = due ? Date.parse(`${due}T12:00:00`) : NaN
    if (due && Number.isFinite(dueMs) && dueMs > asOf.getTime()) {
      const [y, m, day] = due.split('-').map(Number)
      return notBefore(addDays(new Date(y, m - 1, day, 12, 0, 0, 0), days), asOf)
    }
    return notBefore(addDays(clock, days), asOf)
  }

  const unit = node.data.waitUnit
  if (unit === 'minutes' || unit === 'hours') {
    const ms = unit === 'minutes' ? cardDays * 60_000 : cardDays * 3_600_000
    return notBefore(new Date(clock.getTime() + ms), asOf)
  }
  return notBefore(addDays(clock, cardDays), asOf)
}

function nextNode(bp: SavedBlueprint, id: string): FlowNode | null {
  const edge = bp.edges.find((e) => e.source === id)
  if (!edge) return null
  return bp.nodes.find((n) => n.id === edge.target) ?? null
}

/** Remaining chase emails on the blueprint this invoice will run. */
export function projectBlueprintChaseEmails(input: {
  invoice: Invoice
  broker?: Broker
  asOf?: Date
  blueprint?: SavedBlueprint | null
}): AssistantCalendarEvent[] {
  const { invoice, broker } = input
  const asOf = input.asOf ?? new Date()
  const bp = input.blueprint === undefined ? pickChaseBlueprint(invoice) : input.blueprint
  if (!bp) return []

  const start = bp.nodes.find((n) => n.data.kind === 'trigger')
  if (!start) return []

  const events: AssistantCalendarEvent[] = []
  let clock = new Date(asOf)
  let current: FlowNode | null = nextNode(bp, start.id)
  let guard = 0

  while (current && guard < 40) {
    guard += 1
    const data = current.data
    if (data.kind === 'stop') break

    if (data.kind === 'if' || data.kind === 'elseif') {
      if (!whenPasses(invoice, data.checkId, data.whenMatch === 'no')) break
    } else if (data.kind === 'wait') {
      const next = advanceWait(current, invoice, broker, clock, asOf)
      if (!next) break
      clock = next
    } else if (data.kind === 'action') {
      for (const actionId of getActionIds(data)) {
        if (!CHASE_ACTIONS.has(actionId)) continue
        const templateId = data.actionConfigs?.[actionId]?.templateId?.trim() || ''
        const already = sentStamp(invoice, templateId)
        if (already) {
          const sent = new Date(already)
          if (Number.isFinite(sent.getTime())) clock = sent
          continue
        }
        const face = emailFace(templateId, data.label || 'Chase email')
        const dueDate = toDateKey(clock)
        const today = toDateKey(asOf)
        const shown = dueDate < today ? today : dueDate
        events.push({
          id: `live-chase-email-${invoice.id}-${current.id}`,
          type: face.type,
          title: face.title,
          invoiceNumber: invoice.invoice_number,
          invoiceId: invoice.id,
          brokerName: `${invoice.broker_name} · ${invoice.client_name}`,
          dueDate: shown,
          dueLabel: formatShortDate(shown),
          owner: 'credyx_staff',
          status: 'pending',
          detail: `${bp.name} emails ${invoice.broker_name} about invoice #${invoice.invoice_number} on ${formatShortDate(shown)}. Sends when the chase cron runs.`,
          amountLabel: formatCurrency(invoice.amount),
        })
      }
    }

    current = nextNode(bp, current.id)
  }

  return events
}
