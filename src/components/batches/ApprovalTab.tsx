import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { getAdminUserDisplayName } from '../../config/adminNav'
import { formatCurrency } from '../../utils/format'
import { formatDate } from '../../utils/format'
import { ArrowLeft, CheckCircle, Download } from 'lucide-react'
import { getAllBatches, updateBatchStatus } from '../../data/mockBatches'
import { approveAdminInvoice, holdAdminInvoice } from '../../services/adminInvoiceActions'
import { mockInvoices } from '../../data/mockInvoices'
import { Invoice } from '../../types/invoice'
import AdminInvoiceDetailView from './AdminInvoiceDetailView'
import AccountingModal from './AccountingModal'
import AdminBatchesListView, { type AdminBatchListItem } from './AdminBatchesListView'
import { sendPaperworkForBatch } from '../../utils/paperworkSender'
import { logAuditEvent } from '../../utils/auditLogger'
import { useToast } from '../ui/ToastProvider'
import Spinner from '../ui/Spinner'

interface ApprovalTabProps {
  batchId: string | null
  onBatchSelect: (batchId: string) => void
  onBack: () => void
}

export default function ApprovalTab({
  batchId,
  onBatchSelect,
  onBack,
}: ApprovalTabProps) {
  const { resolved, session } = useAuth()
  const { showToast } = useToast()
  const authUser = resolved.user ?? session?.user ?? null
  const adminUserId = authUser?.id ?? 'unknown'
  const adminUserName = getAdminUserDisplayName(authUser?.email ?? null)

  const [batches] = useState(() => {
    const allBatches = getAllBatches()
    return allBatches.filter((b) => b.status === 'approval')
  })
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null)
  const [approvalNotes, setApprovalNotes] = useState('')
  const [showAccountingModal, setShowAccountingModal] = useState(false)
  const [isProcessingBatch, setIsProcessingBatch] = useState(false)

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
    }))

    return (
      <AdminBatchesListView
        batches={listItems}
        variant="approval"
        onSelectBatch={onBatchSelect}
        actionLabel="Review"
        onAction={(item, e) => {
          e.stopPropagation()
          onBatchSelect(item.id)
        }}
        emptyTitle="No batches ready for approval"
        emptyHint="Batches appear here after verification is complete"
      />
    )
  }

  // Batch detail view
  const batchInvoices = mockInvoices.filter((inv) => inv.batch_id === batchId)
  const allApproved = batchInvoices.every((inv) => inv.status === 'approved')
  const approvedInvoices = batchInvoices.filter((inv) => inv.status === 'approved')

  const handleProcessBatch = async () => {
    if (isProcessingBatch) return
    if (!allApproved) {
      showToast('All invoices must be approved before processing the batch.', 'error')
      return
    }

    if (!batchId || !batch) {
      showToast('Batch not found', 'error')
      return
    }

    setIsProcessingBatch(true)
    try {
      logAuditEvent(
        'batch_status_changed',
        'batch',
        batchId,
        batch.batch_number,
        `Processing batch ${batch.batch_number} - moving to submitted status`,
        adminUserId,
        adminUserName,
        'Admin',
        [
          {
            field: 'status',
            old_value: 'approval',
            new_value: 'submitted',
          },
        ],
        {
          total_invoices: batchInvoices.length,
          total_amount: batch.total_amount,
        },
        'info',
        true
      )

      const paperworkResults = await sendPaperworkForBatch(
        approvedInvoices,
        batch.batch_number,
        adminUserId,
        adminUserName,
        'Admin'
      )

      updateBatchStatus(batchId, 'submitted')

      if (paperworkResults.failed > 0) {
        showToast(
          `Batch processed. Paperwork: ${paperworkResults.success} sent, ${paperworkResults.failed} failed — check audit logs.`,
          'info'
        )
      } else {
        showToast(
          `Batch processed — paperwork sent for all ${paperworkResults.success} invoices.`,
          'success'
        )
      }

      logAuditEvent(
        'batch_status_changed',
        'batch',
        batchId,
        batch.batch_number,
        `Batch ${batch.batch_number} processed and moved to submitted status. Paperwork sent: ${paperworkResults.success} successful, ${paperworkResults.failed} failed`,
        adminUserId,
        adminUserName,
        'Admin',
        undefined,
        {
          total_invoices: batchInvoices.length,
          paperwork_sent: paperworkResults.success,
          paperwork_failed: paperworkResults.failed,
        },
        paperworkResults.failed > 0 ? 'warning' : 'info',
        true
      )

      onBack()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Batch processing failed', 'error')
    } finally {
      setIsProcessingBatch(false)
    }
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-4">
          <button
            onClick={onBack}
            className="flex items-center space-x-2 transition-colors"
            style={{ color: '#819291' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = '#113543'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = '#819291'
            }}
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back</span>
          </button>
          <div>
            <h2 className="text-xl font-bold" style={{ color: '#113543' }}>
              {batch.batch_number}
            </h2>
            <p className="text-sm" style={{ color: '#819291' }}>{batch.client_name}</p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setShowAccountingModal(true)}
            className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-white transition-colors"
            style={{ backgroundColor: '#113543' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#0d2a35'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#113543'
            }}
          >
            <span>Accounting</span>
          </button>
          <button
            className="flex items-center space-x-2 px-4 py-2 text-sm font-medium transition-colors border rounded"
            style={{
              color: '#113543',
              backgroundColor: '#FFFFFF',
              borderColor: '#819291',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#f8f9fa'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#FFFFFF'
            }}
          >
            <Download className="w-4 h-4" />
            <span>Export</span>
          </button>
          {allApproved && (
            <button
              onClick={() => void handleProcessBatch()}
              disabled={isProcessingBatch}
              className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-white transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              style={{ backgroundColor: '#819291' }}
              onMouseEnter={(e) => {
                if (!isProcessingBatch) e.currentTarget.style.backgroundColor = '#6b7a7a'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#819291'
              }}
            >
              {isProcessingBatch ? (
                <Spinner size="sm" className="text-white" />
              ) : (
                <CheckCircle className="w-4 h-4" />
              )}
              <span>{isProcessingBatch ? 'Processing…' : 'Process Batch'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="p-4 border rounded" style={{ backgroundColor: '#f8f9fa', borderColor: '#819291' }}>
          <div className="text-sm mb-1" style={{ color: '#819291' }}>Total Invoices</div>
          <div className="text-2xl font-bold" style={{ color: '#113543' }}>
            {batchInvoices.length}
          </div>
        </div>
        <div className="p-4 border rounded" style={{ backgroundColor: '#f8f9fa', borderColor: '#819291' }}>
          <div className="text-sm mb-1" style={{ color: '#819291' }}>Approved</div>
          <div className="text-2xl font-bold" style={{ color: '#113543' }}>
            {approvedInvoices.length}
          </div>
        </div>
        <div className="p-4 border rounded" style={{ backgroundColor: '#f8f9fa', borderColor: '#819291' }}>
          <div className="text-sm mb-1" style={{ color: '#819291' }}>Total Amount</div>
          <div className="text-2xl font-bold" style={{ color: '#113543' }}>
            {formatCurrency(batch.total_amount)}
          </div>
        </div>
        <div className="p-4 border rounded" style={{ backgroundColor: '#f8f9fa', borderColor: '#819291' }}>
          <div className="text-sm mb-1" style={{ color: '#819291' }}>Status</div>
          <div className="text-lg font-medium" style={{ color: allApproved ? '#819291' : '#C2A558' }}>
            {allApproved ? 'Ready' : 'Pending'}
          </div>
        </div>
      </div>

      {/* Approval Notes */}
      <div className="mb-6">
        <label className="block text-sm font-medium mb-2" style={{ color: '#113543' }}>
          Approval Notes
        </label>
        <textarea
          value={approvalNotes}
          onChange={(e) => setApprovalNotes(e.target.value)}
          placeholder="Add notes about this approval..."
          className="w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2"
          style={{
            borderColor: '#819291',
            color: '#113543',
            backgroundColor: '#FFFFFF',
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = '#C2A558'
            e.currentTarget.style.boxShadow = '0 0 0 2px rgba(194, 165, 88, 0.2)'
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = '#819291'
            e.currentTarget.style.boxShadow = 'none'
          }}
          rows={3}
        />
      </div>

      {/* Invoices Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b" style={{ borderColor: '#819291' }}>
              <th className="text-left py-3 px-4 text-sm font-semibold" style={{ color: '#113543' }}>
                Invoice#
              </th>
              <th className="text-left py-3 px-4 text-sm font-semibold" style={{ color: '#113543' }}>
                Broker
              </th>
              <th className="text-right py-3 px-4 text-sm font-semibold" style={{ color: '#113543' }}>
                Amount
              </th>
              <th className="text-left py-3 px-4 text-sm font-semibold" style={{ color: '#113543' }}>
                Date
              </th>
              <th className="text-left py-3 px-4 text-sm font-semibold" style={{ color: '#113543' }}>
                Status
              </th>
              <th className="text-center py-3 px-4 text-sm font-semibold" style={{ color: '#113543' }}>
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {batchInvoices.map((invoice, index) => (
              <tr
                key={invoice.id}
                className="border-b transition-colors cursor-pointer"
                style={{
                  borderColor: '#819291',
                  backgroundColor: index % 2 === 0 ? '#f8f9fa' : '#FFFFFF',
                }}
                onClick={() => setSelectedInvoice(invoice)}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#f0f0f0'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = index % 2 === 0 ? '#f8f9fa' : '#FFFFFF'
                }}
              >
                <td className="py-3 px-4 text-sm font-medium" style={{ color: '#113543' }}>
                  {invoice.invoice_number}
                </td>
                <td className="py-3 px-4 text-sm" style={{ color: '#819291' }}>
                  {invoice.broker_name}
                </td>
                <td className="py-3 px-4 text-sm text-right font-medium" style={{ color: '#113543' }}>
                  {formatCurrency(invoice.amount)}
                </td>
                <td className="py-3 px-4 text-sm" style={{ color: '#819291' }}>
                  {formatDate(invoice.invoice_date)}
                </td>
                <td className="py-3 px-4 text-sm">
                  {invoice.status === 'approved' ? (
                    <span
                      className="inline-flex items-center px-2.5 py-0.5 text-xs font-medium"
                      style={{ backgroundColor: '#819291', color: '#FFFFFF' }}
                    >
                      <CheckCircle className="w-3 h-3 mr-1" />
                      Approved
                    </span>
                  ) : (
                    <span
                      className="inline-flex items-center px-2.5 py-0.5 text-xs font-medium"
                      style={{ backgroundColor: '#C2A558', color: '#FFFFFF' }}
                    >
                      {invoice.status}
                    </span>
                  )}
                </td>
                <td className="py-3 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => setSelectedInvoice(invoice)}
                    className="text-sm transition-colors"
                    style={{ color: '#819291' }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = '#113543'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = '#819291'
                    }}
                  >
                    View
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Invoice Detail View with Three-Panel Layout */}
      {selectedInvoice && (
        <AdminInvoiceDetailView
          invoice={selectedInvoice}
          invoiceList={batchInvoices}
          onInvoiceSelect={(inv) => setSelectedInvoice(inv)}
          onClose={() => setSelectedInvoice(null)}
          stage="approval"
          onApprove={(invoiceId) => {
            const updated = approveAdminInvoice(invoiceId)
            if (updated && selectedInvoice?.id === invoiceId) {
              setSelectedInvoice(updated)
            }
          }}
          onHold={(invoiceId) => {
            const updated = holdAdminInvoice(invoiceId)
            if (updated && selectedInvoice?.id === invoiceId) {
              setSelectedInvoice(updated)
            }
          }}
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

