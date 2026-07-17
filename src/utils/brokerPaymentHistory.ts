/**
 * Broker payment history aggregates (month-to-month / yearly) from confirmed payments.
 */
import type { Payment } from '../types/payment'
import type { Invoice } from '../types/invoice'

export interface BrokerMonthHistory {
  /** YYYY-MM */
  month: string
  paidAmount: number
  paidCount: number
  avgDaysToPay: number | null
}

export interface BrokerYearHistory {
  year: string
  paidAmount: number
  paidCount: number
  avgDaysToPay: number | null
}

export interface BrokerPaymentHistory {
  months: BrokerMonthHistory[]
  years: BrokerYearHistory[]
  lifetimePaid: number
  lifetimeCount: number
}

function daysBetween(a: string, b: string): number | null {
  const t0 = new Date(a).getTime()
  const t1 = new Date(b).getTime()
  if (!Number.isFinite(t0) || !Number.isFinite(t1)) return null
  return Math.max(0, Math.round((t1 - t0) / (1000 * 60 * 60 * 24)))
}

/**
 * Compute payment history for a broker from confirmed payments + invoices.
 * Matches payments via invoice.broker_id (Payment has no broker_id field).
 */
export function computeBrokerPaymentHistory(
  brokerId: string,
  payments: Payment[],
  invoices: Invoice[]
): BrokerPaymentHistory {
  const invById = new Map(invoices.map((i) => [i.id, i]))
  const brokerInvoiceIds = new Set(
    invoices.filter((i) => i.broker_id === brokerId).map((i) => i.id)
  )

  const confirmed = payments.filter(
    (p) => p.status === 'confirmed' && brokerInvoiceIds.has(p.invoice_id)
  )

  const monthMap = new Map<string, { amount: number; count: number; days: number[] }>()
  const yearMap = new Map<string, { amount: number; count: number; days: number[] }>()

  let lifetimePaid = 0
  let lifetimeCount = 0

  for (const p of confirmed) {
    const received = p.received_date || p.payment_date
    if (!received) continue
    const d = new Date(received)
    if (!Number.isFinite(d.getTime())) continue
    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const year = String(d.getFullYear())

    lifetimePaid += p.amount
    lifetimeCount++

    const inv = invById.get(p.invoice_id)
    const days = inv ? daysBetween(inv.invoice_date, received) : null

    const m = monthMap.get(month) ?? { amount: 0, count: 0, days: [] }
    m.amount += p.amount
    m.count++
    if (days != null) m.days.push(days)
    monthMap.set(month, m)

    const y = yearMap.get(year) ?? { amount: 0, count: 0, days: [] }
    y.amount += p.amount
    y.count++
    if (days != null) y.days.push(days)
    yearMap.set(year, y)
  }

  const avg = (days: number[]) =>
    days.length > 0 ? Math.round(days.reduce((a, b) => a + b, 0) / days.length) : null

  const months: BrokerMonthHistory[] = [...monthMap.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([month, v]) => ({
      month,
      paidAmount: v.amount,
      paidCount: v.count,
      avgDaysToPay: avg(v.days),
    }))

  const years: BrokerYearHistory[] = [...yearMap.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([year, v]) => ({
      year,
      paidAmount: v.amount,
      paidCount: v.count,
      avgDaysToPay: avg(v.days),
    }))

  return { months, years, lifetimePaid, lifetimeCount }
}
