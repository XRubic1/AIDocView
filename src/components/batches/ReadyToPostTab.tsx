import { useState } from 'react'
import { ArrowLeft, CheckCircle, ExternalLink, Mail, Sparkles } from 'lucide-react'
import { getAllBatches } from '../../data/mockBatches'
import { mockInvoices } from '../../data/mockInvoices'
import { Invoice } from '../../types/invoice'
import AdminInvoiceDetailView from './AdminInvoiceDetailView'
import AccountingModal from './AccountingModal'
import AdminBatchesListView, { type AdminBatchListItem } from './AdminBatchesListView'
import HandoffBatchWorkspace from './HandoffBatchWorkspace'
import { useClientTheme } from '../../theme/ThemeContext'
import { useToast } from '../ui/ToastProvider'
import { useAuth } from '../../context/AuthContext'
import { getAdminUserDisplayName } from '../../config/adminNav'
import { sendPaperworkForBatch } from '../../utils/paperworkSender'

interface ReadyToPostTabProps {
  batchId: string | null
  onBatchSelect: (batchId: string) => void
  onMoveToVerification: (batchId: string) => void
  onBack: () => void
  onOpenPacketRework?: (batchId: string) => void
  onOpenAiVerification?: (batchId: string) => void
}

export default function ReadyToPostTab({
  batchId,
  onBatchSelect,
  onMoveToVerification,
  onBack,
  onOpenPacketRework,
  onOpenAiVerification,
}: ReadyToPostTabProps) {
  const { showToast } = useToast()
  const c = useClientTheme()
  const { resolved, session } = useAuth()
  const authUser = resolved.user ?? session?.user ?? null
  const adminUserId = authUser?.id ?? 'unknown'
  const adminUserName = getAdminUserDisplayName(authUser?.email ?? null)
  const batches = getAllBatches().filter((b) => b.status === 'ready_to_post')
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null)
  const [showAccountingModal, setShowAccountingModal] = useState(false)
  const [batchRefresh, setBatchRefresh] = useState(0)
  const [sendingPpw, setSendingPpw] = useState(false)

  // Find the batch - search in all batches, not just filtered ones
  const allBatches = getAllBatches()
  const batch = batchId ? allBatches.find((b) => b.id === batchId) : null

  // If no batch selected, show batch list
  if (!batchId || !batch) {
    const listItems: AdminBatchListItem[] = batches.map((b) => ({
      id: b.id,
      batch_number: b.batch_number,
      client_name: b.client_name,
      total_invoices: b.total_invoices,
      total_amount: b.total_amount,
      submitted_at: b.submitted_at,
      status: b.status,
      upload_mode: b.upload_mode,
    }))

    return (
      <AdminBatchesListView
        batches={listItems}
        variant="ready_to_post"
        onSelectBatch={onBatchSelect}
        actionLabel="Review"
        onAction={(item, e) => {
          e.stopPropagation()
          onBatchSelect(item.id)
        }}
        emptyTitle="No batches ready to post"
        emptyHint="Batches appear here after documents are submitted"
      />
    )
  }

  // Batch detail view - ensure batch exists
  if (!batch) {
    return (
      <div className="p-6">
        <div className="text-center py-12" style={{ color: '#819291' }}>
          <div className="text-4xl mb-2">⚠️</div>
          <div className="font-medium">Batch not found</div>
        </div>
      </div>
    )
  }

  const batchInvoices = mockInvoices
    .filter((inv) => inv.batch_id === batchId)
    .map((inv) => ({
      ...inv,
      paperwork_complete: !!(inv.documents_count && inv.documents_count > 0),
      broker_assigned: !!inv.broker_id,
    }))

  const isHandoffAwaitingInvoices =
    batch.upload_mode === 'handoff' && batchInvoices.length === 0

  const allComplete = batchInvoices.length > 0 && batchInvoices.every(
    (inv) => inv.paperwork_complete && inv.broker_assigned
  )

  // Calculate progress percentage
  const paperworkComplete = batchInvoices.filter((inv) => inv.paperwork_complete).length
  const brokersAssigned = batchInvoices.filter((inv) => inv.broker_assigned).length
  const totalInvoices = batchInvoices.length
  const progress = totalInvoices > 0
    ? Math.round(((paperworkComplete + brokersAssigned) / (totalInvoices * 2)) * 100)
    : 0

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-5">
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onBack}
            className="dashboard-btn-secondary !h-8 !px-2.5 inline-flex items-center gap-1.5"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold truncate" style={{ color: c.primary }}>
              {batch.batch_number}
            </h2>
            <p className="text-sm truncate" style={{ color: c.secondary }}>
              {batch.client_name}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => {
              if (batchId && onOpenPacketRework) onOpenPacketRework(batchId)
            }}
            className="dashboard-btn-secondary inline-flex items-center gap-1.5"
            title="Open Packets rework when the batch is ready"
          >
            <ExternalLink className="w-4 h-4" />
            Packets
          </button>
          {onOpenAiVerification && batchId && !isHandoffAwaitingInvoices && (
            <button
              type="button"
              onClick={() => onOpenAiVerification(batchId)}
              className="dashboard-btn-primary inline-flex items-center gap-1.5"
              title="Open AI verification with packet docs"
            >
              <Sparkles className="w-4 h-4" />
              AI verification
            </button>
          )}
          {!isHandoffAwaitingInvoices && batchInvoices.length > 0 && (
            <button
              type="button"
              disabled={sendingPpw}
              onClick={async () => {
                setSendingPpw(true)
                try {
                  const result = await sendPaperworkForBatch(
                    batchInvoices.filter((inv) => inv.broker_id),
                    batch.batch_number,
                    adminUserId,
                    adminUserName,
                    'Admin',
                    { skipAlreadySent: true }
                  )
                  showToast(
                    `PPW: ${result.success} sent, ${result.failed} failed, ${result.skipped} already sent.`,
                    result.failed > 0 ? 'info' : 'success'
                  )
                  setBatchRefresh((k) => k + 1)
                } catch (err) {
                  showToast(err instanceof Error ? err.message : 'PPW send failed', 'error')
                } finally {
                  setSendingPpw(false)
                }
              }}
              className="dashboard-btn-secondary inline-flex items-center gap-1.5"
            >
              <Mail className="w-4 h-4" />
              {sendingPpw ? 'Sending…' : 'Send PPW'}
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowAccountingModal(true)}
            className="dashboard-btn-secondary"
          >
            Accounting
          </button>
          <div className="flex flex-col items-end">
            <button
              type="button"
              onClick={() => {
                if (isHandoffAwaitingInvoices) {
                  showToast('Create invoices from the client documents before moving to verification.', 'error')
                  return
                }
                if (!allComplete || progress !== 100) {
                  showToast(
                    `Cannot move batch to verification. Progress must be 100%. Current progress: ${progress}%`,
                    'error'
                  )
                  return
                }
                onMoveToVerification(batchId)
              }}
              disabled={isHandoffAwaitingInvoices || !allComplete || progress !== 100}
              className="dashboard-btn-primary disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
            >
              <CheckCircle className="w-4 h-4" />
              Move to Verification
            </button>
            {(!isHandoffAwaitingInvoices && (!allComplete || progress !== 100)) && (
              <p className="text-xs mt-1 text-right" style={{ color: c.warning }}>
                Progress: {progress}% — complete paperwork and broker assignments
              </p>
            )}
            {isHandoffAwaitingInvoices && (
              <p className="text-xs mt-1 text-right" style={{ color: c.warning }}>
                Create invoices from client documents to continue
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        {[
          { label: 'Total Invoices', value: batchInvoices.length, tone: c.stat.blue },
          {
            label: 'Paperwork Complete',
            value: batchInvoices.filter((inv) => inv.paperwork_complete).length,
            tone: c.stat.slate,
          },
          {
            label: 'Brokers Assigned',
            value: batchInvoices.filter((inv) => inv.broker_assigned).length,
            tone: c.stat.amber,
          },
          {
            label: 'Ready',
            value: allComplete ? 'Yes' : 'No',
            tone: allComplete ? c.stat.green : c.stat.red,
          },
        ].map((stat) => (
          <div
            key={stat.label}
            className="dashboard-card px-4 py-3"
            style={{ backgroundColor: stat.tone }}
          >
            <div className="text-xs font-medium mb-1" style={{ color: c.secondary }}>
              {stat.label}
            </div>
            <div className="text-xl font-bold tabular-nums" style={{ color: c.primary }}>
              {stat.value}
            </div>
          </div>
        ))}
      </div>

      {/* Document workspace — the Ready to Post view for every batch */}
      <HandoffBatchWorkspace
        key={batchRefresh}
        batchId={batchId}
        clientId={batch.client_id}
        clientName={batch.client_name}
        existingInvoices={batchInvoices}
        isHandoff={batch.upload_mode === 'handoff'}
        onSelectInvoice={(inv) => setSelectedInvoice(inv)}
        onInvoicesCreated={() => setBatchRefresh((k) => k + 1)}
      />

      {/* Invoice Detail View with Three-Panel Layout */}
      {selectedInvoice && (
        <AdminInvoiceDetailView
          invoice={selectedInvoice}
          invoiceList={batchInvoices}
          onInvoiceSelect={(inv) => setSelectedInvoice(inv)}
          onClose={() => setSelectedInvoice(null)}
          stage="ready_to_post"
        />
      )}

      {/* Accounting Modal */}
      {showAccountingModal && batch && (
        <AccountingModal
          batch={batch}
          onClose={() => setShowAccountingModal(false)}
        />
      )}
    </div>
  )
}

