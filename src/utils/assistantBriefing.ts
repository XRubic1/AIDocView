/**
 * Rules-first briefing for the carrier Assistant.
 *
 * Every number and sentence here is computed in code from client-visible data —
 * the AI only rephrases it. Nothing internal (Credyx-only notes, chase tasks,
 * staff tooling) is read: invoices are masked with mapClientVisibleInvoices first.
 */

import type { Invoice } from '../types/invoice'
import type { Payment } from '../types/payment'
import { mapClientVisibleInvoices } from './clientInvoiceView'
import { deriveHoldExplanation } from './assistantHoldExplanation'
import { AR_POLICY, getDaysOutstanding, isOpenArInvoice } from './invoiceAging'
import { AMOUNT_EPSILON, getInvoiceOpenArBalance } from './paymentVariance'
import { formatCurrency } from './format'

export type BriefingOwner = 'you' | 'credyx'

export type BriefingKind =
  | 'docs_needed'
  | 'confirm_payment'
  | 'short_paid'
  | 'overdue'
  | 'dispute_open'
  | 'hold_review'

export type BriefingActionType = 'upload' | 'open_invoice' | 'open_payments'

export interface BriefingItem {
  id: string
  kind: BriefingKind
  owner: BriefingOwner
  invoiceId: string
  invoiceNumber: string
  brokerName: string
  amount: number
  amountLabel: string
  /** Plain headline, e.g. "Upload the missing BOL". */
  title: string
  /** Why it matters, in plain words. */
  why: string
  /** The exact next step (for Credyx-owned items: what is happening, no action needed). */
  nextStep: string
  daysOpen: number
  action?: { type: BriefingActionType; label: string }
  /** Lower sorts first. */
  priority: number
}

export type PayConfidence = 'high' | 'medium' | 'low'

export interface PayEstimate {
  /** YYYY-MM-DD, null when nothing reliable is known. */
  date: string | null
  confidence: PayConfidence
  basis: string
}

export interface ForecastWeek {
  label: string
  startKey: string
  /** Open money expected to land (not on hold). */
  expected: number
  /** Money tied to held invoices that would land in the same week once cleared. */
  onHold: number
  invoiceCount: number
}

export interface BrokerInsight {
  brokerName: string
  openAmount: number
  openCount: number
  holdAmount: number
  paidCount: number
  /** Average days from invoice date to confirmed payment; null with too little history. */
  avgDaysToPay: number | null
  /** Share of paid invoices that landed on or before the due date; null if unknown. */
  onTimeRate: number | null
  note: string
}

export interface Briefing {
  generatedAt: string
  headline: string
  subline: string
  totals: {
    openAmount: number
    openCount: number
    onHoldAmount: number
    onHoldCount: number
    waitingOnYouAmount: number
    needsYouCount: number
    expectedNext7Days: number
  }
  items: BriefingItem[]
  forecast: ForecastWeek[]
  brokers: BrokerInsight[]
}

const MISSING_RE = /missing|\bbol\b|\bpod\b|rate\s*con|paperwork|document|\bdocs?\b|lumper|scale/i
const DAY_MS = 86_400_000
/** Minimum paid invoices before a broker's history is trusted for an estimate. */
const MIN_HISTORY = 2

function toKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`
}

function parseKey(key: string): Date {
  const [y, m, d] = key.slice(0, 10).split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}

function startOfDay(d: Date): Date {
  const next = new Date(d)
  next.setHours(0, 0, 0, 0)
  return next
}

function addDays(d: Date, n: number): Date {
  const next = new Date(d)
  next.setDate(next.getDate() + n)
  return next
}

function daysBetween(from: Date, to: Date): number {
  return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / DAY_MS)
}

function shortDate(key: string): string {
  return parseKey(key).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`
}

function confirmedPaymentDate(invoiceId: string, payments: Payment[]): string | null {
  const dates = payments
    .filter((p) => p.invoice_id === invoiceId && p.status === 'confirmed')
    .map((p) => (p.received_date || p.payment_date || '').slice(0, 10))
    .filter(Boolean)
    .sort()
  return dates.length ? dates[dates.length - 1] : null
}

export function buildBrokerInsights(invoices: Invoice[], payments: Payment[]): BrokerInsight[] {
  const byBroker = new Map<string, Invoice[]>()
  for (const inv of invoices) {
    const name = inv.broker_name?.trim()
    if (!name) continue
    byBroker.set(name, [...(byBroker.get(name) ?? []), inv])
  }

  const out: BrokerInsight[] = []
  for (const [brokerName, list] of byBroker) {
    const open = list.filter(isOpenArInvoice)
    const days: number[] = []
    let onTime = 0
    let onTimeKnown = 0
    for (const inv of list) {
      if (inv.status !== 'paid') continue
      const paidOn = confirmedPaymentDate(inv.id, payments)
      if (!paidOn) continue
      const d = daysBetween(parseKey(inv.invoice_date), parseKey(paidOn))
      if (d >= 0) days.push(d)
      if (inv.due_date) {
        onTimeKnown += 1
        if (paidOn <= inv.due_date.slice(0, 10)) onTime += 1
      }
    }
    const avg = days.length >= MIN_HISTORY ? Math.round(days.reduce((s, n) => s + n, 0) / days.length) : null
    const onTimeRate = onTimeKnown >= MIN_HISTORY ? onTime / onTimeKnown : null
    const holdAmount = open.filter((i) => i.status === 'hold').reduce((s, i) => s + i.amount, 0)

    let note: string
    if (avg == null) {
      note = 'Not enough payment history yet to predict how this broker pays.'
    } else if (onTimeRate != null && onTimeRate < 0.5) {
      note = `Usually pays in about ${avg} days and is often late — plan cash accordingly.`
    } else if (avg <= 30) {
      note = `Usually pays in about ${avg} days.`
    } else {
      note = `Slow payer — usually about ${avg} days.`
    }

    out.push({
      brokerName,
      openAmount: open.reduce((s, i) => s + i.amount, 0),
      openCount: open.length,
      holdAmount,
      paidCount: days.length,
      avgDaysToPay: avg,
      onTimeRate,
      note,
    })
  }
  return out
    .filter((b) => b.openCount > 0 || b.paidCount > 0)
    .sort((a, b) => b.openAmount - a.openAmount)
}

/** Best honest guess of when an open invoice will be paid, with the reason. */
export function estimatePayDate(
  inv: Invoice,
  broker: BrokerInsight | undefined,
  today: Date = new Date()
): PayEstimate {
  const todayKey = toKey(today)
  if (inv.collection_status === 'W/P' && inv.collection_date) {
    const date = inv.collection_date.slice(0, 10)
    return { date, confidence: 'high', basis: 'The broker confirmed this pay date.' }
  }
  if (broker?.avgDaysToPay != null) {
    const est = toKey(
      addDays(parseKey(inv.invoice_date), broker.avgDaysToPay)
    )
    if (est >= todayKey) {
      return {
        date: est,
        confidence: 'medium',
        basis: `${broker.brokerName} usually pays in about ${broker.avgDaysToPay} days.`,
      }
    }
  }
  const terms = (inv.expected_payment_date || inv.due_date || '').slice(0, 10)
  if (terms) {
    return {
      date: terms < todayKey ? todayKey : terms,
      confidence: terms < todayKey ? 'low' : 'medium',
      basis: terms < todayKey ? 'Past the payment terms — payment is late.' : 'Based on the payment terms.',
    }
  }
  return { date: null, confidence: 'low', basis: 'No pay date from the broker yet.' }
}

function weekStarts(today: Date): Date[] {
  const start = startOfDay(today)
  return [0, 1, 2, 3].map((i) => addDays(start, i * 7))
}

function buildForecast(
  open: Invoice[],
  payments: Payment[],
  brokers: Map<string, BrokerInsight>,
  today: Date
): ForecastWeek[] {
  const starts = weekStarts(today)
  const weeks: ForecastWeek[] = starts.map((d, i) => ({
    label: i === 0 ? 'Next 7 days' : i === 1 ? 'Days 8–14' : `${shortDate(toKey(d))} – ${shortDate(toKey(addDays(d, 6)))}`,
    startKey: toKey(d),
    expected: 0,
    onHold: 0,
    invoiceCount: 0,
  }))

  for (const inv of open) {
    const balance = getInvoiceOpenArBalance(inv, payments)
    if (balance <= AMOUNT_EPSILON) continue
    const est = estimatePayDate(inv, brokers.get(inv.broker_name), today)
    if (!est.date) continue
    const idx = Math.floor(daysBetween(today, parseKey(est.date)) / 7)
    if (idx < 0 || idx > 3) continue
    const week = weeks[idx]
    week.invoiceCount += 1
    if (inv.status === 'hold') week.onHold += balance
    else week.expected += balance
  }
  return weeks
}

function holdItem(inv: Invoice, daysOpen: number): BriefingItem {
  const base = {
    invoiceId: inv.id,
    invoiceNumber: inv.invoice_number,
    brokerName: inv.broker_name,
    amount: inv.amount,
    amountLabel: formatCurrency(inv.amount),
    daysOpen,
  }

  const attention = [...(inv.notes_history ?? [])]
    .filter((n) => n.client_attention === 'open' && n.visibility !== 'internal')
    .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))[0]
  const expl = deriveHoldExplanation(inv, 'client')

  if (attention) {
    const ask = attention.attention_message?.trim() || expl.reason
    return {
      ...base,
      id: `hold-${inv.id}`,
      kind: 'docs_needed',
      owner: 'you',
      title: 'Credyx needs something from you',
      why: `Invoice #${inv.invoice_number} (${formatCurrency(inv.amount)}) is on hold until this is done.`,
      nextStep: ask,
      action: { type: 'upload', label: 'Upload documents' },
      priority: 0,
    }
  }

  const looksMissing = MISSING_RE.test(expl.reason) || Boolean(expl.missingNoticeText)
  if (looksMissing && expl.carrierUploadedAfterNotice) {
    return {
      ...base,
      id: `hold-${inv.id}`,
      kind: 'hold_review',
      owner: 'credyx',
      title: 'Credyx is reviewing your upload',
      why: `You uploaded after the hold notice. Nothing else is needed unless Credyx contacts you.`,
      nextStep: 'No action needed. If this takes longer than a business day, open the invoice and add a note.',
      action: { type: 'open_invoice', label: 'View invoice' },
      priority: 4,
    }
  }
  if (looksMissing) {
    return {
      ...base,
      id: `hold-${inv.id}`,
      kind: 'docs_needed',
      owner: 'you',
      title: 'Upload the missing paperwork',
      why: `${expl.reason}. ${formatCurrency(inv.amount)} stays on hold until it is uploaded.`,
      nextStep: 'Upload the missing document(s) on the invoice. Credyx will review them and release the hold.',
      action: { type: 'upload', label: 'Upload documents' },
      priority: 0,
    }
  }

  const brokerFlag =
    inv.email_lifecycle?.last_reply_status === 'rejected' ||
    inv.email_lifecycle?.paperwork_status === 'issue'
  return {
    ...base,
    id: `hold-${inv.id}`,
    kind: 'hold_review',
    owner: 'credyx',
    title: brokerFlag ? 'Broker flagged the paperwork' : 'Credyx is reviewing this hold',
    why: brokerFlag
      ? 'The broker reported a problem with the paperwork. Credyx is following up with them.'
      : expl.reason,
    nextStep: 'No action needed from you right now. You will be notified if anything is required.',
    action: { type: 'open_invoice', label: 'View invoice' },
    priority: 5,
  }
}

/** Build the full carrier briefing from raw (or already client-visible) data. */
export function buildAssistantBriefing(
  rawInvoices: Invoice[],
  payments: Payment[],
  today: Date = new Date()
): Briefing {
  const invoices = mapClientVisibleInvoices(rawInvoices)
  const open = invoices.filter(isOpenArInvoice)
  const insights = buildBrokerInsights(invoices, payments)
  const brokerMap = new Map(insights.map((b) => [b.brokerName, b]))

  const items: BriefingItem[] = []

  for (const inv of open) {
    const balance = getInvoiceOpenArBalance(inv, payments)
    if (balance <= AMOUNT_EPSILON) continue
    const daysOpen = Math.max(0, daysBetween(parseKey(inv.invoice_date), today))
    const common = {
      invoiceId: inv.id,
      invoiceNumber: inv.invoice_number,
      brokerName: inv.broker_name,
      amount: balance,
      amountLabel: formatCurrency(balance),
      daysOpen,
    }

    if (inv.status === 'hold') {
      items.push(holdItem(inv, daysOpen))
    }

    const openDispute = (inv.disputes ?? []).find(
      (d) => d.status === 'open' || d.status === 'under_review'
    )
    if (openDispute) {
      items.push({
        ...common,
        id: `dispute-${inv.id}`,
        kind: 'dispute_open',
        owner: 'credyx',
        title: 'Your dispute is open',
        why: 'Credyx is reviewing the dispute you opened on this invoice.',
        nextStep: openDispute.response
          ? `Credyx replied: ${openDispute.response}`
          : 'No action needed. You will see Credyx’s reply on the invoice.',
        action: { type: 'open_invoice', label: 'View invoice' },
        priority: 3,
      })
    }

    const received = inv.amount - balance
    if (received > AMOUNT_EPSILON) {
      items.push({
        ...common,
        id: `short-${inv.id}`,
        kind: 'short_paid',
        owner: 'you',
        title: 'Only part of this invoice was paid',
        why: `${formatCurrency(received)} of ${formatCurrency(inv.amount)} was paid. ${formatCurrency(balance)} is still open.`,
        nextStep: 'Open the invoice to see the payment and decide whether to dispute or accept the shortfall.',
        action: { type: 'open_invoice', label: 'Review invoice' },
        priority: 2,
      })
    }

    if (inv.status !== 'hold' && getDaysOutstanding(inv, today) >= AR_POLICY.collectionsOverdueDays) {
      const broker = brokerMap.get(inv.broker_name)
      const late =
        broker?.avgDaysToPay != null
          ? ` ${inv.broker_name} usually pays in about ${broker.avgDaysToPay} days.`
          : ''
      items.push({
        ...common,
        id: `overdue-${inv.id}`,
        kind: 'overdue',
        owner: 'credyx',
        title: 'Past due',
        why: `${plural(daysOpen, 'day')} since the invoice date and still unpaid.${late}`,
        nextStep: 'Credyx is following up with the broker. No action needed unless you have new information.',
        action: { type: 'open_invoice', label: 'View invoice' },
        priority: 2.5,
      })
    }
  }

  // Payments Credyx posted that the carrier still needs to confirm.
  for (const p of payments) {
    if (p.status !== 'awaiting_receipt') continue
    const inv = invoices.find((i) => i.id === p.invoice_id)
    if (!inv) continue
    const deadline = p.client_confirmation_deadline
      ? ` Confirm by ${shortDate(p.client_confirmation_deadline)}.`
      : ''
    items.push({
      id: `confirm-${p.id}`,
      kind: 'confirm_payment',
      owner: 'you',
      invoiceId: inv.id,
      invoiceNumber: inv.invoice_number,
      brokerName: inv.broker_name,
      amount: p.amount,
      amountLabel: formatCurrency(p.amount),
      title: 'Confirm you received this payment',
      why: `Credyx posted ${formatCurrency(p.amount)} on invoice #${inv.invoice_number}.${deadline}`,
      nextStep: 'Check your bank. If the money arrived, confirm it; if not, dispute it.',
      daysOpen: 0,
      action: { type: 'open_payments', label: 'Review payment' },
      priority: 1,
    })
  }

  items.sort((a, b) => a.priority - b.priority || b.daysOpen - a.daysOpen || b.amount - a.amount)

  const holdInvoices = open.filter((i) => i.status === 'hold')
  const onHoldAmount = holdInvoices.reduce((s, i) => s + getInvoiceOpenArBalance(i, payments), 0)
  const youItems = items.filter((i) => i.owner === 'you')
  const waitingOnYou = new Map<string, number>()
  for (const i of youItems) {
    waitingOnYou.set(i.invoiceId, Math.max(waitingOnYou.get(i.invoiceId) ?? 0, i.amount))
  }
  const waitingOnYouAmount = [...waitingOnYou.values()].reduce((s, n) => s + n, 0)

  const forecast = buildForecast(open, payments, brokerMap, today)
  const expectedNext7Days = forecast[0]?.expected ?? 0
  const openAmount = open.reduce((s, i) => s + getInvoiceOpenArBalance(i, payments), 0)

  let headline: string
  let subline: string
  if (youItems.length > 0) {
    headline = `${plural(youItems.length, 'thing')} need${youItems.length === 1 ? 's' : ''} you today`
    subline = `${formatCurrency(waitingOnYouAmount)} is waiting on you.${
      expectedNext7Days > 0 ? ` ${formatCurrency(expectedNext7Days)} is expected in the next 7 days.` : ''
    }`
  } else if (holdInvoices.length > 0) {
    headline = 'Nothing needed from you right now'
    subline = `${formatCurrency(onHoldAmount)} is on hold while Credyx reviews it.${
      expectedNext7Days > 0 ? ` ${formatCurrency(expectedNext7Days)} is expected in the next 7 days.` : ''
    }`
  } else if (open.length > 0) {
    headline = 'You’re all clear'
    subline =
      expectedNext7Days > 0
        ? `${formatCurrency(expectedNext7Days)} is expected in the next 7 days.`
        : 'No payments are expected in the next 7 days.'
  } else {
    headline = 'No open invoices'
    subline = 'Submit a batch and Credyx will start collecting.'
  }

  return {
    generatedAt: today.toISOString(),
    headline,
    subline,
    totals: {
      openAmount,
      openCount: open.length,
      onHoldAmount,
      onHoldCount: holdInvoices.length,
      waitingOnYouAmount,
      needsYouCount: youItems.length,
      expectedNext7Days,
    },
    items,
    forecast,
    brokers: insights.slice(0, 6),
  }
}

/** Compact, client-safe facts for the chat model (it must quote these, not recompute). */
export function summarizeBriefingForAi(briefing: Briefing): Record<string, unknown> {
  return {
    headline: briefing.headline,
    subline: briefing.subline,
    totals: briefing.totals,
    todo: briefing.items.slice(0, 8).map((i) => ({
      invoice: i.invoiceNumber,
      broker: i.brokerName,
      amount: i.amountLabel,
      owner: i.owner,
      kind: i.kind,
      title: i.title,
      why: i.why,
      nextStep: i.nextStep,
      daysOpen: i.daysOpen,
    })),
    cashForecast: briefing.forecast.map((w) => ({
      period: w.label,
      expected: formatCurrency(w.expected),
      onHold: formatCurrency(w.onHold),
    })),
    brokers: briefing.brokers.map((b) => ({
      broker: b.brokerName,
      open: formatCurrency(b.openAmount),
      onHold: formatCurrency(b.holdAmount),
      avgDaysToPay: b.avgDaysToPay,
      note: b.note,
    })),
  }
}
