import { useState } from 'react'
import { formatCurrency } from '../../utils/format'
import { formatDate } from '../../utils/format'
import { X, Check, FileText, Phone, Download, Paperclip, Eye, Mail, ChevronDown, ChevronUp } from 'lucide-react'
import { Invoice } from '../../types/invoice'
import ContactBrokerModal from '../brokers/ContactBrokerModal'
import { mockBrokers } from '../../data/mockBrokers'
import { getClientById } from '../../services/clientRegistry'

interface InvoiceDetailModalProps {
  invoice: Invoice | null
  onClose: () => void
  onApprove?: (invoiceId: string) => void
  onReject?: (invoiceId: string) => void
  onHold?: (invoiceId: string) => void
  onReleaseHold?: (invoiceId: string) => void
  onContactBroker?: (invoiceId: string) => void
}

export default function InvoiceDetailModal({
  invoice,
  onClose,
  onApprove,
  onReject,
  onHold,
  onReleaseHold,
  onContactBroker,
}: InvoiceDetailModalProps) {
  const [actionNotes, setActionNotes] = useState('')
  const [showContactModal, setShowContactModal] = useState(false)
  const [isCarrierExpanded, setIsCarrierExpanded] = useState(false)

  if (!invoice) return null

  const broker = mockBrokers.find((b) => b.id === invoice.broker_id)
  const client = getClientById(invoice.client_id)

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      pending: { color: 'bg-gray-100 text-gray-800', label: 'Pending' },
      approved: { color: 'bg-green-100 text-green-800', label: 'Approved' },
      rejected: { color: 'bg-red-100 text-red-800', label: 'Rejected' },
      hold: { color: 'bg-yellow-100 text-yellow-800', label: 'On Hold' },
      paid: { color: 'bg-blue-100 text-blue-800', label: 'Paid' },
      force_closed: { color: 'bg-orange-100 text-orange-800', label: 'Force Closed' },
      written_off: { color: 'bg-purple-100 text-purple-800', label: 'Written Off' },
    }
    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.pending

    return (
      <span className={`inline-flex items-center px-3 py-1 text-sm font-medium ${config.color}`}>
        {config.label}
      </span>
    )
  }

  const handleApprove = () => {
    onApprove?.(invoice.id)
    onClose()
  }

  const handleReject = () => {
    onReject?.(invoice.id)
    onClose()
  }

  const handleHold = () => {
    onHold?.(invoice.id)
    onClose()
  }

  const handleReleaseHold = () => {
    onReleaseHold?.(invoice.id)
    onClose()
  }

  const handleContactBroker = () => {
    onContactBroker?.(invoice.id)
    setShowContactModal(true)
  }

  const handleCallBroker = () => {
    console.log('Calling broker for invoice:', invoice.id)
    // Additional call logic can be added here
  }

  const handleEmailBroker = () => {
    console.log('Emailing broker for invoice:', invoice.id)
    // Additional email logic can be added here
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
            <div>
              <h2 className="text-xl font-bold text-black">{invoice.invoice_number}</h2>
              <p className="text-sm text-gray-600">
                {invoice.client_name} • {invoice.broker_name}
              </p>
            </div>
            <div className="flex items-center space-x-3">
              {getStatusBadge(invoice.status)}
              <button
                onClick={() => {
                  console.log('View documents for invoice:', invoice.id)
                  // TODO: Implement document viewer
                }}
                className="flex items-center space-x-2 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 transition-colors"
              >
                <Eye className="w-4 h-4" />
                <span>View Documents</span>
              </button>
              <button
                onClick={onClose}
                className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="p-6">
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
              <button className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 transition-colors">
                <Download className="w-4 h-4" />
                <span>Export</span>
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
                  {invoice.reviewed_by && !invoice.approved_by && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Reviewed By:</span>
                      <span className="font-medium text-gray-900">{invoice.reviewed_by}</span>
                    </div>
                  )}
                  {invoice.reviewed_at && !invoice.approved_at && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Reviewed At:</span>
                      <span className="font-medium text-gray-900">{formatDate(invoice.reviewed_at)}</span>
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

            {/* Document Send History */}
            {invoice.document_send_history && invoice.document_send_history.length > 0 && (
              <div className="bg-gray-50 p-4 border border-gray-200 mb-6">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Paperwork Sent History</h3>
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

            {/* Previous Notes Section */}
            <div className="bg-gray-50 p-4 border border-gray-200 rounded">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Previous Notes</h3>
              <div className="space-y-3">
                {invoice.notes_history && invoice.notes_history.length > 0 ? (
                  invoice.notes_history
                    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                    .map((note) => {
                      const isHoldReason = note.type === 'hold_reason'
                      const isApproval = note.type === 'approval'
                      const isRejection = note.type === 'rejection'

                      return (
                        <div
                          key={note.id}
                          className={`p-3 border rounded ${
                            isHoldReason
                              ? 'bg-yellow-50 border-yellow-200'
                              : isApproval
                                ? 'bg-green-50 border-green-200'
                                : isRejection
                                  ? 'bg-red-50 border-red-200'
                                  : 'bg-white border-gray-200'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center space-x-2">
                              <span
                                className={`text-xs font-medium ${
                                  isHoldReason
                                    ? 'text-yellow-800'
                                    : isApproval
                                      ? 'text-green-800'
                                      : isRejection
                                        ? 'text-red-800'
                                        : 'text-gray-600'
                                }`}
                              >
                                {note.created_by}
                              </span>
                              {isApproval && (
                                <span className="text-xs px-1.5 py-0.5 bg-green-200 text-green-800 rounded">
                                  Approved
                                </span>
                              )}
                              {isRejection && (
                                <span className="text-xs px-1.5 py-0.5 bg-red-200 text-red-800 rounded">
                                  Rejected
                                </span>
                              )}
                              {isHoldReason && (
                                <span className="text-xs px-1.5 py-0.5 bg-yellow-200 text-yellow-800 rounded">
                                  Hold Reason
                                </span>
                              )}
                            </div>
                            <span
                              className={`text-xs ${
                                isHoldReason
                                  ? 'text-yellow-600'
                                  : isApproval
                                    ? 'text-green-600'
                                    : isRejection
                                      ? 'text-red-600'
                                      : 'text-gray-500'
                              }`}
                            >
                              {formatDate(note.created_at)}
                            </span>
                          </div>
                          <p
                            className={`text-sm ${
                              isHoldReason
                                ? 'text-yellow-900'
                                : isApproval
                                  ? 'text-green-900'
                                  : isRejection
                                    ? 'text-red-900'
                                    : 'text-gray-900'
                            }`}
                          >
                            {note.note}
                          </p>
                        </div>
                      )
                    })
                ) : invoice.notes ? (
                  <div className="bg-white p-3 border border-gray-200 rounded">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-gray-600">
                        {invoice.reviewed_by || 'System'}
                      </span>
                      <span className="text-xs text-gray-500">
                        {invoice.reviewed_at ? formatDate(invoice.reviewed_at) : formatDate(invoice.created_at)}
                      </span>
                    </div>
                    <p className="text-sm text-gray-900">{invoice.notes}</p>
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">No previous notes</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Contact Broker Modal */}
      {showContactModal && broker && (
        <ContactBrokerModal
          broker={broker}
          invoiceNumber={invoice.invoice_number}
          onClose={() => setShowContactModal(false)}
          onCall={handleCallBroker}
          onEmail={handleEmailBroker}
        />
      )}
    </div>
  )
}

