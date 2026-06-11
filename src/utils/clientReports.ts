import type { AgingAR } from '../types/admin'
import type { Invoice } from '../types/invoice'
import type { Payment } from '../types/payment'
import {
  DISPLAY_AGING_BUCKETS,
  type DisplayAgingBucketId,
  type EnrichedInvoice,
  enrichInvoices,
  getDisplayAgingBucketId,
  isOpenArInvoice,
} from './invoiceAging'

export type DateRange = { start_date: string; end_date: string }

export type ReportInsight = {
  id: string
  tone: 'info' | 'success' | 'warning' | 'danger'
  title: string
  body: string
}

export type AgingBucketRow = {
  id: DisplayAgingBucketId
  label: string
  amount: number
  invoice_count: number
}

export type BrokerScoreRow = {
  broker_name: string
  open_ar: number
  open_invoices: number
  invoiced_in_range: number
  collected_in_range: number
  collection_rate: number
  avg_days_to_pay: number | null
  share_of_ar: number
  overdue_amount: number
  overdue_count: number
}

export type CashFlowMonth = {
  month: string
  monthKey: string
  invoiced: number
  collected: number
  invoice_count: number
  payment_count: number
}

export type PipelineMetrics = {
  submitted: number
  approved: number
  pending: number
  on_hold: number
  rejected: number
  paid: number
  approval_rate: number
  avg_days_to_approve: number | null
  dispute_count: number
  open_dispute_count: number
}

export type PaymentLagStats = {
  avg_days: number | null
  on_time_pct: number
  late_pct: number
  sample_size: number
}

function inRange(date: string, range: DateRange): boolean {
  return date >= range.start_date && date <= range.end_date
}

function daysBetween(start: string, end: string): number {
  const a = new Date(start)
  const b = new Date(end)
  a.setHours(0, 0, 0, 0)
  b.setHours(0, 0, 0, 0)
  return Math.max(0, Math.floor((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24)))
}

/** Open A/R aging buckets from live invoice data. */
export function computeOpenArAging(invoices: Invoice[], asOf = new Date()): {
  buckets: AgingBucketRow[]
  total_ar: number
  total_invoices: number
  overdue_amount: number
  overdue_count: number
  aging_ar: AgingAR
} {
  const enriched = enrichInvoices(invoices, asOf).filter((inv) => isOpenArInvoice(inv))

  const bucketMap = new Map<DisplayAgingBucketId, { amount: number; count: number }>()
  for (const b of DISPLAY_AGING_BUCKETS) {
    bucketMap.set(b.id, { amount: 0, count: 0 })
  }

  let overdue_amount = 0
  let overdue_count = 0

  for (const inv of enriched) {
    const id = getDisplayAgingBucketId(inv.daysOutstanding)
    const row = bucketMap.get(id)!
    row.amount += inv.amount
    row.count += 1
    if (inv.isOverdue) {
      overdue_amount += inv.amount
      overdue_count += 1
    }
  }

  const buckets: AgingBucketRow[] = DISPLAY_AGING_BUCKETS.map((b) => ({
    id: b.id,
    label: b.label,
    amount: bucketMap.get(b.id)!.amount,
    invoice_count: bucketMap.get(b.id)!.count,
  }))

  const total_ar = buckets.reduce((s, b) => s + b.amount, 0)
  const total_invoices = buckets.reduce((s, b) => s + b.invoice_count, 0)

  const aging_ar: AgingAR = {
    '1_15': bucketMap.get('0_15')!.amount,
    '16_30': bucketMap.get('16_30')!.amount,
    '31_45': bucketMap.get('31_45')!.amount,
    '46_60': bucketMap.get('46_60')!.amount,
    '61_90': bucketMap.get('61_90')!.amount,
    over_91: bucketMap.get('over_91')!.amount,
    total: total_ar,
  }

  return { buckets, total_ar, total_invoices, overdue_amount, overdue_count, aging_ar }
}

/** Weighted days sales outstanding on open A/R. */
export function computeDso(openInvoices: EnrichedInvoice[]): number | null {
  const open = openInvoices.filter(isOpenArInvoice)
  if (open.length === 0) return null
  const total = open.reduce((s, inv) => s + inv.amount, 0)
  if (total <= 0) return null
  const weighted = open.reduce((s, inv) => s + inv.daysOutstanding * inv.amount, 0)
  return Math.round(weighted / total)
}

/** Monthly invoiced vs collected for the last N months. */
export function computeCashFlowTrend(
  invoices: Invoice[],
  payments: Payment[],
  months = 6
): CashFlowMonth[] {
  const today = new Date()
  const result: CashFlowMonth[] = []

  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1)
    const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const label = d.toLocaleDateString('en-US', { month: 'short' })
    result.push({
      month: label,
      monthKey,
      invoiced: 0,
      collected: 0,
      invoice_count: 0,
      payment_count: 0,
    })
  }

  const monthIndex = new Map(result.map((m, i) => [m.monthKey, i]))

  for (const inv of invoices) {
    const key = inv.invoice_date.slice(0, 7)
    const idx = monthIndex.get(key)
    if (idx !== undefined) {
      result[idx].invoiced += inv.amount
      result[idx].invoice_count += 1
    }
  }

  for (const p of payments) {
    if (p.status !== 'confirmed') continue
    const key = p.received_date.slice(0, 7)
    const idx = monthIndex.get(key)
    if (idx !== undefined) {
      result[idx].collected += p.amount
      result[idx].payment_count += 1
    }
  }

  return result
}

/** Broker scorecard for collections performance. */
export function computeBrokerScores(
  invoices: Invoice[],
  payments: Payment[],
  range: DateRange,
  asOf = new Date()
): BrokerScoreRow[] {
  const enriched = enrichInvoices(invoices, asOf)
  const openByBroker = new Map<string, { ar: number; count: number; overdue: number; overdueCount: number }>()
  const rangeInvoices = invoices.filter((inv) => inRange(inv.invoice_date, range))

  for (const inv of enriched.filter(isOpenArInvoice)) {
    const row = openByBroker.get(inv.broker_name) ?? {
      ar: 0,
      count: 0,
      overdue: 0,
      overdueCount: 0,
    }
    row.ar += inv.amount
    row.count += 1
    if (inv.isOverdue) {
      row.overdue += inv.amount
      row.overdueCount += 1
    }
    openByBroker.set(inv.broker_name, row)
  }

  const brokerNames = new Set([
    ...rangeInvoices.map((i) => i.broker_name),
    ...openByBroker.keys(),
  ])

  const totalOpenAr = [...openByBroker.values()].reduce((s, r) => s + r.ar, 0)

  const invoiceById = new Map(invoices.map((i) => [i.id, i]))

  return [...brokerNames]
    .map((broker_name) => {
      const inRangeInv = rangeInvoices.filter((i) => i.broker_name === broker_name)
      const invoiced_in_range = inRangeInv.reduce((s, i) => s + i.amount, 0)
      const collected_in_range = payments
        .filter(
          (p) =>
            p.broker_name === broker_name &&
            p.status === 'confirmed' &&
            inRange(p.received_date, range)
        )
        .reduce((s, p) => s + p.amount, 0)

      const paidPayments = payments.filter(
        (p) => p.broker_name === broker_name && p.status === 'confirmed'
      )
      const lagDays: number[] = []
      for (const p of paidPayments) {
        const inv = invoiceById.get(p.invoice_id)
        if (inv?.expected_payment_date) {
          lagDays.push(daysBetween(inv.expected_payment_date, p.received_date))
        }
      }

      const open = openByBroker.get(broker_name)

      return {
        broker_name,
        open_ar: open?.ar ?? 0,
        open_invoices: open?.count ?? 0,
        invoiced_in_range,
        collected_in_range,
        collection_rate:
          invoiced_in_range > 0 ? (collected_in_range / invoiced_in_range) * 100 : 0,
        avg_days_to_pay:
          lagDays.length > 0
            ? Math.round(lagDays.reduce((a, b) => a + b, 0) / lagDays.length)
            : null,
        share_of_ar: totalOpenAr > 0 ? ((open?.ar ?? 0) / totalOpenAr) * 100 : 0,
        overdue_amount: open?.overdue ?? 0,
        overdue_count: open?.overdueCount ?? 0,
      }
    })
    .filter((b) => b.open_ar > 0 || b.invoiced_in_range > 0)
    .sort((a, b) => b.open_ar - a.open_ar || b.invoiced_in_range - a.invoiced_in_range)
}

/** Invoice pipeline & dispute stats for the selected period. */
export function computePipelineMetrics(invoices: Invoice[], range: DateRange): PipelineMetrics {
  const filtered = invoices.filter((inv) => inRange(inv.invoice_date, range))
  const submitted = filtered.length
  const approved = filtered.filter((i) => i.status === 'approved' || i.status === 'paid').length
  const pending = filtered.filter((i) => i.status === 'pending').length
  const on_hold = filtered.filter((i) => i.status === 'hold').length
  const rejected = filtered.filter((i) => i.status === 'rejected').length
  const paid = filtered.filter((i) => i.status === 'paid').length

  const approveDays: number[] = []
  for (const inv of filtered) {
    if (inv.approved_at && inv.created_at) {
      approveDays.push(daysBetween(inv.created_at.slice(0, 10), inv.approved_at.slice(0, 10)))
    }
  }

  let dispute_count = 0
  let open_dispute_count = 0
  for (const inv of filtered) {
    const disputes = inv.disputes ?? []
    dispute_count += disputes.length
    open_dispute_count += disputes.filter((d) => d.status === 'open' || d.status === 'under_review').length
  }

  return {
    submitted,
    approved,
    pending,
    on_hold,
    rejected,
    paid,
    approval_rate: submitted > 0 ? (approved / submitted) * 100 : 0,
    avg_days_to_approve:
      approveDays.length > 0
        ? Math.round(approveDays.reduce((a, b) => a + b, 0) / approveDays.length)
        : null,
    dispute_count,
    open_dispute_count,
  }
}

/** How long brokers take to pay vs expected date. */
export function computePaymentLag(
  payments: Payment[],
  invoices: Invoice[],
  range: DateRange
): PaymentLagStats {
  const invoiceById = new Map(invoices.map((i) => [i.id, i]))
  const lags: number[] = []

  for (const p of payments) {
    if (p.status !== 'confirmed' || !inRange(p.received_date, range)) continue
    const inv = invoiceById.get(p.invoice_id)
    if (!inv?.expected_payment_date) continue
    lags.push(daysBetween(inv.expected_payment_date, p.received_date))
  }

  if (lags.length === 0) {
    return { avg_days: null, on_time_pct: 0, late_pct: 0, sample_size: 0 }
  }

  const onTime = lags.filter((d) => d <= 0).length
  const late = lags.length - onTime

  return {
    avg_days: Math.round(lags.reduce((a, b) => a + b, 0) / lags.length),
    on_time_pct: (onTime / lags.length) * 100,
    late_pct: (late / lags.length) * 100,
    sample_size: lags.length,
  }
}

export type PeriodSummary = {
  invoiced: number
  collected: number
  collection_rate: number
  invoice_count: number
  payment_count: number
  open_ar: number
  dso: number | null
}

export function computePeriodSummary(
  invoices: Invoice[],
  payments: Payment[],
  range: DateRange,
  asOf = new Date()
): PeriodSummary {
  const enriched = enrichInvoices(invoices, asOf)
  const inRangeInv = invoices.filter((i) => inRange(i.invoice_date, range))
  const invoiced = inRangeInv.reduce((s, i) => s + i.amount, 0)
  const collected = payments
    .filter((p) => p.status === 'confirmed' && inRange(p.received_date, range))
    .reduce((s, p) => s + p.amount, 0)

  const open_ar = enriched.filter(isOpenArInvoice).reduce((s, i) => s + i.amount, 0)

  return {
    invoiced,
    collected,
    collection_rate: invoiced > 0 ? (collected / invoiced) * 100 : 0,
    invoice_count: inRangeInv.length,
    payment_count: payments.filter(
      (p) => p.status === 'confirmed' && inRange(p.received_date, range)
    ).length,
    open_ar,
    dso: computeDso(enriched),
  }
}

/** Actionable narrative insights from computed metrics. */
export function generateReportInsights(input: {
  summary: PeriodSummary
  aging: ReturnType<typeof computeOpenArAging>
  brokers: BrokerScoreRow[]
  pipeline: PipelineMetrics
  paymentLag: PaymentLagStats
  cashFlow: CashFlowMonth[]
}): ReportInsight[] {
  const insights: ReportInsight[] = []
  const { summary, aging, brokers, pipeline, paymentLag, cashFlow } = input

  if (aging.overdue_count > 0) {
    insights.push({
      id: 'overdue',
      tone: 'danger',
      title: `${aging.overdue_count} overdue invoice${aging.overdue_count !== 1 ? 's' : ''}`,
      body: `${formatCompact(aging.overdue_amount)} is 15+ days past expected pay. Review Aging A/R or contact brokers on the oldest balances.`,
    })
  }

  const topBroker = brokers[0]
  if (topBroker && topBroker.share_of_ar >= 30) {
    insights.push({
      id: 'concentration',
      tone: 'warning',
      title: `${topBroker.broker_name} is ${topBroker.share_of_ar.toFixed(0)}% of open A/R`,
      body: 'High broker concentration increases collection risk. Track payment speed and diversify load volume where possible.',
    })
  }

  if (summary.dso !== null && summary.dso >= 30) {
    insights.push({
      id: 'dso',
      tone: 'warning',
      title: `DSO at ${summary.dso} days`,
      body: 'Open receivables are aging longer than typical freight terms. Prioritize follow-up on 31–45 and 46–60 day buckets.',
    })
  }

  if (cashFlow.length >= 2) {
    const last = cashFlow[cashFlow.length - 1]
    const prev = cashFlow[cashFlow.length - 2]
    if (last.collected > prev.collected && prev.collected > 0) {
      const pct = ((last.collected - prev.collected) / prev.collected) * 100
      insights.push({
        id: 'collections-up',
        tone: 'success',
        title: `Collections up ${pct.toFixed(0)}% vs prior month`,
        body: `${formatCompact(last.collected)} collected in ${last.month} compared with ${formatCompact(prev.collected)} in ${prev.month}.`,
      })
    }
  }

  if (paymentLag.sample_size >= 3 && paymentLag.late_pct >= 40) {
    insights.push({
      id: 'late-pay',
      tone: 'warning',
      title: `${paymentLag.late_pct.toFixed(0)}% of payments arrived late`,
      body: `Average ${paymentLag.avg_days} days past expected pay across ${paymentLag.sample_size} confirmed payments in range.`,
    })
  }

  if (pipeline.open_dispute_count > 0) {
    insights.push({
      id: 'disputes',
      tone: 'info',
      title: `${pipeline.open_dispute_count} open dispute${pipeline.open_dispute_count !== 1 ? 's' : ''}`,
      body: 'Unresolved disputes can delay funding. Check invoice detail for Credyx responses and required documents.',
    })
  }

  if (summary.collection_rate >= 75 && summary.invoiced > 0) {
    insights.push({
      id: 'collection-strong',
      tone: 'success',
      title: `${summary.collection_rate.toFixed(0)}% collection rate in period`,
      body: `Collected ${formatCompact(summary.collected)} against ${formatCompact(summary.invoiced)} invoiced in the selected date range.`,
    })
  }

  return insights.slice(0, 4)
}

function formatCompact(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount)
}

export function getPresetRange(preset: 'mtd' | '30d' | '90d' | 'ytd'): DateRange {
  const end = new Date()
  const start = new Date()
  end.setHours(0, 0, 0, 0)
  start.setHours(0, 0, 0, 0)

  switch (preset) {
    case 'mtd':
      start.setDate(1)
      break
    case '30d':
      start.setDate(start.getDate() - 30)
      break
    case '90d':
      start.setDate(start.getDate() - 90)
      break
    case 'ytd':
      start.setMonth(0, 1)
      break
  }

  return {
    start_date: start.toISOString().split('T')[0],
    end_date: end.toISOString().split('T')[0],
  }
}
