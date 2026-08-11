import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import { BarChart3 } from 'lucide-react'
import DashboardPanel from '../../client/dashboard/DashboardPanel'
import { useClientTheme } from '../../../theme/ThemeContext'
import { formatCurrency } from '../../../utils/format'
import { AgingAR } from '../../../types/admin'

interface AgingDistributionChartProps {
  aging: AgingAR
}

export function AgingDistributionChart({ aging }: AgingDistributionChartProps) {
  const c = useClientTheme()

  const data = [
    { name: '0–15 days', value: aging['1_15'], color: c.success },
    { name: '16-30 days', value: aging['16_30'], color: c.chart.cyan },
    { name: '31-45 days', value: aging['31_45'], color: c.chart.amber },
    { name: '46-60 days', value: aging['46_60'], color: c.chart.orange },
    { name: '61-90 days', value: aging['61_90'], color: c.error },
    { name: 'Over 91 days', value: aging.over_91, color: c.chart.red },
  ].filter((item) => item.value > 0)

  const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ name: string; value: number }> }) => {
    if (active && payload && payload.length) {
      const point = payload[0]
      const percentage = aging.total > 0 ? ((point.value / aging.total) * 100).toFixed(1) : 0
      return (
        <div
          style={{
            backgroundColor: c.card,
            padding: '8px 12px',
            border: `1px solid ${c.border}`,
            borderRadius: '8px',
          }}
        >
          <p style={{ color: c.primary, fontWeight: 600 }}>{point.name}</p>
          <p style={{ color: c.primary }}>{formatCurrency(point.value)}</p>
          <p style={{ color: c.secondary, fontSize: '12px' }}>{percentage}% of total</p>
        </div>
      )
    }
    return null
  }

  return (
    <DashboardPanel
      title="Aging A/R Distribution"
      icon={BarChart3}
      iconTone="amber"
      interactive={false}
    >
      <div className="p-4" style={{ height: 320 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={({ name, percent }) => `${name}: ${((percent ?? 0) * 100).toFixed(0)}%`}
              outerRadius={100}
              fill={c.chart.blue}
              dataKey="value"
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </DashboardPanel>
  )
}
