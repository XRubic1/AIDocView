import { formatCurrency } from '../../../utils/format'
import { AlertCircle } from 'lucide-react'

interface BrokerOverdueData {
  brokerId: string
  brokerName: string
  overdueAmount: number
  overdueCount: number
  avgDaysOverdue: number
}

interface TopBrokersOverdueProps {
  brokers: BrokerOverdueData[]
  onBrokerClick?: (brokerId: string) => void
}

export function TopBrokersOverdue({ brokers, onBrokerClick }: TopBrokersOverdueProps) {
  if (brokers.length === 0) {
    return (
      <div className="border" style={{ backgroundColor: '#FFFFFF', borderColor: '#819291' }}>
        <div className="p-6">
          <h2 className="text-lg font-bold mb-4" style={{ color: '#113543' }}>Top Brokers - Overdue</h2>
          <div className="text-center py-8" style={{ color: '#819291' }}>
            No overdue invoices
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="border" style={{ backgroundColor: '#FFFFFF', borderColor: '#819291' }}>
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold" style={{ color: '#113543' }}>Top Brokers - Overdue</h2>
          <AlertCircle className="w-5 h-5" style={{ color: '#C2A558' }} />
        </div>
        <div className="space-y-3">
          {brokers.slice(0, 5).map((broker, index) => (
            <div
              key={broker.brokerId}
              className={`p-3 rounded transition-colors ${
                onBrokerClick ? 'cursor-pointer hover:bg-gray-50' : ''
              }`}
              style={{ backgroundColor: index % 2 === 0 ? '#F5F5F5' : '#FFFFFF' }}
              onClick={() => onBrokerClick?.(broker.brokerId)}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium text-sm" style={{ color: '#113543' }}>
                  {broker.brokerName}
                </span>
                <span className="font-bold text-sm" style={{ color: '#C2A558' }}>
                  {formatCurrency(broker.overdueAmount)}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs" style={{ color: '#819291' }}>
                <span>{broker.overdueCount} invoices</span>
                <span style={{ color: '#C2A558' }}>
                  Avg {broker.avgDaysOverdue} days overdue
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}


