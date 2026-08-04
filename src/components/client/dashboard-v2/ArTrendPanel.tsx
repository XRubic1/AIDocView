import { useId, useMemo, useState } from 'react'
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from 'recharts'
import type { Invoice } from '../../../types/invoice'
import type { Payment } from '../../../types/payment'
import { formatCurrency } from '../../../utils/format'
import { useTheme } from '../../../theme/ThemeContext'

type ChartPeriod = 'weekly' | 'monthly'

type AgingBuckets = {
  '1_15': number
  '16_30': number
  '31_45': number
  '46_60': number
  '61_90': number
  over_91: number
  total: number
}

type ArTrendPanelProps = {
  invoices: Invoice[]
  payments: Payment[]
  aging?: AgingBuckets
  loading?: boolean
}

type SparkPoint = { label: string; collected: number; invoiced: number }

const PERIOD_COUNT = 6

const AGING_BUCKETS = [
  { key: '1_15' as const, label: '1–15d', color: '#1684FE' },
  { key: '16_30' as const, label: '16–30d', color: '#38BDF8' },
  { key: '31_45' as const, label: '31–45d', color: '#A78BFA' },
  { key: '46_60' as const, label: '46–60d', color: '#FBBF24' },
  { key: '61_90' as const, label: '61–90d', color: '#FB923C' },
  { key: 'over_91' as const, label: '91+d', color: '#F87171' },
]

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function startOfWeek(d: Date): Date {
  const next = new Date(d)
  next.setHours(12, 0, 0, 0)
  const day = (next.getDay() + 6) % 7
  next.setDate(next.getDate() - day)
  return next
}

function weekKey(dateStr: string): string {
  return toIsoDate(startOfWeek(new Date(`${dateStr}T12:00:00`)))
}

function monthKey(dateStr: string): string {
  return dateStr.slice(0, 7)
}

/** Full short month names — never truncated to "Au". */
function formatBucketLabel(key: string, period: ChartPeriod): string {
  if (period === 'monthly') {
    const [y, m] = key.split('-').map(Number)
    const d = new Date(y, (m || 1) - 1, 1)
    return d.toLocaleDateString('en-US', { month: 'short' })
  }
  const d = new Date(`${key}T12:00:00`)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/** Past 6 weeks / months of collected + invoiced. */
function buildHistory(
  invoices: Invoice[],
  payments: Payment[],
  period: ChartPeriod
): SparkPoint[] {
  const today = new Date()
  today.setHours(12, 0, 0, 0)
  const buckets: Array<{ key: string; label: string; collected: number; invoiced: number }> = []

  if (period === 'weekly') {
    const thisWeek = startOfWeek(today)
    for (let i = PERIOD_COUNT - 1; i >= 0; i--) {
      const start = new Date(thisWeek)
      start.setDate(start.getDate() - i * 7)
      const key = toIsoDate(start)
      buckets.push({ key, label: formatBucketLabel(key, period), collected: 0, invoiced: 0 })
    }
  } else {
    for (let i = PERIOD_COUNT - 1; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      buckets.push({ key, label: formatBucketLabel(key, period), collected: 0, invoiced: 0 })
    }
  }

  const index = new Map(buckets.map((b, i) => [b.key, i]))
  const keyFor = period === 'weekly' ? weekKey : monthKey

  for (const inv of invoices) {
    const idx = index.get(keyFor(inv.invoice_date))
    if (idx !== undefined) buckets[idx].invoiced += inv.amount
  }
  for (const p of payments) {
    if (p.status !== 'confirmed') continue
    const idx = index.get(keyFor(p.received_date))
    if (idx !== undefined) buckets[idx].collected += p.amount
  }

  return buckets.map(({ label, collected, invoiced }) => ({ label, collected, invoiced }))
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{ dataKey?: string | number; value?: number }>
  label?: string | number
}) {
  if (!active || !payload?.length) return null
  const byKey = new Map(
    payload.map((p) => [String(p.dataKey), typeof p.value === 'number' ? p.value : 0])
  )
  return (
    <div className="cdv2-chart-tooltip">
      {label != null ? <p className="cdv2-chart-tooltip__label">{label}</p> : null}
      <p className="cdv2-chart-tooltip__row">
        <i className="cdv2-chart-tooltip__dot is-collected" aria-hidden />
        Collected
        <strong className="tabular-nums">{formatCurrency(byKey.get('collected') ?? 0)}</strong>
      </p>
      <p className="cdv2-chart-tooltip__row">
        <i className="cdv2-chart-tooltip__dot is-invoiced" aria-hidden />
        Invoiced
        <strong className="tabular-nums">{formatCurrency(byKey.get('invoiced') ?? 0)}</strong>
      </p>
    </div>
  )
}

/** Custom tick so month labels never clip to two letters. */
function AxisTick({
  x,
  y,
  payload,
  index,
  total,
  fill,
}: {
  x?: number
  y?: number
  payload?: { value: string }
  index?: number
  total: number
  fill: string
}) {
  if (x == null || y == null || !payload) return null
  const isFirst = index === 0
  const isLast = index === total - 1
  return (
    <text
      x={x}
      y={y + 12}
      textAnchor={isFirst ? 'start' : isLast ? 'end' : 'middle'}
      fill={fill}
      fontSize={11}
      fontWeight={500}
    >
      {payload.value}
    </text>
  )
}

/** Light/dark aging bar with a compact 2×3 legend. */
function SimpleAgingBar({ aging, loading }: { aging: AgingBuckets; loading: boolean }) {
  const total = aging.total > 0 ? aging.total : 0
  const current = aging['1_15'] + aging['16_30']
  const aged = Math.max(0, total - current)
  const segments = AGING_BUCKETS.map((b) => {
    const amount = aging[b.key] ?? 0
    const pct = total > 0 ? (amount / total) * 100 : 0
    return { ...b, amount, pct }
  })

  if (loading) {
    return (
      <div className="cdv2-aging is-loading" aria-label="Loading aging">
        <div className="cdv2-aging__bar" />
      </div>
    )
  }

  return (
    <div className="cdv2-aging" aria-label="Aging A/R">
      <div className="cdv2-aging__head">
        <h3 className="cdv2-aging__title">Aging A/R</h3>
        <div className="cdv2-aging__summary">
          <span>
            Current ≤30d <strong className="tabular-nums">{formatCurrency(current)}</strong>
          </span>
          <span className="cdv2-aging__aged">
            31+ days <strong className="tabular-nums">{formatCurrency(aged)}</strong>
          </span>
        </div>
      </div>
      <div className="cdv2-aging__bar" role="img" aria-label="A/R aging distribution">
        {total <= 0 ? (
          <span className="cdv2-aging__bar-empty" />
        ) : (
          segments.map((seg) =>
            seg.pct > 0 ? (
              <span
                key={seg.key}
                className="cdv2-aging__seg"
                style={{ width: `${seg.pct}%`, background: seg.color }}
                title={`${seg.label}: ${formatCurrency(seg.amount)}`}
              />
            ) : null
          )
        )}
      </div>
      <ul className="cdv2-aging__legend">
        {segments.map((seg) => (
          <li key={seg.key} className={seg.amount <= 0 ? 'is-zero' : undefined}>
            <i style={{ background: seg.color }} aria-hidden />
            <span className="cdv2-aging__legend-label">{seg.label}</span>
            <span className="cdv2-aging__legend-amt tabular-nums">{formatCurrency(seg.amount)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * Right column: collected vs invoiced trend (weekly/monthly) + aging bar.
 */
export default function ArTrendPanel({
  invoices,
  payments,
  aging,
  loading = false,
}: ArTrendPanelProps) {
  const [period, setPeriod] = useState<ChartPeriod>('monthly')
  const uid = useId().replace(/:/g, '')
  const gradId = `cdv2-grad-${uid}`
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'
  const invoicedStroke = isDark ? 'rgba(148, 163, 184, 0.55)' : '#94a3b8'
  const tickFill = isDark ? '#94a3b8' : '#64748b'
  const cursorStroke = isDark ? 'rgba(148, 163, 184, 0.35)' : '#cbd5e1'

  const { data, collectedTotal, invoicedTotal, hasSignal } = useMemo(() => {
    const points = buildHistory(invoices, payments, period)
    const collected = points.reduce((s, p) => s + p.collected, 0)
    const invoiced = points.reduce((s, p) => s + p.invoiced, 0)
    return {
      data: points,
      collectedTotal: collected,
      invoicedTotal: invoiced,
      hasSignal: collected > 0 || invoiced > 0,
    }
  }, [invoices, payments, period])

  return (
    <section className={`cdv2-trend${loading ? ' is-loading' : ''}`} aria-label="A/R trend">
      <header className="cdv2-trend__head">
        <h2 className="cdv2-trend__title">A/R trend</h2>
        <div className="cdv2-trend__periods" role="tablist" aria-label="Chart range">
          {(['weekly', 'monthly'] as const).map((p) => (
            <button
              key={p}
              type="button"
              role="tab"
              aria-selected={period === p}
              className={`cdv2-trend__period${period === p ? ' is-active' : ''}`}
              onClick={() => setPeriod(p)}
            >
              {p === 'weekly' ? 'Weekly' : 'Monthly'}
            </button>
          ))}
        </div>
      </header>

      {/* Explicit legend — solid = Collected, dashed = Invoiced */}
      <div className="cdv2-trend__legend" aria-label="Chart legend">
        <span className="cdv2-trend__legend-item">
          <i className="cdv2-trend__legend-line is-collected" aria-hidden />
          Collected
          <strong className="tabular-nums is-blue">
            {loading ? '—' : formatCurrency(collectedTotal)}
          </strong>
        </span>
        <span className="cdv2-trend__legend-item">
          <i className="cdv2-trend__legend-line is-invoiced" aria-hidden />
          Invoiced
          <strong className="tabular-nums">
            {loading ? '—' : formatCurrency(invoicedTotal)}
          </strong>
        </span>
      </div>

      <div className="cdv2-trend__chart">
        {!loading && !hasSignal ? (
          <p className="cdv2-trend__empty">No collections or invoices in this window yet.</p>
        ) : (
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <AreaChart
              data={data}
              margin={{ top: 8, right: 14, left: 14, bottom: 4 }}
              accessibilityLayer={false}
            >
              <defs>
                <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#1684FE" stopOpacity={0.18} />
                  <stop offset="100%" stopColor="#1684FE" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="label"
                axisLine={false}
                tickLine={false}
                interval={0}
                minTickGap={0}
                height={30}
                padding={{ left: 8, right: 8 }}
                tick={(props) => (
                  <AxisTick {...props} total={data.length} fill={tickFill} />
                )}
              />
              <Tooltip
                content={<ChartTooltip />}
                cursor={{ stroke: cursorStroke, strokeDasharray: '3 4' }}
              />
              <Area
                type="monotone"
                dataKey="invoiced"
                name="Invoiced"
                stroke={invoicedStroke}
                strokeWidth={1.75}
                strokeDasharray="5 4"
                fill="transparent"
                dot={false}
                isAnimationActive
                animationDuration={700}
              />
              <Area
                type="monotone"
                dataKey="collected"
                name="Collected"
                stroke="#1684FE"
                strokeWidth={2.25}
                fill={`url(#${gradId})`}
                dot={{ r: 3.5, fill: '#1684FE', stroke: 'none' }}
                activeDot={{ r: 5, fill: '#1684FE', stroke: 'none' }}
                isAnimationActive
                animationDuration={700}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {aging ? <SimpleAgingBar aging={aging} loading={loading} /> : null}
    </section>
  )
}
