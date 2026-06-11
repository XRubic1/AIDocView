import { useMemo } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from 'recharts'
import { formatCurrency } from '../../utils/format'
import { useClientTheme } from '../../theme/ThemeContext'
import type { CashFlowMonth } from '../../utils/clientReports'

interface CashFlowChartProps {
  data: CashFlowMonth[]
  compact?: boolean
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{ value: number; dataKey: string; color: string; name: string }>
  label?: string
}) {
  const t = useClientTheme()
  if (!active || !payload?.length) return null
  return (
    <div
      className="rounded-xl px-3 py-2 text-xs shadow-lg border"
      style={{ backgroundColor: t.card, borderColor: t.border }}
    >
      <p className="font-semibold mb-1.5" style={{ color: t.primary }}>
        {label}
      </p>
      {payload.map((entry) => (
        <div key={entry.dataKey} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: entry.color }} />
          <span style={{ color: t.secondary }}>
            {entry.name}:{' '}
            <span className="font-semibold tabular-nums" style={{ color: t.primary }}>
              {formatCurrency(entry.value)}
            </span>
          </span>
        </div>
      ))}
    </div>
  )
}

/** Grouped bar chart — invoiced vs collected by month. */
export default function CashFlowChart({ data, compact = false }: CashFlowChartProps) {
  const t = useClientTheme()

  const chartData = useMemo(
    () =>
      data.map((row) => ({
        month: row.month,
        Invoiced: row.invoiced,
        Collected: row.collected,
      })),
    [data]
  )

  const hasData = chartData.some((d) => d.Invoiced > 0 || d.Collected > 0)

  if (!hasData) {
    return (
      <p className="text-xs text-center py-6" style={{ color: t.secondary }}>
        No invoicing or payment activity in this window
      </p>
    )
  }

  const height = compact ? 168 : 280

  return (
    <div className="px-2 pb-2" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={4}>
          <CartesianGrid strokeDasharray="3 3" stroke={t.chartGrid} vertical={false} />
          <XAxis
            dataKey="month"
            tick={{ fontSize: 11, fill: t.muted }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 10, fill: t.muted }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) =>
              v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`
            }
            width={44}
          />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: t.chartGrid, opacity: 0.5 }} />
          <Legend
            iconType="square"
            iconSize={8}
            wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
          />
          <Bar
            dataKey="Invoiced"
            fill={t.chart.blue}
            radius={[4, 4, 0, 0]}
            maxBarSize={28}
            fillOpacity={0.9}
          />
          <Bar
            dataKey="Collected"
            fill={t.success}
            radius={[4, 4, 0, 0]}
            maxBarSize={28}
            fillOpacity={0.9}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
