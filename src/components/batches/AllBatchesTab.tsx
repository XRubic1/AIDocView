import { useMemo, useState } from 'react'
import { getAllBatches, updateBatchStatus } from '../../data/mockBatches'
import { PendingBatch } from '../../types/admin'
import AdminBatchesListView, { type AdminBatchListItem } from './AdminBatchesListView'
import { useClientTheme, useTheme } from '../../theme/ThemeContext'
import { useTenantDataRevision } from '../../hooks/useTenantDataRevision'
import { useAdminCapabilities } from '../../hooks/useAdminCapabilities'
import {
  canOpenPacketRework,
  getAdminBatchAiReviewProgress,
  resolveAdminBatchWorkflowStage,
  type AdminBatchWorkflowStage,
} from '../../utils/adminBatchQueue'
import { deleteUnsubmittedBatch } from '../../services/credyx/deleteBatch'
import { useToast } from '../ui/ToastProvider'

interface AllBatchesTabProps {
  /** Pre-filtered batches from page-level display chips. */
  batches?: PendingBatch[]
  onBatchSelect: (batchId: string, stage?: AdminBatchWorkflowStage) => void
  /** Open the Packets rework workspace (same UI as AI upload confirm). */
  onPacketRework: (batchId: string) => void
  /** Parent list refresh after delete / status change. */
  onBatchesChanged?: () => void
}

interface Batch extends PendingBatch {
  reviewed_at?: string
  reviewed_by?: string
  approved_count?: number
  rejected_count?: number
  in_use?: boolean
  in_use_by?: string
}

export default function AllBatchesTab({
  batches: batchesProp,
  onBatchSelect,
  onPacketRework,
  onBatchesChanged,
}: AllBatchesTabProps) {
  const c = useClientTheme()
  const { resolvedTheme } = useTheme()
  const { showToast } = useToast()
  const { capabilities } = useAdminCapabilities()
  const canDeleteBatches = capabilities.canDeleteBatches
  const tenantRevision = useTenantDataRevision()
  const [listVersion, setListVersion] = useState(0)
  const allBatches = useMemo(
    () => getAllBatches() as Batch[],
    [listVersion, tenantRevision]
  )
  const batches = (batchesProp as Batch[] | undefined) ?? allBatches
  const [showNavigationModal, setShowNavigationModal] = useState(false)
  const [selectedBatchForNavigation, setSelectedBatchForNavigation] = useState<Batch | null>(null)

  const listItems: AdminBatchListItem[] = batches.map((batch) => {
    const aiProgress = getAdminBatchAiReviewProgress(batch.id)
    return {
      id: batch.id,
      batch_number: batch.batch_number,
      client_name: batch.client_name,
      total_invoices: batch.total_invoices,
      total_amount: batch.total_amount,
      submitted_at: batch.submitted_at,
      status: batch.status,
      upload_mode: batch.upload_mode,
      sort_status: batch.sort_status,
      in_use: batch.in_use,
      in_use_by: batch.in_use_by,
      reviewed_at: batch.reviewed_at ?? null,
      reviewed_by: batch.reviewed_by,
      ai_review_label: aiProgress.label,
      ai_review_completed: aiProgress.completed,
      ai_review_total: aiProgress.total,
      packet_rework_ready: canOpenPacketRework(batch),
    }
  })

  /** Confirm + delete — admin / super_admin only. */
  const handleDeleteBatch = async (item: AdminBatchListItem, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!canDeleteBatches) {
      showToast('Only admins can delete batches', 'error')
      return
    }
    const full =
      allBatches.find((b) => b.id === item.id) ?? batches.find((b) => b.id === item.id)
    if (!full) return
    const invoiceNote =
      full.total_invoices > 0
        ? ` This removes ${full.total_invoices} invoice${full.total_invoices === 1 ? '' : 's'} and their documents.`
        : ''
    if (
      !window.confirm(
        `Delete batch ${full.batch_number}?${invoiceNote} This cannot be undone.`
      )
    ) {
      return
    }
    try {
      await deleteUnsubmittedBatch(full.id)
      setListVersion((v) => v + 1)
      onBatchesChanged?.()
      showToast(`Deleted batch ${full.batch_number}`, 'success')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not delete batch', 'error')
    }
  }

  const handleViewClick = (batch: AdminBatchListItem, e: React.MouseEvent) => {
    e.stopPropagation()
    const full = allBatches.find((b) => b.id === batch.id) ?? batches.find((b) => b.id === batch.id)
    if (!full) return

    if (full.status === 'verification' || full.status === 'approval') {
      setSelectedBatchForNavigation(full)
      setShowNavigationModal(true)
      return
    }

    onBatchSelect(full.id, resolveAdminBatchWorkflowStage(full))
  }

  const handlePreviewClick = (batch: AdminBatchListItem, e: React.MouseEvent) => {
    e.stopPropagation()
    const full = allBatches.find((b) => b.id === batch.id) ?? batches.find((b) => b.id === batch.id)
    if (!full) return
    if (!canOpenPacketRework(full)) {
      showToast('Packet rework is available once invoices are created and AI review finishes.', 'info')
      onBatchSelect(full.id, 'ai')
      return
    }
    onPacketRework(batch.id)
  }

  const handleReturnToVerification = (batch: AdminBatchListItem, e: React.MouseEvent) => {
    e.stopPropagation()
    const full = allBatches.find((b) => b.id === batch.id)
    if (
      !full ||
      full.status === 'verification' ||
      full.status === 'draft' ||
      full.status === 'creating'
    ) {
      return
    }

    const confirmed = window.confirm(
      `Return batch ${full.batch_number} to Verification? It will reappear under the Verification filter.`
    )
    if (!confirmed) return

    updateBatchStatus(full.id, 'verification')
    setListVersion((v) => v + 1)
  }

  const canReturnToVerification = (status: string) =>
    status !== 'verification' &&
    status !== 'draft' &&
    status !== 'creating' &&
    status !== 'ready_to_post'

  const handleNavigateToStage = (stage: AdminBatchWorkflowStage) => {
    if (selectedBatchForNavigation) {
      onBatchSelect(selectedBatchForNavigation.id, stage)
      setShowNavigationModal(false)
      setSelectedBatchForNavigation(null)
    }
  }

  return (
    <>
      <AdminBatchesListView
        batches={listItems}
        variant="all"
        onSelectBatch={(batchId) => {
          const full =
            allBatches.find((b) => b.id === batchId) ?? batches.find((b) => b.id === batchId)
          if (!full) {
            onBatchSelect(batchId)
            return
          }
          if (full.status === 'verification' || full.status === 'approval') {
            setSelectedBatchForNavigation(full)
            setShowNavigationModal(true)
            return
          }
          onBatchSelect(batchId, resolveAdminBatchWorkflowStage(full))
        }}
        onViewClick={handleViewClick}
        onPreviewClick={handlePreviewClick}
        onReturnToApproval={handleReturnToVerification}
        canReturnToApproval={canReturnToVerification}
        onDeleteBatch={canDeleteBatches ? handleDeleteBatch : undefined}
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
                    Open batch
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
                  onClick={() => {
                    onPacketRework(selectedBatchForNavigation.id)
                    setShowNavigationModal(false)
                    setSelectedBatchForNavigation(null)
                  }}
                  className="w-full text-left px-4 py-3 rounded-lg border transition-colors dashboard-card-interactive"
                  style={{ borderColor: c.border, backgroundColor: c.card }}
                >
                  <div className="font-medium text-sm" style={{ color: c.primary }}>
                    Packets rework
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: c.secondary }}>
                    Same Packets window as AI upload — reassign docs and edit invoice packets
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => handleNavigateToStage('verification')}
                  className="w-full text-left px-4 py-3 rounded-lg border transition-colors dashboard-card-interactive"
                  style={{ borderColor: c.border, backgroundColor: c.card }}
                >
                  <div className="font-medium text-sm" style={{ color: c.primary }}>
                    AI verification
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: c.secondary }}>
                    Packet docs, AI outcome, mark OK / needs review / hold, and process
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => handleNavigateToStage('ready_to_post')}
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
