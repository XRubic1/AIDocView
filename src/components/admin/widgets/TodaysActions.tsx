import { CheckCircle, CheckCircle2, Clock, Phone, FileText, ListTodo, Scale } from 'lucide-react'
import DashboardPanel from '../../client/dashboard/DashboardPanel'
import { useClientTheme } from '../../../theme/ThemeContext'

interface ActionItem {
  id: string
  type: 'batch_review' | 'broker_call' | 'document_upload' | 'invoice_approval' | 'review_dispute'
  title: string
  description: string
  priority: 'high' | 'medium' | 'low'
  relatedId?: string
}

interface TodaysActionsProps {
  actions: ActionItem[]
  onActionClick?: (action: ActionItem) => void
}

export function TodaysActions({ actions, onActionClick }: TodaysActionsProps) {
  const c = useClientTheme()

  const getIcon = (type: ActionItem['type']) => {
    switch (type) {
      case 'batch_review':
        return <FileText className="w-4 h-4" />
      case 'broker_call':
        return <Phone className="w-4 h-4" />
      case 'document_upload':
        return <FileText className="w-4 h-4" />
      case 'invoice_approval':
        return <CheckCircle className="w-4 h-4" />
      case 'review_dispute':
        return <Scale className="w-4 h-4" />
      default:
        return <Clock className="w-4 h-4" />
    }
  }

  /** Left-border + tint by priority for urgency scanning. */
  const getPriorityStyle = (priority: ActionItem['priority']) => {
    switch (priority) {
      case 'high':
        return {
          color: c.error,
          borderLeft: `3px solid ${c.error}`,
          backgroundColor: c.stat.red,
        }
      case 'medium':
        return {
          color: c.warning,
          borderLeft: `3px solid ${c.warning}`,
          backgroundColor: c.stat.amber,
        }
      default:
        return {
          color: c.secondary,
          borderLeft: `3px solid ${c.border}`,
          backgroundColor: c.stat.slate,
        }
    }
  }

  if (actions.length === 0) {
    return (
      <DashboardPanel title="Today's Actions" icon={ListTodo} iconTone="blue" interactive={false}>
        <div className="p-8 text-center flex flex-col items-center gap-2" style={{ color: c.secondary }}>
          <CheckCircle2 className="w-8 h-8" style={{ color: c.success }} strokeWidth={1.5} />
          <div className="font-medium text-sm" style={{ color: c.primary }}>
            All clear
          </div>
          <div className="text-xs">All caught up for today</div>
        </div>
      </DashboardPanel>
    )
  }

  return (
    <DashboardPanel
      title="Today's Actions"
      icon={ListTodo}
      iconTone="blue"
      badge={actions.length}
      badgeTone="blue"
      interactive={false}
    >
      <div className="p-4 space-y-2 max-h-96 overflow-y-auto">
        {actions.map((action) => {
          const priorityStyle = getPriorityStyle(action.priority)
          return (
            <button
              key={action.id}
              type="button"
              disabled={!onActionClick}
              onClick={() => onActionClick?.(action)}
              className={`w-full p-3 rounded-lg text-left transition-shadow ${
                onActionClick ? 'dashboard-card-interactive cursor-pointer' : 'cursor-default'
              }`}
              style={{
                backgroundColor: priorityStyle.backgroundColor,
                borderLeft: priorityStyle.borderLeft,
              }}
            >
              <div className="flex items-start gap-3">
                <div style={{ color: priorityStyle.color }} className="mt-0.5 shrink-0">
                  {getIcon(action.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm mb-0.5" style={{ color: c.primary }}>
                    {action.title}
                  </div>
                  <div className="text-xs" style={{ color: c.secondary }}>
                    {action.description}
                  </div>
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </DashboardPanel>
  )
}
