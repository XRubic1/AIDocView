import { useMemo, useState } from 'react'
import { TrendingDown, TrendingUp, Minus } from 'lucide-react'
import type { Invoice } from '../../../types/invoice'
import type { Payment } from '../../../types/payment'
import { formatCurrency } from '../../../utils/format'

export type GrowthPeriod = 'week' | 'month' | 'year'

type AccountGrowthCardProps = {
  invoices: Invoice[]
  payments: Payment[]
  loading?: boolean
  /** Optional class for entrance animation (onboarding). */
  className?: string
}

type PeriodTotals = {
  collected: number
  invoiced: number
  paymentCount: number
  invoiceCount: number
}

const PERIODS: { id: GrowthPeriod; label: string; days: number }[] = [
  { id: 'week', label: 'Week', days: 7 },
  { id: 'month', label: 'Month', days: 30 },
  { id: 'year', label: 'Year', days: 365 },
]

function startOfDay(d: Date): Date {
  const next = new Date(d)
  next.setHours(0, 0, 0, 0)
  return next
}

function addDays(d: Date, days: number): Date {
  const next = new Date(d)
  next.setDate(next.getDate() + days)
  return next
}

function inRange(dateStr: string, start: Date, endExclusive: Date): boolean {
  const t = new Date(`${dateStr.slice(0, 10)}T12:00:00`).getTime()
  return t >= start.getTime() && t < endExclusive.getTime()
}

/** Sum collected / invoiced for an inclusive calendar window [start, endExclusive). */
function totalsInRange(
  invoices: Invoice[],
  payments: Payment[],
  start: Date,
  endExclusive: Date
): PeriodTotals {
  let collected = 0
  let paymentCount = 0
  for (const p of payments) {
    if (p.status !== 'confirmed') continue
    if (!inRange(p.received_date, start, endExclusive)) continue
    collected += p.amount
    paymentCount += 1
  }

  let invoiced = 0
  let invoiceCount = 0
  for (const inv of invoices) {
    if (!inRange(inv.invoice_date, start, endExclusive)) continue
    invoiced += inv.amount
    invoiceCount += 1
  }

  return { collected, invoiced, paymentCount, invoiceCount }
}

/** Percent change current vs previous; null when previous is zero. */
function pctChange(current: number, previous: number): number | null {
  if (previous <= 0.01) {
    if (current <= 0.01) return 0
    return null
  }
  return ((current - previous) / previous) * 100
}

function formatPct(pct: number | null): string {
  if (pct == null) return 'New'
  const rounded = Math.round(pct * 10) / 10
  const sign = rounded > 0 ? '+' : ''
  return `${sign}${rounded}%`
}

function trendTone(pct: number | null): 'up' | 'down' | 'flat' {
  if (pct == null) return 'up'
  if (pct > 1) return 'up'
  if (pct < -1) return 'down'
  return 'flat'
}

type MetricRowProps = {
  label: string
  current: number
  previous: number
  format?: 'money' | 'count'
}

/** One compact growth metric — value + delta on one row. */
function MetricRow({ label, current, previous, format = 'money' }: MetricRowProps) {
  const pct = pctChange(current, previous)
  const tone = trendTone(pct)
  const TrendIcon = tone === 'up' ? TrendingUp : tone === 'down' ? TrendingDown : Minus

  return (
    <div className={`cd-growth__metric tone-${tone}`}>
      <div className="cd-growth__metric-top">
        <span className="cd-growth__metric-label">{label}</span>
        <span className={`cd-growth__delta tone-${tone}`}>
          <TrendIcon size={11} strokeWidth={2.5} aria-hidden />
          <span className="tabular-nums">{formatPct(pct)}</span>
        </span>
      </div>
      <p className="cd-growth__metric-value tabular-nums">
        {format === 'money' ? formatCurrency(current) : current.toLocaleString()}
      </p>
    </div>
  )
}

/**
 * Quick account growth overview under Open Balance —
 * Week / Month / Year filters compare the latest window to the one before it.
 */
export default function AccountGrowthCard({
  invoices,
  payments,
  loading = false,
  className,
}: AccountGrowthCardProps) {
  const [period, setPeriod] = useState<GrowthPeriod>('month')

  const { current, previous, periodLabel, compareLabel } = useMemo(() => {
    const days = PERIODS.find((p) => p.id === period)?.days ?? 30
    const today = startOfDay(new Date())
    const currentEnd = addDays(today, 1) // include today
    const currentStart = addDays(currentEnd, -days)
    const previousEnd = currentStart
    const previousStart = addDays(previousEnd, -days)

    return {
      current: totalsInRange(invoices, payments, currentStart, currentEnd),
      previous: totalsInRange(invoices, payments, previousStart, previousEnd),
      periodLabel:
        period === 'week' ? 'Last 7 days' : period === 'month' ? 'Last 30 days' : 'Last 12 months',
      compareLabel:
        period === 'week'
          ? 'vs prior week'
          : period === 'month'
            ? 'vs prior month'
            : 'vs prior year',
    }
  }, [invoices, payments, period])

  const collectionRate =
    current.invoiced > 0.01 ? Math.min(999, (current.collected / current.invoiced) * 100) : null
  const prevCollectionRate =
    previous.invoiced > 0.01 ? Math.min(999, (previous.collected / previous.invoiced) * 100) : null

  if (loading) {
    return (
      <section
        className={`cd-growth is-loading${className ? ` ${className}` : ''}`}
        aria-label="Loading account growth"
      >
        <header className="cd-growth__head">
          <h2 className="cd-growth__title">Account overview</h2>
        </header>
        <p className="cd-growth__loading">Loading growth…</p>
      </section>
    )
  }

  return (
    <section
      className={`cd-growth${className ? ` ${className}` : ''}`}
      aria-label="Account growth overview"
    >      <header className="cd-growth__head">
        <div className="cd-growth__head-text">
          <h2 className="cd-growth__title">Account overview</h2>
          <p className="cd-growth__subtitle">
            {periodLabel} · {compareLabel}
          </p>
        </div>
        <div className="cd-growth__filters" role="tablist" aria-label="Growth period">
          {PERIODS.map((p) => (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={period === p.id}
              className={`cd-growth__filter${period === p.id ? ' is-active' : ''}`}
              onClick={() => setPeriod(p.id)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </header>

      <div className="cd-growth__grid">
        <MetricRow label="Collected" current={current.collected} previous={previous.collected} />
        <MetricRow label="Invoiced" current={current.invoiced} previous={previous.invoiced} />
        <MetricRow
          label="Payments"
          current={current.paymentCount}
          previous={previous.paymentCount}
          format="count"
        />
        <MetricRow
          label="Invoices"
          current={current.invoiceCount}
          previous={previous.invoiceCount}
          format="count"
        />
      </div>

      {collectionRate != null ? (
        <div className="cd-growth__rate">
          <span className="cd-growth__rate-label">Collection rate</span>
          <div
            className="cd-growth__rate-bar"
            role="img"
            aria-label={`Collection rate ${Math.round(collectionRate)} percent`}
          >
            <span
              className="cd-growth__rate-fill"
              style={{ width: `${Math.min(100, collectionRate)}%` }}
            />
          </div>
          <span className="cd-growth__rate-value tabular-nums">
            {Math.round(collectionRate * 10) / 10}%
            {prevCollectionRate != null ? (
              <span className="cd-growth__rate-prev">
                {' '}
                · was {Math.round(prevCollectionRate * 10) / 10}%
              </span>
            ) : null}
          </span>
        </div>
      ) : null}
    </section>
  )
}
