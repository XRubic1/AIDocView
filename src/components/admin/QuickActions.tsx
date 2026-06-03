
import {
  FileText,
  Phone,
  Paperclip,
  PlusCircle,
  Upload,
} from 'lucide-react'

interface QuickActionsProps {
  pendingBatchesCount?: number
  collectionsAlertsCount?: number
  unattachedDocumentsCount?: number
  onReviewBatch?: () => void
  onCollectionsQueue?: () => void
  onUnattachedDocuments?: () => void
  onCreateBroker?: () => void
  onCreateClient?: () => void
  onUploadDocuments?: () => void
}

export function QuickActions({
  pendingBatchesCount = 0,
  collectionsAlertsCount = 0,
  unattachedDocumentsCount = 0,
  onReviewBatch,
  onCollectionsQueue,
  onUnattachedDocuments,
  onCreateBroker,
  onCreateClient,
  onUploadDocuments,
}: QuickActionsProps) {
  const actions = [
    {
      label: 'Review Next Batch',
      icon: <FileText className="w-5 h-5" />,
      count: pendingBatchesCount,
      onClick: onReviewBatch,
    },
    {
      label: 'Collections Queue',
      icon: <Phone className="w-5 h-5" />,
      count: collectionsAlertsCount,
      onClick: onCollectionsQueue,
    },
    {
      label: 'Unattached Documents',
      icon: <Paperclip className="w-5 h-5" />,
      count: unattachedDocumentsCount,
      onClick: onUnattachedDocuments,
    },
    {
      label: 'Create Broker',
      icon: <PlusCircle className="w-5 h-5" />,
      onClick: onCreateBroker,
    },
    {
      label: 'Create Client',
      icon: <PlusCircle className="w-5 h-5" />,
      onClick: onCreateClient,
    },
    {
      label: 'Upload Documents',
      icon: <Upload className="w-5 h-5" />,
      onClick: onUploadDocuments,
    },
  ]

  return (
    <div className="border" style={{ backgroundColor: '#FFFFFF', borderColor: '#819291' }}>
      <div className="p-6">
        <h2 className="text-lg font-bold mb-4" style={{ color: '#113543' }}>Quick Actions</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {actions.map((action, index) => (
            <button
              key={index}
              onClick={action.onClick}
              className="flex items-center space-x-3 px-4 py-3 text-white transition-colors rounded text-left"
              style={{
                backgroundColor: '#C2A558',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#b89547'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#C2A558'
              }}
            >
              {action.icon}
              <div className="flex-1">
                <div className="font-medium">{action.label}</div>
                {action.count !== undefined && action.count > 0 && (
                  <div className="text-xs opacity-90">({action.count} pending)</div>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

