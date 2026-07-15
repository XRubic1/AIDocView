import { useMemo } from 'react'
import { AlertTriangle } from 'lucide-react'
import { formatCurrency } from '../../utils/format'
import { AgingAR } from '../../types/admin'
import { useClientTheme } from '../../theme/ThemeContext'

interface AgingARChartProps {
  aging: AgingAR
  compact?: boolean
}

/** Compact aging distribution — stacked bar + dense bucket rows (not a tall chart). */
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

  const overdueAmount = aging['61_90'] + aging.over_91
  const overduePct = aging.total > 0 ? Math.round((overdueAmount / aging.total) * 100) : 0
  const maxAmount = Math.max(...buckets.map((b) => b.amount), 0)

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
    <div className="aging-ar-chart p-3 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium" style={{ color: t.secondary }}>
          Distribution by age
        </p>
        {overdueAmount > 0 ? (
          <div
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
            style={{ backgroundColor: t.stat.amber, color: t.warning }}
          >
            <AlertTriangle className="w-3 h-3 shrink-0" />
            {formatCurrency(overdueAmount)} overdue ({overduePct}%)
          </div>
        ) : (
          <div
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
            style={{ backgroundColor: t.stat.green, color: t.success }}
          >
            No overdue A/R
          </div>
        )}
      </div>

      {/* Stacked distribution bar — replaces tall vertical chart */}
      <div
        className="aging-ar-chart__stack flex h-3 w-full rounded-full overflow-hidden"
        style={{ backgroundColor: t.chartGrid }}
        role="img"
        aria-label="A/R aging distribution"
      >
        {buckets.map((bucket) =>
          bucket.pct > 0 ? (
            <div
              key={bucket.key}
              className="h-full transition-all"
              style={{ width: `${bucket.pct}%`, backgroundColor: bucket.color }}
              title={`${bucket.label}: ${formatCurrency(bucket.amount)} (${bucket.pct.toFixed(0)}%)`}
            />
          ) : null
        )}
      </div>

      {/* Dense bucket rows with proportional mini bars */}
      <ul className="aging-ar-chart__buckets">
        {buckets.map((bucket) => {
          const barWidth =
            maxAmount > 0 ? Math.max((bucket.amount / maxAmount) * 100, bucket.amount > 0 ? 4 : 0) : 0
          return (
            <li key={bucket.key} className="aging-ar-chart__bucket-row">
              <span
                className="aging-ar-chart__legend-dot shrink-0"
                style={{ backgroundColor: bucket.color }}
                aria-hidden
              />
              <span className="aging-ar-chart__bucket-label" style={{ color: t.secondary }}>
                {bucket.short}
              </span>
              <div
                className="aging-ar-chart__bucket-track"
                style={{ backgroundColor: t.chartGrid }}
              >
                <div
                  className="aging-ar-chart__bucket-fill"
                  style={{ width: `${barWidth}%`, backgroundColor: bucket.color }}
                />
              </div>
              <span
                className="aging-ar-chart__bucket-amount tabular-nums"
                style={{ color: t.primary }}
              >
                {formatCurrency(bucket.amount)}
              </span>
              <span
                className="aging-ar-chart__bucket-pct tabular-nums"
                style={{ color: t.mutedLight }}
              >
                {bucket.pct.toFixed(0)}%
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
