import { useState } from 'react'
import { formatCurrency } from '../../utils/format'
import { formatDate } from '../../utils/format'
import { ArrowLeft, Check, X, FileText, Download } from 'lucide-react'
import { mockAdminDashboardData } from '../../data/mockAdminDashboard'
import AdminInvoiceDetailView from './AdminInvoiceDetailView'
import { Invoice } from '../../types/invoice'
import { mockInvoices } from '../../data/mockInvoices'

interface BatchReviewTabProps {
  batchId: string | null
  onBack: () => void
}

export default function BatchReviewTab({ batchId, onBack }: BatchReviewTabProps) {
  const [selectedInvoices, setSelectedInvoices] = useState<Set<string>>(new Set())
  const [reviewNotes, setReviewNotes] = useState('')
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null)
  const [lastViewedInvoiceId, setLastViewedInvoiceId] = useState<string | null>(null)

  // Find the batch
  const batch = mockAdminDashboardData.pending_batches.find((b) => b.id === batchId)

  // Get invoices for this batch from mock data
  const [invoices] = useState<Invoice[]>(() => {
    // Filter invoices that belong to this batch
    return mockInvoices.filter((inv) => inv.batch_id === batchId)
  })

  if (!batch) {
    return (
      <div className="p-6">
        <button
          onClick={onBack}
          className="flex items-center space-x-2 mb-4 transition-colors"
          style={{ color: '#819291' }}
          onMouseEnter={(e) => { e.currentTarget.style.color = '#113543' }}
          onMouseLeave={(e) => { e.currentTarget.style.color = '#819291' }}
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Batches</span>
        </button>
        <div className="text-center py-12">
          <p style={{ color: '#819291' }}>No batch selected</p>
        </div>
      </div>
    )
  }

  const handleSelectAll = () => {
    if (selectedInvoices.size === invoices.length) {
      setSelectedInvoices(new Set())
    } else {
      setSelectedInvoices(new Set(invoices.map((inv) => inv.id)))
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

  const handleApprove = () => {
    console.log('Approving invoices:', Array.from(selectedInvoices))
    // TODO: Implement approval logic
  }

  const handleReject = () => {
    console.log('Rejecting invoices:', Array.from(selectedInvoices))
    // TODO: Implement rejection logic
  }

  const handleHold = () => {
    console.log('Holding invoices:', Array.from(selectedInvoices))
    // TODO: Implement hold logic
  }

  const handleInvoiceClick = (invoiceId: string) => {
    const invoice = mockInvoices.find((inv) => inv.id === invoiceId)
    setSelectedInvoice(invoice || null)
    // Clear the last viewed highlight when opening a new invoice
    if (lastViewedInvoiceId !== invoiceId) {
      setLastViewedInvoiceId(null)
    }
  }

  const handleCloseModal = () => {
    // Store the invoice ID before closing so we can highlight it
    if (selectedInvoice) {
      setLastViewedInvoiceId(selectedInvoice.id)
    }
    setSelectedInvoice(null)
  }

  const handleApproveInvoice = (invoiceId: string) => {
    console.log('Approving invoice:', invoiceId)
    // TODO: Implement approval logic
    setSelectedInvoice(null)
  }


  const handleHoldInvoice = (invoiceId: string) => {
    console.log('Holding invoice:', invoiceId)
    // TODO: Implement hold logic
    setSelectedInvoice(null)
  }


  const handleContactBrokerInvoice = (invoiceId: string) => {
    console.log('Contacting broker for invoice:', invoiceId)
    // The modal will handle opening the contact broker modal
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
            onMouseEnter={(e) => { e.currentTarget.style.color = '#113543' }}
            onMouseLeave={(e) => { e.currentTarget.style.color = '#819291' }}
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back</span>
          </button>
          <div>
            <h2 className="text-xl font-bold" style={{ color: '#113543' }}>{batch.batch_number}</h2>
            <p className="text-sm" style={{ color: '#819291' }}>{batch.client_name}</p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
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
        </div>
      </div>

      {/* Batch Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="p-4 border rounded" style={{ backgroundColor: '#f8f9fa', borderColor: '#819291' }}>
          <div className="text-sm mb-1" style={{ color: '#819291' }}>Total Invoices</div>
          <div className="text-2xl font-bold" style={{ color: '#113543' }}>{batch.total_invoices}</div>
        </div>
        <div className="p-4 border rounded" style={{ backgroundColor: '#f8f9fa', borderColor: '#819291' }}>
          <div className="text-sm mb-1" style={{ color: '#819291' }}>Total Amount</div>
          <div className="text-2xl font-bold" style={{ color: '#113543' }}>{formatCurrency(batch.total_amount)}</div>
        </div>
        <div className="p-4 border rounded" style={{ backgroundColor: '#f8f9fa', borderColor: '#819291' }}>
          <div className="text-sm mb-1" style={{ color: '#819291' }}>Submitted</div>
          <div className="text-lg font-medium" style={{ color: '#113543' }}>{formatDate(batch.submitted_at)}</div>
        </div>
        <div className="p-4 border rounded" style={{ backgroundColor: '#f8f9fa', borderColor: '#819291' }}>
          <div className="text-sm mb-1" style={{ color: '#819291' }}>Status</div>
          <div className="text-lg font-medium capitalize" style={{ color: '#113543' }}>{batch.status}</div>
        </div>
      </div>

      {/* Action Bar */}
      {selectedInvoices.size > 0 && (
        <div className="p-4 mb-6 rounded flex items-center justify-between border" style={{ backgroundColor: '#EFF6FF', borderColor: '#819291' }}>
          <div className="text-sm font-medium" style={{ color: '#113543' }}>
            {selectedInvoices.size} invoice(s) selected
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={handleApprove}
              className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-white transition-colors"
              style={{ backgroundColor: '#819291' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#6b7a7a'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#819291'
              }}
            >
              <Check className="w-4 h-4" />
              <span>Approve</span>
            </button>
            <button
              onClick={handleReject}
              className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-white transition-colors"
              style={{ backgroundColor: '#C2A558' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#b89547'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#C2A558'
              }}
            >
              <X className="w-4 h-4" />
              <span>Reject</span>
            </button>
            <button
              onClick={handleHold}
              className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-white transition-colors"
              style={{ backgroundColor: '#C2A558' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#b89547'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#C2A558'
              }}
            >
              <FileText className="w-4 h-4" />
              <span>Hold</span>
            </button>
          </div>
        </div>
      )}

      {/* Review Notes */}
      <div className="mb-6">
        <label className="block text-sm font-medium mb-2" style={{ color: '#113543' }}>
          Review Notes
        </label>
        <textarea
          value={reviewNotes}
          onChange={(e) => setReviewNotes(e.target.value)}
          placeholder="Add notes about this batch review..."
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
                  checked={selectedInvoices.size === invoices.length}
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
              {invoices.map((invoice, index) => {
                const isLastViewed = lastViewedInvoiceId === invoice.id
                return (
                  <tr
                    key={invoice.id}
                    className="border-b cursor-pointer transition-colors"
                    style={{
                      borderColor: '#819291',
                      backgroundColor: isLastViewed
                        ? '#FFF9E6'
                        : index % 2 === 0
                          ? '#f8f9fa'
                          : '#FFFFFF',
                    }}
                    onClick={() => handleInvoiceClick(invoice.id)}
                    onMouseEnter={(e) => {
                      if (!isLastViewed) {
                        e.currentTarget.style.backgroundColor = '#f0f0f0'
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isLastViewed) {
                        e.currentTarget.style.backgroundColor = index % 2 === 0 ? '#f8f9fa' : '#FFFFFF'
                      }
                    }}
                  >
                <td className="py-3 px-4">
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
                <td className="py-3 px-4 text-sm" style={{ color: '#819291' }}>{invoice.broker_name}</td>
                <td className="py-3 px-4 text-sm text-right font-medium" style={{ color: '#113543' }}>
                  {formatCurrency(invoice.amount)}
                </td>
                <td className="py-3 px-4 text-sm" style={{ color: '#819291' }}>
                  {formatDate(invoice.invoice_date)}
                </td>
                <td className="py-3 px-4 text-sm">
                  <span
                    className="inline-flex items-center px-2.5 py-0.5 text-xs font-medium"
                    style={{ backgroundColor: '#819291', color: '#FFFFFF' }}
                  >
                    {invoice.status}
                  </span>
                </td>
                <td className="py-3 px-4 text-center">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleInvoiceClick(invoice.id)
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
                )
              })}
          </tbody>
        </table>
      </div>

      {/* Invoice Detail View */}
      {selectedInvoice && (
        <AdminInvoiceDetailView
          invoice={selectedInvoice}
          onClose={handleCloseModal}
          onApprove={handleApproveInvoice}
          onHold={handleHoldInvoice}
          onContactBroker={handleContactBrokerInvoice}
        />
      )}
    </div>
  )
}

