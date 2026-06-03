import { formatCurrency } from '../../../utils/format'
import { TrendingUp } from 'lucide-react'

interface ClientARData {
  clientId: string
  clientName: string
  totalAR: number
  invoiceCount: number
  overdueCount: number
}

interface TopClientsByARProps {
  clients: ClientARData[]
  onClientClick?: (clientId: string) => void
}

export function TopClientsByAR({ clients, onClientClick }: TopClientsByARProps) {
  if (clients.length === 0) {
    return (
      <div className="border" style={{ backgroundColor: '#FFFFFF', borderColor: '#819291' }}>
        <div className="p-6">
          <h2 className="text-lg font-bold mb-4" style={{ color: '#113543' }}>Top Clients by A/R</h2>
          <div className="text-center py-8" style={{ color: '#819291' }}>
            No data available
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="border" style={{ backgroundColor: '#FFFFFF', borderColor: '#819291' }}>
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold" style={{ color: '#113543' }}>Top Clients by A/R</h2>
          <TrendingUp className="w-5 h-5" style={{ color: '#819291' }} />
        </div>
        <div className="space-y-3">
          {clients.slice(0, 5).map((client, index) => (
            <div
              key={client.clientId}
              className={`p-3 rounded transition-colors ${
                onClientClick ? 'cursor-pointer hover:bg-gray-50' : ''
              }`}
              style={{ backgroundColor: index % 2 === 0 ? '#F5F5F5' : '#FFFFFF' }}
              onClick={() => onClientClick?.(client.clientId)}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium text-sm" style={{ color: '#113543' }}>
                  {client.clientName}
                </span>
                <span className="font-bold text-sm" style={{ color: '#113543' }}>
                  {formatCurrency(client.totalAR)}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs" style={{ color: '#819291' }}>
                <span>{client.invoiceCount} invoices</span>
                {client.overdueCount > 0 && (
                  <span style={{ color: '#C2A558' }}>
                    {client.overdueCount} overdue
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}


