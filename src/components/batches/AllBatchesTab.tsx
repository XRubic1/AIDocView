import { useMemo, useState } from 'react'
import { getAllBatches, updateBatchStatus } from '../../data/mockBatches'
import { PendingBatch } from '../../types/admin'
import AdminBatchesListView, { type AdminBatchListItem } from './AdminBatchesListView'
import { useClientTheme, useTheme } from '../../theme/ThemeContext'
import { useTenantDataRevision } from '../../hooks/useTenantDataRevision'

interface AllBatchesTabProps {
  onBatchSelect: (batchId: string, tab?: 'ready_to_post' | 'verification' | 'ai') => void
}

interface Batch extends PendingBatch {
  reviewed_at?: string
  reviewed_by?: string
  approved_count?: number
  rejected_count?: number
  in_use?: boolean
  in_use_by?: string
}

export default function AllBatchesTab({ onBatchSelect }: AllBatchesTabProps) {
  const c = useClientTheme()
  const { resolvedTheme } = useTheme()
  const tenantRevision = useTenantDataRevision()
  const [listVersion, setListVersion] = useState(0)
  const batches = useMemo(() => getAllBatches() as Batch[], [listVersion, tenantRevision])
  const [showNavigationModal, setShowNavigationModal] = useState(false)
  const [selectedBatchForNavigation, setSelectedBatchForNavigation] = useState<Batch | null>(null)

  const listItems: AdminBatchListItem[] = batches.map((batch) => ({
    id: batch.id,
    batch_number: batch.batch_number,
    client_name: batch.client_name,
    total_invoices: batch.total_invoices,
    total_amount: batch.total_amount,
    submitted_at: batch.submitted_at,
    status: batch.status === 'approval' ? 'verification' : batch.status,
    upload_mode: batch.upload_mode,
    in_use: batch.in_use,
    in_use_by: batch.in_use_by,
    reviewed_at: batch.reviewed_at ?? null,
    reviewed_by: batch.reviewed_by,
  }))

  const handleViewClick = (batch: AdminBatchListItem, e: React.MouseEvent) => {
    e.stopPropagation()
    const full = batches.find((b) => b.id === batch.id)
    if (!full) return

    if (full.status === 'ready_to_post') {
      onBatchSelect(full.id, 'ready_to_post')
    } else if (full.status === 'verification' || full.status === 'approval') {
      setSelectedBatchForNavigation(full)
      setShowNavigationModal(true)
    } else if (full.upload_mode === 'ai' || full.sort_status) {
      onBatchSelect(full.id, 'ai')
    } else {
      onBatchSelect(full.id)
    }
  }

  const handleReturnToVerification = (batch: AdminBatchListItem, e: React.MouseEvent) => {
    e.stopPropagation()
    const full = batches.find((b) => b.id === batch.id)
    if (!full || full.status === 'verification' || full.status === 'draft') return

    const confirmed = window.confirm(
      `Return batch ${full.batch_number} to Verification? It will reappear in the Verification workflow.`
    )
    if (!confirmed) return

    updateBatchStatus(full.id, 'verification')
    setListVersion((v) => v + 1)
  }

  const canReturnToVerification = (status: string) =>
    status !== 'verification' && status !== 'draft' && status !== 'ready_to_post'

  const handleNavigateToTab = (tab: 'ready_to_post' | 'verification' | 'ai') => {
    if (selectedBatchForNavigation) {
      onBatchSelect(selectedBatchForNavigation.id, tab)
      setShowNavigationModal(false)
      setSelectedBatchForNavigation(null)
    }
  }

  return (
    <>
      <AdminBatchesListView
        batches={listItems}
        variant="all"
        onSelectBatch={(batchId) => onBatchSelect(batchId)}
        onViewClick={handleViewClick}
        onReturnToApproval={handleReturnToVerification}
        canReturnToApproval={canReturnToVerification}
        actionLabel="View"
        emptyTitle="No batches found"
        emptyHint="Try adjusting your search or filters"
      />

      {showNavigationModal && selectedBatchForNavigation && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <button
              type="button"
              className="absolute inset-0"
              style={{
                backgroundColor:
                  resolvedTheme === 'dark' ? 'rgba(0,0,0,0.5)' : 'rgba(15,23,42,0.2)',
              }}
              onClick={() => {
                setShowNavigationModal(false)
                setSelectedBatchForNavigation(null)
              }}
              aria-label="Close"
            />
            <div className="dashboard-card relative max-w-md w-full z-10 overflow-hidden">
              <div
                className="flex items-center justify-between gap-3 px-5 py-3.5 border-b"
                style={{ borderColor: c.border }}
              >
                <div className="min-w-0">
                  <h3 className="text-base font-semibold truncate" style={{ color: c.primary }}>
                    Select workflow stage
                  </h3>
                  <p className="text-sm truncate" style={{ color: c.secondary }}>
                    {selectedBatchForNavigation.batch_number}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowNavigationModal(false)
                    setSelectedBatchForNavigation(null)
                  }}
                  className="client-header-icon-btn p-1.5 rounded-lg shrink-0"
                  style={{ color: c.muted }}
                  aria-label="Close"
                >
                  ×
                </button>
              </div>

              <div className="p-4 space-y-2">
                <button
                  type="button"
                  onClick={() => handleNavigateToTab('verification')}
                  className="w-full text-left px-4 py-3 rounded-lg border transition-colors dashboard-card-interactive"
                  style={{ borderColor: c.border, backgroundColor: c.card }}
                >
                  <div className="font-medium text-sm" style={{ color: c.primary }}>
                    Verification
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: c.secondary }}>
                    Verify, hold/approve, and process batch
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => handleNavigateToTab('ai')}
                  className="w-full text-left px-4 py-3 rounded-lg border transition-colors dashboard-card-interactive"
                  style={{ borderColor: c.border, backgroundColor: c.card }}
                >
                  <div className="font-medium text-sm" style={{ color: c.primary }}>
                    AI
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: c.secondary }}>
                    DocSort mismatches and AI review status
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => handleNavigateToTab('ready_to_post')}
                  className="w-full text-left px-4 py-3 rounded-lg border transition-colors dashboard-card-interactive"
                  style={{ borderColor: c.border, backgroundColor: c.card }}
                >
                  <div className="font-medium text-sm" style={{ color: c.primary }}>
                    Ready to Post
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: c.secondary }}>
                    Assign paperwork and brokers
                  </div>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
