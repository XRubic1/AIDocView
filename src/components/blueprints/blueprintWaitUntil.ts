/**
 * Catalog-aware Wait until → wake ISO.
 * Calendar-day waits use local 09:00; hours/minutes use now + duration (for testing).
 */

import type { BlueprintFlowNode } from '../../types/blueprintGraph'
import type { Invoice } from '../../types/invoice'
import type { Broker } from '../../types/broker'
import { mockBrokers } from '../../data/mockBrokers'
import { mockInvoices } from '../../data/mockInvoices'
import { mockPayments } from '../../data/mockPayments'
import { resolveLastChaseFollowup } from '../../utils/adminCollections'
import { getEffectiveInvoiceDueDate } from '../../utils/invoiceAging'
import { hasPpwBeenSent, getPpwSentAt } from '../../utils/ppwSent'
import {
  addDaysToYmd,
  getBrokerPaymentTermsDays,
} from '../../utils/invoiceDueDate'
import { computeBrokerPaymentHistory } from '../../utils/brokerPaymentHistory'
import { buildBrokerPaymentTiming } from '../../utils/brokerPaymentTiming'

export type BlueprintWaitUnit = 'days' | 'hours' | 'minutes'

export type BlueprintWaitSubject =
  | { kind: 'invoice'; invoice: Invoice }
  | { kind: 'broker'; broker: Broker }
  | { kind: 'batch' }

export type BlueprintWaitResolveResult = {
  waitUntil: string
  detail: string
}

function parseWaitDays(node: BlueprintFlowNode, fallback = 3): number {
  const n = Number(node.data.days)
  return Number.isFinite(n) && n >= 0 ? n : fallback
}

export function parseWaitUnit(node: BlueprintFlowNode): BlueprintWaitUnit {
  const u = node.data.waitUnit
  if (u === 'hours' || u === 'minutes' || u === 'days') return u
  return 'days'
}

/** Local calendar day @ 09:00 → ISO. */
export function atLocalNine(ymdOrDate: string | Date): string {
  let d: Date
  if (typeof ymdOrDate === 'string') {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymdOrDate.trim())
    if (m) {
      d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 9, 0, 0, 0)
    } else {
      d = new Date(ymdOrDate)
      if (!Number.isFinite(d.getTime())) d = new Date()
      d.setHours(9, 0, 0, 0)
    }
  } else {
    d = new Date(ymdOrDate)
    d.setHours(9, 0, 0, 0)
  }
  return d.toISOString()
}

function daysFromNow(days: number, now = new Date()): string {
  const d = new Date(now)
  d.setDate(d.getDate() + days)
  d.setHours(9, 0, 0, 0)
  return d.toISOString()
}

function addDaysToIso(iso: string, days: number): string {
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return daysFromNow(days)
  d.setDate(d.getDate() + days)
  d.setHours(9, 0, 0, 0)
  return d.toISOString()
}

/** If wake is already past, clamp to now so the runner can continue. */
function clampWake(iso: string, now = new Date()): string {
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t) || t <= now.getTime()) return now.toISOString()
  return iso
}

function unitLabel(amount: number, unit: BlueprintWaitUnit): string {
  if (unit === 'minutes') return amount === 1 ? 'minute' : 'minutes'
  if (unit === 'hours') return amount === 1 ? 'hour' : 'hours'
  return amount === 1 ? 'day' : 'days'
}

function pauseFromStep(
  amount: number,
  now = new Date(),
  unit: BlueprintWaitUnit = 'days'
): BlueprintWaitResolveResult {
  if (unit === 'minutes' || unit === 'hours') {
    const ms = unit === 'minutes' ? amount * 60_000 : amount * 3_600_000
    const waitUntil = clampWake(new Date(now.getTime() + ms).toISOString(), now)
    return {
      waitUntil,
      detail: `Wait ${amount} ${unitLabel(amount, unit)} from this step`,
    }
  }
  const waitUntil = clampWake(daysFromNow(amount, now), now)
  return {
    waitUntil,
    detail: `Wait ${amount} ${unitLabel(amount, 'days')} from this step`,
  }
}

/** Latest confirmed payment received date for this broker’s invoices. */
export function getLastConfirmedPaymentAtForBroker(brokerId: string): string | null {
  const brokerInvoiceIds = new Set(
    mockInvoices.filter((i) => i.broker_id === brokerId).map((i) => i.id)
  )
  let latest: string | null = null
  let latestMs = 0
  for (const p of mockPayments) {
    if (p.status !== 'confirmed' || !brokerInvoiceIds.has(p.invoice_id)) continue
    const received = p.received_date || p.payment_date
    if (!received) continue
    const ms = new Date(received).getTime()
    if (!Number.isFinite(ms)) continue
    if (ms >= latestMs) {
      latestMs = ms
      latest = received
    }
  }
  return latest
}

function resolveInvoiceWait(
  invoice: Invoice,
  node: BlueprintFlowNode,
  now = new Date()
): BlueprintWaitResolveResult {
  const id = node.data.waitUntilId || 'pause_days'
  const D = parseWaitDays(node, id === 'after_last_email' ? 5 : 15)

  if (id === 'pause_days') {
    return pauseFromStep(parseWaitDays(node, 3), now, parseWaitUnit(node))
  }

  if (id === 'net_plus_late') {
    const net = getBrokerPaymentTermsDays(invoice, mockBrokers) ?? 0
    const baseYmd = invoice.invoice_date?.trim()
    if (!baseYmd) {
      return pauseFromStep(D, now)
    }
    const target = addDaysToYmd(baseYmd, net + D)
    if (!target) return pauseFromStep(D, now)
    const waitUntil = clampWake(atLocalNine(target), now)
    return {
      waitUntil,
      detail: `Until invoice date + Net ${net} + ${D} late day${D === 1 ? '' : 's'}`,
    }
  }

  if (id === 'due_plus_late') {
    const due =
      getEffectiveInvoiceDueDate(invoice) ||
      invoice.due_date?.trim() ||
      invoice.expected_payment_date?.trim()
    if (!due) return pauseFromStep(D, now)
    const target = addDaysToYmd(due, D)
    if (!target) return pauseFromStep(D, now)
    const waitUntil = clampWake(atLocalNine(target), now)
    return {
      waitUntil,
      detail: `Until ${D} day${D === 1 ? '' : 's'} after due date`,
    }
  }

  if (id === 'after_last_email') {
    const days = parseWaitDays(node, 5)
    const last = resolveLastChaseFollowup(invoice)?.at
    if (!last) {
      const fallback = pauseFromStep(days, now)
      return {
        waitUntil: fallback.waitUntil,
        detail: `No chase email yet — ${fallback.detail}`,
      }
    }
    const waitUntil = clampWake(addDaysToIso(last, days), now)
    return {
      waitUntil,
      detail: `Until ${days} day${days === 1 ? '' : 's'} after last chase email`,
    }
  }

  if (id === 'after_ppw') {
    const broker = mockBrokers.find((b) => b.id === invoice.broker_id)
    const override = broker?.paperwork_status_check_days
    const days =
      typeof override === 'number' && override > 0 ? Math.floor(override) : parseWaitDays(node, 7)
    const sent = getPpwSentAt(invoice)
    if (!sent || !hasPpwBeenSent(invoice)) {
      const fallback = pauseFromStep(days, now)
      return { waitUntil: fallback.waitUntil, detail: `No PPW yet — ${fallback.detail}` }
    }
    return {
      waitUntil: clampWake(addDaysToIso(sent, days), now),
      detail: `Until ${days} day${days === 1 ? '' : 's'} after PPW`,
    }
  }

  if (id === 'payment_clock') {
    const due =
      getEffectiveInvoiceDueDate(invoice) ||
      invoice.due_date?.trim() ||
      invoice.expected_payment_date?.trim()
    const dueYmd = due?.slice(0, 10) ?? ''
    if (/^\d{4}-\d{2}-\d{2}$/.test(dueYmd)) {
      return {
        waitUntil: clampWake(atLocalNine(dueYmd), now),
        detail: 'Until the broker net due date',
      }
    }
    const broker = mockBrokers.find((b) => b.id === invoice.broker_id)
    const net = broker?.payment_terms_days
    const days = typeof net === 'number' && net > 0 ? Math.floor(net) : parseWaitDays(node, 30)
    const paused = pauseFromStep(days, now)
    return { waitUntil: paused.waitUntil, detail: `No due date — ${paused.detail}` }
  }

  return pauseFromStep(parseWaitDays(node, 3), now)
}

function resolveBrokerWait(
  broker: Broker,
  node: BlueprintFlowNode,
  now = new Date()
): BlueprintWaitResolveResult {
  const id = node.data.waitUntilId || 'pause_days'
  const D = parseWaitDays(node, id === 'no_payments_for' ? 30 : 15)

  if (id === 'pause_days') {
    return pauseFromStep(parseWaitDays(node, 3), now, parseWaitUnit(node))
  }

  if (id === 'no_payments_for') {
    const lastPay = getLastConfirmedPaymentAtForBroker(broker.id)
    if (lastPay) {
      const waitUntil = clampWake(addDaysToIso(lastPay, D), now)
      return {
        waitUntil,
        detail: `Until ${D} day${D === 1 ? '' : 's'} with no confirmed payment`,
      }
    }
    const created =
      (broker as Broker & { created_at?: string }).created_at?.trim() || null
    if (created) {
      const waitUntil = clampWake(addDaysToIso(created, D), now)
      return {
        waitUntil,
        detail: `Until ${D} day${D === 1 ? '' : 's'} since broker added (no payments yet)`,
      }
    }
    return pauseFromStep(D, now)
  }

  if (id === 'avg_pay_late') {
    const history = computeBrokerPaymentHistory(
      broker.id,
      mockPayments,
      mockInvoices,
      {
        paymentTermsDays: broker.payment_terms_days,
        brokerName: broker.name,
      }
    )
    const timing = buildBrokerPaymentTiming({
      paymentTermsDays: broker.payment_terms_days,
      avgDaysInvoiceToPay: history.avgDaysToPay,
      paidSampleSize: history.lifetimeCount,
      minPaidSample: 1,
    })
    if (timing && timing.daysLate >= D) {
      return {
        waitUntil: now.toISOString(),
        detail: `Avg pay ${timing.daysLate}d late ≥ ${D} — continue now`,
      }
    }
    const waitUntil = clampWake(daysFromNow(1, now), now)
    const lateLabel =
      timing != null ? `avg ${timing.daysLate}d late` : 'not enough pay history'
    return {
      waitUntil,
      detail: `Avg pay late gate (${lateLabel}; need ≥ ${D}) — check again tomorrow`,
    }
  }

  return pauseFromStep(parseWaitDays(node, 3), now)
}

/**
 * Resolve absolute wake time for a Wait until card.
 */
export function resolveBlueprintWaitUntil(
  subject: BlueprintWaitSubject,
  node: BlueprintFlowNode,
  now = new Date()
): BlueprintWaitResolveResult {
  if (subject.kind === 'invoice') {
    return resolveInvoiceWait(subject.invoice, node, now)
  }
  if (subject.kind === 'broker') {
    return resolveBrokerWait(subject.broker, node, now)
  }
  return pauseFromStep(parseWaitDays(node, 1), now, parseWaitUnit(node))
}
