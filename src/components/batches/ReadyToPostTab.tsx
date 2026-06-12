import { useState } from 'react'
import { formatCurrency } from '../../utils/format'
import { ArrowLeft, CheckCircle } from 'lucide-react'
import { getAllBatches } from '../../data/mockBatches'
import { mockInvoices } from '../../data/mockInvoices'
import { Invoice } from '../../types/invoice'
import AdminInvoiceDetailView from './AdminInvoiceDetailView'
import AccountingModal from './AccountingModal'
import BatchAiReviewPanel, { InvoiceAiReviewBadge } from './BatchAiReviewPanel'

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
  const batches = getAllBatches().filter((b) => b.status === 'ready_to_post')
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null)
  const [showAccountingModal, setShowAccountingModal] = useState(false)
  const [reviewRefresh, setReviewRefresh] = useState(0)

  // Find the batch - search in all batches, not just filtered ones
  const allBatches = getAllBatches()
  const batch = batchId ? allBatches.find((b) => b.id === batchId) : null

  // If no batch selected, show batch list
  if (!batchId || !batch) {
    return (
      <div className="p-6">
        <div className="mb-4">
          <h2 className="text-lg font-bold" style={{ color: '#113543' }}>Ready to Post</h2>
          <p className="text-sm mt-1" style={{ color: '#819291' }}>
            Assign paperwork and brokers to invoices before verification
          </p>
        </div>

        {batches.length === 0 ? (
          <div className="text-center py-12" style={{ color: '#819291' }}>
            <div className="text-4xl mb-2">✓</div>
            <div className="font-medium">No batches ready to post</div>
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
                    Progress
                  </th>
                  <th className="text-center py-3 px-4 text-sm font-semibold" style={{ color: '#113543' }}>
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {batches.map((batch, index) => {
                  const batchInvoices = mockInvoices.filter((inv) => inv.batch_id === batch.id)
                  const paperworkComplete = batchInvoices.filter(
                    (inv) => inv.documents_count && inv.documents_count > 0
                  ).length
                  const brokersAssigned = batchInvoices.filter((inv) => !!inv.broker_id).length
                  const totalInvoices = batchInvoices.length
                  const progress = totalInvoices > 0
                    ? Math.round(((paperworkComplete + brokersAssigned) / (totalInvoices * 2)) * 100)
                    : 0

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
                        {batch.upload_mode === 'handoff' && (
                          <span className="ml-2 text-xs font-medium px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                            Handoff
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-sm text-right" style={{ color: '#113543' }}>
                        {batch.total_invoices}
                      </td>
                      <td className="py-3 px-4 text-sm text-right font-medium" style={{ color: '#113543' }}>
                        {formatCurrency(batch.total_amount)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center space-x-2">
                          <div className="w-24 bg-gray-200 rounded-full h-2">
                            <div
                              className="h-2 rounded-full transition-all"
                              style={{
                                width: `${progress}%`,
                                backgroundColor: progress === 100 ? '#819291' : '#C2A558',
                              }}
                            />
                          </div>
                          <span className="text-xs" style={{ color: '#819291' }}>
                            {progress}%
                          </span>
                        </div>
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
        <div className="flex items-center space-x-2 flex-wrap gap-2">
          <BatchAiReviewPanel
            batchId={batchId}
            onComplete={() => setReviewRefresh((k) => k + 1)}
          />
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
          <div className="flex flex-col items-end">
            <button
              onClick={() => {
                if (!allComplete || progress !== 100) {
                  alert(`Cannot move batch to verification. Progress must be 100%.\nCurrent progress: ${progress}%`)
                  return
                }
                onMoveToVerification(batchId)
              }}
              disabled={!allComplete || progress !== 100}
              className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-white transition-colors"
              style={{
                backgroundColor: allComplete && progress === 100 ? '#819291' : '#cccccc',
                cursor: allComplete && progress === 100 ? 'pointer' : 'not-allowed',
                opacity: allComplete && progress === 100 ? 1 : 0.6,
              }}
              onMouseEnter={(e) => {
                if (allComplete && progress === 100) {
                  e.currentTarget.style.backgroundColor = '#6b7a7a'
                }
              }}
              onMouseLeave={(e) => {
                if (allComplete && progress === 100) {
                  e.currentTarget.style.backgroundColor = '#819291'
                }
            }}
          >
            <CheckCircle className="w-4 h-4" />
            <span>Move to Verification</span>
          </button>
            {(!allComplete || progress !== 100) && (
              <div className="text-xs mt-1 text-right" style={{ color: '#C2A558' }}>
                Progress: {progress}% - Complete all paperwork and broker assignments
              </div>
        )}
          </div>
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
          <div className="text-sm mb-1" style={{ color: '#819291' }}>Paperwork Complete</div>
          <div className="text-2xl font-bold" style={{ color: '#113543' }}>
            {batchInvoices.filter((inv) => inv.paperwork_complete).length}
          </div>
        </div>
        <div className="p-4 border rounded" style={{ backgroundColor: '#f8f9fa', borderColor: '#819291' }}>
          <div className="text-sm mb-1" style={{ color: '#819291' }}>Brokers Assigned</div>
          <div className="text-2xl font-bold" style={{ color: '#113543' }}>
            {batchInvoices.filter((inv) => inv.broker_assigned).length}
          </div>
        </div>
        <div className="p-4 border rounded" style={{ backgroundColor: '#f8f9fa', borderColor: '#819291' }}>
          <div className="text-sm mb-1" style={{ color: '#819291' }}>Ready</div>
          <div className="text-2xl font-bold" style={{ color: allComplete ? '#819291' : '#C2A558' }}>
            {allComplete ? 'Yes' : 'No'}
          </div>
        </div>
      </div>

      {/* Invoices Table */}
      {batchInvoices.length === 0 ? (
        <div className="text-center py-12" style={{ color: '#819291' }}>
          <div className="text-4xl mb-2">📄</div>
          <div className="font-medium">No invoices found in this batch</div>
        </div>
      ) : (
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b" style={{ borderColor: '#819291' }}>
              <th className="text-left py-3 px-4 text-sm font-semibold" style={{ color: '#113543' }}>
                Invoice#
              </th>
              <th className="text-left py-3 px-4 text-sm font-semibold" style={{ color: '#113543' }}>
                Load#
              </th>
              <th className="text-right py-3 px-4 text-sm font-semibold" style={{ color: '#113543' }}>
                Amount
              </th>
              <th className="text-center py-3 px-4 text-sm font-semibold" style={{ color: '#113543' }}>
                Paperwork
              </th>
              <th className="text-left py-3 px-4 text-sm font-semibold" style={{ color: '#113543' }}>
                Broker
              </th>
              <th className="text-center py-3 px-4 text-sm font-semibold" style={{ color: '#113543' }}>
                AI review
              </th>
              <th className="text-center py-3 px-4 text-sm font-semibold" style={{ color: '#113543' }}>
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {batchInvoices.map((invoice, index) => (
              <tr
                key={`${invoice.id}-${reviewRefresh}`}
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
                  {invoice.load_number || '-'}
                </td>
                <td className="py-3 px-4 text-sm text-right font-medium" style={{ color: '#113543' }}>
                  {formatCurrency(invoice.amount)}
                </td>
                <td className="py-3 px-4 text-center">
                  {invoice.paperwork_complete ? (
                    <span
                      className="inline-flex items-center px-2.5 py-0.5 text-xs font-medium"
                      style={{ backgroundColor: '#819291', color: '#FFFFFF' }}
                    >
                      <CheckCircle className="w-3 h-3 mr-1" />
                      Complete
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
                <td className="py-3 px-4 text-sm" style={{ color: '#819291' }}>
                  {invoice.broker_assigned ? (
                    invoice.broker_name
                  ) : (
                    <span style={{ color: '#C2A558' }}>Not Assigned</span>
                  )}
                </td>
                <td className="py-3 px-4 text-center">
                  <InvoiceAiReviewBadge invoice={invoice} status={invoice.ai_review_status} />
                </td>
                <td className="py-3 px-4 text-center">
                      <button
                    onClick={(e) => {
                      e.stopPropagation()
                          setSelectedInvoice(invoice)
                        }}
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

