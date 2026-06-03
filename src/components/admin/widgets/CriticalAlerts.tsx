import { AlertTriangle, Clock, FileX, DollarSign } from 'lucide-react'
import { formatCurrency } from '../../../utils/format'
import { formatRelativeTime } from '../../../utils/format'

interface Alert {
  id: string
  type: 'stale_batch' | 'overdue_invoice' | 'missing_document' | 'short_paid'
  severity: 'high' | 'medium' | 'low'
  title: string
  description: string
  relatedId?: string
  relatedType?: 'batch' | 'invoice'
  timestamp?: string
}

interface CriticalAlertsProps {
  alerts: Alert[]
  onAlertClick?: (alert: Alert) => void
}

export function CriticalAlerts({ alerts, onAlertClick }: CriticalAlertsProps) {
  const getIcon = (type: Alert['type']) => {
    switch (type) {
      case 'stale_batch':
        return <Clock className="w-5 h-5" style={{ color: '#C2A558' }} />
      case 'overdue_invoice':
        return <AlertTriangle className="w-5 h-5" style={{ color: '#C2A558' }} />
      case 'missing_document':
        return <FileX className="w-5 h-5" style={{ color: '#819291' }} />
      case 'short_paid':
        return <DollarSign className="w-5 h-5" style={{ color: '#C2A558' }} />
      default:
        return <AlertTriangle className="w-5 h-5" style={{ color: '#819291' }} />
    }
  }

  const getSeverityColor = (severity: Alert['severity']) => {
    switch (severity) {
      case 'high':
        return { borderLeft: '4px solid #C2A558', backgroundColor: '#FFF9E6' }
      case 'medium':
        return { borderLeft: '4px solid #819291', backgroundColor: '#F5F5F5' }
      case 'low':
        return { borderLeft: '4px solid #819291', backgroundColor: '#FFFFFF' }
      default:
        return { borderLeft: 'none', backgroundColor: '#FFFFFF' }
    }
  }

  if (alerts.length === 0) {
    return (
      <div className="border" style={{ backgroundColor: '#FFFFFF', borderColor: '#819291' }}>
        <div className="p-6">
          <h2 className="text-lg font-bold mb-4" style={{ color: '#113543' }}>Critical Alerts</h2>
          <div className="text-center py-8" style={{ color: '#819291' }}>
            <div className="text-4xl mb-2">✓</div>
            <div className="font-medium">No critical alerts</div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="border" style={{ backgroundColor: '#FFFFFF', borderColor: '#819291' }}>
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold" style={{ color: '#113543' }}>Critical Alerts</h2>
          <span
            className="px-2 py-1 text-xs font-bold text-white rounded"
            style={{ backgroundColor: '#C2A558' }}
          >
            {alerts.length}
          </span>
        </div>
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {alerts.map((alert) => (
            <div
              key={alert.id}
              className={`p-3 rounded transition-colors ${
                onAlertClick ? 'cursor-pointer hover:shadow-md' : ''
              }`}
              style={getSeverityColor(alert.severity)}
              onClick={() => onAlertClick?.(alert)}
            >
              <div className="flex items-start space-x-3">
                <div className="mt-0.5">{getIcon(alert.type)}</div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm mb-1" style={{ color: '#113543' }}>
                    {alert.title}
                  </div>
                  <div className="text-xs mb-1" style={{ color: '#819291' }}>
                    {alert.description}
                  </div>
                  {alert.timestamp && (
                    <div className="text-xs" style={{ color: '#819291' }}>
                      {formatRelativeTime(alert.timestamp)}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}


