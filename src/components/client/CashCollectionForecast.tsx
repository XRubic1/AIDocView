import { useId, useMemo, useState } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatCurrency } from '../../utils/format'
import {
  aggregateForecastByWeek,
  computeCashCollectionForecast,
  type ForecastHorizon,
} from '../../utils/cashCollectionForecast'
import type { Invoice } from '../../types/invoice'
import type { Payment } from '../../types/payment'
import { useClientTheme } from '../../theme/ThemeContext'

interface CashCollectionForecastProps {
  invoices: Invoice[]
  payments: Payment[]
  compact?: boolean
}

function ForecastTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{ value: number; payload?: { invoice_count?: number } }>
  label?: string
}) {
  const c = useClientTheme()
  if (!active || !payload?.length) return null
  const count = payload[0].payload?.invoice_count ?? 0

  return (
    <div
      className="rounded-xl px-3 py-2 text-xs shadow-lg border"
      style={{ backgroundColor: c.card, borderColor: c.border }}
    >
      <p className="font-medium mb-1" style={{ color: c.secondary }}>
        {label}
      </p>
      <p className="font-semibold tabular-nums" style={{ color: c.primary }}>
        {formatCurrency(payload[0].value)}
      </p>
      <p className="text-[10px] mt-0.5" style={{ color: c.mutedLight }}>
        {count} invoice{count === 1 ? '' : 's'}
      </p>
    </div>
  )
}

/** Expected cash in from open A/R — by due date and broker pay patterns. */
export default function CashCollectionForecast({
  invoices,
  payments,
  compact = false,
}: CashCollectionForecastProps) {
  const c = useClientTheme()
  const gradientId = useId()
  const [horizon, setHorizon] = useState<ForecastHorizon>(30)

  const forecast = useMemo(
    () => computeCashCollectionForecast(invoices, payments, 30),
    [invoices, payments]
  )

  const chartData = useMemo(() => {
    const buckets =
      horizon === 7 ? forecast.daily_buckets.slice(0, 7) : forecast.daily_buckets
    const aggregated = horizon === 30 ? aggregateForecastByWeek(buckets) : buckets
    return aggregated.map((row) => ({
      label: row.label,
      amount: row.amount,
      invoice_count: row.invoice_count,
    }))
  }, [forecast, horizon])

  const horizonTotal = horizon === 7 ? forecast.next_7_days : forecast.next_30_days
  const chartHeight = compact ? 150 : 180

  if (forecast.open_ar <= 0) {
    return (
      <p className="text-xs text-center py-6" style={{ color: c.secondary }}>
        No open A/R to forecast
      </p>
    )
  }

  return (
    <div className={compact ? 'px-1 pb-1' : 'px-2 pb-2'}>
      <div className="flex flex-wrap items-center gap-3 mb-2">
        <div className="flex gap-1">
          {(
            [
              { id: 7 as const, label: '7 days' },
              { id: 30 as const, label: '30 days' },
            ] as const
          ).map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setHorizon(opt.id)}
              className={`batch-filter-pill batch-filter-pill--sm ${
                horizon === opt.id ? 'batch-filter-pill--active' : ''
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-4 ml-auto">
          <div className="text-right">
            <p
              className="text-[10px] font-semibold uppercase tracking-wide leading-none"
              style={{ color: c.mutedLight }}
            >
              Expected
            </p>
            <p className="text-sm font-bold tabular-nums mt-0.5" style={{ color: c.success }}>
              {formatCurrency(horizonTotal)}
            </p>
          </div>
          <div
            className="w-px h-7 shrink-0"
            style={{ backgroundColor: c.border }}
            aria-hidden
          />
          <div className="text-right">
            <p
              className="text-[10px] font-semibold uppercase tracking-wide leading-none"
              style={{ color: c.mutedLight }}
            >
              Open A/R
            </p>
            <p className="text-sm font-bold tabular-nums mt-0.5" style={{ color: c.primary }}>
              {formatCurrency(forecast.open_ar)}
            </p>
          </div>
        </div>
      </div>

      <div className="w-full min-w-0" style={{ height: chartHeight }}>
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <AreaChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={c.success} stopOpacity={0.22} />
                <stop offset="100%" stopColor={c.success} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={c.chartGrid} vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: c.muted, fontWeight: 500 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 10, fill: c.mutedLight }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => (v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`)}
              width={44}
            />
            <Tooltip
              content={<ForecastTooltip />}
              cursor={{ stroke: c.success, strokeWidth: 1, strokeDasharray: '4 4' }}
            />
            <Area
              type="monotone"
              dataKey="amount"
              stroke={c.success}
              strokeWidth={2}
              fill={`url(#${gradientId})`}
              dot={{ r: 3, fill: c.success, strokeWidth: 0 }}
              activeDot={{ r: 5, fill: c.success, stroke: c.card, strokeWidth: 2 }}
              isAnimationActive
              animationDuration={600}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
