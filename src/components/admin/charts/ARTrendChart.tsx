import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { formatCurrency } from '../../../utils/format'

interface ARTrendChartProps {
  data: Array<{
    date: string
    totalAR: number
    collected: number
  }>
}

export function ARTrendChart({ data }: ARTrendChartProps) {
  return (
    <div className="border" style={{ backgroundColor: '#FFFFFF', borderColor: '#819291' }}>
      <div className="p-6">
        <h2 className="text-lg font-bold mb-4" style={{ color: '#113543' }}>A/R Trend (Last 30 Days)</h2>
        <div style={{ height: '384px' }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#819291" opacity={0.3} />
              <XAxis 
                dataKey="date" 
                stroke="#819291"
                style={{ fontSize: '12px' }}
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
              <Legend />
              <Line 
                type="monotone" 
                dataKey="totalAR" 
                stroke="#113543" 
                strokeWidth={2}
                name="Total A/R"
                dot={{ fill: '#113543', r: 4 }}
              />
              <Line 
                type="monotone" 
                dataKey="collected" 
                stroke="#2E7D32" 
                strokeWidth={2}
                name="Collected"
                dot={{ fill: '#2E7D32', r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}


