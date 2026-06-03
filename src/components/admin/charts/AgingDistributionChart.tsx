import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import { formatCurrency } from '../../../utils/format'
import { AgingAR } from '../../../types/admin'

interface AgingDistributionChartProps {
  aging: AgingAR
}

export function AgingDistributionChart({ aging }: AgingDistributionChartProps) {
  const data = [
    { name: '1-15 days', value: aging['1_15'], color: '#2E7D32' },
    { name: '16-30 days', value: aging['16_30'], color: '#4CAF50' },
    { name: '31-45 days', value: aging['31_45'], color: '#FFC107' },
    { name: '46-60 days', value: aging['46_60'], color: '#FF9800' },
    { name: '61-90 days', value: aging['61_90'], color: '#F44336' },
    { name: 'Over 91 days', value: aging.over_91, color: '#D32F2F' },
  ].filter(item => item.value > 0)

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0]
      const percentage = aging.total > 0 ? ((data.value / aging.total) * 100).toFixed(1) : 0
      return (
        <div style={{ 
          backgroundColor: '#FFFFFF', 
          padding: '8px', 
          border: '1px solid #819291',
          borderRadius: '4px'
        }}>
          <p style={{ color: '#113543', fontWeight: 'bold' }}>{data.name}</p>
          <p style={{ color: '#113543' }}>{formatCurrency(data.value)}</p>
          <p style={{ color: '#819291', fontSize: '12px' }}>{percentage}% of total</p>
        </div>
      )
    }
    return null
  }

  return (
    <div className="border" style={{ backgroundColor: '#FFFFFF', borderColor: '#819291' }}>
      <div className="p-6">
        <h2 className="text-lg font-bold mb-4" style={{ color: '#113543' }}>Aging A/R Distribution</h2>
        <div style={{ height: '384px' }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                outerRadius={100}
                fill="#8884d8"
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
      </div>
    </div>
  )
}


