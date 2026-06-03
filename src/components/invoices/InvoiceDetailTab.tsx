import { useState } from 'react'
import { formatCurrency } from '../../utils/format'
import { formatDate } from '../../utils/format'
import { ArrowLeft, Check, X, FileText, Phone, Download, Paperclip, Mail, ChevronDown, ChevronUp, AlertCircle } from 'lucide-react'
import { mockInvoices } from '../../data/mockInvoices'
import { mockBrokers } from '../../data/mockBrokers'
import { mockClients } from '../../data/mockClients'

interface InvoiceDetailTabProps {
  invoiceId: string | null
  onBack: () => void
}

export default function InvoiceDetailTab({ invoiceId, onBack }: InvoiceDetailTabProps) {
  const [actionNotes, setActionNotes] = useState('')
  const [isCarrierExpanded, setIsCarrierExpanded] = useState(false)

  const invoice = mockInvoices.find((inv) => inv.id === invoiceId)
  const broker = invoice ? mockBrokers.find((b) => b.id === invoice.broker_id) : null
  const client = invoice ? mockClients.find((c) => c.id === invoice.client_id) : null

  if (!invoice) {
    return (
      <div className="p-6">
        <button
          onClick={onBack}
          className="flex items-center space-x-2 text-gray-600 hover:text-black mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Invoices</span>
        </button>
        <div className="text-center py-12">
          <p className="text-gray-500">Invoice not found</p>
        </div>
      </div>
    )
  }

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      pending: { color: 'bg-gray-100 text-gray-800', label: 'Pending' },
      approved: { color: 'bg-green-100 text-green-800', label: 'Approved' },
      rejected: { color: 'bg-red-100 text-red-800', label: 'Rejected' },
      hold: { color: 'bg-yellow-100 text-yellow-800', label: 'On Hold' },
      paid: { color: 'bg-blue-100 text-blue-800', label: 'Paid' },
      force_closed: { color: 'bg-purple-100 text-purple-800', label: 'Force Closed' },
    }
    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.pending

    return (
      <span className={`inline-flex items-center px-3 py-1 text-sm font-medium ${config.color}`}>
        {config.label}
      </span>
    )
  }

  const handleApprove = () => {
    console.log('Approving invoice:', invoice.id)
    // TODO: Implement approval logic
  }

  const handleReject = () => {
    console.log('Rejecting invoice:', invoice.id)
    // TODO: Implement rejection logic
  }

  const handleHold = () => {
    console.log('Holding invoice:', invoice.id)
    // TODO: Implement hold logic
  }

  const handleReleaseHold = () => {
    console.log('Releasing hold on invoice:', invoice.id)
    // TODO: Implement release hold logic
  }

  const handleContactBroker = () => {
    console.log('Contacting broker for invoice:', invoice.id)
    // TODO: Implement broker contact logic
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-4">
          <button
            onClick={onBack}
            className="flex items-center space-x-2 text-gray-600 hover:text-black"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back</span>
          </button>
          <div>
            <h2 className="text-xl font-bold text-black">{invoice.invoice_number}</h2>
            <p className="text-sm text-gray-600">
              {invoice.client_name} • {invoice.broker_name}
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          {getStatusBadge(invoice.status)}
          <button className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 transition-colors">
            <Download className="w-4 h-4" />
            <span>Export</span>
          </button>
        </div>
      </div>

      {/* Invoice Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-gray-50 p-4 border border-gray-200">
          <div className="text-sm text-gray-600 mb-1">Amount</div>
          <div className="text-2xl font-bold text-black">{formatCurrency(invoice.amount)}</div>
        </div>
        <div className="bg-gray-50 p-4 border border-gray-200">
          <div className="text-sm text-gray-600 mb-1">Invoice Date</div>
          <div className="text-lg font-medium text-black">{formatDate(invoice.invoice_date)}</div>
        </div>
        <div className="bg-gray-50 p-4 border border-gray-200">
          <div className="text-sm text-gray-600 mb-1">Expected Payment</div>
          <div className="text-lg font-medium text-black">
            {formatDate(invoice.expected_payment_date)}
          </div>
        </div>
        <div className="bg-gray-50 p-4 border border-gray-200">
          <div className="text-sm text-gray-600 mb-1">Documents</div>
          <div className="text-lg font-medium text-black flex items-center space-x-1">
            <Paperclip className="w-4 h-4" />
            <span>{invoice.documents_count || 0}</span>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center space-x-2 mb-6">
        {invoice.status === 'pending' && (
          <>
            <button
              onClick={handleApprove}
              className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 transition-colors"
            >
              <Check className="w-4 h-4" />
              <span>Approve</span>
            </button>
            <button
              onClick={handleReject}
              className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 transition-colors"
            >
              <X className="w-4 h-4" />
              <span>Reject</span>
            </button>
            <button
              onClick={handleHold}
              className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-white bg-yellow-600 hover:bg-yellow-700 transition-colors"
            >
              <FileText className="w-4 h-4" />
              <span>Put on Hold</span>
            </button>
          </>
        )}
        {invoice.status === 'hold' && (
          <>
            <button
              onClick={handleReleaseHold}
              className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 transition-colors"
            >
              <Check className="w-4 h-4" />
              <span>Release Hold</span>
            </button>
            <button
              onClick={handleApprove}
              className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 transition-colors"
            >
              <Check className="w-4 h-4" />
              <span>Approve</span>
            </button>
          </>
        )}
        <button
          onClick={handleContactBroker}
          className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 transition-colors"
        >
          <Phone className="w-4 h-4" />
          <span>Contact Broker</span>
        </button>
      </div>

      {/* Invoice Details */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="bg-gray-50 p-4 border border-gray-200">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Invoice Information</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Invoice Number:</span>
              <span className="font-medium text-gray-900">{invoice.invoice_number}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Load Number:</span>
              <span className="font-medium text-gray-900">{invoice.load_number || 'N/A'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Batch Number:</span>
              <span className="font-medium text-gray-900">
                {invoice.batch_number || 'N/A'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Due Date:</span>
              <span className="font-medium text-gray-900">{formatDate(invoice.due_date)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Expected Payment Date:</span>
              <span className="font-medium text-gray-900">{formatDate(invoice.expected_payment_date)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">{invoice.days_since_expected !== undefined && invoice.days_since_expected > 0 ? 'Overdue' : 'Due In'}:</span>
              <span 
                className="font-medium" 
                style={{ 
                  color: invoice.days_since_expected !== undefined && invoice.days_since_expected > 0 ? '#dc2626' : '#1f2937' 
                }}
              >
                {invoice.days_since_expected !== undefined ? (
                  invoice.days_since_expected > 0 
                    ? `${invoice.days_since_expected} days overdue`
                    : invoice.days_since_expected === 0
                    ? 'Due today'
                    : `Due in ${Math.abs(invoice.days_since_expected)} days`
                ) : 'N/A'}
              </span>
            </div>
          </div>
        </div>

        <div className="bg-gray-50 p-4 border border-gray-200">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Parties</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Client:</span>
              <span className="font-medium text-gray-900">{invoice.client_name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Broker:</span>
              <span className="font-medium text-gray-900">{invoice.broker_name}</span>
            </div>
            {invoice.reviewed_by && (
              <div className="flex justify-between">
                <span className="text-gray-600">Reviewed By:</span>
                <span className="font-medium text-gray-900">{invoice.reviewed_by}</span>
              </div>
            )}
            {invoice.reviewed_at && (
              <div className="flex justify-between">
                <span className="text-gray-600">Reviewed At:</span>
                <span className="font-medium text-gray-900">{formatDate(invoice.reviewed_at)}</span>
              </div>
            )}
            {invoice.approved_by && (
              <div className="flex justify-between">
                <span className="text-gray-600">Approved By:</span>
                <span className="font-medium text-gray-900">{invoice.approved_by}</span>
              </div>
            )}
            {invoice.approved_at && (
              <div className="flex justify-between">
                <span className="text-gray-600">Approved At:</span>
                <span className="font-medium text-gray-900">{formatDate(invoice.approved_at)}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Broker Information */}
      {broker && (
        <div className="bg-gray-50 p-4 border border-gray-200 mb-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Broker Information</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Broker Name:</span>
              <span className="font-medium text-gray-900">{invoice.broker_name}</span>
            </div>
            {broker.phone && (
              <div className="flex justify-between">
                <span className="text-gray-600">Phone:</span>
                <span className="font-medium text-gray-900">{broker.phone}</span>
              </div>
            )}
            {broker.email && (
              <div className="flex justify-between">
                <span className="text-gray-600">Email:</span>
                <span className="font-medium text-gray-900">{broker.email}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Carrier Information */}
      {client && (
        <div className="bg-gray-50 p-4 border border-gray-200 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-700">Carrier Information</h3>
            <button
              onClick={() => setIsCarrierExpanded(!isCarrierExpanded)}
              className="flex items-center space-x-1 text-xs text-gray-600 hover:text-gray-900"
            >
              <span>{isCarrierExpanded ? 'Collapse' : 'Expand'}</span>
              {isCarrierExpanded ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </button>
          </div>
          {isCarrierExpanded && (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Carrier Name:</span>
                <span className="font-medium text-gray-900">{invoice.client_name}</span>
              </div>
              {client.phone && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Phone:</span>
                  <span className="font-medium text-gray-900">{client.phone}</span>
                </div>
              )}
              {client.email && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Email:</span>
                  <span className="font-medium text-gray-900">{client.email}</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Collection Information */}
      {(invoice.collection_status || invoice.collection_date) && (
        <div className="bg-gray-50 p-4 border border-gray-200 mb-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Collection Information</h3>
          <div className="space-y-2 text-sm">
            {invoice.collection_status && (
              <div className="flex justify-between">
                <span className="text-gray-600">Status:</span>
                <span className="font-medium text-gray-900">{invoice.collection_status === 'C/B' ? 'C/B - Call Back' : 'W/P - Will Pay'}</span>
              </div>
            )}
            {invoice.collection_date && (
              <div className="flex justify-between">
                <span className="text-gray-600">Date:</span>
                <span className="font-medium text-gray-900">{formatDate(invoice.collection_date)}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Verification Information */}
      {invoice.verification_status && (
        <div className="bg-gray-50 p-4 border border-gray-200 mb-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Verification Information</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">How was the invoice verified?:</span>
              <span className="font-medium text-gray-900">{invoice.verification_status}</span>
            </div>
            {invoice.selected_contact_person && (
              <div className="flex justify-between">
                <span className="text-gray-600">Who did you speak to?:</span>
                <span className="font-medium text-gray-900">{invoice.selected_contact_person}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Hold Information */}
      {invoice.status === 'hold' && invoice.hold_reason && (
        <div className="bg-yellow-50 border border-yellow-200 p-4 mb-6 rounded">
          <h3 className="text-sm font-semibold text-yellow-900 mb-2">Hold Information</h3>
          <p className="text-sm text-yellow-800 mb-2">
            <strong>Reason:</strong> {invoice.hold_reason}
          </p>
          {invoice.notes && (
            <p className="text-sm text-yellow-800">
              <strong>Notes:</strong> {invoice.notes}
            </p>
          )}
        </div>
      )}

      {/* Notes Section */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Action Notes
        </label>
        <textarea
          value={actionNotes}
          onChange={(e) => setActionNotes(e.target.value)}
          placeholder="Add notes about this invoice..."
          className="w-full px-3 py-2 border border-gray-300 rounded text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
          rows={4}
        />
      </div>

      {/* Previous Notes */}
      {invoice.notes_history && invoice.notes_history.length > 0 && (
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Previous Notes
          </label>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {invoice.notes_history
              .slice()
              .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
              .map((noteItem) => (
                <div
                  key={noteItem.id}
                  className="p-3 border border-gray-200 rounded bg-white"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-gray-900">
                      {noteItem.created_by}
                    </span>
                    <span className="text-xs text-gray-600">
                      {formatDate(noteItem.created_at)}
                    </span>
                  </div>
                  <p className="text-sm text-gray-700">
                    {noteItem.note}
                  </p>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Document Send History */}
      {invoice.document_send_history && invoice.document_send_history.length > 0 && (
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Paperwork Sent History
          </label>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {invoice.document_send_history
              .sort((a, b) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime())
              .map((sendRecord, index) => (
                <div
                  key={index}
                  className="p-3 border border-gray-200 rounded bg-white"
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center space-x-2">
                      <Mail className="w-4 h-4 text-gray-400" />
                      <span className="text-xs font-medium text-gray-900">
                        {sendRecord.email_address}
                      </span>
                    </div>
                    <span className="text-xs text-gray-600">
                      {formatDate(sendRecord.sent_at)}
                    </span>
                  </div>
                  {sendRecord.sent_by && (
                    <div className="text-xs mt-1 text-gray-600">
                      Sent by: {sendRecord.sent_by}
                    </div>
                  )}
                  {sendRecord.documents_sent && sendRecord.documents_sent.length > 0 && (
                    <div className="text-xs mt-1 text-gray-600">
                      Documents: {sendRecord.documents_sent.join(', ')}
                    </div>
                  )}
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Documents Section */}
      <div className="bg-gray-50 p-4 border border-gray-200 rounded">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Documents</h3>
        <div className="text-sm text-gray-600">
          {invoice.documents_count && invoice.documents_count > 0 ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between p-2 bg-white border border-gray-200 rounded">
                <div className="flex items-center space-x-2">
                  <FileText className="w-4 h-4 text-gray-400" />
                  <span>Invoice Document</span>
                </div>
                <button className="text-blue-600 hover:text-blue-800 text-sm">View</button>
              </div>
              <div className="flex items-center justify-between p-2 bg-white border border-gray-200 rounded">
                <div className="flex items-center space-x-2">
                  <FileText className="w-4 h-4 text-gray-400" />
                  <span>Bill of Lading</span>
                </div>
                <button className="text-blue-600 hover:text-blue-800 text-sm">View</button>
              </div>
            </div>
          ) : (
            <p className="text-gray-500">No documents attached</p>
          )}
        </div>
      </div>
    </div>
  )
}


