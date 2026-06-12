import { useMemo } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { AlertTriangle } from 'lucide-react'
import { formatCurrency } from '../../utils/format'
import { AgingAR } from '../../types/admin'
import { useClientTheme } from '../../theme/ThemeContext'

interface AgingARChartProps {
  aging: AgingAR
  compact?: boolean
}

function AgingTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{ value: number; payload?: { pct?: number } }>
  label?: string
}) {
  const t = useClientTheme()
  if (!active || !payload?.length) return null
  const pct = payload[0].payload?.pct ?? 0

  return (
    <div
      className="rounded-xl px-3 py-2 text-xs shadow-lg border"
      style={{ backgroundColor: t.card, borderColor: t.border }}
    >
      <p className="font-medium mb-1" style={{ color: t.secondary }}>
        {label}
      </p>
      <p className="font-semibold tabular-nums" style={{ color: t.primary }}>
        {formatCurrency(payload[0].value)}
      </p>
      <p className="text-[10px] mt-0.5" style={{ color: t.mutedLight }}>
        {pct.toFixed(0)}% of open A/R
      </p>
    </div>
  )
}

export default function AgingARChart({ aging, compact = false }: AgingARChartProps) {
  const t = useClientTheme()
  const total = aging.total || 1

  const buckets = useMemo(() => {
    const colors = [
      t.chart.blue,
      t.chart.cyan,
      t.chart.purple,
      t.chart.amber,
      t.chart.orange,
      t.chart.red,
    ]

    return [
      { key: '1-15', amount: aging['1_15'], label: '0–15 days', short: '0-15' },
      { key: '16-30', amount: aging['16_30'], label: '16–30 days', short: '16-30' },
      { key: '31-45', amount: aging['31_45'], label: '31–45 days', short: '31-45' },
      { key: '46-60', amount: aging['46_60'], label: '46–60 days', short: '46-60' },
      { key: '61-90', amount: aging['61_90'], label: '61–90 days', short: '61-90' },
      { key: '91+', amount: aging.over_91, label: '91+ days', short: '91+' },
    ].map((row, index) => ({
      ...row,
      color: colors[index],
      pct: (row.amount / total) * 100,
    }))
  }, [aging, t.chart, total])

  const chartData = useMemo(
    () =>
      buckets.map((bucket) => ({
        label: bucket.short,
        amount: bucket.amount,
        pct: bucket.pct,
        color: bucket.color,
      })),
    [buckets]
  )

  const overdueAmount = aging['61_90'] + aging.over_91
  const overduePct = aging.total > 0 ? Math.round((overdueAmount / aging.total) * 100) : 0

  if (compact) {
    return (
      <div className="px-3 py-2.5 space-y-2">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-base font-bold tabular-nums" style={{ color: t.primary }}>
            {formatCurrency(aging.total)}
          </span>
          <span className="text-[10px]" style={{ color: t.muted }}>
            outstanding
          </span>
        </div>
        <div
          className="flex h-1.5 w-full rounded-full overflow-hidden"
          style={{ backgroundColor: t.chartGrid }}
        >
          {buckets.map((bucket) =>
            bucket.pct > 0 ? (
              <div
                key={bucket.key}
                className="h-full"
                style={{ width: `${bucket.pct}%`, backgroundColor: bucket.color }}
                title={`${bucket.label}: ${formatCurrency(bucket.amount)}`}
              />
            ) : null
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="p-5">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div>
          <p className="text-2xl font-bold tabular-nums" style={{ color: t.primary }}>
            {formatCurrency(aging.total)}
          </p>
          <p className="text-xs font-medium mt-0.5" style={{ color: t.secondary }}>
            outstanding
          </p>
        </div>
        {overdueAmount > 0 ? (
          <div
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium"
            style={{ backgroundColor: t.stat.amber, color: t.warning }}
          >
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            {formatCurrency(overdueAmount)} overdue ({overduePct}%)
          </div>
        ) : (
          <div
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium"
            style={{ backgroundColor: t.stat.green, color: t.success }}
          >
            No overdue A/R
          </div>
        )}
      </div>

      <div className="w-full min-w-0" style={{ height: 160 }}>
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={t.chartGrid} vertical={false} />
            <XAxis
              dataKey="label"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11, fill: t.muted, fontWeight: 500 }}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11, fill: t.mutedLight }}
              tickFormatter={(v) => (v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`)}
              width={48}
            />
            <Tooltip
              content={<AgingTooltip />}
              cursor={{ fill: t.chartGrid, opacity: 0.45 }}
            />
            <Bar dataKey="amount" radius={[4, 4, 0, 0]} maxBarSize={36}>
              {chartData.map((entry) => (
                <Cell key={entry.label} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="aging-ar-chart__legend">
        {buckets.map((bucket) => (
          <div key={bucket.key} className="aging-ar-chart__legend-item">
            <span
              className="aging-ar-chart__legend-dot"
              style={{ backgroundColor: bucket.color }}
            />
            <span className="aging-ar-chart__legend-label" style={{ color: t.secondary }}>
              {bucket.short}
            </span>
          </div>
        ))}
        <span className="aging-ar-chart__legend-note" style={{ color: t.mutedLight }}>
          By age bucket
        </span>
      </div>
    </div>
  )
}
