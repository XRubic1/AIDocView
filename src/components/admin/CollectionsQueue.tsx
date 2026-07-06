
import { Phone } from 'lucide-react'
import DashboardPanel from '../client/dashboard/DashboardPanel'
import { useClientTheme } from '../../theme/ThemeContext'
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
  const c = useClientTheme()

  const getResponseBadge = (response: string) => {
    const classMap: Record<string, string> = {
      received: 'status-pill status-pill--approved',
      not_received: 'status-pill status-pill--overdue',
      no_response: 'status-pill status-pill--pending',
    }
    const labels: Record<string, string> = {
      received: 'Received',
      not_received: 'Not Received',
      no_response: 'No Response',
    }
    return (
      <span className={classMap[response] || classMap.no_response}>
        {labels[response] || labels.no_response}
      </span>
    )
  }

  if (alerts.length === 0) {
    return (
      <DashboardPanel title="Collections Queue" icon={Phone} iconTone="red" interactive={false}>
        <div className="p-8 text-center" style={{ color: c.secondary }}>
          <div className="text-3xl mb-2">✓</div>
          <div className="font-medium text-sm">No invoices in collections queue</div>
        </div>
      </DashboardPanel>
    )
  }

  return (
    <DashboardPanel
      title="Collections Queue"
      icon={Phone}
      iconTone="red"
      actionLabel="View all"
      onAction={() => onInvoiceClick?.('')}
      interactive={false}
    >
      <div className="overflow-x-auto">
        <table className="dashboard-table dashboard-table--compact w-full">
          <thead>
            <tr>
              <th>Inv#</th>
              <th>Client</th>
              <th>Broker</th>
              <th className="text-right">Amount</th>
              <th>Expected Date</th>
              <th className="text-center">Days Since</th>
              <th>Response</th>
              <th className="text-center">Contacted</th>
              <th className="text-center">Actions</th>
            </tr>
          </thead>
          <tbody>
            {alerts.map((alert) => (
              <tr
                key={alert.invoice_id}
                className={onInvoiceClick ? 'cursor-pointer' : ''}
                style={{
                  borderLeft:
                    alert.days_since_expected >= 20 ? `3px solid ${c.warning}` : undefined,
                }}
                onClick={() => onInvoiceClick?.(alert.invoice_id)}
              >
                <td className="font-medium">{alert.inv_number}</td>
                <td>{alert.client_name}</td>
                <td>{alert.broker_name}</td>
                <td className="text-right font-medium tabular-nums">
                  {formatCurrency(alert.amount)}
                </td>
                <td>{new Date(alert.expected_payment_date).toLocaleDateString()}</td>
                <td className="text-center">
                  <span
                    className={
                      alert.days_since_expected >= 20
                        ? 'status-pill status-pill--overdue'
                        : 'status-pill status-pill--pending'
                    }
                  >
                    {alert.days_since_expected} days
                  </span>
                </td>
                <td>{getResponseBadge(alert.client_response)}</td>
                <td className="text-center" style={{ color: c.secondary }}>
                  {alert.broker_contacted ? '✓ Yes' : 'No'}
                </td>
                <td className="text-center">
                  <div className="inline-flex items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        onCallBroker?.(alert.invoice_id)
                      }}
                      className="dashboard-btn-secondary !h-7 !px-2 !text-xs"
                    >
                      Call
                    </button>
                    {!alert.broker_contacted && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          onMarkContacted?.(alert.invoice_id)
                        }}
                        className="dashboard-btn-primary !h-7 !px-2 !text-xs"
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
    </DashboardPanel>
  )
}
