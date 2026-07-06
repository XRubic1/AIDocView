import { useState } from 'react'
import { formatCurrency } from '../../utils/format'
import { ArrowLeft, Check, AlertCircle, CheckCircle } from 'lucide-react'
import { getAllBatches } from '../../data/mockBatches'
import { approveAdminInvoice, holdAdminInvoice } from '../../services/adminInvoiceActions'
import { mockInvoices } from '../../data/mockInvoices'
import { Invoice } from '../../types/invoice'
import AdminInvoiceDetailView from './AdminInvoiceDetailView'
import AccountingModal from './AccountingModal'

interface VerificationTabProps {
  batchId: string | null
  onBatchSelect: (batchId: string) => void
  onMoveToApproval: (batchId: string) => void
  onBack: () => void
}

export default function VerificationTab({
  batchId,
  onBatchSelect,
  onMoveToApproval,
  onBack,
}: VerificationTabProps) {
  const [batches] = useState(() => {
    const allBatches = getAllBatches()
    return allBatches.filter((b) => b.status === 'verification')
  })
  const [selectedInvoices, setSelectedInvoices] = useState<Set<string>>(new Set())
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null)
  const [verificationNotes, setVerificationNotes] = useState('')
  const [showAccountingModal, setShowAccountingModal] = useState(false)

  // Find the batch - search in all batches, not just filtered ones
  const allBatches = getAllBatches()
  const batch = batchId ? allBatches.find((b) => b.id === batchId) : null

  // If no batch selected, show batch list
  if (!batchId || !batch) {
    return (
      <div className="p-6">
        <div className="mb-4">
          <h2 className="text-lg font-bold" style={{ color: '#113543' }}>Verification</h2>
          <p className="text-sm mt-1" style={{ color: '#819291' }}>
            Verify each invoice, approve or place on hold
          </p>
        </div>

        {batches.length === 0 ? (
          <div className="text-center py-12" style={{ color: '#819291' }}>
            <div className="text-4xl mb-2">✓</div>
            <div className="font-medium">No batches in verification</div>
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
                    Verified
                  </th>
                  <th className="text-center py-3 px-4 text-sm font-semibold" style={{ color: '#113543' }}>
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {batches.map((batch, index) => {
                  const batchInvoices = mockInvoices.filter((inv) => inv.batch_id === batch.id)
                  const verifiedCount = batchInvoices.filter(
                    (inv) => inv.status === 'approved' || inv.status === 'hold'
                  ).length

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
                        <span className="text-sm" style={{ color: '#819291' }}>
                          {verifiedCount} / {batchInvoices.length}
                        </span>
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
                          Verify
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
  const verifiedInvoices = batchInvoices.filter(
    (inv) => inv.status === 'approved' || inv.status === 'hold'
  )
  const allVerified = batchInvoices.length > 0 && verifiedInvoices.length === batchInvoices.length
  const verifiedCount = verifiedInvoices.length
  const totalCount = batchInvoices.length

  const handleSelectAll = () => {
    if (selectedInvoices.size === batchInvoices.length) {
      setSelectedInvoices(new Set())
    } else {
      setSelectedInvoices(new Set(batchInvoices.map((inv) => inv.id)))
    }
  }

  const handleSelectInvoice = (invoiceId: string) => {
    const newSelected = new Set(selectedInvoices)
    if (newSelected.has(invoiceId)) {
      newSelected.delete(invoiceId)
    } else {
      newSelected.add(invoiceId)
    }
    setSelectedInvoices(newSelected)
  }

  const handleApproveInvoice = (invoiceId: string) => {
    const updated = approveAdminInvoice(invoiceId)
    if (updated && selectedInvoice?.id === invoiceId) {
      setSelectedInvoice({ ...updated })
    }
  }

  const handleHoldInvoice = (invoiceId: string) => {
    const updated = holdAdminInvoice(invoiceId)
    if (updated && selectedInvoice?.id === invoiceId) {
      setSelectedInvoice({ ...updated })
    }
  }


  const handleContactBrokerInvoice = () => {
    // Handled by modal
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
          <div className="flex flex-col items-end">
            <button
              onClick={() => {
                if (!allVerified) {
                  alert(`Cannot move batch to approval. All invoices must be verified.\nVerified: ${verifiedCount}/${totalCount}`)
                  return
                }
                onMoveToApproval(batchId)
              }}
              disabled={!allVerified}
              className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-white transition-colors"
              style={{
                backgroundColor: allVerified ? '#819291' : '#cccccc',
                cursor: allVerified ? 'pointer' : 'not-allowed',
                opacity: allVerified ? 1 : 0.6,
              }}
              onMouseEnter={(e) => {
                if (allVerified) {
                  e.currentTarget.style.backgroundColor = '#6b7a7a'
                }
              }}
              onMouseLeave={(e) => {
                if (allVerified) {
                  e.currentTarget.style.backgroundColor = '#819291'
                }
            }}
          >
            <CheckCircle className="w-4 h-4" />
            <span>Move to Approval</span>
          </button>
            {!allVerified && (
              <div className="text-xs mt-1 text-right" style={{ color: '#C2A558' }}>
                Verified: {verifiedCount}/{totalCount} invoices - Verify all invoices before moving to approval
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
          <div className="text-sm mb-1" style={{ color: '#819291' }}>Approved</div>
          <div className="text-2xl font-bold" style={{ color: '#113543' }}>
            {batchInvoices.filter((inv) => inv.status === 'approved').length}
          </div>
        </div>
        <div className="p-4 border rounded" style={{ backgroundColor: '#f8f9fa', borderColor: '#819291' }}>
          <div className="text-sm mb-1" style={{ color: '#819291' }}>On Hold</div>
          <div className="text-2xl font-bold" style={{ color: '#113543' }}>
            {batchInvoices.filter((inv) => inv.status === 'hold').length}
          </div>
        </div>
        <div className="p-4 border rounded" style={{ backgroundColor: '#f8f9fa', borderColor: '#819291' }}>
          <div className="text-sm mb-1" style={{ color: '#819291' }}>Verified</div>
          <div className="text-2xl font-bold" style={{ color: allVerified ? '#819291' : '#C2A558' }}>
            {verifiedInvoices.length} / {batchInvoices.length}
          </div>
        </div>
      </div>

      {/* Verification Notes */}
      <div className="mb-6">
        <label className="block text-sm font-medium mb-2" style={{ color: '#113543' }}>
          Verification Notes
        </label>
        <textarea
          value={verificationNotes}
          onChange={(e) => setVerificationNotes(e.target.value)}
          placeholder="Add notes about this verification..."
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
              <th className="text-left py-3 px-4">
                <input
                  type="checkbox"
                  checked={selectedInvoices.size === batchInvoices.length}
                  onChange={handleSelectAll}
                  className="w-4 h-4 rounded"
                  style={{ borderColor: '#819291' }}
                />
              </th>
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
                <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selectedInvoices.has(invoice.id)}
                    onChange={() => handleSelectInvoice(invoice.id)}
                    className="w-4 h-4 rounded"
                    style={{ borderColor: '#819291' }}
                  />
                </td>
                <td className="py-3 px-4 text-sm font-medium" style={{ color: '#113543' }}>
                  {invoice.invoice_number}
                </td>
                <td className="py-3 px-4 text-sm" style={{ color: '#819291' }}>
                  {invoice.broker_name}
                </td>
                <td className="py-3 px-4 text-sm text-right font-medium" style={{ color: '#113543' }}>
                  {formatCurrency(invoice.amount)}
                </td>
                <td className="py-3 px-4 text-sm">
                  {invoice.status === 'approved' ? (
                    <span
                      className="inline-flex items-center px-2.5 py-0.5 text-xs font-medium"
                      style={{ backgroundColor: '#819291', color: '#FFFFFF' }}
                    >
                      <Check className="w-3 h-3 mr-1" />
                      Approved
                    </span>
                  ) : invoice.status === 'hold' ? (
                    <span
                      className="inline-flex items-center px-2.5 py-0.5 text-xs font-medium"
                      style={{ backgroundColor: '#C2A558', color: '#FFFFFF' }}
                    >
                      <AlertCircle className="w-3 h-3 mr-1" />
                      On Hold
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
                    Verify
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
          onApprove={handleApproveInvoice}
          onHold={handleHoldInvoice}
          onContactBroker={handleContactBrokerInvoice}
          stage="verification"
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

