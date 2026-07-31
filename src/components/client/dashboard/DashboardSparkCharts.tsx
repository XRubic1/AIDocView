import { useCallback, useEffect, useId, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
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
import { isOpenArInvoice } from '../../../utils/invoiceAging'
import { AMOUNT_EPSILON, getInvoiceOpenArBalance } from '../../../utils/paymentVariance'

export type ChartPeriod = 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom'

export type CustomDateRange = {
  start: string
  end: string
}

type DashboardSparkChartsProps = {
  invoices: Invoice[]
  payments: Payment[]
  period: ChartPeriod
  customRange: CustomDateRange
}

type SparkPoint = {
  i: number
  label: string
  /** Past collections — null on forecast buckets so the line ends cleanly. */
  a: number | null
  /** Invoiced (history) or unused. */
  b: number
  /** Upcoming forecast — null on history buckets. */
  forecast?: number | null
  phase?: 'past' | 'future'
}

type NamedBucket = {
  key: string
  label: string
  collected: number
  invoiced: number
  forecast: number
  /** Inclusive start / exclusive end for custom segment matching. */
  rangeStart?: string
  rangeEnd?: string
}

const PERIOD_COUNT = 6

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

function yearKey(dateStr: string): string {
  return dateStr.slice(0, 4)
}

/** Short timeline labels for axis ticks. */
function formatBucketLabel(key: string, period: ChartPeriod): string {
  if (period === 'yearly') return key
  if (period === 'monthly') {
    const [y, m] = key.split('-').map(Number)
    const d = new Date(y, (m || 1) - 1, 1)
    return d.toLocaleDateString('en-US', { month: 'short' })
  }
  // daily / weekly — calendar date
  const d = new Date(`${key}T12:00:00`)
  if (period === 'daily') {
    return d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' })
  }
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function emptyBucket(key: string, period: ChartPeriod): NamedBucket {
  return {
    key,
    label: formatBucketLabel(key, period),
    collected: 0,
    invoiced: 0,
    forecast: 0,
  }
}

function dayKey(dateStr: string): string {
  return dateStr.slice(0, 10)
}

function periodKeyFn(period: ChartPeriod): (dateStr: string) => string {
  if (period === 'daily' || period === 'custom') return dayKey
  if (period === 'weekly') return weekKey
  if (period === 'monthly') return monthKey
  return yearKey
}

function parseDay(dateStr: string): Date {
  return new Date(`${dateStr.slice(0, 10)}T12:00:00`)
}

function daysBetweenInclusive(start: string, end: string): number {
  const a = parseDay(start).getTime()
  const b = parseDay(end).getTime()
  return Math.max(1, Math.round((b - a) / (1000 * 60 * 60 * 24)) + 1)
}

function shortDayLabel(dateStr: string): string {
  const d = parseDay(dateStr)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/**
 * Split a calendar range into up to PERIOD_COUNT equal segments for custom charts.
 */
function buildCustomSegmentBuckets(start: string, end: string): NamedBucket[] {
  let from = parseDay(start)
  let to = parseDay(end)
  if (to.getTime() < from.getTime()) {
    const tmp = from
    from = to
    to = tmp
  }

  const totalDays = daysBetweenInclusive(toIsoDate(from), toIsoDate(to))
  const count = Math.min(PERIOD_COUNT, totalDays)
  const buckets: NamedBucket[] = []

  for (let i = 0; i < count; i++) {
    const segStartOffset = Math.floor((totalDays * i) / count)
    const segEndOffset = Math.floor((totalDays * (i + 1)) / count)
    const segStart = new Date(from)
    segStart.setDate(segStart.getDate() + segStartOffset)
    const segEnd = new Date(from)
    segEnd.setDate(segEnd.getDate() + segEndOffset)
    // last segment includes the end day
    const rangeEnd =
      i === count - 1
        ? toIsoDate(new Date(to.getTime() + 24 * 60 * 60 * 1000))
        : toIsoDate(segEnd)

    const key = toIsoDate(segStart)
    buckets.push({
      key,
      label: shortDayLabel(key),
      collected: 0,
      invoiced: 0,
      forecast: 0,
      rangeStart: key,
      rangeEnd,
    })
  }

  return buckets
}

function dateInBucket(dateStr: string, bucket: NamedBucket): boolean {
  const d = dateStr.slice(0, 10)
  if (bucket.rangeStart && bucket.rangeEnd) {
    return d >= bucket.rangeStart && d < bucket.rangeEnd
  }
  return d === bucket.key
}

function buildFallbackSeries(seed: number, period: ChartPeriod): SparkPoint[] {
  const labels =
    period === 'yearly'
      ? ['2019', '2020', '2021', '2022', '2023', '2024']
      : period === 'monthly'
        ? ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun']
        : period === 'weekly'
          ? ['Wk 1', 'Wk 2', 'Wk 3', 'Wk 4', 'Wk 5', 'Wk 6']
          : period === 'custom'
            ? ['1', '2', '3', '4', '5', '6']
            : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  return labels.map((label, i) => {
    const t = i / Math.max(1, labels.length - 1)
    const a =
      48 +
      Math.sin((t + seed) * Math.PI * 1.85) * 26 +
      Math.sin((t + seed) * Math.PI * 4.2) * 7
    const b =
      40 +
      Math.sin((t + seed * 1.35) * Math.PI * 1.55) * 20 +
      Math.cos((t + seed) * Math.PI * 3.1) * 9
    return { i, label, a: Math.max(10, a), b: Math.max(8, b) }
  })
}

/** Past window: last 6 weeks / months / years of collected + invoiced. */
function buildHistoricalBuckets(
  invoices: Invoice[],
  payments: Payment[],
  period: ChartPeriod,
  customRange: CustomDateRange,
  asOf = new Date()
): NamedBucket[] {
  const today = new Date(asOf)
  today.setHours(12, 0, 0, 0)
  const todayKey = toIsoDate(today)
  const buckets: NamedBucket[] = []

  if (period === 'custom') {
    const end = customRange.end <= todayKey ? customRange.end : todayKey
    const start = customRange.start <= end ? customRange.start : end
    if (start > todayKey) return []
    buckets.push(...buildCustomSegmentBuckets(start, end))
  } else if (period === 'daily') {
    for (let i = PERIOD_COUNT - 1; i >= 0; i--) {
      const d = new Date(today)
      d.setDate(d.getDate() - i)
      buckets.push(emptyBucket(toIsoDate(d), period))
    }
  } else if (period === 'weekly') {
    const thisWeek = startOfWeek(today)
    for (let i = PERIOD_COUNT - 1; i >= 0; i--) {
      const start = new Date(thisWeek)
      start.setDate(start.getDate() - i * 7)
      buckets.push(emptyBucket(toIsoDate(start), period))
    }
  } else if (period === 'monthly') {
    for (let i = PERIOD_COUNT - 1; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1)
      buckets.push(
        emptyBucket(
          `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
          period
        )
      )
    }
  } else {
    const year = today.getFullYear()
    for (let i = PERIOD_COUNT - 1; i >= 0; i--) {
      buckets.push(emptyBucket(String(year - i), period))
    }
  }

  if (period === 'custom') {
    for (const inv of invoices) {
      const bucket = buckets.find((b) => dateInBucket(inv.invoice_date, b))
      if (bucket) bucket.invoiced += inv.amount
    }
    for (const p of payments) {
      if (p.status !== 'confirmed') continue
      const bucket = buckets.find((b) => dateInBucket(p.received_date, b))
      if (bucket) bucket.collected += p.amount
    }
    return buckets
  }

  const index = new Map(buckets.map((b, i) => [b.key, i]))
  const keyFor = periodKeyFn(period)

  for (const inv of invoices) {
    const idx = index.get(keyFor(inv.invoice_date))
    if (idx !== undefined) buckets[idx].invoiced += inv.amount
  }
  for (const p of payments) {
    if (p.status !== 'confirmed') continue
    const idx = index.get(keyFor(p.received_date))
    if (idx !== undefined) buckets[idx].collected += p.amount
  }

  return buckets
}

/**
 * Forward window: next 6 weeks / months / years of open A/R
 * expected by broker net terms (`expected_payment_date`, fallback `due_date`).
 */
function buildForecastBuckets(
  invoices: Invoice[],
  payments: Payment[],
  period: ChartPeriod,
  customRange: CustomDateRange,
  asOf = new Date()
): NamedBucket[] {
  const today = new Date(asOf)
  today.setHours(12, 0, 0, 0)
  const todayKey = toIsoDate(today)
  const buckets: NamedBucket[] = []

  if (period === 'custom') {
    const start = customRange.start >= todayKey ? customRange.start : todayKey
    const end = customRange.end >= start ? customRange.end : start
    if (end < todayKey) return []
    buckets.push(...buildCustomSegmentBuckets(start, end))
  } else if (period === 'daily') {
    for (let i = 0; i < PERIOD_COUNT; i++) {
      const d = new Date(today)
      d.setDate(d.getDate() + i)
      buckets.push(emptyBucket(toIsoDate(d), period))
    }
  } else if (period === 'weekly') {
    const thisWeek = startOfWeek(today)
    for (let i = 0; i < PERIOD_COUNT; i++) {
      const start = new Date(thisWeek)
      start.setDate(start.getDate() + i * 7)
      buckets.push(emptyBucket(toIsoDate(start), period))
    }
  } else if (period === 'monthly') {
    for (let i = 0; i < PERIOD_COUNT; i++) {
      const d = new Date(today.getFullYear(), today.getMonth() + i, 1)
      buckets.push(
        emptyBucket(
          `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
          period
        )
      )
    }
  } else {
    const year = today.getFullYear()
    for (let i = 0; i < PERIOD_COUNT; i++) {
      buckets.push(emptyBucket(String(year + i), period))
    }
  }

  if (period === 'custom') {
    for (const inv of invoices) {
      if (!isOpenArInvoice(inv)) continue
      const balance = getInvoiceOpenArBalance(inv, payments)
      if (balance <= AMOUNT_EPSILON) continue
      const expected = inv.expected_payment_date || inv.due_date
      if (!expected) continue
      const bucket = buckets.find((b) => dateInBucket(expected, b))
      if (bucket) bucket.forecast += balance
    }
    return buckets
  }

  const index = new Map(buckets.map((b, i) => [b.key, i]))
  const keyFor = periodKeyFn(period)

  for (const inv of invoices) {
    if (!isOpenArInvoice(inv)) continue
    const balance = getInvoiceOpenArBalance(inv, payments)
    if (balance <= AMOUNT_EPSILON) continue

    const expected = inv.expected_payment_date || inv.due_date
    if (!expected) continue

    const idx = index.get(keyFor(expected))
    if (idx !== undefined) buckets[idx].forecast += balance
  }

  return buckets
}

type ChartMode = 'history' | 'forecast' | 'unified'

function ChartTooltip({
  active,
  payload,
  label,
  mode,
}: {
  active?: boolean
  payload?: Array<{ dataKey?: string | number; value?: number; color?: string }>
  label?: string | number
  mode: ChartMode
}) {
  if (!active || !payload?.length) return null

  const byKey = new Map(
    payload.map((p) => [String(p.dataKey), typeof p.value === 'number' ? p.value : 0])
  )

  const collected = byKey.get('a') ?? 0
  const forecast = byKey.get('forecast') ?? 0
  const showForecast =
    forecast > 0.01 && (collected <= 0.01 || Math.abs(forecast - collected) > 0.01)

  const rows =
    mode === 'unified'
      ? [
          ...(collected > 0.01
            ? [{ label: 'Collected', value: collected, color: '#1684FE' }]
            : []),
          ...(showForecast
            ? [{ label: 'Forecast', value: forecast, color: '#2DD4BF' }]
            : []),
        ]
      : mode === 'history'
        ? [
            { label: 'Collected', value: byKey.get('a') ?? 0, color: '#1684FE' },
            ...(byKey.has('b')
              ? [
                  {
                    label: 'Invoiced',
                    value: byKey.get('b') ?? 0,
                    color: 'rgba(203, 213, 225, 0.85)',
                  },
                ]
              : []),
          ]
        : [{ label: 'Forecast', value: byKey.get('a') ?? 0, color: '#2DD4BF' }]

  if (rows.length === 0) return null

  return (
    <div className="cd-spark-tooltip">
      {label != null ? <p className="cd-spark-tooltip__label">{label}</p> : null}
      {rows.map((row) => (
        <p key={row.label} className="cd-spark-tooltip__row">
          <span
            className={`cd-spark-tooltip__dot${row.label === 'Invoiced' || row.label === 'Forecast' ? ' is-dashed' : ''}`}
            style={{ background: row.color }}
            aria-hidden
          />
          <span>{row.label}</span>
          <strong className="tabular-nums">{formatCurrency(row.value)}</strong>
        </p>
      ))}
    </div>
  )
}

type SparkChartProps = {
  data: SparkPoint[]
  dual?: boolean
  primaryColor: string
  chartKey: string
  mode: ChartMode
  syncId: string
}

function SparkChart({
  data,
  dual = false,
  primaryColor,
  chartKey,
  mode,
  syncId,
}: SparkChartProps) {
  const uid = useId().replace(/:/g, '')
  const primaryGrad = `cd-spark-p-${uid}`
  const forecastGrad = `cd-spark-f-${uid}`
  // Flat $0 secondary series draws a hard baseline stroke — skip it.
  const showSecondary = dual && mode !== 'unified' && data.some((d) => d.b > 0.01)
  const showForecast =
    mode === 'unified' && data.some((d) => (d.forecast ?? 0) > 0.01)
  const isUnified = mode === 'unified'

  return (
    <div
      className="cd-spark"
      onMouseDown={(e) => {
        // Keep clicks from focusing the chart surface (white focus ring).
        e.preventDefault()
      }}
    >
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <AreaChart
          key={chartKey}
          data={data}
          syncId={syncId}
          syncMethod="index"
          accessibilityLayer={false}
          tabIndex={-1}
          style={{ outline: 'none', border: 'none' }}
          margin={{ top: 12, right: 0, left: 0, bottom: 2 }}
        >
          <defs>
            <linearGradient id={primaryGrad} x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="0%"
                stopColor={primaryColor}
                stopOpacity={isUnified || mode === 'history' ? 0.16 : 0.22}
              />
              <stop
                offset="55%"
                stopColor={primaryColor}
                stopOpacity={isUnified || mode === 'history' ? 0.04 : 0.06}
              />
              <stop offset="100%" stopColor={primaryColor} stopOpacity={0} />
            </linearGradient>
            <linearGradient id={forecastGrad} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2DD4BF" stopOpacity={0.14} />
              <stop offset="60%" stopColor="#2DD4BF" stopOpacity={0.03} />
              <stop offset="100%" stopColor="#2DD4BF" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="label"
            axisLine={false}
            tickLine={false}
            interval={0}
            height={28}
            tick={(props) => {
              const { x, y, payload, index } = props as {
                x: number
                y: number
                payload: { value: string }
                index: number
              }
              const isFirst = index === 0
              const isLast = index === data.length - 1
              return (
                <text
                  x={x}
                  y={y + 12}
                  textAnchor={isFirst ? 'start' : isLast ? 'end' : 'middle'}
                  fill="#64748b"
                  fontSize={11}
                  fontWeight={500}
                >
                  {payload.value}
                </text>
              )
            }}
          />
          <Tooltip
            content={<ChartTooltip mode={mode} />}
            cursor={{
              stroke: 'rgba(148, 163, 184, 0.28)',
              strokeWidth: 1,
              strokeDasharray: '3 4',
            }}
            isAnimationActive={false}
          />
          {/* Invoiced: thin dashed line only — keeps the top chart uncluttered */}
          {showSecondary ? (
            <Area
              type="monotone"
              dataKey="b"
              name="Invoiced"
              stroke="rgba(203, 213, 225, 0.7)"
              strokeWidth={1.5}
              strokeDasharray="5 4"
              fill="transparent"
              fillOpacity={0}
              baseLine={0}
              dot={false}
              activeDot={{
                r: 3.5,
                fill: 'rgba(203, 213, 225, 0.9)',
                stroke: 'none',
                strokeWidth: 0,
              }}
              isAnimationActive
              animationDuration={800}
            />
          ) : null}
          <Area
            type="monotone"
            dataKey="a"
            name="Collected"
            stroke={primaryColor}
            strokeWidth={isUnified || mode === 'history' ? 2.5 : 2.25}
            fill={`url(#${primaryGrad})`}
            fillOpacity={1}
            baseLine={0}
            connectNulls={false}
            dot={
              isUnified
                ? ((props: { cx?: number; cy?: number; payload?: SparkPoint }) => {
                    const { cx, cy, payload } = props
                    if (
                      payload?.phase !== 'past' ||
                      (payload.a ?? 0) <= 0.01 ||
                      cx == null ||
                      cy == null
                    ) {
                      return <g key={`dot-a-${payload?.i ?? 0}`} />
                    }
                    return (
                      <circle
                        key={`dot-a-${payload.i}`}
                        cx={cx}
                        cy={cy}
                        r={3.5}
                        fill={primaryColor}
                        stroke="none"
                      />
                    )
                  })
                : {
                    r: mode === 'history' ? 4 : 3.5,
                    fill: primaryColor,
                    stroke: 'none',
                    strokeWidth: 0,
                  }
            }
            activeDot={{
              r: 6,
              fill: primaryColor,
              stroke: 'none',
              strokeWidth: 0,
            }}
            isAnimationActive
            animationDuration={800}
          />
          {showForecast ? (
            <Area
              type="monotone"
              dataKey="forecast"
              name="Forecast"
              stroke="#2DD4BF"
              strokeWidth={2}
              strokeDasharray="5 4"
              fill={`url(#${forecastGrad})`}
              fillOpacity={1}
              baseLine={0}
              connectNulls={false}
              dot={false}
              activeDot={{
                r: 5,
                fill: '#2DD4BF',
                stroke: 'none',
                strokeWidth: 0,
              }}
              isAnimationActive
              animationDuration={800}
            />
          ) : null}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

/**
 * One trend chart: past collected (solid) + upcoming forecast (dashed).
 */
export default function DashboardSparkCharts({
  invoices,
  payments,
  period,
  customRange,
}: DashboardSparkChartsProps) {
  const { series, totals, rangeLabel } = useMemo(() => {
    const past = buildHistoricalBuckets(invoices, payments, period, customRange)
    const upcoming = buildForecastBuckets(invoices, payments, period, customRange)

    const collectedTotal = past.reduce((s, b) => s + b.collected, 0)
    const forecastTotal = upcoming.reduce((s, b) => s + b.forecast, 0)

    // Fold the overlapping current bucket into the last history point, then continue forward.
    const lastPastKey = past[past.length - 1]?.key
    const overlap = lastPastKey && upcoming[0]?.key === lastPastKey ? upcoming[0] : null
    const futureBuckets = overlap ? upcoming.slice(1) : upcoming

    const pastPoints: SparkPoint[] = past.map((b, i) => ({
      i,
      label: b.label,
      a: b.collected,
      b: 0,
      forecast: null as number | null,
      phase: 'past' as const,
    }))

    if (pastPoints.length > 0) {
      const anchor = pastPoints[pastPoints.length - 1]
      if (futureBuckets.length > 0) {
        // Same Y as collected so solid → dashed joins without a gap.
        anchor.forecast = typeof anchor.a === 'number' ? anchor.a : 0
      } else if (overlap && overlap.forecast > 0.01) {
        anchor.forecast = overlap.forecast
      }
    }

    const futurePoints: SparkPoint[] = futureBuckets.map((b, i) => ({
      i: pastPoints.length + i,
      label: b.label,
      a: null,
      b: 0,
      forecast: b.forecast,
      phase: 'future' as const,
    }))

    const series =
      pastPoints.length + futurePoints.length > 0
        ? [...pastPoints, ...futurePoints]
        : buildFallbackSeries(0.35, period).map((p) => ({
            ...p,
            forecast: null,
            phase: 'past' as const,
          }))

    const label =
      period === 'custom'
        ? `${customRange.start} → ${customRange.end}`
        : period === 'daily'
          ? '6 days past + next'
          : period === 'weekly'
            ? '6 weeks past + next'
            : period === 'monthly'
              ? '6 months past + next'
              : '6 years past + next'

    return {
      series,
      totals: { collected: collectedTotal, forecast: forecastTotal },
      rangeLabel: label,
    }
  }, [invoices, payments, period, customRange])

  return (
    <div className="cd-spark-stack cd-spark-stack--unified">
      <div className="cd-spark-block">
        <div className="cd-spark-metrics" aria-label="Trend totals">
          <div className="cd-spark-metric">
            <span className="cd-spark-metric__label">
              <i className="cd-spark-swatch cd-spark-swatch--collected" aria-hidden />
              Collected
            </span>
            <span className="cd-spark-metric__value tabular-nums cd-spark-metric__value--blue">
              {formatCurrency(totals.collected)}
            </span>
          </div>
          <div className="cd-spark-metric">
            <span className="cd-spark-metric__label-row">
              <span className="cd-spark-metric__label">
                <i className="cd-spark-swatch cd-spark-swatch--forecast" aria-hidden />
                Forecast
              </span>
              <span
                className="cd-spark-disclaimer-tip"
                tabIndex={0}
                aria-label={`Forecast uses broker net days — actual pay dates may differ. Range: ${rangeLabel}.`}
              >
                <span className="cd-spark-disclaimer-tip__icon" aria-hidden>
                  !
                </span>
                <span role="tooltip" className="cd-spark-disclaimer-tip__bubble">
                  Forecast uses broker net days — actual pay dates may differ.
                  Range: {rangeLabel}.
                </span>
              </span>
            </span>
            <span className="cd-spark-metric__value tabular-nums cd-spark-metric__value--teal">
              {formatCurrency(totals.forecast)}
            </span>
          </div>
        </div>
        <SparkChart
          chartKey={`unified-${period}-${customRange.start}-${customRange.end}`}
          data={series}
          mode="unified"
          syncId="cd-ar-charts"
          primaryColor="#1684FE"
        />
      </div>
    </div>
  )
}

const PERIODS: { id: ChartPeriod; label: string }[] = [
  { id: 'daily', label: 'Daily' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'monthly', label: 'Monthly' },
  { id: 'yearly', label: 'Yearly' },
  { id: 'custom', label: 'Custom' },
]

const PANEL_MIN = 280
const PANEL_MAX_RATIO = 0.72
const PANEL_DEFAULT = 420

function defaultCustomRange(): CustomDateRange {
  const end = new Date()
  end.setHours(12, 0, 0, 0)
  const start = new Date(end)
  start.setDate(start.getDate() - 14)
  const future = new Date(end)
  future.setDate(future.getDate() + 14)
  return { start: toIsoDate(start), end: toIsoDate(future) }
}

type DashboardChartsPanelProps = {
  invoices: Invoice[]
  payments: Payment[]
}

/**
 * Resizable right charts panel with period + custom date range control.
 */
export function DashboardChartsPanel({ invoices, payments }: DashboardChartsPanelProps) {
  const [period, setPeriod] = useState<ChartPeriod>('monthly')
  const [customRange, setCustomRange] = useState<CustomDateRange>(defaultCustomRange)
  const [width, setWidth] = useState(PANEL_DEFAULT)
  const dragging = useRef(false)
  const startX = useRef(0)
  const startWidth = useRef(PANEL_DEFAULT)

  const clampWidth = useCallback((next: number) => {
    const max = Math.floor(window.innerWidth * PANEL_MAX_RATIO)
    return Math.min(max, Math.max(PANEL_MIN, next))
  }, [])

  useEffect(() => {
    setWidth((w) => clampWidth(w))
    const onResize = () => setWidth((w) => clampWidth(w))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [clampWidth])

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!dragging.current) return
      const delta = startX.current - e.clientX
      setWidth(clampWidth(startWidth.current + delta))
    }
    const onUp = () => {
      if (!dragging.current) return
      dragging.current = false
      document.body.classList.remove('cd-charts-resizing')
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [clampWidth])

  const onHandlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    dragging.current = true
    startX.current = e.clientX
    startWidth.current = width
    document.body.classList.add('cd-charts-resizing')
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }

  return (
    <aside
      className="cd-charts-panel"
      aria-label="Charts"
      style={{ width, flex: `0 0 ${width}px` }}
    >
      <div
        className="cd-charts-panel__handle"
        role="separator"
        aria-orientation="vertical"
        aria-valuenow={Math.round(width)}
        aria-valuemin={PANEL_MIN}
        aria-label="Resize charts panel"
        tabIndex={0}
        onPointerDown={onHandlePointerDown}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') {
            e.preventDefault()
            setWidth((w) => clampWidth(w + 24))
          } else if (e.key === 'ArrowRight') {
            e.preventDefault()
            setWidth((w) => clampWidth(w - 24))
          }
        }}
      />

      <div className="cd-charts-panel__periods" role="tablist" aria-label="Chart range">
        {PERIODS.map((p) => (
          <button
            key={p.id}
            type="button"
            role="tab"
            aria-selected={period === p.id}
            className={`cd-charts-period${period === p.id ? ' is-active' : ''}`}
            onClick={() => setPeriod(p.id)}
          >
            {p.label}
          </button>
        ))}
      </div>

      {period === 'custom' ? (
        <div className="cd-charts-custom" aria-label="Custom date range">
          <label className="cd-charts-custom__field">
            <span>From</span>
            <input
              type="date"
              value={customRange.start}
              max={customRange.end}
              onChange={(e) =>
                setCustomRange((r) => ({ ...r, start: e.target.value || r.start }))
              }
            />
          </label>
          <label className="cd-charts-custom__field">
            <span>To</span>
            <input
              type="date"
              value={customRange.end}
              min={customRange.start}
              onChange={(e) =>
                setCustomRange((r) => ({ ...r, end: e.target.value || r.end }))
              }
            />
          </label>
        </div>
      ) : null}

      <div className="cd-charts-panel__body">
        <DashboardSparkCharts
          invoices={invoices}
          payments={payments}
          period={period}
          customRange={customRange}
        />
      </div>
    </aside>
  )
}
