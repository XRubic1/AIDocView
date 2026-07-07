import { useState } from 'react'
import { formatCurrency } from '../../utils/format'
import { ArrowLeft, CheckCircle } from 'lucide-react'
import { getAllBatches } from '../../data/mockBatches'
import { mockInvoices } from '../../data/mockInvoices'
import { Invoice } from '../../types/invoice'
import AdminInvoiceDetailView from './AdminInvoiceDetailView'
import AccountingModal from './AccountingModal'
import BatchAiReviewPanel, { InvoiceAiReviewBadge } from './BatchAiReviewPanel'
import AdminBatchesListView, { type AdminBatchListItem } from './AdminBatchesListView'
import { useClientTheme } from '../../theme/ThemeContext'
import { useToast } from '../ui/ToastProvider'

interface ReadyToPostTabProps {
  batchId: string | null
  onBatchSelect: (batchId: string) => void
  onMoveToVerification: (batchId: string) => void
  onBack: () => void
}

export default function ReadyToPostTab({
  batchId,
  onBatchSelect,
  onMoveToVerification,
  onBack,
}: ReadyToPostTabProps) {
  const { showToast } = useToast()
  const c = useClientTheme()
  const batches = getAllBatches().filter((b) => b.status === 'ready_to_post')
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null)
  const [showAccountingModal, setShowAccountingModal] = useState(false)
  const [reviewRefresh, setReviewRefresh] = useState(0)

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
          <BatchAiReviewPanel batchId={batchId} onComplete={() => setReviewRefresh((k) => k + 1)} />
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
                if (!allComplete || progress !== 100) {
                  showToast(
                    `Cannot move batch to verification. Progress must be 100%. Current progress: ${progress}%`,
                    'error'
                  )
                  return
                }
                onMoveToVerification(batchId)
              }}
              disabled={!allComplete || progress !== 100}
              className="dashboard-btn-primary disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
            >
              <CheckCircle className="w-4 h-4" />
              Move to Verification
            </button>
            {(!allComplete || progress !== 100) && (
              <p className="text-xs mt-1 text-right" style={{ color: c.warning }}>
                Progress: {progress}% — complete paperwork and broker assignments
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

      {/* Invoices Table */}
      {batchInvoices.length === 0 ? (
        <div className="text-center py-12" style={{ color: c.secondary }}>
          <div className="text-3xl mb-2">📄</div>
          <div className="font-medium text-sm">No invoices found in this batch</div>
        </div>
      ) : (
        <div className="dashboard-card overflow-hidden">
          <table className="dashboard-table dashboard-table--compact w-full">
            <thead>
              <tr>
                <th>Invoice#</th>
                <th>Load#</th>
                <th className="text-right">Amount</th>
                <th className="text-center">Paperwork</th>
                <th>Broker</th>
                <th className="text-center">AI review</th>
                <th className="text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {batchInvoices.map((invoice) => (
                <tr
                  key={`${invoice.id}-${reviewRefresh}`}
                  className="cursor-pointer"
                  onClick={() => setSelectedInvoice(invoice)}
                >
                  <td className="font-medium">{invoice.invoice_number}</td>
                  <td style={{ color: c.secondary }}>{invoice.load_number || '—'}</td>
                  <td className="text-right font-medium tabular-nums">{formatCurrency(invoice.amount)}</td>
                  <td className="text-center">
                    {invoice.paperwork_complete ? (
                      <span className="status-pill status-pill--approved inline-flex items-center gap-1">
                        <CheckCircle className="w-3 h-3" />
                        Complete
                      </span>
                    ) : (
                      <span className="status-pill status-pill--pending">Pending</span>
                    )}
                  </td>
                  <td style={{ color: c.secondary }}>
                    {invoice.broker_assigned ? invoice.broker_name : (
                      <span style={{ color: c.warning }}>Not assigned</span>
                    )}
                  </td>
                  <td className="text-center">
                    <InvoiceAiReviewBadge invoice={invoice} status={invoice.ai_review_status} />
                  </td>
                  <td className="text-center">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        setSelectedInvoice(invoice)
                      }}
                      className="dashboard-btn-secondary !h-7 !px-2 !text-xs"
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

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

