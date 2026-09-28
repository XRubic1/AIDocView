/**
 * Build Credyx staff Assistant calendar + due-today actions from live chase queue / A/R.
 */

import type { AssistantActionItem, AssistantCalendarEvent } from '../types/assistant'
import type { Invoice } from '../types/invoice'
import type { Broker } from '../types/broker'
import type { SharedCalendarEvent } from '../data/sharedCalendarEvents'
import { formatCurrency } from './format'
import { buildCollectionsChaseQueue, type ChaseQueueItem } from './collectionsChase'
import { COLLECTIONS_POLICY, daysPastYmd } from './collectionsPolicy'
import { enrichInvoice, getEffectiveInvoiceDueDate, isOpenArInvoice } from './invoiceAging'
import { getPpwSentAt, hasPpwBeenSent } from './ppwSent'
import { applyAssistantCompletions } from './assistantTaskStore'
import { isCollectionsWorkInvoice } from './adminCollections'
import { isPlaceholderPaymentDueDate } from './invoiceDueDate'
import { projectBlueprintChaseEmails } from './blueprintChaseCalendar'

function toDateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function parseDateKey(key: string): Date {
  const [y, m, day] = key.split('-').map(Number)
  return new Date(y, m - 1, day, 12, 0, 0, 0)
}

function formatShortDate(dateKey: string): string {
  return parseDateKey(dateKey).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}

function addDaysToIso(iso: string, days: number): string {
  const d = new Date(iso)
  d.setHours(12, 0, 0, 0)
  d.setDate(d.getDate() + days)
  return toDateKey(d)
}

function todayKey(asOf = new Date()): string {
  return toDateKey(asOf)
}

function clampToTodayOrLater(dateKey: string, asOf = new Date()): string {
  const today = todayKey(asOf)
  return dateKey < today ? today : dateKey
}

/** Normalize invoice collection_date to YYYY-MM-DD. */
function normalizeDateKey(raw?: string): string | null {
  if (!raw?.trim()) return null
  const t = raw.trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10)
  const d = new Date(t)
  if (Number.isNaN(d.getTime())) return null
  return toDateKey(d)
}

function chaseDueDate(item: ChaseQueueItem, asOf: Date): string {
  const today = todayKey(asOf)
  if (item.status === 'needs_attention') return today

  if (item.status === 'due_for_followup' && item.invoice.collections_last_inquiry_at) {
    return clampToTodayOrLater(
      addDaysToIso(item.invoice.collections_last_inquiry_at, COLLECTIONS_POLICY.followupAfterDays),
      asOf
    )
  }

  const ppw = getPpwSentAt(item.invoice) || item.ppwSentAt
  if (ppw) {
    return clampToTodayOrLater(addDaysToIso(ppw, item.inquiryThreshold), asOf)
  }
  return today
}

function mapChaseItem(item: ChaseQueueItem, asOf: Date): AssistantCalendarEvent {
  const inv = item.invoice
  const dueDate = chaseDueDate(item, asOf)
  const brokerLabel = item.broker?.name ?? inv.broker_name
  const clientLabel = inv.client_name

  if (item.status === 'needs_attention') {
    const preferCall = item.preferredContact === 'phone'
    return {
      id: `live-chase-${inv.id}-attention`,
      type: preferCall ? 'call' : 'escalate',
      title: preferCall ? 'AP follow-up call' : 'Escalate unpaid invoice',
      invoiceNumber: inv.invoice_number,
      invoiceId: inv.id,
      brokerName: `${brokerLabel} · ${clientLabel}`,
      dueDate,
      dueLabel: formatShortDate(dueDate),
      owner: 'credyx_staff',
      status: 'pending',
      detail: preferCall
        ? `Call ${brokerLabel} AP about unpaid invoice #${inv.invoice_number} (${clientLabel}).`
        : `Escalate invoice #${inv.invoice_number} for ${clientLabel} — chase needs attention.`,
      amountLabel: formatCurrency(inv.amount),
    }
  }

  if (item.status === 'due_for_followup') {
    return {
      id: `live-chase-${inv.id}-followup`,
      type: 'reminder',
      title: 'Payment status follow-up',
      invoiceNumber: inv.invoice_number,
      invoiceId: inv.id,
      brokerName: `${brokerLabel} · ${clientLabel}`,
      dueDate,
      dueLabel: formatShortDate(dueDate),
      owner: 'credyx_staff',
      status: 'pending',
      detail: `Follow up with ${brokerLabel} on payment status for invoice #${inv.invoice_number}.`,
      amountLabel: formatCurrency(inv.amount),
    }
  }

  return {
    id: `live-chase-${inv.id}-inquiry`,
    type: 'payment_status_check',
    title: 'Payment status check',
    invoiceNumber: inv.invoice_number,
    invoiceId: inv.id,
    brokerName: `${brokerLabel} · ${clientLabel}`,
    dueDate,
    dueLabel: formatShortDate(dueDate),
    owner: 'credyx_staff',
    status: 'pending',
    detail: `Check ${brokerLabel} portal / email for payment status on invoice #${inv.invoice_number} (${clientLabel}). PPW sent ${item.daysSincePpw}d ago (threshold ${item.inquiryThreshold}d).`,
    amountLabel: formatCurrency(inv.amount),
  }
}

/** Credyx-only Call Back from invoice collection_status / collection_date. */
function mapCallBackEvent(inv: Invoice): AssistantCalendarEvent | null {
  if (inv.collection_status !== 'C/B') return null
  if (!isOpenArInvoice(inv)) return null
  const dueDate = normalizeDateKey(inv.collection_date)
  if (!dueDate) return null

  return {
    id: `live-callback-${inv.id}`,
    type: 'call',
    title: 'Call Back',
    invoiceNumber: inv.invoice_number,
    invoiceId: inv.id,
    brokerName: `${inv.broker_name} · ${inv.client_name}`,
    dueDate,
    dueLabel: formatShortDate(dueDate),
    owner: 'credyx_staff',
    status: 'pending',
    detail: `Scheduled call back with ${inv.broker_name} for invoice #${inv.invoice_number} (${inv.client_name}).`,
    amountLabel: formatCurrency(inv.amount),
  }
}

/** Credyx-only Will Pay from invoice collection_status / collection_date. */
function mapWillPayEvent(inv: Invoice): AssistantCalendarEvent | null {
  if (inv.collection_status !== 'W/P') return null
  if (!isOpenArInvoice(inv)) return null
  const dueDate = normalizeDateKey(inv.collection_date)
  if (!dueDate) return null

  return {
    id: `live-willpay-${inv.id}`,
    type: 'expected_payment',
    title: 'Will Pay',
    invoiceNumber: inv.invoice_number,
    invoiceId: inv.id,
    brokerName: `${inv.broker_name} · ${inv.client_name}`,
    dueDate,
    dueLabel: formatShortDate(dueDate),
    owner: 'credyx_staff',
    status: 'pending',
    detail: `Broker said they will pay invoice #${inv.invoice_number} (${inv.client_name}) by ${formatShortDate(dueDate)}.`,
    amountLabel: formatCurrency(inv.amount),
  }
}

/**
 * Invoice Net / due date — staff cue when payment terms actually come due.
 * Skipped for just-purchased invoices whose stored due date is the invoice day
 * (DB placeholder when the broker has no Net terms).
 * Skipped when Will Pay is already scheduled for the same day.
 */
function mapInvoiceDueEvent(inv: Invoice): AssistantCalendarEvent | null {
  if (!isCollectionsWorkInvoice(inv)) return null
  const stored = normalizeDateKey(inv.due_date)
  const effective = normalizeDateKey(getEffectiveInvoiceDueDate(inv))
  const dueDate =
    (stored && !isPlaceholderPaymentDueDate(inv, stored) ? stored : null) ||
    (effective && !isPlaceholderPaymentDueDate(inv, effective) ? effective : null)
  if (!dueDate) return null

  if (
    inv.collection_status === 'W/P' &&
    normalizeDateKey(inv.collection_date) === dueDate
  ) {
    return null
  }

  return {
    id: `live-due-${inv.id}`,
    type: 'reminder',
    title: 'Invoice due',
    invoiceNumber: inv.invoice_number,
    invoiceId: inv.id,
    brokerName: `${inv.broker_name} · ${inv.client_name}`,
    dueDate,
    dueLabel: formatShortDate(dueDate),
    owner: 'credyx_staff',
    status: 'pending',
    detail: `Invoice #${inv.invoice_number} for ${inv.client_name} is due ${formatShortDate(dueDate)}. Confirm payment status or start chase.`,
    amountLabel: formatCurrency(inv.amount),
  }
}

/**
 * Will Pay date passed grace window with no payment — follow up today (or on the miss day).
 */
function mapWillPayMissedEvent(inv: Invoice, asOf: Date): AssistantCalendarEvent | null {
  if (inv.collection_status !== 'W/P') return null
  if (!isOpenArInvoice(inv)) return null
  const wpDate = normalizeDateKey(inv.collection_date)
  if (!wpDate) return null

  const daysPast = daysPastYmd(wpDate, asOf)
  if (daysPast < COLLECTIONS_POLICY.willPayMissedDays) return null

  const missKey = addDaysToIso(`${wpDate}T12:00:00`, COLLECTIONS_POLICY.willPayMissedDays)
  const dueDate = clampToTodayOrLater(missKey, asOf)

  return {
    id: `live-wpmissed-${inv.id}`,
    type: 'escalate',
    title: 'Will Pay missed — follow up',
    invoiceNumber: inv.invoice_number,
    invoiceId: inv.id,
    brokerName: `${inv.broker_name} · ${inv.client_name}`,
    dueDate,
    dueLabel: formatShortDate(dueDate),
    owner: 'credyx_staff',
    status: 'pending',
    detail: `Will Pay was ${formatShortDate(wpDate)} (${daysPast}d ago). Follow up with ${inv.broker_name} on invoice #${inv.invoice_number}.`,
    amountLabel: formatCurrency(inv.amount),
  }
}

/** Open hold — staff should chase missing docs / resolve hold. */
function mapHoldStaffEvent(inv: Invoice, asOf: Date): AssistantCalendarEvent | null {
  if (inv.status !== 'hold') return null
  const dueDate = todayKey(asOf)

  return {
    id: `live-hold-${inv.id}`,
    type: 'paperwork_check',
    title: 'Hold — chase docs',
    invoiceNumber: inv.invoice_number,
    invoiceId: inv.id,
    brokerName: `${inv.broker_name} · ${inv.client_name}`,
    dueDate,
    dueLabel: formatShortDate(dueDate),
    owner: 'credyx_staff',
    status: 'pending',
    detail:
      inv.hold_reason?.trim() ||
      `Invoice #${inv.invoice_number} is on hold — chase missing paperwork with ${inv.client_name}.`,
    amountLabel: formatCurrency(inv.amount),
  }
}

/** Approved open A/R with no PPW past policy threshold — send paperwork. */
function mapNoPpwEvent(inv: Invoice, asOf: Date): AssistantCalendarEvent | null {
  if (!isCollectionsWorkInvoice(inv)) return null
  if (inv.status !== 'approved') return null
  if (hasPpwBeenSent(inv)) return null

  const enriched = enrichInvoice(inv, asOf)
  if (enriched.daysOutstanding < COLLECTIONS_POLICY.noPpwAfterDays) return null

  const dueDate = todayKey(asOf)
  return {
    id: `live-noppw-${inv.id}`,
    type: 'reminder',
    title: 'Send PPW',
    invoiceNumber: inv.invoice_number,
    invoiceId: inv.id,
    brokerName: `${inv.broker_name} · ${inv.client_name}`,
    dueDate,
    dueLabel: formatShortDate(dueDate),
    owner: 'credyx_staff',
    status: 'pending',
    detail: `Invoice #${inv.invoice_number} is ${enriched.daysOutstanding}d old with no PPW sent. Send paperwork to ${inv.broker_name}.`,
    amountLabel: formatCurrency(inv.amount),
  }
}

/** Parse MM/DD/YYYY from a status note body into YYYY-MM-DD. */
function parseUsDateFromStatusNote(note: string): string | null {
  const m = note.match(/·\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (!m) return null
  const month = Number(m[1])
  const day = Number(m[2])
  const year = Number(m[3])
  if (!month || !day || !year) return null
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/**
 * Credyx-only Payment status confirmed — latest status note lands on its dated day
 * (or the day it was posted when no date was chosen).
 */
function mapPaymentConfirmedEvent(inv: Invoice): AssistantCalendarEvent | null {
  if (!isOpenArInvoice(inv)) return null

  const latest = [...(inv.notes_history || [])]
    .filter(
      (n) =>
        n.type === 'status_update' && /payment status confirmed/i.test(n.note)
    )
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0]

  if (!latest) return null

  const dueDate =
    parseUsDateFromStatusNote(latest.note) || normalizeDateKey(latest.created_at)
  if (!dueDate) return null

  return {
    id: `live-payconfirm-${inv.id}`,
    type: 'payment_status_check',
    title: 'Payment status confirmed',
    invoiceNumber: inv.invoice_number,
    invoiceId: inv.id,
    brokerName: `${inv.broker_name} · ${inv.client_name}`,
    dueDate,
    dueLabel: formatShortDate(dueDate),
    owner: 'credyx_staff',
    status: 'pending',
    detail: `Payment status confirmed for invoice #${inv.invoice_number} (${inv.client_name}).`,
    amountLabel: formatCurrency(inv.amount),
  }
}

/**
 * Derive Credyx chase + aging review events from live invoices/brokers.
 * Call Back / Payment confirmed stay Credyx-only. Will Pay also appears on the carrier calendar from the invoice.
 */
export function deriveAdminCalendarEvents(
  invoices: Invoice[],
  brokers: Broker[],
  asOf = new Date()
): AssistantCalendarEvent[] {
  const events: AssistantCalendarEvent[] = []
  const chase = buildCollectionsChaseQueue(invoices, brokers, asOf.getTime())
  const chasedIds = new Set(chase.map((c) => c.invoice.id))
  const brokerById = new Map(brokers.map((b) => [b.id, b]))

  for (const inv of invoices) {
    if (!isCollectionsWorkInvoice(inv)) continue
    const broker = brokerById.get(inv.broker_id)
    events.push(...projectBlueprintChaseEmails({ invoice: inv, broker, asOf }))
  }

  const blueprintChaseIds = new Set(
    events.filter((e) => e.id.startsWith('live-chase-email-')).map((e) => e.invoiceId)
  )

  for (const item of chase.slice(0, 60)) {
    if (item.status !== 'needs_attention' && blueprintChaseIds.has(item.invoice.id)) {
      continue
    }
    events.push(mapChaseItem(item, asOf))
  }

  // Collection status notes + due dates — Credyx staff only.
  for (const inv of invoices) {
    const cb = mapCallBackEvent(inv)
    if (cb) events.push(cb)
    const wp = mapWillPayEvent(inv)
    if (wp) events.push(wp)
    const wpMissed = mapWillPayMissedEvent(inv, asOf)
    if (wpMissed) events.push(wpMissed)
    const due = mapInvoiceDueEvent(inv)
    if (due) events.push(due)
    const pc = mapPaymentConfirmedEvent(inv)
    if (pc) events.push(pc)
  }

  // Holds + no-PPW cues (capped so the month grid stays readable).
  const holds = invoices
    .map((inv) => mapHoldStaffEvent(inv, asOf))
    .filter((e): e is AssistantCalendarEvent => Boolean(e))
    .slice(0, 20)
  events.push(...holds)

  const noPpw = invoices
    .map((inv) => mapNoPpwEvent(inv, asOf))
    .filter((e): e is AssistantCalendarEvent => Boolean(e))
    .slice(0, 15)
  events.push(...noPpw)

  // Aging reviews — open A/R that crossed collections overdue band (not already in chase).
  const aging = invoices
    .filter((inv) => isOpenArInvoice(inv) && !chasedIds.has(inv.id))
    .map((inv) => enrichInvoice(inv, asOf))
    .filter((inv) => inv.isOverdue)
    .sort((a, b) => b.daysOutstanding - a.daysOutstanding)
    .slice(0, 20)

  const today = todayKey(asOf)
  for (const inv of aging) {
    events.push({
      id: `live-aging-${inv.id}`,
      type: 'payment_status_check',
      title: 'Review aging invoice',
      invoiceNumber: inv.invoice_number,
      invoiceId: inv.id,
      brokerName: `${inv.broker_name} · ${inv.client_name}`,
      dueDate: today,
      dueLabel: formatShortDate(today),
      owner: 'credyx_staff',
      status: 'pending',
      detail: `Invoice #${inv.invoice_number} is ${inv.daysOutstanding}d past expected pay. Review notes and next chase step for ${inv.client_name}.`,
      amountLabel: formatCurrency(inv.amount),
    })
  }

  return applyAssistantCompletions(
    events.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.title.localeCompare(b.title))
  )
}

/** Map derived admin events into shared-calendar shape for the admin month grid. */
export function deriveAdminChaseAsSharedEvents(
  invoices: Invoice[],
  brokers: Broker[],
  asOf = new Date()
): SharedCalendarEvent[] {
  const now = new Date().toISOString()
  return deriveAdminCalendarEvents(invoices, brokers, asOf).map((e) => {
    const inv = invoices.find((i) => i.id === e.invoiceId)
    const parts = e.brokerName.split(' · ')
    return {
      ...e,
      brokerName: parts[0] ?? e.brokerName,
      clientId: inv?.client_id ?? `live-${e.invoiceId}`,
      clientName: inv?.client_name ?? parts[1] ?? 'Carrier',
      createdBy: 'admin' as const,
      createdAt: now,
      emailRequested: false,
    }
  })
}

/** Staff due-today action cards from derived chase/aging events. */
export function deriveAdminDueTodayActions(
  invoices: Invoice[],
  brokers: Broker[],
  asOf = new Date()
): AssistantActionItem[] {
  const today = todayKey(asOf)
  return deriveAdminCalendarEvents(invoices, brokers, asOf)
    .filter((e) => e.status === 'pending' && e.dueDate === today)
    .slice(0, 12)
    .map((e) => {
      const kind =
        e.type === 'paperwork_check'
          ? ('upload_docs' as const)
          : e.type === 'call' || e.type === 'escalate'
            ? ('check_payment' as const)
            : e.title.toLowerCase().includes('aging') || e.title.toLowerCase().includes('invoice due')
              ? ('review_invoice' as const)
              : ('check_payment' as const)
      return {
        id: e.id.replace(/^live-/, 'admin-act-'),
        title: e.title.includes('#')
          ? e.title
          : `${e.title} — #${e.invoiceNumber}`,
        invoiceNumber: e.invoiceNumber,
        invoiceId: e.invoiceId,
        brokerName: e.brokerName,
        dueLabel: 'Due today',
        status: 'pending' as const,
        kind,
        amountLabel: e.amountLabel,
        detail: e.detail,
      }
    })
}

export function deriveAdminDueTodayCount(
  invoices: Invoice[],
  brokers: Broker[],
  asOf = new Date()
): number {
  return deriveAdminDueTodayActions(invoices, brokers, asOf).length
}
