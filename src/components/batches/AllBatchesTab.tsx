import { useMemo, useState } from 'react'
import { getAllBatches, updateBatchStatus } from '../../data/mockBatches'
import { PendingBatch } from '../../types/admin'
import AdminBatchesListView, {
  type AdminBatchListItem,
  buildBatchDocumentCountMap,
} from './AdminBatchesListView'
import { useClientTheme, useTheme } from '../../theme/ThemeContext'
import { useTenantDataRevision } from '../../hooks/useTenantDataRevision'
import { useAdminCapabilities } from '../../hooks/useAdminCapabilities'
import {
  canOpenDocSplitter,
  canOpenPacketRework,
  getAdminBatchAiReviewProgress,
  resolveAdminBatchWorkflowStage,
  type AdminBatchWorkflowStage,
} from '../../utils/adminBatchQueue'
import { batchNeedsDocSplit } from '../../utils/batchDocSplit'
import { deleteUnsubmittedBatch } from '../../services/credyx/deleteBatch'
import {
  batchIsStuckCreating,
  releaseBatchToManualCreation,
} from '../../services/batchReworkService'
import { useToast } from '../ui/ToastProvider'

interface AllBatchesTabProps {
  /** Pre-filtered batches from page-level display chips. */
  batches?: PendingBatch[]
  onBatchSelect: (batchId: string, stage?: AdminBatchWorkflowStage) => void
  /** Open the Packets rework workspace (same UI as AI upload confirm). */
  onPacketRework: (batchId: string) => void
  /** Open Doc Splitter when combined PDFs need Credyx review. */
  onDocSplitter?: (batchId: string) => void
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
  onDocSplitter,
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

  /** Batch → paperwork document count. */
  const documentCounts = useMemo(
    () => buildBatchDocumentCountMap(batches),
    [listVersion, tenantRevision, batches]
  )

  const listItems: AdminBatchListItem[] = batches.map((batch) => {
    const aiProgress = getAdminBatchAiReviewProgress(batch.id)
    return {
      id: batch.id,
      batch_number: batch.batch_number,
      client_name: batch.client_name,
      client_id: batch.client_id,
      total_invoices: batch.total_invoices,
      documents_count: documentCounts.get(batch.id) ?? 0,
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
      packet_rework_ready: canOpenPacketRework(batch) && !batchNeedsDocSplit(batch),
      needs_doc_split: batchNeedsDocSplit(batch),
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

  const canReturnToVerification = (status: string) =>
    status !== 'verification' &&
    status !== 'draft' &&
    status !== 'creating' &&
    status !== 'needs_split' &&
    status !== 'ready_to_post'

  const shouldShowOpenModal = (batch: Batch) =>
    batch.status === 'verification' ||
    batch.status === 'approval' ||
    batch.status === 'needs_split' ||
    batchNeedsDocSplit(batch)

  const handleViewClick = (batch: AdminBatchListItem, e: React.MouseEvent) => {
    e.stopPropagation()
    const full = allBatches.find((b) => b.id === batch.id) ?? batches.find((b) => b.id === batch.id)
    if (!full) return

    if (shouldShowOpenModal(full)) {
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
    if (canOpenDocSplitter(full) && onDocSplitter) {
      onDocSplitter(full.id)
      return
    }
    if (!canOpenPacketRework(full)) {
      showToast('Packet rework is available once invoices are created and AI review finishes.', 'info')
      onBatchSelect(full.id, 'ai')
      return
    }
    onPacketRework(batch.id)
  }

  /** Right-click → Doc Splitter (always, when the parent wired the handler). */
  const handleDocSplitterClick = (batch: AdminBatchListItem, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!onDocSplitter) {
      showToast('Doc Splitter is not available here.', 'info')
      return
    }
    onDocSplitter(batch.id)
  }

  const handleManualCreation = async (item: AdminBatchListItem, e: React.MouseEvent) => {
    e.stopPropagation()
    const full =
      allBatches.find((b) => b.id === item.id) ?? batches.find((b) => b.id === item.id)
    if (!full || !batchIsStuckCreating(full)) return

    const confirmed = window.confirm(
      `Stop AI on ${full.batch_number} and open Packet Rework? All uploaded docs go to Unassigned so you can build packets by hand.`
    )
    if (!confirmed) return

    try {
      await releaseBatchToManualCreation(full.id)
      setListVersion((v) => v + 1)
      onBatchesChanged?.()
      showToast('AI stopped — assign documents in Packet Rework.', 'success')
      onPacketRework(full.id)
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not switch to manual creation', 'error')
    }
  }

  const handleReturnToVerification = (batch: AdminBatchListItem, e: React.MouseEvent) => {
    e.stopPropagation()
    const full = allBatches.find((b) => b.id === batch.id)
    if (
      !full ||
      full.status === 'verification' ||
      full.status === 'draft' ||
      full.status === 'creating' ||
      full.status === 'needs_split'
    ) {
      return
    }

    const confirmed = window.confirm(
      `Return batch ${full.batch_number} to AI Verification? It will reappear under the Verification filter.`
    )
    if (!confirmed) return

    updateBatchStatus(full.id, 'verification')
    setListVersion((v) => v + 1)
    onBatchSelect(full.id, 'verification')
  }

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
          // Doc Split / Verification: let staff pick the workspace.
          if (shouldShowOpenModal(full)) {
            setSelectedBatchForNavigation(full)
            setShowNavigationModal(true)
            return
          }
          onBatchSelect(batchId, resolveAdminBatchWorkflowStage(full))
        }}
        onViewClick={handleViewClick}
        onPreviewClick={handlePreviewClick}
        onDocSplitterClick={onDocSplitter ? handleDocSplitterClick : undefined}
        onReturnToApproval={handleReturnToVerification}
        canReturnToApproval={canReturnToVerification}
        onDeleteBatch={canDeleteBatches ? handleDeleteBatch : undefined}
        onManualCreation={handleManualCreation}
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
                {(onDocSplitter || canOpenDocSplitter(selectedBatchForNavigation)) && (
                  <button
                    type="button"
                    onClick={() => {
                      if (onDocSplitter) {
                        onDocSplitter(selectedBatchForNavigation.id)
                        setShowNavigationModal(false)
                        setSelectedBatchForNavigation(null)
                        return
                      }
                      handleNavigateToStage('doc_split')
                    }}
                    className="w-full text-left px-4 py-3 rounded-lg border transition-colors dashboard-card-interactive"
                    style={{ borderColor: c.border, backgroundColor: c.card }}
                  >
                    <div className="font-medium text-sm" style={{ color: c.primary }}>
                      Doc Splitter
                    </div>
                    <div className="text-xs mt-0.5" style={{ color: c.secondary }}>
                      Split combined invoice / RC / BOL PDFs before packets
                      {batchNeedsDocSplit(selectedBatchForNavigation) ? ' · Required' : ''}
                    </div>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    onPacketRework(selectedBatchForNavigation.id)
                    setShowNavigationModal(false)
                    setSelectedBatchForNavigation(null)
                  }}
                  className="w-full text-left px-4 py-3 rounded-lg border transition-colors dashboard-card-interactive"
                  style={{
                    borderColor: c.border,
                    backgroundColor: c.card,
                    opacity:
                      canOpenPacketRework(selectedBatchForNavigation) &&
                      !batchNeedsDocSplit(selectedBatchForNavigation)
                        ? 1
                        : 0.55,
                  }}
                >
                  <div className="font-medium text-sm" style={{ color: c.primary }}>
                    Packet Rework
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: c.secondary }}>
                    {batchNeedsDocSplit(selectedBatchForNavigation)
                      ? 'Unlocks after Doc Splitter finishes'
                      : 'Assign docs into packets and edit invoice fields'}
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => handleNavigateToStage('verification')}
                  className="w-full text-left px-4 py-3 rounded-lg border transition-colors dashboard-card-interactive"
                  style={{ borderColor: c.border, backgroundColor: c.card }}
                >
                  <div className="font-medium text-sm" style={{ color: c.primary }}>
                    AI Verification
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: c.secondary }}>
                    Review AI checks, mark OK / Hold, and process the batch
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
