
import { formatRelativeTime } from '../../utils/format'
import { RecentActivity as RecentActivityType } from '../../types/admin'
import {
  FileText,
  AlertCircle,
  Upload,
  Phone,
  XCircle,
} from 'lucide-react'

interface RecentActivityProps {
  activities: RecentActivityType[]
  onActivityClick?: (activityId: string, type: string) => void
}

export function RecentActivity({
  activities,
  onActivityClick,
}: RecentActivityProps) {
  const getActivityIcon = (type: string) => {
    const iconClass = 'w-4 h-4'
    switch (type) {
      case 'batch_submitted':
        return <FileText className={iconClass} />
      case 'invoice_status_changed':
        return <AlertCircle className={iconClass} />
      case 'force_close':
        return <XCircle className={iconClass} />
      case 'document_uploaded':
        return <Upload className={iconClass} />
      case 'broker_contacted':
        return <Phone className={iconClass} />
      default:
        return <FileText className={iconClass} />
    }
  }

  const getActivityColor = (type: string) => {
    switch (type) {
      case 'batch_submitted':
        return { color: '#819291' }
      case 'invoice_status_changed':
        return { color: '#C2A558' }
      case 'force_close':
        return { color: '#C2A558' }
      case 'document_uploaded':
        return { color: '#819291' }
      case 'broker_contacted':
        return { color: '#C2A558' }
      default:
        return { color: '#819291' }
    }
  }

  if (activities.length === 0) {
    return (
      <div className="border p-6" style={{ backgroundColor: '#FFFFFF', borderColor: '#819291' }}>
        <h2 className="text-lg font-bold mb-4" style={{ color: '#113543' }}>Recent Activity</h2>
        <div className="flex items-center justify-center py-8" style={{ color: '#819291' }}>
          <div className="text-center">
            <div className="text-4xl mb-2">🕐</div>
            <div className="font-medium">No recent activity</div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="border" style={{ backgroundColor: '#FFFFFF', borderColor: '#819291' }}>
      <div className="p-6">
        <h2 className="text-lg font-bold mb-4" style={{ color: '#113543' }}>Recent Activity</h2>
        <p className="text-sm mb-4" style={{ color: '#819291' }}>Latest system events requiring attention</p>
        <div className="space-y-3">
          {activities.map((activity) => (
            <div
              key={activity.id}
              className={`flex items-start space-x-3 p-3 border-l-4 transition-colors ${
                onActivityClick ? 'cursor-pointer' : ''
              }`}
              style={{
                borderLeftColor: '#819291',
              }}
              onClick={() => onActivityClick?.(activity.id, activity.type)}
              onMouseEnter={(e) => {
                if (onActivityClick) {
                  e.currentTarget.style.backgroundColor = '#f8f9fa'
                }
              }}
              onMouseLeave={(e) => {
                if (onActivityClick) {
                  e.currentTarget.style.backgroundColor = 'transparent'
                }
              }}
            >
              <div className="mt-0.5" style={getActivityColor(activity.type)}>
                {getActivityIcon(activity.type)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm" style={{ color: '#113543' }}>{activity.description}</div>
                <div className="text-xs mt-1" style={{ color: '#819291' }}>
                  {activity.user_name} • {formatRelativeTime(activity.timestamp)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

