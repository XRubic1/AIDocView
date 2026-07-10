import type { Invoice } from '../types/invoice'
import type { Payment } from '../types/payment'
import { isOpenArInvoice } from './invoiceAging'
import { AMOUNT_EPSILON, getInvoiceOpenArBalance } from './paymentVariance'

export type ForecastHorizon = 7 | 30

export type ForecastBucket = {
  dateKey: string
  label: string
  amount: number
  invoice_count: number
}

export type ForecastBrokerRow = {
  broker_name: string
  amount: number
  invoice_count: number
  share_pct: number
}

export type ForecastedInvoice = {
  invoice_id: string
  invoice_number: string
  broker_name: string
  amount: number
  expected_date: string
  predicted_date: string
  days_until: number
}

export type CashCollectionForecast = {
  horizon_days: number
  next_7_days: number
  next_30_days: number
  open_ar: number
  forecasted_in_horizon: number
  beyond_horizon: number
  daily_buckets: ForecastBucket[]
  broker_rows_7: ForecastBrokerRow[]
  broker_rows_30: ForecastBrokerRow[]
  top_invoices: ForecastedInvoice[]
}

function buildBrokerRows(
  items: ForecastedInvoice[],
  totalAmount: number
): ForecastBrokerRow[] {
  const brokerTotals = new Map<string, { amount: number; count: number }>()

  for (const item of items) {
    const row = brokerTotals.get(item.broker_name) ?? { amount: 0, count: 0 }
    row.amount += item.amount
    row.count += 1
    brokerTotals.set(item.broker_name, row)
  }

  return [...brokerTotals.entries()]
    .map(([broker_name, row]) => ({
      broker_name,
      amount: row.amount,
      invoice_count: row.count,
      share_pct: totalAmount > 0 ? (row.amount / totalAmount) * 100 : 0,
    }))
    .sort((a, b) => b.amount - a.amount)
}

function toDateKey(d: Date): string {
  return d.toISOString().split('T')[0]
}

function addDays(base: Date, days: number): Date {
  const d = new Date(base)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + days)
  return d
}

function daysBetween(start: string, end: string): number {
  const a = new Date(start)
  const b = new Date(end)
  a.setHours(0, 0, 0, 0)
  b.setHours(0, 0, 0, 0)
  return Math.max(0, Math.floor((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24)))
}

/** Average days from expected pay date to received date per broker (positive = late). */
function buildBrokerPayLag(
  invoices: Invoice[],
  payments: Payment[]
): Map<string, number> {
  const invoiceById = new Map(invoices.map((inv) => [inv.id, inv]))
  const lagByBroker = new Map<string, number[]>()

  for (const payment of payments) {
    if (payment.status !== 'confirmed') continue
    const invoice = invoiceById.get(payment.invoice_id)
    if (!invoice?.expected_payment_date) continue

    const lag = daysBetween(invoice.expected_payment_date, payment.received_date)
    const rows = lagByBroker.get(payment.broker_name) ?? []
    rows.push(lag)
    lagByBroker.set(payment.broker_name, rows)
  }

  const result = new Map<string, number>()
  for (const [broker, lags] of lagByBroker) {
    const avg = Math.round(lags.reduce((sum, n) => sum + n, 0) / lags.length)
    result.set(broker, avg)
  }
  return result
}

/** Predict when an open invoice is likely to be paid. */
function predictPaymentDate(
  invoice: Invoice,
  brokerLagDays: number,
  asOf: Date
): string {
  const todayKey = toDateKey(asOf)
  const baseExpected = invoice.expected_payment_date || invoice.due_date
  let predicted = addDays(new Date(baseExpected), brokerLagDays)
  const predictedKey = toDateKey(predicted)

  if (predictedKey < todayKey) {
    const recoveryDays = Math.min(14, Math.max(3, brokerLagDays > 0 ? brokerLagDays : 7))
    predicted = addDays(asOf, recoveryDays)
  }

  return toDateKey(predicted)
}

/**
 * Forward-looking cash collection forecast from open A/R and broker pay history.
 * Returns daily buckets for the next `horizonDays` (default 30).
 */
export function computeCashCollectionForecast(
  invoices: Invoice[],
  payments: Payment[],
  horizonDays = 30,
  asOf = new Date()
): CashCollectionForecast {
  const asOfDate = new Date(asOf)
  asOfDate.setHours(0, 0, 0, 0)

  const brokerLag = buildBrokerPayLag(invoices, payments)
  const openInvoices = invoices.filter((inv) => {
    if (!isOpenArInvoice(inv)) return false
    return getInvoiceOpenArBalance(inv, payments) > AMOUNT_EPSILON
  })
  const open_ar = openInvoices.reduce(
    (sum, inv) => sum + getInvoiceOpenArBalance(inv, payments),
    0
  )

  const bucketMap = new Map<string, ForecastBucket>()
  for (let i = 0; i < horizonDays; i++) {
    const d = addDays(asOfDate, i)
    const dateKey = toDateKey(d)
    const label =
      i === 0
        ? 'Today'
        : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    bucketMap.set(dateKey, { dateKey, label, amount: 0, invoice_count: 0 })
  }

  const forecasted: ForecastedInvoice[] = []

  for (const invoice of openInvoices) {
    const lag = brokerLag.get(invoice.broker_name) ?? 0
    const predicted_date = predictPaymentDate(invoice, lag, asOfDate)
    const days_until = daysBetween(toDateKey(asOfDate), predicted_date)
    const openBalance = getInvoiceOpenArBalance(invoice, payments)

    if (days_until < 0 || days_until >= horizonDays) continue

    const bucket = bucketMap.get(predicted_date)
    if (bucket) {
      bucket.amount += openBalance
      bucket.invoice_count += 1
    }

    forecasted.push({
      invoice_id: invoice.id,
      invoice_number: invoice.invoice_number,
      broker_name: invoice.broker_name,
      amount: openBalance,
      expected_date: invoice.expected_payment_date,
      predicted_date,
      days_until,
    })
  }

  const daily_buckets = [...bucketMap.values()]
  const next_7_days = daily_buckets.slice(0, 7).reduce((sum, b) => sum + b.amount, 0)
  const next_30_days = daily_buckets.reduce((sum, b) => sum + b.amount, 0)
  const forecasted_in_horizon = next_30_days

  const forecasted_7 = forecasted.filter((item) => item.days_until < 7)
  const broker_rows_7 = buildBrokerRows(forecasted_7, next_7_days)
  const broker_rows_30 = buildBrokerRows(forecasted, next_30_days)

  const top_invoices = forecasted
    .sort((a, b) => a.days_until - b.days_until || b.amount - a.amount)
    .slice(0, 6)

  return {
    horizon_days: horizonDays,
    next_7_days,
    next_30_days,
    open_ar,
    forecasted_in_horizon,
    beyond_horizon: Math.max(0, open_ar - forecasted_in_horizon),
    daily_buckets,
    broker_rows_7,
    broker_rows_30,
    top_invoices,
  }
}

/** Aggregate daily forecast buckets into weekly bars for chart display. */
export function aggregateForecastByWeek(
  buckets: ForecastBucket[]
): Array<{ label: string; amount: number; invoice_count: number }> {
  if (buckets.length <= 7) {
    return buckets.map((b) => ({
      label: b.label,
      amount: b.amount,
      invoice_count: b.invoice_count,
    }))
  }

  const weeks: Array<{ label: string; amount: number; invoice_count: number }> = []
  for (let i = 0; i < buckets.length; i += 7) {
    const slice = buckets.slice(i, i + 7)
    weeks.push({
      label: `Wk ${Math.floor(i / 7) + 1}`,
      amount: slice.reduce((sum, b) => sum + b.amount, 0),
      invoice_count: slice.reduce((sum, b) => sum + b.invoice_count, 0),
    })
  }
  return weeks
}

export type ForecastSparklinePoint = { amount: number }

/** Weekly forecast amounts for KPI sparkline (30-day horizon). */
export function getForecastSparklinePoints(
  forecast: CashCollectionForecast
): ForecastSparklinePoint[] {
  return aggregateForecastByWeek(forecast.daily_buckets).map((bucket) => ({
    amount: bucket.amount,
  }))
}
