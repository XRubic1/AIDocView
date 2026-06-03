import { CheckCircle, Clock, Phone, FileText } from 'lucide-react'

interface ActionItem {
  id: string
  type: 'batch_review' | 'broker_call' | 'document_upload' | 'invoice_approval'
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
      default:
        return <Clock className="w-4 h-4" />
    }
  }

  const getPriorityColor = (priority: ActionItem['priority']) => {
    switch (priority) {
      case 'high':
        return { color: '#C2A558', backgroundColor: '#FFF9E6' }
      case 'medium':
        return { color: '#819291', backgroundColor: '#F5F5F5' }
      case 'low':
        return { color: '#819291', backgroundColor: '#FFFFFF' }
      default:
        return { color: '#819291', backgroundColor: '#FFFFFF' }
    }
  }

  if (actions.length === 0) {
    return (
      <div className="border" style={{ backgroundColor: '#FFFFFF', borderColor: '#819291' }}>
        <div className="p-6">
          <h2 className="text-lg font-bold mb-4" style={{ color: '#113543' }}>Today's Actions</h2>
          <div className="text-center py-8" style={{ color: '#819291' }}>
            <div className="text-4xl mb-2">✓</div>
            <div className="font-medium">All caught up!</div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="border" style={{ backgroundColor: '#FFFFFF', borderColor: '#819291' }}>
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold" style={{ color: '#113543' }}>Today's Actions</h2>
          <span
            className="px-2 py-1 text-xs font-bold text-white rounded"
            style={{ backgroundColor: '#819291' }}
          >
            {actions.length}
          </span>
        </div>
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {actions.map((action) => {
            const priorityStyle = getPriorityColor(action.priority)
            return (
              <div
                key={action.id}
                className={`p-3 rounded transition-colors ${
                  onActionClick ? 'cursor-pointer hover:shadow-md' : ''
                }`}
                style={{ backgroundColor: priorityStyle.backgroundColor }}
                onClick={() => onActionClick?.(action)}
              >
                <div className="flex items-start space-x-3">
                  <div style={{ color: priorityStyle.color }} className="mt-0.5">
                    {getIcon(action.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm mb-1" style={{ color: '#113543' }}>
                      {action.title}
                    </div>
                    <div className="text-xs" style={{ color: '#819291' }}>
                      {action.description}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}


