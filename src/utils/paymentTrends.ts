import type { Payment } from '../types/payment'

export type PaymentMonthBucket = {
  monthKey: string
  month: string
  paid: number
  pending: number
  count: number
}

export type PaymentTrendSummary = {
  totalPaid: number
  totalPending: number
  confirmedCount: number
  months: PaymentMonthBucket[]
}

export type KpiDetailType = 'paid' | 'pending' | 'received'

export type KpiDetailMonth = {
  month: string
  monthKey: string
  amount: number
  count: number
}

export type KpiDetailData = {
  type: KpiDetailType
  title: string
  subtitle: string
  totalLabel: string
  totalValue: string
  chartMode: 'amount' | 'count'
  chartSeriesLabel: string
  months: KpiDetailMonth[]
  payments: Payment[]
}

/** Monthly paid / pending totals for the last N months. */
export function computePaymentTrendSummary(
  payments: Payment[],
  months = 6
): PaymentTrendSummary {
  const today = new Date()
  const buckets: PaymentMonthBucket[] = []

  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1)
    const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const label = d.toLocaleDateString('en-US', { month: 'short' })
    buckets.push({ monthKey, month: label, paid: 0, pending: 0, count: 0 })
  }

  const monthIndex = new Map(buckets.map((b, i) => [b.monthKey, i]))

  for (const p of payments) {
    const key = p.received_date.slice(0, 7)
    const idx = monthIndex.get(key)
    if (idx === undefined) continue

    if (p.status === 'confirmed') {
      buckets[idx].paid += p.amount
      buckets[idx].count += 1
    } else if (p.status === 'pending' || p.status === 'awaiting_receipt' || p.status === 'disputed') {
      buckets[idx].pending += p.amount
    }
  }

  const confirmed = payments.filter((p) => p.status === 'confirmed')
  const pending = payments.filter(
    (p) => p.status === 'pending' || p.status === 'awaiting_receipt' || p.status === 'disputed'
  )
  const totalPaid = confirmed.reduce((s, p) => s + p.amount, 0)
  const totalPending = pending.reduce((s, p) => s + p.amount, 0)

  return {
    totalPaid,
    totalPending,
    confirmedCount: confirmed.length,
    months: buckets,
  }
}

function buildMonthBuckets(months: number) {
  const today = new Date()
  const buckets: KpiDetailMonth[] = []

  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1)
    const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const label = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    buckets.push({ monthKey, month: label, amount: 0, count: 0 })
  }

  return { buckets, monthIndex: new Map(buckets.map((b, i) => [b.monthKey, i])) }
}

/** Detailed breakdown for a KPI chart drill-down modal. */
export function computeKpiDetail(
  payments: Payment[],
  type: KpiDetailType,
  months = 6
): KpiDetailData {
  const { buckets, monthIndex } = buildMonthBuckets(months)
  const status = type === 'pending' ? ['pending', 'awaiting_receipt', 'disputed'] : 'confirmed'
  const filtered = payments.filter((p) =>
    Array.isArray(status) ? status.includes(p.status) : p.status === status
  )

  for (const p of filtered) {
    const key = p.received_date.slice(0, 7)
    const idx = monthIndex.get(key)
    if (idx === undefined) continue
    buckets[idx].amount += p.amount
    buckets[idx].count += 1
  }

  const totalAmount = filtered.reduce((s, p) => s + p.amount, 0)
  const recentPayments = [...filtered].sort(
    (a, b) => new Date(b.received_date).getTime() - new Date(a.received_date).getTime()
  )

  if (type === 'paid') {
    return {
      type,
      title: 'Total Paid',
      subtitle: 'Confirmed payments by received date',
      totalLabel: 'Total received',
      totalValue: String(totalAmount),
      chartMode: 'amount',
      chartSeriesLabel: 'Amount received',
      months: buckets,
      payments: recentPayments,
    }
  }

  if (type === 'pending') {
    return {
      type,
      title: 'Pending Payments',
      subtitle: 'Awaiting confirmation by received date',
      totalLabel: 'Pending amount',
      totalValue: String(totalAmount),
      chartMode: 'amount',
      chartSeriesLabel: 'Pending amount',
      months: buckets,
      payments: recentPayments,
    }
  }

  return {
    type,
    title: 'Payments Received',
    subtitle: 'Confirmed payment count by received date',
    totalLabel: 'Payments received',
    totalValue: String(filtered.length),
    chartMode: 'count',
    chartSeriesLabel: 'Payments received',
    months: buckets,
    payments: recentPayments,
  }
}
