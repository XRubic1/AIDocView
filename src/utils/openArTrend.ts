import type { Invoice } from '../types/invoice'
import type { Payment } from '../types/payment'
import { isOpenArInvoice } from './invoiceAging'
import {
  AMOUNT_EPSILON,
  getEffectivePaymentAmount,
  getInvoiceOpenArBalance,
} from './paymentVariance'

export type OpenArTrendPoint = {
  /** YYYY-MM */
  monthKey: string
  /** Short chart label */
  label: string
  /** Open A/R balance at month end (or today for the current month). */
  amount: number
}

export type OpenArTrendResult = {
  points: OpenArTrendPoint[]
  /** Latest point (current / this month). */
  current: number
  /** Previous month-end open A/R. */
  previousMonth: number
  /**
   * Month-over-month % change (current vs previous month end).
   * `null` when previous is 0 and current is also 0 (nothing to compare).
   */
  momPct: number | null
}

/** Calendar date at local end-of-day for inclusive as-of comparisons. */
function endOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(23, 59, 59, 999)
  return d
}

/** Last calendar day of the month containing `date` (or today if same month as now). */
function asOfForMonth(year: number, monthIndex: number, now: Date): Date {
  const isCurrentMonth = year === now.getFullYear() && monthIndex === now.getMonth()
  if (isCurrentMonth) return endOfDay(now)
  return endOfDay(new Date(year, monthIndex + 1, 0))
}

function parseDay(iso: string): Date | null {
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return null
  return new Date(t)
}

/**
 * Confirmed payments applied on or before `asOf` (excludes `paid_amount` snapshot so
 * historical points stay reconstructable from payment history).
 */
function receivedAsOf(invoiceId: string, payments: Payment[], asOf: Date): number {
  return payments
    .filter((p) => p.invoice_id === invoiceId && p.status === 'confirmed')
    .filter((p) => {
      const received = parseDay(p.received_date || p.payment_date)
      return received != null && received <= asOf
    })
    .reduce((sum, p) => sum + getEffectivePaymentAmount(p), 0)
}

/** True when `asOf` is the same local calendar day as `now`. */
function isSameCalendarDay(asOf: Date, now: Date): boolean {
  return (
    asOf.getFullYear() === now.getFullYear() &&
    asOf.getMonth() === now.getMonth() &&
    asOf.getDate() === now.getDate()
  )
}

/**
 * Open A/R on a single as-of date.
 * - Today: same definition as dashboard Total A/R (`approved` + open balance).
 * - Past month-ends: reconstruct from invoices that were open then (incl. now-paid)
 *   using confirmed payment history dated on or before the as-of day.
 */
export function computeOpenArAsOf(
  invoices: Invoice[],
  payments: Payment[],
  asOfInput: Date = new Date(),
  nowInput: Date = new Date()
): number {
  const asOf = endOfDay(asOfInput)

  // Keep the latest sparkline point identical to the KPI headline.
  if (isSameCalendarDay(asOf, nowInput)) {
    return invoices
      .filter(isOpenArInvoice)
      .reduce((sum, inv) => {
        const balance = getInvoiceOpenArBalance(inv, payments)
        return balance > AMOUNT_EPSILON ? sum + balance : sum
      }, 0)
  }

  let total = 0

  for (const invoice of invoices) {
    // Pending / hold / rejected never sit in Total A/R.
    if (
      invoice.status === 'pending' ||
      invoice.status === 'hold' ||
      invoice.status === 'rejected'
    ) {
      continue
    }

    const openDate = parseDay(invoice.approved_at || invoice.invoice_date)
    if (!openDate || openDate > asOf) continue

    if (
      invoice.status === 'written_off' ||
      invoice.status === 'write_off_pending' ||
      invoice.status === 'force_closed'
    ) {
      const closedAt = parseDay(
        invoice.updated_at || invoice.reviewed_at || invoice.approved_at || invoice.invoice_date
      )
      if (closedAt && closedAt <= asOf) continue
    }

    const received = receivedAsOf(invoice.id, payments, asOf)
    const balance = Math.max(0, invoice.amount - received)
    if (balance <= AMOUNT_EPSILON) continue
    total += balance
  }

  return total
}

/** Month-over-month percent change helper. */
export function pctChange(current: number, previous: number): number | null {
  if (previous <= AMOUNT_EPSILON) {
    if (current <= AMOUNT_EPSILON) return null
    return 100
  }
  return ((current - previous) / previous) * 100
}

/**
 * Monthly open A/R trend for sparklines (default last 6 month-ends) plus MoM %.
 */
export function computeOpenArMonthlyTrend(
  invoices: Invoice[],
  payments: Payment[],
  monthCount = 6,
  nowInput: Date = new Date()
): OpenArTrendResult {
  const now = nowInput
  const points: OpenArTrendPoint[] = []

  for (let offset = monthCount - 1; offset >= 0; offset -= 1) {
    const monthDate = new Date(now.getFullYear(), now.getMonth() - offset, 1)
    const year = monthDate.getFullYear()
    const month = monthDate.getMonth()
    const asOf = asOfForMonth(year, month, now)
    const amount = computeOpenArAsOf(invoices, payments, asOf, now)
    const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`
    const label = monthDate.toLocaleDateString('en-US', { month: 'short' })
    points.push({ monthKey, label, amount })
  }

  const current = points[points.length - 1]?.amount ?? 0
  const previousMonth = points[points.length - 2]?.amount ?? 0
  const momPct = pctChange(current, previousMonth)

  return { points, current, previousMonth, momPct }
}
