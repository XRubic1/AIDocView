import { useState } from 'react'
import { formatCurrency } from '../../utils/format'
import { formatDate } from '../../utils/format'
import { ArrowLeft, CheckCircle, Download } from 'lucide-react'
import { getAllBatches, updateBatchStatus } from '../../data/mockBatches'
import { approveAdminInvoice, holdAdminInvoice } from '../../services/adminInvoiceActions'
import { mockInvoices } from '../../data/mockInvoices'
import { Invoice } from '../../types/invoice'
import AdminInvoiceDetailView from './AdminInvoiceDetailView'
import AccountingModal from './AccountingModal'
import { sendPaperworkForBatch } from '../../utils/paperworkSender'
import { logAuditEvent } from '../../utils/auditLogger'

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
  const [batches] = useState(() => {
    const allBatches = getAllBatches()
    return allBatches.filter((b) => b.status === 'approval')
  })
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null)
  const [approvalNotes, setApprovalNotes] = useState('')
  const [showAccountingModal, setShowAccountingModal] = useState(false)

  // Find the batch - search in all batches, not just filtered ones
  const allBatches = getAllBatches()
  const batch = batchId ? allBatches.find((b) => b.id === batchId) : null

  // If no batch selected, show batch list
  if (!batchId || !batch) {
    return (
      <div className="p-6">
        <div className="mb-4">
          <h2 className="text-lg font-bold" style={{ color: '#113543' }}>Approval</h2>
          <p className="text-sm mt-1" style={{ color: '#819291' }}>
            Final approval and processing of verified batches
          </p>
        </div>

        {batches.length === 0 ? (
          <div className="text-center py-12" style={{ color: '#819291' }}>
            <div className="text-4xl mb-2">✓</div>
            <div className="font-medium">No batches ready for approval</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b" style={{ borderColor: '#819291' }}>
                  <th className="text-left py-3 px-4 text-sm font-semibold" style={{ color: '#113543' }}>
                    Client
                  </th>
                  <th className="text-left py-3 px-4 text-sm font-semibold" style={{ color: '#113543' }}>
                    Batch#
                  </th>
                  <th className="text-right py-3 px-4 text-sm font-semibold" style={{ color: '#113543' }}>
                    Total Invoices
                  </th>
                  <th className="text-right py-3 px-4 text-sm font-semibold" style={{ color: '#113543' }}>
                    Total Amount
                  </th>
                  <th className="text-center py-3 px-4 text-sm font-semibold" style={{ color: '#113543' }}>
                    Ready
                  </th>
                  <th className="text-center py-3 px-4 text-sm font-semibold" style={{ color: '#113543' }}>
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {batches.map((batch, index) => {
                  const batchInvoices = mockInvoices.filter((inv) => inv.batch_id === batch.id)
                  const allApproved = batchInvoices.every((inv) => inv.status === 'approved')

                  return (
                    <tr
                      key={batch.id}
                      className="border-b cursor-pointer transition-colors"
                      style={{
                        borderColor: '#819291',
                        backgroundColor: index % 2 === 0 ? '#f8f9fa' : '#FFFFFF',
                      }}
                      onClick={() => onBatchSelect(batch.id)}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = '#f0f0f0'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = index % 2 === 0 ? '#f8f9fa' : '#FFFFFF'
                      }}
                    >
                      <td className="py-3 px-4 text-sm font-medium" style={{ color: '#113543' }}>
                        {batch.client_name}
                      </td>
                      <td className="py-3 px-4 text-sm" style={{ color: '#819291' }}>
                        {batch.batch_number}
                      </td>
                      <td className="py-3 px-4 text-sm text-right" style={{ color: '#113543' }}>
                        {batch.total_invoices}
                      </td>
                      <td className="py-3 px-4 text-sm text-right font-medium" style={{ color: '#113543' }}>
                        {formatCurrency(batch.total_amount)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {allApproved ? (
                          <span
                            className="inline-flex items-center px-2.5 py-0.5 text-xs font-medium"
                            style={{ backgroundColor: '#819291', color: '#FFFFFF' }}
                          >
                            <CheckCircle className="w-3 h-3 mr-1" />
                            Ready
                          </span>
                        ) : (
                          <span
                            className="inline-flex items-center px-2.5 py-0.5 text-xs font-medium"
                            style={{ backgroundColor: '#C2A558', color: '#FFFFFF' }}
                          >
                            Pending
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            onBatchSelect(batch.id)
                          }}
                          className="px-3 py-1 text-sm font-medium text-white transition-colors"
                          style={{ backgroundColor: '#C2A558' }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = '#b89547'
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = '#C2A558'
                          }}
                        >
                          Review
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    )
  }

  // Batch detail view
  const batchInvoices = mockInvoices.filter((inv) => inv.batch_id === batchId)
  const allApproved = batchInvoices.every((inv) => inv.status === 'approved')
  const approvedInvoices = batchInvoices.filter((inv) => inv.status === 'approved')

  const handleProcessBatch = () => {
    if (!allApproved) {
      alert('All invoices must be approved before processing the batch.')
      return
    }
    
    if (!batchId || !batch) {
      alert('Batch not found')
      return
    }

    // Log batch processing start
    logAuditEvent(
      'batch_status_changed',
      'batch',
      batchId,
      batch.batch_number,
      `Processing batch ${batch.batch_number} - moving to submitted status`,
      'user-1', // In real app, get from auth context
      'Admin User',
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

    // Automatically send paperwork for all approved invoices
    const paperworkResults = sendPaperworkForBatch(
      approvedInvoices,
      batch.batch_number,
      'user-1', // In real app, get from auth context
      'Admin User',
      'Admin'
    )

    // Update batch status to submitted
    updateBatchStatus(batchId, 'submitted')

    // Show results
    if (paperworkResults.failed > 0) {
      alert(
        `Batch processed successfully!\n\nPaperwork sending results:\n- ${paperworkResults.success} invoices sent successfully\n- ${paperworkResults.failed} invoices failed to send\n\nPlease check the audit logs for details.`
      )
    } else {
      alert(
        `Batch processed successfully!\n\nPaperwork has been automatically sent to brokers for all ${paperworkResults.success} invoices.`
      )
    }

    // Log batch processing completion
    logAuditEvent(
      'batch_status_changed',
      'batch',
      batchId,
      batch.batch_number,
      `Batch ${batch.batch_number} processed and moved to submitted status. Paperwork sent: ${paperworkResults.success} successful, ${paperworkResults.failed} failed`,
      'user-1',
      'Admin User',
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
              onClick={handleProcessBatch}
              className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-white transition-colors"
              style={{ backgroundColor: '#819291' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#6b7a7a'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#819291'
              }}
            >
              <CheckCircle className="w-4 h-4" />
              <span>Process Batch</span>
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

