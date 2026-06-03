import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { formatCurrency } from '../../utils/format'
import { Payment } from '../../types/payment'

interface PaymentTrendsChartProps {
  payments: Payment[]
}

export default function PaymentTrendsChart({ payments }: PaymentTrendsChartProps) {
  // Group payments by month for the last 6 months
  const data = (() => {
    const today = new Date()
    const months: { [key: string]: number } = {}
    
    // Initialize last 6 months with 0
    for (let i = 5; i >= 0; i--) {
      const date = new Date(today.getFullYear(), today.getMonth() - i, 1)
      const monthKey = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
      months[monthKey] = 0
    }
    
    // Sum payments by month
    payments.forEach((payment) => {
      if (payment.status === 'confirmed') {
        const paymentDate = new Date(payment.received_date)
        const monthKey = paymentDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
        
        if (months.hasOwnProperty(monthKey)) {
          months[monthKey] += payment.amount
        }
      }
    })
    
    return Object.entries(months).map(([month, amount]) => ({
      month,
      amount: Math.round(amount * 100) / 100, // Round to 2 decimals
    }))
  })()

  const totalAmount = payments
    .filter((p) => p.status === 'confirmed')
    .reduce((sum, p) => sum + p.amount, 0)

  return (
    <div className="bg-white border rounded" style={{ borderColor: '#819291' }}>
      <div className="p-6">
        <h3 className="text-lg font-bold mb-4" style={{ color: '#113543' }}>Payment Trends</h3>
        <div style={{ height: '300px' }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#819291" opacity={0.3} />
              <XAxis 
                dataKey="month" 
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
              <Line 
                type="monotone" 
                dataKey="amount" 
                stroke="#C2A558"
                strokeWidth={2}
                dot={{ fill: '#C2A558', r: 4 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-4 pt-4 border-t flex items-center justify-between" style={{ borderColor: '#819291' }}>
          <span className="text-sm font-semibold" style={{ color: '#113543' }}>Total Received</span>
          <span className="text-lg font-bold" style={{ color: '#113543' }}>
            {formatCurrency(totalAmount)}
          </span>
        </div>
      </div>
    </div>
  )
}


