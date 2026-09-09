/**
 * Broker payment history aggregates (month-to-month / yearly) from confirmed payments.
 */
import type { Payment } from '../types/payment'
import type { Invoice } from '../types/invoice'
import { isOpenArInvoice } from './invoiceAging'
import { normalizeBrokerNameKey } from './brokerRiskPolicy'
import { getInvoiceOpenArBalance } from './paymentVariance'
import { classifyBrokerInvoicePayClocks } from './brokerInvoicePayClock'

export interface BrokerMonthHistory {
  /** YYYY-MM */
  month: string
  paidAmount: number
  paidCount: number
  avgDaysToPay: number | null
  onTimeCount: number
  lateCount: number
  /** 0–100 when terms are known and the month has paid samples. */
  onTimeRate: number | null
}

export interface BrokerYearHistory {
  year: string
  paidAmount: number
  paidCount: number
  avgDaysToPay: number | null
  onTimeCount: number
  lateCount: number
  onTimeRate: number | null
}

export interface BrokerPaymentHistory {
  months: BrokerMonthHistory[]
  years: BrokerYearHistory[]
  lifetimePaid: number
  lifetimeCount: number
  openAr: number
  avgDaysToPay: number | null
  onTimeRate: number | null
  paymentTermsDays: number | null
  invoiceCount: number
  holdCount: number
  disputeCount: number
  pausedInvoiceCount: number
  pausedInvoiceShare: number
  pausedOpenAr: number
}

function daysBetween(a: string, b: string): number | null {
  const t0 = new Date(a).getTime()
  const t1 = new Date(b).getTime()
  if (!Number.isFinite(t0) || !Number.isFinite(t1)) return null
  return Math.max(0, Math.round((t1 - t0) / (1000 * 60 * 60 * 24)))
}

const avg = (days: number[]) =>
  days.length > 0 ? Math.round(days.reduce((a, b) => a + b, 0) / days.length) : null

function onTimeRate(onTime: number, late: number): number | null {
  const n = onTime + late
  if (n === 0) return null
  return Math.round((onTime / n) * 100)
}

type Bucket = { amount: number; count: number; days: number[]; onTime: number; late: number }

function emptyBucket(): Bucket {
  return { amount: 0, count: 0, days: [], onTime: 0, late: 0 }
}

function toMonthRow(month: string, v: Bucket): BrokerMonthHistory {
  return {
    month,
    paidAmount: v.amount,
    paidCount: v.count,
    avgDaysToPay: avg(v.days),
    onTimeCount: v.onTime,
    lateCount: v.late,
    onTimeRate: onTimeRate(v.onTime, v.late),
  }
}

function toYearRow(year: string, v: Bucket): BrokerYearHistory {
  return {
    year,
    paidAmount: v.amount,
    paidCount: v.count,
    avgDaysToPay: avg(v.days),
    onTimeCount: v.onTime,
    lateCount: v.late,
    onTimeRate: onTimeRate(v.onTime, v.late),
  }
}

/** True when this invoice belongs to the broker id or catalog name. */
export function invoiceMatchesBroker(
  invoice: Invoice,
  brokerId: string,
  brokerName?: string | null
): boolean {
  if (invoice.broker_id === brokerId) return true
  if (
    brokerName &&
    normalizeBrokerNameKey(invoice.broker_name) === normalizeBrokerNameKey(brokerName)
  ) {
    return true
  }
  return false
}

/**
 * Compute payment history for a broker from confirmed payments + invoices.
 * Matches payments via invoice.broker_id (Payment has no broker_id field).
 */
export function computeBrokerPaymentHistory(
  brokerId: string,
  payments: Payment[],
  invoices: Invoice[],
  options?: { paymentTermsDays?: number | null; brokerName?: string | null }
): BrokerPaymentHistory {
  const terms = options?.paymentTermsDays ?? null
  const invById = new Map(invoices.map((i) => [i.id, i]))
  const brokerInvoices = invoices.filter((i) =>
    invoiceMatchesBroker(i, brokerId, options?.brokerName)
  )
  const clocks = classifyBrokerInvoicePayClocks(brokerInvoices, payments)
  const brokerInvoiceIds = new Set(brokerInvoices.map((i) => i.id))

  const confirmed = payments.filter(
    (p) => p.status === 'confirmed' && brokerInvoiceIds.has(p.invoice_id)
  )

  const monthMap = new Map<string, Bucket>()
  const yearMap = new Map<string, Bucket>()

  let lifetimePaid = 0
  let lifetimeCount = 0
  let lifetimeOnTime = 0
  let lifetimeLate = 0
  const lifetimeDays: number[] = []

  for (const p of confirmed) {
    const received = p.received_date || p.payment_date
    if (!received) continue
    const d = new Date(received)
    if (!Number.isFinite(d.getTime())) continue

    const inv = invById.get(p.invoice_id)
    if (inv && clocks.get(inv.id)?.paused) continue

    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const year = String(d.getFullYear())

    lifetimePaid += p.amount
    lifetimeCount++

    const days = inv ? daysBetween(inv.invoice_date, received) : null
    if (days != null) lifetimeDays.push(days)

    let onTimeInc = 0
    let lateInc = 0
    if (days != null && terms != null && terms > 0) {
      if (days <= terms) {
        onTimeInc = 1
        lifetimeOnTime++
      } else {
        lateInc = 1
        lifetimeLate++
      }
    }

    const m = monthMap.get(month) ?? emptyBucket()
    m.amount += p.amount
    m.count++
    if (days != null) m.days.push(days)
    m.onTime += onTimeInc
    m.late += lateInc
    monthMap.set(month, m)

    const y = yearMap.get(year) ?? emptyBucket()
    y.amount += p.amount
    y.count++
    if (days != null) y.days.push(days)
    y.onTime += onTimeInc
    y.late += lateInc
    yearMap.set(year, y)
  }

  const months: BrokerMonthHistory[] = [...monthMap.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([month, v]) => toMonthRow(month, v))

  const years: BrokerYearHistory[] = [...yearMap.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([year, v]) => toYearRow(year, v))

  let holdCount = 0
  let disputeCount = 0
  let pausedInvoiceCount = 0
  let pausedOpenAr = 0
  const openAr = brokerInvoices.reduce((sum, inv) => {
    const clock = clocks.get(inv.id)
    if (clock?.hold) holdCount += 1
    if (clock?.dispute) disputeCount += 1
    if (clock?.paused) pausedInvoiceCount += 1
    if (!isOpenArInvoice(inv)) return sum
    const bal = getInvoiceOpenArBalance(inv, payments)
    if (clock?.paused) pausedOpenAr += bal
    return sum + bal
  }, 0)

  const invoiceCount = brokerInvoices.length

  return {
    months,
    years,
    lifetimePaid,
    lifetimeCount,
    openAr,
    avgDaysToPay: avg(lifetimeDays),
    onTimeRate: onTimeRate(lifetimeOnTime, lifetimeLate),
    paymentTermsDays: terms,
    invoiceCount,
    holdCount,
    disputeCount,
    pausedInvoiceCount,
    pausedInvoiceShare: invoiceCount > 0 ? pausedInvoiceCount / invoiceCount : 0,
    pausedOpenAr,
  }
}

/** Last N calendar months, newest first (YYYY-MM). */
export function lastCalendarMonths(count: number, asOf = new Date()): string[] {
  const keys: string[] = []
  const cursor = new Date(asOf.getFullYear(), asOf.getMonth(), 1)
  for (let i = 0; i < count; i++) {
    keys.push(
      `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`
    )
    cursor.setMonth(cursor.getMonth() - 1)
  }
  return keys
}

/** Pad a month series so charts show empty months, not gaps. */
export function fillMonthSeries(
  months: BrokerMonthHistory[],
  count = 18,
  asOf = new Date()
): BrokerMonthHistory[] {
  const byKey = new Map(months.map((m) => [m.month, m]))
  return lastCalendarMonths(count, asOf).map(
    (month) =>
      byKey.get(month) ?? {
        month,
        paidAmount: 0,
        paidCount: 0,
        avgDaysToPay: null,
        onTimeCount: 0,
        lateCount: 0,
        onTimeRate: null,
      }
  )
}

/** Display label for YYYY-MM. */
export function formatBrokerMonthLabel(month: string): string {
  const [year, mm] = month.split('-')
  const date = new Date(Number(year), Number(mm) - 1, 1)
  if (!Number.isFinite(date.getTime())) return month
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}
