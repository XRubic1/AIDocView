import { useCallback, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { CalendarDays, ChevronDown } from 'lucide-react'
import type { Invoice } from '../../../types/invoice'
import type { Payment } from '../../../types/payment'
import { formatCurrency, formatDate } from '../../../utils/format'
import { AMOUNT_EPSILON, getInvoiceOpenArBalance } from '../../../utils/paymentVariance'
import { hasBrokerConfirmedPayDate } from '../../../utils/clientCashWindows'
import { isOpenArInvoice } from '../../../utils/invoiceAging'
import { getPresetRange } from '../../../utils/clientReports'
import DesktopDateRangeDropdown from './DesktopDateRangeDropdown'

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

type CashCollectedPanelProps = {
  invoices: Invoice[]
  payments: Payment[]
  aging?: AgingBuckets
  loading?: boolean
}

type SparkPoint = {
  label: string
  /** Confirmed collections in the period. */
  collected: number
  /** Open A/R expected to land in the period (current + next only). */
  forecast: number
  invoiced: number
  /** Sum for top labels / Y-axis sense. */
  total: number
  /** Tallest series in the month — drives a single centered bar band. */
  chartMax: number
  isCurrent: boolean
  /** Pure forecast bar (next period only — no confirmed yet). */
  isNext: boolean
}

const HISTORY_COUNT = 12
/** Safety cap so a huge custom range doesn't drown the chart. */
const MAX_MONTH_BUCKETS = 24
const MAX_WEEK_BUCKETS = 26

type DatePresetId = 'all' | '30d' | '90d' | 'ytd' | 'custom'

const AGING_BUCKETS = [
  { key: '1_15' as const, mark: '0–15', color: '#1684FE' },
  { key: '16_30' as const, mark: '16–30', color: '#3B9AFE' },
  { key: '31_45' as const, mark: '31–45', color: '#7BB8FE' },
  { key: '46_60' as const, mark: '46–60', color: '#94A3B8' },
  { key: '61_90' as const, mark: '61–90', color: '#64748B' },
  { key: 'over_91' as const, mark: '91+', color: '#D14343' },
]

function formatAxisUsd(value: number): string {
  if (value === 0) return '$0'
  if (Math.abs(value) >= 1000) return `$${Math.round(value / 1000)}k`
  return `$${Math.round(value)}`
}

function formatBarLabel(amount: number): string {
  if (amount <= 0) return ''
  if (amount >= 10_000) return `$${(amount / 1000).toFixed(0)}k`
  if (amount >= 1000) return `$${(amount / 1000).toFixed(1)}k`
  return formatCurrency(amount)
}

function formatAgingTick(amount: number): string {
  if (amount <= 0) return '—'
  if (amount >= 10_000) return `$${(amount / 1000).toFixed(0)}k`
  if (amount >= 1000) return `$${(amount / 1000).toFixed(1)}k`
  return formatCurrency(amount)
}

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

function formatBucketLabel(key: string, period: ChartPeriod): string {
  if (period === 'monthly') {
    const [y, m] = key.split('-').map(Number)
    const d = new Date(y, (m || 1) - 1, 1)
    return d.toLocaleDateString('en-US', { month: 'short' })
  }
  const d = new Date(`${key}T12:00:00`)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/** Expected remittance day for open A/R — Will Pay date wins over due date. */
function expectedCollectDay(inv: Invoice): string | null {
  if (hasBrokerConfirmedPayDate(inv) && inv.collection_date) {
    return inv.collection_date.slice(0, 10)
  }
  if (inv.expected_payment_date) return inv.expected_payment_date.slice(0, 10)
  if (inv.due_date) return inv.due_date.slice(0, 10)
  return null
}

/** Open A/R expected to land inside a calendar month / week key. */
function forecastForBucket(
  invoices: Invoice[],
  payments: Payment[],
  period: ChartPeriod,
  bucketKey: string
): number {
  let total = 0
  for (const inv of invoices) {
    if (!isOpenArInvoice(inv)) continue
    if (inv.status !== 'approved' && inv.status !== 'hold') continue
    const balance = getInvoiceOpenArBalance(inv, payments)
    if (balance <= AMOUNT_EPSILON) continue
    const day = expectedCollectDay(inv)
    if (!day) continue
    const key = period === 'weekly' ? weekKey(day) : monthKey(day)
    if (key === bucketKey) total += balance
  }
  return total
}

function buildHistory(
  invoices: Invoice[],
  payments: Payment[],
  period: ChartPeriod,
  rangeFrom: string,
  rangeTo: string
): SparkPoint[] {
  const today = new Date()
  today.setHours(12, 0, 0, 0)

  const fromDate = parseIsoLocal(rangeFrom)
  const toDate = parseIsoLocal(rangeTo)

  const buckets: Array<{
    key: string
    label: string
    collected: number
    forecast: number
    invoiced: number
    isCurrent: boolean
    isNext: boolean
  }> = []

  if (period === 'weekly') {
    const endWeek = startOfWeek(toDate ?? today)
    let startWeek = startOfWeek(
      fromDate ?? new Date(today.getFullYear(), today.getMonth(), today.getDate() - (HISTORY_COUNT - 1) * 7)
    )
    // Cap length
    const maxStart = new Date(endWeek)
    maxStart.setDate(maxStart.getDate() - (MAX_WEEK_BUCKETS - 1) * 7)
    if (startWeek < maxStart) startWeek = startOfWeek(maxStart)

    const currentKey = toIsoDate(startOfWeek(today))
    for (let cursor = new Date(startWeek); cursor <= endWeek; cursor.setDate(cursor.getDate() + 7)) {
      const key = toIsoDate(cursor)
      buckets.push({
        key,
        label: formatBucketLabel(key, period),
        collected: 0,
        forecast: 0,
        invoiced: 0,
        isCurrent: key === currentKey,
        isNext: false,
      })
    }
    const nextStart = new Date(startOfWeek(today))
    nextStart.setDate(nextStart.getDate() + 7)
    const nextKey = toIsoDate(nextStart)
    if (!buckets.some((b) => b.key === nextKey)) {
      buckets.push({
        key: nextKey,
        label: formatBucketLabel(nextKey, period),
        collected: 0,
        forecast: 0,
        invoiced: 0,
        isCurrent: false,
        isNext: true,
      })
    } else {
      const existing = buckets.find((b) => b.key === nextKey)
      if (existing) {
        existing.isNext = true
        existing.isCurrent = false
      }
    }
  } else {
    const endMonth = new Date((toDate ?? today).getFullYear(), (toDate ?? today).getMonth(), 1)
    let startMonth = fromDate
      ? new Date(fromDate.getFullYear(), fromDate.getMonth(), 1)
      : new Date(today.getFullYear(), today.getMonth() - (HISTORY_COUNT - 1), 1)
    const maxStart = new Date(endMonth.getFullYear(), endMonth.getMonth() - (MAX_MONTH_BUCKETS - 1), 1)
    if (startMonth < maxStart) startMonth = maxStart

    const currentKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
    for (
      let cursor = new Date(startMonth);
      cursor <= endMonth;
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)
    ) {
      const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`
      buckets.push({
        key,
        label: formatBucketLabel(key, period),
        collected: 0,
        forecast: 0,
        invoiced: 0,
        isCurrent: key === currentKey,
        isNext: false,
      })
    }
    const next = new Date(today.getFullYear(), today.getMonth() + 1, 1)
    const nextKey = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`
    if (!buckets.some((b) => b.key === nextKey)) {
      buckets.push({
        key: nextKey,
        label: formatBucketLabel(nextKey, period),
        collected: 0,
        forecast: 0,
        invoiced: 0,
        isCurrent: false,
        isNext: true,
      })
    } else {
      const existing = buckets.find((b) => b.key === nextKey)
      if (existing) {
        existing.isNext = true
        existing.isCurrent = false
      }
    }
  }

  const index = new Map(buckets.map((b, i) => [b.key, i]))
  const keyFor = period === 'weekly' ? weekKey : monthKey

  for (const inv of invoices) {
    const idx = index.get(keyFor(inv.invoice_date))
    if (idx !== undefined && !buckets[idx].isNext) {
      buckets[idx].invoiced += inv.amount
    }
  }
  for (const p of payments) {
    if (p.status !== 'confirmed') continue
    const idx = index.get(keyFor(p.received_date))
    if (idx !== undefined && !buckets[idx].isNext) {
      buckets[idx].collected += p.amount
    }
  }

  for (const bucket of buckets) {
    if (bucket.isCurrent || bucket.isNext) {
      bucket.forecast = forecastForBucket(invoices, payments, period, bucket.key)
    }
  }

  return buckets.map(({ label, collected, forecast, invoiced, isCurrent, isNext }) => {
    const total = collected + forecast
    return {
      label,
      collected,
      forecast,
      invoiced,
      total,
      chartMax: Math.max(invoiced, total),
      isCurrent,
      isNext,
    }
  })
}

function parseIsoLocal(iso: string): Date | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{ dataKey?: string | number; value?: number; payload?: SparkPoint }>
  label?: string | number
}) {
  if (!active || !payload?.length) return null
  const point = payload[0]?.payload
  if (!point) return null
  const collected = point.collected
  const forecast = point.forecast
  const isNext = point.isNext
  const isCurrent = point.isCurrent

  return (
    <div className="cdv3-cash__tooltip">
      {label != null ? (
        <p className="cdv3-cash__tooltip-label">
          {label}
          {isNext ? ' · Forecast' : isCurrent ? ' · In progress' : ''}
        </p>
      ) : null}
      {!isNext ? (
        <p className="cdv3-cash__tooltip-row">
          <i className="is-collected" aria-hidden />
          Collected
          <strong className="tabular-nums">{formatCurrency(collected)}</strong>
        </p>
      ) : null}
      {forecast > 0 || isNext ? (
        <p className="cdv3-cash__tooltip-row">
          <i className="is-forecast" aria-hidden />
          Forecast
          <strong className="tabular-nums">{formatCurrency(forecast)}</strong>
        </p>
      ) : null}
      {(collected > 0 && forecast > 0) || (isCurrent && forecast > 0) ? (
        <p className="cdv3-cash__tooltip-row">
          <i className="is-invoiced" aria-hidden />
          Total expected
          <strong className="tabular-nums">{formatCurrency(collected + forecast)}</strong>
        </p>
      ) : null}
      {!isNext ? (
        <p className="cdv3-cash__tooltip-row">
          <i className="is-invoiced" aria-hidden />
          Invoiced
          <strong className="tabular-nums">{formatCurrency(point.invoiced)}</strong>
        </p>
      ) : null}
    </div>
  )
}

const BAR_GAP = 4
const CASH_BAR_WIDTH = 34
const INVOICED_BAR_WIDTH = 18

type BarShapeProps = {
  x?: number
  y?: number
  width?: number
  height?: number
  payload?: SparkPoint
}

/**
 * One Recharts series → one centered category band. We draw invoiced /
 * collected / forecast ourselves so a lone bar sits on the month label.
 */
function makeMonthBarShape(hatchFill: string) {
  return function MonthBarShape(props: BarShapeProps) {
    const { x = 0, y = 0, width = 0, height = 0, payload } = props
    if (!payload || width <= 0 || height <= 0) return null

    const invoiced = payload.invoiced ?? 0
    const collected = payload.collected ?? 0
    const forecast = payload.forecast ?? 0
    const cash = collected + forecast
    const chartMax = Math.max(payload.chartMax ?? 0, invoiced, cash)
    if (chartMax <= 0) return null

    const baseline = y + height
    const toH = (value: number) => (value / chartMax) * height
    const hasInvoiced = invoiced > 0
    const hasCash = cash > 0
    const nodes: ReactNode[] = []

    if (hasInvoiced && hasCash) {
      const invW = Math.min(INVOICED_BAR_WIDTH, width * 0.4)
      const cashW = Math.min(CASH_BAR_WIDTH, width - invW - BAR_GAP)
      const pairW = invW + BAR_GAP + cashW
      const startX = x + (width - pairW) / 2

      const invH = toH(invoiced)
      nodes.push(
        <rect
          key="inv"
          x={startX}
          y={baseline - invH}
          width={invW}
          height={invH}
          fill="#E7EBEC"
          rx={6}
          ry={6}
        />,
      )

      const colH = toH(collected)
      const fcsH = toH(forecast)
      const cashX = startX + invW + BAR_GAP
      if (colH > 0) {
        nodes.push(
          <rect
            key="col"
            x={cashX}
            y={baseline - colH}
            width={cashW}
            height={colH}
            fill="#2FA98C"
          />,
        )
      }
      if (fcsH > 0) {
        nodes.push(
          <rect
            key="fcs"
            x={cashX}
            y={baseline - colH - fcsH}
            width={cashW}
            height={fcsH}
            fill={hatchFill}
            rx={8}
            ry={8}
          />,
        )
      }
    } else if (hasCash) {
      const barW = Math.min(CASH_BAR_WIDTH, width)
      const barX = x + (width - barW) / 2
      const colH = toH(collected)
      const fcsH = toH(forecast)
      if (colH > 0) {
        nodes.push(
          <rect
            key="col"
            x={barX}
            y={baseline - colH}
            width={barW}
            height={colH}
            fill="#2FA98C"
            rx={fcsH > 0 ? 0 : 8}
            ry={fcsH > 0 ? 0 : 8}
          />,
        )
      }
      if (fcsH > 0) {
        nodes.push(
          <rect
            key="fcs"
            x={barX}
            y={baseline - colH - fcsH}
            width={barW}
            height={fcsH}
            fill={hatchFill}
            rx={8}
            ry={8}
          />,
        )
      }
    } else if (hasInvoiced) {
      const barW = Math.min(INVOICED_BAR_WIDTH, width)
      const barX = x + (width - barW) / 2
      const invH = toH(invoiced)
      nodes.push(
        <rect
          key="inv"
          x={barX}
          y={baseline - invH}
          width={barW}
          height={invH}
          fill="#E7EBEC"
          rx={6}
          ry={6}
        />,
      )
    }

    return <g>{nodes}</g>
  }
}

function CashBarLabel(props: {
  x?: number
  y?: number
  width?: number
  value?: number
  payload?: SparkPoint
}) {
  const { x = 0, y = 0, width = 0, payload } = props
  const total = payload?.total ?? 0
  if (total <= 0) return null

  return (
    <text
      x={x + width / 2}
      y={y - 6}
      textAnchor="middle"
      fill="#4B5D63"
      fontSize={11}
      fontWeight={600}
    >
      {formatBarLabel(total)}
    </text>
  )
}

/** Tiny ▲ under the current month — head only, soft bounce. */
function MonthAxisTick({
  x,
  y,
  payload,
  currentLabel,
}: {
  x?: number
  y?: number
  payload?: { value: string }
  currentLabel?: string
}) {
  if (x == null || y == null || !payload) return null
  const isCurrent = Boolean(currentLabel && payload.value === currentLabel)
  return (
    <g transform={`translate(${x},${y})`}>
      <text
        x={0}
        y={12}
        textAnchor="middle"
        fill={isCurrent ? '#1684FE' : '#4B5D63'}
        fontSize={12}
        fontWeight={isCurrent ? 700 : 600}
      >
        {payload.value}
      </text>
      {isCurrent ? (
        <g transform="translate(0, 18)" aria-hidden>
          <g className="cdv3-cash__now-arrow">
            <polygon points="0,0 -3.2,5 3.2,5" fill="#1684FE" />
          </g>
        </g>
      ) : null}
    </g>
  )
}

/**
 * Waitlist-branded cash chart — 12 months collected + forecast for this month
 * (stacked hatched) and next month (hatched only).
 */
export default function CashCollectedPanel({
  invoices,
  payments,
  aging,
  loading = false,
}: CashCollectedPanelProps) {
  const [period, setPeriod] = useState<ChartPeriod>('monthly')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [dateMenuOpen, setDateMenuOpen] = useState(false)
  const dateTriggerRef = useRef<HTMLButtonElement>(null)
  const uid = useId().replace(/:/g, '')
  const hatchId = `cdv3-hatch-${uid}`
  const monthBarShape = useMemo(
    () => makeMonthBarShape(`url(#${hatchId})`),
    [hatchId],
  )

  const matchesDatePreset = useCallback(
    (preset: '30d' | '90d' | 'ytd') => {
      const range = getPresetRange(preset)
      return dateFrom === range.start_date && dateTo === range.end_date
    },
    [dateFrom, dateTo]
  )

  const applyDatePreset = useCallback((preset: '30d' | '90d' | 'ytd' | 'all') => {
    if (preset === 'all') {
      setDateFrom('')
      setDateTo('')
      return
    }
    const range = getPresetRange(preset)
    setDateFrom(range.start_date)
    setDateTo(range.end_date)
  }, [])

  const dateRangeValue = useMemo((): DatePresetId => {
    if (!dateFrom && !dateTo) return 'all'
    if (matchesDatePreset('30d')) return '30d'
    if (matchesDatePreset('90d')) return '90d'
    if (matchesDatePreset('ytd')) return 'ytd'
    return 'custom'
  }, [dateFrom, dateTo, matchesDatePreset])

  const dateRangeLabel = useMemo(() => {
    if (dateRangeValue === 'all') {
      return period === 'monthly' ? 'Last 12 months' : 'Last 12 weeks'
    }
    if (dateRangeValue === '30d') return 'Last 30d'
    if (dateRangeValue === '90d') return 'Last 90d'
    if (dateRangeValue === 'ytd') return 'YTD'
    if (dateFrom && dateTo) return `${formatDate(dateFrom)} – ${formatDate(dateTo)}`
    if (dateFrom) return `From ${formatDate(dateFrom)}`
    if (dateTo) return `Until ${formatDate(dateTo)}`
    return 'Custom'
  }, [dateRangeValue, dateFrom, dateTo, period])

  const {
    data,
    collectedTotal,
    invoicedTotal,
    currentCollected,
    currentForecast,
    nextForecast,
    hasSignal,
    historyCount,
  } = useMemo(() => {
    const points = buildHistory(invoices, payments, period, dateFrom, dateTo)
    const historical = points.filter((p) => !p.isNext)
    const current = points.find((p) => p.isCurrent)
    const next = points.find((p) => p.isNext)
    const collected = historical.reduce((s, p) => s + p.collected, 0)
    const invoiced = historical.reduce((s, p) => s + p.invoiced, 0)
    return {
      data: points,
      collectedTotal: collected,
      invoicedTotal: invoiced,
      currentCollected: current?.collected ?? 0,
      currentForecast: current?.forecast ?? 0,
      nextForecast: next?.forecast ?? 0,
      historyCount: historical.length,
      hasSignal:
        collected > 0 ||
        invoiced > 0 ||
        (current?.forecast ?? 0) > 0 ||
        (next?.forecast ?? 0) > 0,
    }
  }, [invoices, payments, period, dateFrom, dateTo])

  const mom = useMemo(() => {
    const historical = data.filter((p) => !p.isNext)
    const last = historical[historical.length - 1]?.collected ?? 0
    const prev = historical[historical.length - 2]?.collected ?? 0
    if (prev <= 0 && last <= 0) return { pct: 0, dir: 'flat' as const }
    if (prev <= 0) return { pct: 100, dir: 'up' as const }
    const pct = Math.round(((last - prev) / prev) * 100)
    if (pct > 2) return { pct, dir: 'up' as const }
    if (pct < -2) return { pct: Math.abs(pct), dir: 'down' as const }
    return { pct: Math.abs(pct), dir: 'flat' as const }
  }, [data])

  const agingSegments = useMemo(() => {
    if (!aging) return []
    const total = aging.total > 0 ? aging.total : 0
    return AGING_BUCKETS.map((b) => {
      const amount = aging[b.key] ?? 0
      const pct = total > 0 ? (amount / total) * 100 : 0
      return { ...b, amount, pct }
    })
  }, [aging])

  const agingCurrent = aging ? aging['1_15'] + aging['16_30'] : 0
  const agingAged = aging ? Math.max(0, aging.total - agingCurrent) : 0
  const unit = period === 'monthly' ? 'month' : 'week'
  const currentLabel = data.find((p) => p.isCurrent)?.label

  return (
    <section className={`cdv3-cash${loading ? ' is-loading' : ''}`} aria-label="Cash collected">
      <div className="cdv3-cash__main">
        <header className="cdv3-cash__head">
          <div className="cdv3-cash__titles">
            <h2 className="cdv3-cash__title">Cash collected</h2>
            <button
              type="button"
              ref={dateTriggerRef}
              className={`mobile-payments-date__trigger cdv3-cash__date-trigger${
                dateRangeValue !== 'all' ? ' is-active' : ''
              }${dateMenuOpen ? ' is-open' : ''}`}
              aria-haspopup="dialog"
              aria-expanded={dateMenuOpen}
              onClick={() => setDateMenuOpen((open) => !open)}
            >
              <CalendarDays size={14} strokeWidth={2.25} aria-hidden />
              <span className="mobile-payments-date__label">{dateRangeLabel}</span>
              <ChevronDown
                size={14}
                strokeWidth={2.25}
                className={`cdv3-cash__date-chevron${dateMenuOpen ? ' is-open' : ''}`}
                aria-hidden
              />
            </button>
          </div>
          <div className="cdv3-cash__periods" role="tablist" aria-label="Chart range">
            {(['weekly', 'monthly'] as const).map((p) => (
              <button
                key={p}
                type="button"
                role="tab"
                aria-selected={period === p}
                className={`cdv3-cash__period${period === p ? ' is-active' : ''}`}
                onClick={() => setPeriod(p)}
              >
                {p === 'weekly' ? 'Weekly' : 'Monthly'}
              </button>
            ))}
          </div>
        </header>

        <DesktopDateRangeDropdown
          anchorRef={dateTriggerRef}
          open={dateMenuOpen}
          activeValue={dateRangeValue}
          dateFrom={dateFrom}
          dateTo={dateTo}
          onApplyPreset={applyDatePreset}
          onChangeFrom={setDateFrom}
          onChangeTo={setDateTo}
          onClose={() => setDateMenuOpen(false)}
          allLabel={period === 'monthly' ? '12 mo' : '12 wk'}
        />

        <div className="cdv3-cash__layout">
          <div className="cdv3-cash__chart">
            {!loading && !hasSignal ? (
              <p className="cdv3-cash__empty">No collections or invoices in this window yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <BarChart
                  data={data}
                  margin={{ top: 22, right: 8, left: 0, bottom: 4 }}
                  barCategoryGap="18%"
                  barGap={BAR_GAP}
                  accessibilityLayer={false}
                >
                  <defs>
                    <pattern
                      id={hatchId}
                      patternUnits="userSpaceOnUse"
                      width="6"
                      height="6"
                      patternTransform="rotate(45)"
                    >
                      <rect width="6" height="6" fill="#C8EDE6" />
                      <line
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="6"
                        stroke="#2FA98C"
                        strokeWidth="2.5"
                        strokeOpacity="0.55"
                      />
                    </pattern>
                  </defs>
                  <CartesianGrid vertical={false} stroke="#E7EBEC" strokeDasharray="0" />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    width={42}
                    tickCount={4}
                    tick={{ fill: '#85959A', fontSize: 11, fontWeight: 500 }}
                    tickFormatter={formatAxisUsd}
                  />
                  <XAxis
                    dataKey="label"
                    axisLine={false}
                    tickLine={false}
                    interval={0}
                    height={36}
                    tick={(props) => (
                      <MonthAxisTick {...props} currentLabel={currentLabel} />
                    )}
                  />
                  <Tooltip
                    content={<ChartTooltip />}
                    cursor={{ fill: 'rgba(22, 132, 254, 0.06)' }}
                  />
                  <Bar
                    dataKey="chartMax"
                    fill="transparent"
                    maxBarSize={52}
                    shape={monthBarShape}
                    isAnimationActive={false}
                  >
                    <LabelList dataKey="total" content={CashBarLabel} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          <aside className="cdv3-cash__aside" aria-label="Cash summary">
            <p className="cdv3-cash__aside-label">This {unit}</p>
            <p className="cdv3-cash__aside-amount tabular-nums is-collected">
              {loading ? '—' : formatCurrency(currentCollected)}
            </p>
            {!loading ? (
              <p className={`cdv3-cash__aside-mom is-${mom.dir}`}>
                Collected · {mom.dir === 'up' ? '▲' : mom.dir === 'down' ? '▼' : '→'} {mom.pct}%
                vs prior
              </p>
            ) : null}
            <div className="cdv3-cash__aside-cards">
              <div className="cdv3-cash__aside-card cdv3-cash__aside-card--forecast">
                <span className="cdv3-cash__aside-card-title">Forecast</span>
                <div className="cdv3-cash__aside-forecast-stack">
                  <div>
                    <span>current</span>
                    <strong className="tabular-nums is-forecast">
                      {loading ? '—' : formatCurrency(currentForecast)}
                    </strong>
                  </div>
                  <div>
                    <span>next {unit}</span>
                    <strong className="tabular-nums is-forecast">
                      {loading ? '—' : formatCurrency(nextForecast)}
                    </strong>
                  </div>
                </div>
              </div>
              <div className="cdv3-cash__aside-card">
                <span>
                  Collected ({historyCount} {period === 'monthly' ? 'mo' : 'wk'})
                </span>
                <strong className="tabular-nums is-collected">
                  {loading ? '—' : formatCurrency(collectedTotal)}
                </strong>
              </div>
              <div className="cdv3-cash__aside-card">
                <span>Invoiced (window)</span>
                <strong className="tabular-nums">
                  {loading ? '—' : formatCurrency(invoicedTotal)}
                </strong>
              </div>
            </div>
          </aside>
        </div>

        <p className="cdv3-cash__legend" aria-hidden>
          <span>
            <i className="is-solid" /> Collected
          </span>
          <span>
            <i className="is-hatch" /> Forecast
          </span>
          <span>
            <i className="is-invoiced" /> Invoiced
          </span>
        </p>
      </div>

      {aging ? (
        <div className="cdv3-cash__aging" aria-label="Aging A/R">
          <div className="cdv3-cash__aging-head">
            <h3 className="cdv3-cash__aging-title">Aging A/R</h3>
            <div className="cdv3-cash__aging-summary">
              <span>
                Current <strong className="tabular-nums">{formatCurrency(agingCurrent)}</strong>
              </span>
              <span className="is-aged">
                Aged <strong className="tabular-nums">{formatCurrency(agingAged)}</strong>
              </span>
            </div>
          </div>
          <div className="cdv3-cash__aging-bar" role="img" aria-label="A/R aging distribution">
            {aging.total <= 0 || loading ? (
              <span className="cdv3-cash__aging-empty" />
            ) : (
              agingSegments.map((seg) =>
                seg.pct > 0 ? (
                  <span
                    key={seg.key}
                    className="cdv3-cash__aging-seg"
                    style={{ width: `${seg.pct}%`, background: seg.color }}
                    title={`${seg.mark} days: ${formatCurrency(seg.amount)}`}
                  />
                ) : null
              )
            )}
          </div>
          <ol className="cdv3-cash__aging-scale">
            {agingSegments.map((seg) => (
              <li key={seg.key} className={seg.amount <= 0 ? 'is-zero' : undefined}>
                <i style={{ background: seg.color }} aria-hidden />
                <span className="tabular-nums">{seg.mark}</span>
                <span className="tabular-nums" title={formatCurrency(seg.amount)}>
                  {loading ? '—' : formatAgingTick(seg.amount)}
                </span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </section>
  )
}
