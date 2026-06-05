import { formatCurrency } from '../../utils/format'
import { AgingAR } from '../../types/admin'
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts'
import { clientTheme as t } from '../../theme/clientTheme'

interface AgingARChartProps {
  aging: AgingAR
  compact?: boolean
}

const BUCKET_COLORS = [
  t.chart.blue,
  t.chart.cyan,
  t.chart.purple,
  t.chart.amber,
  t.chart.orange,
  t.chart.red,
]

export default function AgingARChart({ aging, compact = false }: AgingARChartProps) {
  const total = aging.total || 1

  const buckets = [
    { key: '1-15', amount: aging['1_15'], label: '0–15 days' },
    { key: '16-30', amount: aging['16_30'], label: '16–30 days' },
    { key: '31-45', amount: aging['31_45'], label: '31–45 days' },
    { key: '46-60', amount: aging['46_60'], label: '46–60 days' },
    { key: '61-90', amount: aging['61_90'], label: '61–90 days' },
    { key: '91+', amount: aging.over_91, label: '91+ days' },
  ].map((row, index) => ({
    ...row,
    color: BUCKET_COLORS[index],
    pct: (row.amount / total) * 100,
  }))

  const pieData = buckets.filter((b) => b.amount > 0).map((b) => ({
    name: b.label,
    value: b.amount,
    color: b.color,
  }))

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
        <div className="flex h-1.5 w-full rounded-full overflow-hidden bg-slate-100">
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
      <div className="flex flex-col lg:flex-row items-center gap-5">
        <div className="relative shrink-0" style={{ width: 160, height: 160 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={72}
                paddingAngle={2}
                dataKey="value"
                stroke="none"
              >
                {pieData.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-lg font-bold tabular-nums" style={{ color: t.primary }}>
              {formatCurrency(aging.total)}
            </span>
            <span className="text-[10px] font-medium mt-0.5" style={{ color: t.muted }}>
              Outstanding
            </span>
          </div>
        </div>

        <ul className="flex-1 w-full space-y-2">
          {buckets.map((bucket) => (
            <li key={bucket.key} className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: bucket.color }}
                />
                <span className="text-xs font-medium" style={{ color: t.secondary }}>
                  {bucket.label}
                </span>
              </div>
              <span className="text-xs font-semibold tabular-nums shrink-0" style={{ color: t.primary }}>
                {formatCurrency(bucket.amount)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
