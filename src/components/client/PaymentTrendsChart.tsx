import { useId, useMemo } from 'react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts'
import { TrendingUp } from 'lucide-react'
import { formatCurrency } from '../../utils/format'
import type { Invoice } from '../../types/invoice'
import type { Payment } from '../../types/payment'
import { computeCashFlowTrend } from '../../utils/clientReports'
import { useClientTheme } from '../../theme/ThemeContext'

interface PaymentTrendsChartProps {
  payments: Payment[]
  invoices?: Invoice[]
  compact?: boolean
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{ value: number; dataKey: string; color: string }>
  label?: string
}) {
  const t = useClientTheme()
  if (!active || !payload?.length) return null

  const seriesLabel = (dataKey: string) =>
    dataKey === 'collections' ? 'Collections' : 'Invoiced'

  return (
    <div
      className="rounded-xl px-3 py-2 text-xs shadow-lg border"
      style={{ backgroundColor: t.card, borderColor: t.border }}
    >
      <p className="font-medium mb-1.5" style={{ color: t.secondary }}>
        {label}
      </p>
      {payload.map((entry) => (
        <div key={entry.dataKey} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
          <span style={{ color: t.primary }}>
            {seriesLabel(entry.dataKey)}:{' '}
            <span className="font-semibold">{formatCurrency(entry.value)}</span>
          </span>
        </div>
      ))}
    </div>
  )
}

export default function PaymentTrendsChart({
  payments,
  invoices = [],
  compact = false,
}: PaymentTrendsChartProps) {
  const t = useClientTheme()
  const collectionsGradientId = useId().replace(/:/g, '')
  const invoicedGradientId = useId().replace(/:/g, '')

  const { data, thisMonthTotal, monthChangePct } = useMemo(() => {
    const cashFlow = computeCashFlowTrend(invoices, payments, 6)

    const chartData = cashFlow.map((row) => ({
      month: row.month,
      collections: Math.round(row.collected * 100) / 100,
      invoiced: Math.round(row.invoiced * 100) / 100,
    }))

    const thisMonth = cashFlow[cashFlow.length - 1]?.collected ?? 0
    const prevMonth = cashFlow[cashFlow.length - 2]?.collected ?? 0
    const changePct = prevMonth > 0 ? Math.round(((thisMonth - prevMonth) / prevMonth) * 100) : 0

    return {
      data: chartData,
      thisMonthTotal: thisMonth,
      monthChangePct: changePct,
    }
  }, [invoices, payments])

  const hasMonthComparison = useMemo(() => {
    const cashFlow = computeCashFlowTrend(invoices, payments, 6)
    return (cashFlow[cashFlow.length - 2]?.collected ?? 0) > 0
  }, [invoices, payments])

  if (compact) {
    return (
      <div className="px-3 py-2.5">
        <div className="w-full min-w-0" style={{ height: 72 }}>
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <AreaChart data={data} margin={{ top: 2, right: 2, left: 0, bottom: -4 }}>
              <defs>
                <linearGradient id={collectionsGradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={t.info} stopOpacity={0.2} />
                  <stop offset="100%" stopColor={t.info} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="month"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 9, fill: t.mutedLight }}
              />
              <Tooltip content={<ChartTooltip />} />
              <Area
                type="monotone"
                dataKey="collections"
                stroke={t.info}
                strokeWidth={1.5}
                fill={`url(#${collectionsGradientId})`}
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    )
  }

  return (
    <div className="p-3">
      <div className="flex flex-wrap items-end justify-between gap-2 mb-2">
        <div>
          <p className="text-xl font-bold tabular-nums leading-tight" style={{ color: t.primary }}>
            {formatCurrency(thisMonthTotal)}
          </p>
          <p className="text-xs font-medium mt-0.5" style={{ color: t.secondary }}>
            collected this month
          </p>
        </div>
        {hasMonthComparison && (
          <div
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
            style={{
              backgroundColor: monthChangePct >= 0 ? t.stat.green : t.stat.amber,
              color: monthChangePct >= 0 ? t.success : t.warning,
            }}
          >
            <TrendingUp className="w-3 h-3" />
            {monthChangePct >= 0 ? '+' : ''}
            {monthChangePct}% from previous month
          </div>
        )}
      </div>

      <div className="w-full min-w-0" style={{ height: 148 }}>
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={collectionsGradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={t.info} stopOpacity={0.25} />
                <stop offset="100%" stopColor={t.info} stopOpacity={0} />
              </linearGradient>
              <linearGradient id={invoicedGradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={t.success} stopOpacity={0.2} />
                <stop offset="100%" stopColor={t.success} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={t.chartGrid} vertical={false} />
            <XAxis
              dataKey="month"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 12, fill: t.muted, fontWeight: 500 }}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11, fill: t.mutedLight }}
              tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
              width={48}
            />
            <Tooltip content={<ChartTooltip />} />
            <Area
              type="monotone"
              dataKey="collections"
              name="Collections"
              stroke={t.info}
              strokeWidth={2}
              fill={`url(#${collectionsGradientId})`}
              dot={false}
              activeDot={{ r: 4, fill: t.info }}
            />
            <Area
              type="monotone"
              dataKey="invoiced"
              name="Invoiced"
              stroke={t.success}
              strokeWidth={2}
              fill={`url(#${invoicedGradientId})`}
              dot={false}
              activeDot={{ r: 4, fill: t.success }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="flex items-center gap-4 mt-3">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full" style={{ backgroundColor: t.info }} />
          <span className="text-xs font-medium" style={{ color: t.secondary }}>
            Collections
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full" style={{ backgroundColor: t.success }} />
          <span className="text-xs font-medium" style={{ color: t.secondary }}>
            Invoiced
          </span>
        </div>
        <span className="text-xs ml-auto" style={{ color: t.mutedLight }}>
          Last 6 months
        </span>
      </div>
    </div>
  )
}
