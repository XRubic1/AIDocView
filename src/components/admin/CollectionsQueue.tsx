
import { formatCurrency } from '../../utils/format'
import { CollectionsAlert } from '../../types/admin'

interface CollectionsQueueProps {
  alerts: CollectionsAlert[]
  onInvoiceClick?: (invoiceId: string) => void
  onCallBroker?: (invoiceId: string) => void
  onMarkContacted?: (invoiceId: string) => void
}

export function CollectionsQueue({
  alerts,
  onInvoiceClick,
  onCallBroker,
  onMarkContacted,
}: CollectionsQueueProps) {
  const getResponseBadge = (response: string) => {
    const config = {
      received: { bg: '#819291', text: '#FFFFFF', label: 'Received' },
      not_received: { bg: '#C2A558', text: '#FFFFFF', label: 'Not Received' },
      no_response: { bg: '#819291', text: '#FFFFFF', label: 'No Response' },
    }
    const item = config[response as keyof typeof config] || config.no_response

    return (
      <span
        className="inline-flex items-center px-2.5 py-0.5 text-xs font-medium"
        style={{ backgroundColor: item.bg, color: item.text }}
      >
        {item.label}
      </span>
    )
  }

  if (alerts.length === 0) {
    return (
      <div className="border p-6" style={{ backgroundColor: '#FFFFFF', borderColor: '#819291' }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold" style={{ color: '#113543' }}>Collections Queue</h2>
          <button className="text-sm transition-colors" style={{ color: '#819291' }}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#113543' }}
            onMouseLeave={(e) => { e.currentTarget.style.color = '#819291' }}>
            View All Collections
          </button>
        </div>
        <div className="flex items-center justify-center py-8" style={{ color: '#819291' }}>
          <div className="text-center">
            <div className="text-4xl mb-2">✓</div>
            <div className="font-medium">No invoices in collections queue</div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="border" style={{ backgroundColor: '#FFFFFF', borderColor: '#819291' }}>
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold" style={{ color: '#113543' }}>Collections Queue</h2>
            <p className="text-sm mt-1" style={{ color: '#819291' }}>
              Invoices requiring broker contact (Day +15)
            </p>
          </div>
          <button className="text-sm font-medium transition-colors" style={{ color: '#819291' }}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#113543' }}
            onMouseLeave={(e) => { e.currentTarget.style.color = '#819291' }}>
            View All Collections
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b" style={{ borderColor: '#819291' }}>
                <th className="text-left py-3 px-4 text-sm font-semibold" style={{ color: '#113543' }}>
                  Inv#
                </th>
                <th className="text-left py-3 px-4 text-sm font-semibold" style={{ color: '#113543' }}>
                  Client
                </th>
                <th className="text-left py-3 px-4 text-sm font-semibold" style={{ color: '#113543' }}>
                  Broker
                </th>
                <th className="text-right py-3 px-4 text-sm font-semibold" style={{ color: '#113543' }}>
                  Amount
                </th>
                <th className="text-left py-3 px-4 text-sm font-semibold" style={{ color: '#113543' }}>
                  Expected Date
                </th>
                <th className="text-center py-3 px-4 text-sm font-semibold" style={{ color: '#113543' }}>
                  Days Since
                </th>
                <th className="text-left py-3 px-4 text-sm font-semibold" style={{ color: '#113543' }}>
                  Response
                </th>
                <th className="text-center py-3 px-4 text-sm font-semibold" style={{ color: '#113543' }}>
                  Contacted
                </th>
                <th className="text-center py-3 px-4 text-sm font-semibold" style={{ color: '#113543' }}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {alerts.map((alert, index) => (
                <tr
                  key={alert.invoice_id}
                  className={`border-b transition-colors ${
                    onInvoiceClick ? 'cursor-pointer' : ''
                  }`}
                  style={{
                    borderColor: '#819291',
                    backgroundColor: index % 2 === 0 ? '#f8f9fa' : '#FFFFFF',
                    borderLeft: alert.days_since_expected >= 20 ? '4px solid #C2A558' : 'none',
                  }}
                  onClick={() => onInvoiceClick?.(alert.invoice_id)}
                  onMouseEnter={(e) => {
                    if (onInvoiceClick) {
                      e.currentTarget.style.backgroundColor = '#f0f0f0'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (onInvoiceClick) {
                      e.currentTarget.style.backgroundColor = index % 2 === 0 ? '#f8f9fa' : '#FFFFFF'
                    }
                  }}
                >
                  <td className="py-3 px-4 text-sm font-medium" style={{ color: '#113543' }}>
                    {alert.inv_number}
                  </td>
                  <td className="py-3 px-4 text-sm" style={{ color: '#819291' }}>{alert.client_name}</td>
                  <td className="py-3 px-4 text-sm" style={{ color: '#819291' }}>{alert.broker_name}</td>
                  <td className="py-3 px-4 text-sm text-right font-medium" style={{ color: '#113543' }}>
                    {formatCurrency(alert.amount)}
                  </td>
                  <td className="py-3 px-4 text-sm" style={{ color: '#819291' }}>
                    {new Date(alert.expected_payment_date).toLocaleDateString()}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span
                      className="inline-flex items-center px-2.5 py-0.5 text-xs font-medium"
                      style={{
                        backgroundColor: alert.days_since_expected >= 20 ? '#C2A558' : '#FFF9E6',
                        color: alert.days_since_expected >= 20 ? '#FFFFFF' : '#113543',
                      }}
                    >
                      {alert.days_since_expected} days
                    </span>
                  </td>
                  <td className="py-3 px-4 text-sm">{getResponseBadge(alert.client_response)}</td>
                  <td className="py-3 px-4 text-center">
                    {alert.broker_contacted ? (
                      <span className="text-sm" style={{ color: '#819291' }}>✓ Yes</span>
                    ) : (
                      <span className="text-sm" style={{ color: '#819291' }}>No</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          onCallBroker?.(alert.invoice_id)
                        }}
                        className="px-2 py-1 text-xs font-medium text-white transition-colors"
                        style={{ backgroundColor: '#819291' }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = '#6b7a7a'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = '#819291'
                        }}
                      >
                        Call
                      </button>
                      {!alert.broker_contacted && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            onMarkContacted?.(alert.invoice_id)
                          }}
                          className="px-2 py-1 text-xs font-medium text-white transition-colors"
                          style={{ backgroundColor: '#C2A558' }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = '#b89547'
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = '#C2A558'
                          }}
                        >
                          Mark
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

