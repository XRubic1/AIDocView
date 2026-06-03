import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

interface BatchVolumeChartProps {
  data: Array<{
    date: string
    submitted: number
    processed: number
  }>
}

export function BatchVolumeChart({ data }: BatchVolumeChartProps) {
  return (
    <div className="border" style={{ backgroundColor: '#FFFFFF', borderColor: '#819291' }}>
      <div className="p-6">
        <h2 className="text-lg font-bold mb-4" style={{ color: '#113543' }}>Batch Processing Volume (Last 7 Days)</h2>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#819291" opacity={0.3} />
            <XAxis 
              dataKey="date" 
              stroke="#819291"
              style={{ fontSize: '12px' }}
            />
            <YAxis 
              stroke="#819291"
              style={{ fontSize: '12px' }}
            />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: '#FFFFFF', 
                border: '1px solid #819291',
                borderRadius: '4px'
              }}
            />
            <Legend />
            <Bar dataKey="submitted" fill="#819291" name="Submitted" />
            <Bar dataKey="processed" fill="#2E7D32" name="Processed" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}


