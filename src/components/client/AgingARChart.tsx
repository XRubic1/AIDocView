import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { formatCurrency } from '../../utils/format'
import { AgingAR } from '../../types/admin'

interface AgingARChartProps {
  aging: AgingAR
}

export default function AgingARChart({ aging }: AgingARChartProps) {
  const data = [
    { period: '1-15', amount: aging['1_15'], label: '1-15 days' },
    { period: '16-30', amount: aging['16_30'], label: '16-30 days' },
    { period: '31-45', amount: aging['31_45'], label: '31-45 days' },
    { period: '46-60', amount: aging['46_60'], label: '46-60 days' },
    { period: '61-90', amount: aging['61_90'], label: '61-90 days' },
    { period: '91+', amount: aging.over_91, label: 'Over 91 days' },
  ]

  return (
    <div className="bg-white border rounded" style={{ borderColor: '#819291' }}>
      <div className="p-6">
        <h3 className="text-lg font-bold mb-4" style={{ color: '#113543' }}>Aging A/R</h3>
        <div style={{ height: '300px' }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#819291" opacity={0.3} />
              <XAxis 
                dataKey="label" 
                stroke="#819291"
                style={{ fontSize: '12px' }}
                angle={-45}
                textAnchor="end"
                height={80}
              />
              <YAxis 
                stroke="#819291"
                style={{ fontSize: '12px' }}
                tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
              />
              <Tooltip 
                formatter={(value: number) => formatCurrency(value)}
                contentStyle={{ 
                  backgroundColor: '#FFFFFF', 
                  border: '1px solid #819291',
                  borderRadius: '4px'
                }}
              />
              <Bar 
                dataKey="amount" 
                fill="#C2A558"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-4 pt-4 border-t flex items-center justify-between" style={{ borderColor: '#819291' }}>
          <span className="text-sm font-semibold" style={{ color: '#113543' }}>Total</span>
          <span className="text-lg font-bold" style={{ color: '#113543' }}>
            {formatCurrency(aging.total)}
          </span>
        </div>
      </div>
    </div>
  )
}

