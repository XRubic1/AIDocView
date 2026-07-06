import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { BarChart3 } from 'lucide-react'
import DashboardPanel from '../../client/dashboard/DashboardPanel'
import { useClientTheme } from '../../../theme/ThemeContext'
import { formatCurrency } from '../../../utils/format'

interface ARTrendChartProps {
  data: Array<{
    date: string
    totalAR: number
    collected: number
  }>
}

export function ARTrendChart({ data }: ARTrendChartProps) {
  const c = useClientTheme()

  return (
    <DashboardPanel
      title="A/R Trend (Last 30 Days)"
      icon={BarChart3}
      iconTone="blue"
      interactive={false}
    >
      <div className="p-4" style={{ height: 320 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke={c.chartGrid} opacity={0.6} />
            <XAxis dataKey="date" stroke={c.mutedLight} style={{ fontSize: '12px' }} />
            <YAxis
              stroke={c.mutedLight}
              style={{ fontSize: '12px' }}
              tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
            />
            <Tooltip
              formatter={(value: number) => formatCurrency(value)}
              contentStyle={{
                backgroundColor: c.card,
                border: `1px solid ${c.border}`,
                borderRadius: '8px',
              }}
            />
            <Legend />
            <Line
              type="monotone"
              dataKey="totalAR"
              stroke={c.chart.blue}
              strokeWidth={2}
              name="Total A/R"
              dot={{ fill: c.chart.blue, r: 3 }}
            />
            <Line
              type="monotone"
              dataKey="collected"
              stroke={c.success}
              strokeWidth={2}
              name="Collected"
              dot={{ fill: c.success, r: 3 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </DashboardPanel>
  )
}
