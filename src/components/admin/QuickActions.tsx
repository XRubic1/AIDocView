
import {
  FileText,
  Phone,
  Paperclip,
  PlusCircle,
  Upload,
} from 'lucide-react'
import DashboardPanel from '../client/dashboard/DashboardPanel'
import { useClientTheme } from '../../theme/ThemeContext'

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
  const c = useClientTheme()

  const actions = [
    {
      label: 'Review Next Batch',
      icon: FileText,
      count: pendingBatchesCount,
      onClick: onReviewBatch,
    },
    {
      label: 'Collections Queue',
      icon: Phone,
      count: collectionsAlertsCount,
      onClick: onCollectionsQueue,
    },
    {
      label: 'Unattached Documents',
      icon: Paperclip,
      count: unattachedDocumentsCount,
      onClick: onUnattachedDocuments,
    },
    {
      label: 'Create Broker',
      icon: PlusCircle,
      onClick: onCreateBroker,
    },
    {
      label: 'Create Client',
      icon: PlusCircle,
      onClick: onCreateClient,
    },
    {
      label: 'Upload Documents',
      icon: Upload,
      onClick: onUploadDocuments,
    },
  ]

  return (
    <DashboardPanel title="Quick Actions" compact interactive={false}>
      <div className="p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {actions.map((action) => {
          const Icon = action.icon
          return (
            <button
              key={action.label}
              type="button"
              onClick={action.onClick}
              className="dashboard-btn-primary flex items-center gap-2 px-3 py-2.5 text-left text-xs"
            >
              <Icon className="w-4 h-4 shrink-0" strokeWidth={1.75} />
              <div className="min-w-0 flex-1">
                <div className="font-semibold truncate">{action.label}</div>
                {action.count !== undefined && action.count > 0 && (
                  <div className="opacity-80 tabular-nums" style={{ color: c.card }}>
                    {action.count} pending
                  </div>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </DashboardPanel>
  )
}
