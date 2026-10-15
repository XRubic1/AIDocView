/**
 * Extra carrier report metrics for the Reports tab: fees & net, short pays,
 * paperwork speed, days to pay, statement / tax-year ranges, and CSV helpers.
 */
import type { Invoice } from '../types/invoice'
import type { Payment } from '../types/payment'
import type { DateRange } from './clientReports'
import { feeAmountForPayment, formatFeeTermsLabel } from './feeTermsLock'
import {
  AMOUNT_EPSILON,
  getEffectivePaymentAmount,
  getInvoiceBalanceState,
  getInvoiceReceivedAmount,
} from './paymentVariance'
import { getPpwSentAt } from './ppwSent'

function inRange(date: string | undefined | null, range: DateRange): boolean {
  if (!date) return false
  const day = date.slice(0, 10)
  return day >= range.start_date && day <= range.end_date
}

function daysBetween(start: string, end: string): number | null {
  const a = new Date(start.slice(0, 10))
  const b = new Date(end.slice(0, 10))
  if (!Number.isFinite(a.getTime()) || !Number.isFinite(b.getTime())) return null
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 86_400_000))
}

function average(values: number[]): number | null {
  if (values.length === 0) return null
  return Math.round(values.reduce((sum, v) => sum + v, 0) / values.length)
}

function confirmedInRange(payments: Payment[], range: DateRange): Payment[] {
  return payments.filter((p) => p.status === 'confirmed' && inRange(p.received_date, range))
}

/** Average days from invoice date to confirmed payment, for payments received in range. */
export function computeAvgDaysToPay(
  invoices: Invoice[],
  payments: Payment[],
  range: DateRange
): number | null {
  const invoiceById = new Map(invoices.map((i) => [i.id, i]))
  const days: number[] = []
  for (const p of confirmedInRange(payments, range)) {
    const inv = invoiceById.get(p.invoice_id)
    if (!inv?.invoice_date) continue
    const d = daysBetween(inv.invoice_date, p.received_date)
    if (d != null) days.push(d)
  }
  return average(days)
}

export type FeeSummary = {
  gross_collected: number
  fees: number
  net: number
  /** Collected on trial invoices (fees waived). */
  waived_gross: number
  /** Collected on invoices with no fee terms on file (fee unknown). */
  unknown_terms_gross: number
  terms_labels: string[]
  invoice_count: number
}

/**
 * Credyx fees on cash collected in range, estimated from each invoice's locked fee terms.
 * Flat fees apply once per invoice; percentage fees apply to the amount collected.
 */
export function computeFeeSummary(
  invoices: Invoice[],
  payments: Payment[],
  range: DateRange
): FeeSummary {
  const invoiceById = new Map(invoices.map((i) => [i.id, i]))
  const collectedByInvoice = new Map<string, number>()
  for (const p of confirmedInRange(payments, range)) {
    collectedByInvoice.set(
      p.invoice_id,
      (collectedByInvoice.get(p.invoice_id) ?? 0) + getEffectivePaymentAmount(p)
    )
  }

  let gross = 0
  let fees = 0
  let waived = 0
  let unknown = 0
  const labels = new Set<string>()

  for (const [invoiceId, collected] of collectedByInvoice) {
    if (collected <= AMOUNT_EPSILON) continue
    gross += collected
    const terms = invoiceById.get(invoiceId)?.fee_terms
    if (!terms?.fee_type) {
      unknown += collected
      continue
    }
    labels.add(formatFeeTermsLabel(terms))
    if (terms.billing_mode === 'trial') {
      waived += collected
      continue
    }
    fees += feeAmountForPayment(collected, terms)
  }

  return {
    gross_collected: gross,
    fees,
    net: gross - fees,
    waived_gross: waived,
    unknown_terms_gross: unknown,
    terms_labels: [...labels],
    invoice_count: collectedByInvoice.size,
  }
}

export type ShortPayBrokerRow = {
  broker_name: string
  short_amount: number
  short_count: number
}

export type ShortPaySummary = {
  short_amount: number
  short_count: number
  written_off_amount: number
  written_off_count: number
  over_amount: number
  over_count: number
  open_disputes: number
  by_broker: ShortPayBrokerRow[]
}

/**
 * Short pays, overpays and write-offs on invoices whose latest payment landed in range.
 * Open disputes are counted as of today (invoice disputes + disputed remittances).
 */
export function computeShortPaySummary(
  invoices: Invoice[],
  payments: Payment[],
  range: DateRange
): ShortPaySummary {
  const latestPaymentByInvoice = new Map<string, string>()
  for (const p of payments) {
    if (p.status !== 'confirmed') continue
    const prev = latestPaymentByInvoice.get(p.invoice_id)
    if (!prev || p.received_date > prev) latestPaymentByInvoice.set(p.invoice_id, p.received_date)
  }

  const summary: ShortPaySummary = {
    short_amount: 0,
    short_count: 0,
    written_off_amount: 0,
    written_off_count: 0,
    over_amount: 0,
    over_count: 0,
    open_disputes: 0,
    by_broker: [],
  }
  const byBroker = new Map<string, ShortPayBrokerRow>()

  for (const inv of invoices) {
    const openDisputes = (inv.disputes ?? []).filter(
      (d) => d.status === 'open' || d.status === 'under_review'
    ).length
    summary.open_disputes += openDisputes

    const lastPaid = latestPaymentByInvoice.get(inv.id) ?? inv.collection_date
    if (inv.status === 'written_off') {
      const when = inv.write_off_request?.resolved_at ?? inv.updated_at ?? lastPaid
      if (!inRange(when, range)) continue
      const received = getInvoiceReceivedAmount(inv, payments)
      summary.written_off_amount += inv.write_off_request?.shortfall ?? Math.max(0, inv.amount - received)
      summary.written_off_count += 1
      continue
    }

    if (!inRange(lastPaid, range)) continue
    const received = getInvoiceReceivedAmount(inv, payments)
    const balance = getInvoiceBalanceState(inv.amount, received)
    if (balance.tone === 'short') {
      summary.short_amount += balance.signedBalance
      summary.short_count += 1
      const row = byBroker.get(inv.broker_name) ?? {
        broker_name: inv.broker_name,
        short_amount: 0,
        short_count: 0,
      }
      row.short_amount += balance.signedBalance
      row.short_count += 1
      byBroker.set(inv.broker_name, row)
    } else if (balance.tone === 'over') {
      summary.over_amount += Math.abs(balance.signedBalance)
      summary.over_count += 1
    }
  }

  summary.open_disputes += payments.filter((p) => p.status === 'disputed').length
  summary.by_broker = [...byBroker.values()].sort((a, b) => b.short_amount - a.short_amount)
  return summary
}

export type HoldReasonRow = { reason: string; count: number }

export type PaperworkSpeed = {
  submitted: number
  /** Avg days from submission to Credyx verification. */
  avg_days_to_verify: number | null
  /** Avg days from submission to paperwork sent to the broker. */
  avg_days_to_send: number | null
  sent_count: number
  on_hold_now: number
  hold_reasons: HoldReasonRow[]
}

function normalizeHoldReason(reason: string): string {
  const trimmed = reason.trim().replace(/\s+/g, ' ')
  const firstSentence = trimmed.split(/(?<=[.!?])\s/)[0] ?? trimmed
  return firstSentence.length > 70 ? `${firstSentence.slice(0, 67)}…` : firstSentence
}

/** How fast submitted invoices move to verified and sent-to-broker, plus common hold reasons. */
export function computePaperworkSpeed(invoices: Invoice[], range: DateRange): PaperworkSpeed {
  const submitted = invoices.filter((i) => inRange(i.created_at || i.invoice_date, range))
  const verifyDays: number[] = []
  const sendDays: number[] = []
  const reasons = new Map<string, number>()

  for (const inv of submitted) {
    const start = inv.created_at || inv.invoice_date
    const verifiedAt = inv.approved_at || inv.reviewed_at
    if (verifiedAt) {
      const d = daysBetween(start, verifiedAt)
      if (d != null) verifyDays.push(d)
    }
    const sentAt = getPpwSentAt(inv)
    if (sentAt) {
      const d = daysBetween(start, sentAt)
      if (d != null) sendDays.push(d)
    }
    if (inv.hold_reason?.trim()) {
      const key = normalizeHoldReason(inv.hold_reason)
      reasons.set(key, (reasons.get(key) ?? 0) + 1)
    }
  }

  return {
    submitted: submitted.length,
    avg_days_to_verify: average(verifyDays),
    avg_days_to_send: average(sendDays),
    sent_count: sendDays.length,
    on_hold_now: invoices.filter((i) => i.status === 'hold').length,
    hold_reasons: [...reasons.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 4),
  }
}

/** Calendar month (YYYY-MM) as an inclusive date range. */
export function monthToRange(monthKey: string): DateRange {
  const [y, m] = monthKey.split('-').map(Number)
  const last = new Date(y, m, 0).getDate()
  return {
    start_date: `${monthKey}-01`,
    end_date: `${monthKey}-${String(last).padStart(2, '0')}`,
  }
}

export function yearToRange(year: number): DateRange {
  return { start_date: `${year}-01-01`, end_date: `${year}-12-31` }
}

/** The last `count` calendar months, newest first, as { key: YYYY-MM, label }. */
export function listRecentMonths(count = 12, asOf = new Date()): { key: string; label: string }[] {
  const months: { key: string; label: string }[] = []
  for (let i = 0; i < count; i++) {
    const d = new Date(asOf.getFullYear(), asOf.getMonth() - i, 1)
    months.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
    })
  }
  return months
}

/** Years that have invoice or payment activity, newest first (always includes this year). */
export function listActivityYears(invoices: Invoice[], payments: Payment[], asOf = new Date()): number[] {
  const years = new Set<number>([asOf.getFullYear()])
  for (const inv of invoices) {
    const y = Number(inv.invoice_date?.slice(0, 4))
    if (y) years.add(y)
  }
  for (const p of payments) {
    const y = Number(p.received_date?.slice(0, 4))
    if (y) years.add(y)
  }
  return [...years].sort((a, b) => b - a)
}

/** Quote a CSV cell when it contains a comma, quote or newline. */
export function csvCell(value: string | number | null | undefined): string {
  if (value == null) return ''
  const text = typeof value === 'number' ? String(Math.round(value * 100) / 100) : value
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function toCsv(rows: Array<Array<string | number | null | undefined>>): string {
  return rows.map((row) => row.map(csvCell).join(',')).join('\n') + '\n'
}

/** Trigger a browser download of text content. */
export function downloadTextFile(filename: string, content: string, mime = 'text/csv') {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
