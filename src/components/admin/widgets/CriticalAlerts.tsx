import { AlertTriangle, Clock, FileX, DollarSign } from 'lucide-react'
import DashboardPanel from '../../client/dashboard/DashboardPanel'
import { useClientTheme } from '../../../theme/ThemeContext'
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
  const c = useClientTheme()

  const getIcon = (type: Alert['type']) => {
    const color = type === 'missing_document' ? c.mutedLight : c.warning
    switch (type) {
      case 'stale_batch':
        return <Clock className="w-4 h-4" style={{ color }} />
      case 'overdue_invoice':
        return <AlertTriangle className="w-4 h-4" style={{ color: c.warning }} />
      case 'missing_document':
        return <FileX className="w-4 h-4" style={{ color }} />
      case 'short_paid':
        return <DollarSign className="w-4 h-4" style={{ color: c.warning }} />
      default:
        return <AlertTriangle className="w-4 h-4" style={{ color: c.mutedLight }} />
    }
  }

  const getSeverityStyle = (severity: Alert['severity']) => {
    switch (severity) {
      case 'high':
        return {
          borderLeft: `3px solid ${c.warning}`,
          backgroundColor: c.stat.amber,
        }
      case 'medium':
        return {
          borderLeft: `3px solid ${c.info}`,
          backgroundColor: c.stat.blue,
        }
      default:
        return {
          borderLeft: `3px solid ${c.border}`,
          backgroundColor: c.stat.slate,
        }
    }
  }

  if (alerts.length === 0) {
    return (
      <DashboardPanel title="Critical Alerts" icon={AlertTriangle} iconTone="amber" interactive={false}>
        <div className="p-8 text-center" style={{ color: c.secondary }}>
          <div className="text-3xl mb-2">✓</div>
          <div className="font-medium text-sm">No critical alerts</div>
        </div>
      </DashboardPanel>
    )
  }

  return (
    <DashboardPanel
      title="Critical Alerts"
      icon={AlertTriangle}
      iconTone="amber"
      interactive={false}
    >
      <div className="p-4 space-y-2 max-h-96 overflow-y-auto">
        {alerts.map((alert) => (
          <button
            key={alert.id}
            type="button"
            disabled={!onAlertClick}
            onClick={() => onAlertClick?.(alert)}
            className={`w-full p-3 rounded-lg text-left transition-shadow ${
              onAlertClick ? 'dashboard-card-interactive cursor-pointer' : 'cursor-default'
            }`}
            style={getSeverityStyle(alert.severity)}
          >
            <div className="flex items-start gap-3">
              <div className="mt-0.5 shrink-0">{getIcon(alert.type)}</div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm mb-0.5" style={{ color: c.primary }}>
                  {alert.title}
                </div>
                <div className="text-xs" style={{ color: c.secondary }}>
                  {alert.description}
                </div>
                {alert.timestamp && (
                  <div className="text-xs mt-1" style={{ color: c.mutedLight }}>
                    {formatRelativeTime(alert.timestamp)}
                  </div>
                )}
              </div>
            </div>
          </button>
        ))}
      </div>
    </DashboardPanel>
  )
}
