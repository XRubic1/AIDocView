import { useState, useEffect } from 'react'
import { formatCurrency } from '../../utils/format'
import { formatDate } from '../../utils/format'
import { X, FileText, MessageSquare, Send, AlertTriangle, XCircle } from 'lucide-react'
import { Invoice, InvoiceNote } from '../../types/invoice'
import DocumentViewer from '../DocumentViewer'
import { useToast } from '../ui/ToastProvider'

interface CollectionsInvoiceModalProps {
  invoice: Invoice | null
  onClose: () => void
  onAddNote?: (invoiceId: string, note: string) => void
  onConfirmPayment?: (invoiceId: string) => void
  onMarkNotReceived?: (invoiceId: string, note: string) => void
  paymentStatus?: 'not_received' | 'paid' | 'review'
}

export default function CollectionsInvoiceModal({
  invoice,
  onClose,
  onAddNote,
  onConfirmPayment,
  onMarkNotReceived,
  paymentStatus = 'not_received',
}: CollectionsInvoiceModalProps) {
  const { showToast } = useToast()
  const [newNote, setNewNote] = useState('')
  const [showDocumentViewer, setShowDocumentViewer] = useState(false)
  const [isSubmittingNote, setIsSubmittingNote] = useState(false)
  const [hasTakenAction, setHasTakenAction] = useState(false)
  const [showCloseWarning, setShowCloseWarning] = useState(false)

  if (!invoice) return null

  // Calculate days since expected payment date
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const expectedDate = new Date(invoice.expected_payment_date)
  expectedDate.setHours(0, 0, 0, 0)
  const diffTime = today.getTime() - expectedDate.getTime()
  const daysSinceExpected = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)))
  
  const isUrgent = daysSinceExpected >= 25
  const isNearAutoClose = daysSinceExpected >= 30
  const daysUntilAutoClose = 30 - daysSinceExpected

  // Check if action has been taken (note added or payment marked)
  useEffect(() => {
    // Check if there's a recent note from the client (within last hour)
    const recentNote = invoice.notes_history?.some((note) => {
      const noteDate = new Date(note.created_at)
      const hoursAgo = (Date.now() - noteDate.getTime()) / (1000 * 60 * 60)
      return hoursAgo < 1
    })
    setHasTakenAction(!!recentNote)
  }, [invoice.notes_history])

  const handleAddNote = async () => {
    if (!newNote.trim() || !onAddNote) return

    setIsSubmittingNote(true)
    try {
      await onAddNote(invoice.id, newNote.trim())
      setNewNote('')
      setHasTakenAction(true)
    } catch (error) {
      console.error('Error adding note:', error)
    } finally {
      setIsSubmittingNote(false)
    }
  }

  const handleMarkNotReceived = async () => {
    if (!newNote.trim() && isUrgent) {
      showToast(
        'A note is required for invoices over 25 days overdue. Please add a note explaining the payment status.',
        'error'
      )
      return
    }

    if (onMarkNotReceived) {
      const noteText = newNote.trim() || 'Payment not received - marked by client'
      await onMarkNotReceived(invoice.id, noteText)
      if (!newNote.trim()) {
        setNewNote('')
      }
      setHasTakenAction(true)
      onClose()
    }
  }

  const handleConfirmPayment = () => {
    if (onConfirmPayment) {
      onConfirmPayment(invoice.id)
      onClose()
    }
  }

  const handleClose = () => {
    // If invoice is in review, allow closing without warning
    if (paymentStatus === 'review') {
      onClose()
      return
    }
    
    if (isUrgent && !hasTakenAction) {
      setShowCloseWarning(true)
      return
    }
    onClose()
  }

  // Get documents for this invoice
  const getDocumentsForInvoice = (): Array<{ id: string; name: string; type: string; size?: number }> => {
    if (!invoice || !invoice.documents_count || invoice.documents_count === 0) return []
    
    // Generate mock documents based on count (in a real app, these would come from the API)
    return Array.from({ length: invoice.documents_count }).map((_, idx) => ({
      id: `doc-${invoice.id}-${idx}`,
      name: `Document ${idx + 1}.pdf`,
      type: 'application/pdf',
      size: 1024 * 500, // Mock size
    }))
  }

  const documents = getDocumentsForInvoice()

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
              <h2 className="text-xl font-semibold" style={{ color: '#113543' }}>
                Invoice Details
              </h2>
              <p className="text-sm mt-1" style={{ color: '#819291' }}>
                {invoice.invoice_number}
              </p>
            </div>
            <button
              onClick={handleClose}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              style={{ color: '#113543' }}
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6">
            {/* In Review Status Banner */}
            {paymentStatus === 'review' && (
              <div
                className="mb-6 p-4 rounded-lg border-l-4 flex items-start space-x-3"
                style={{
                  backgroundColor: '#EFF6FF',
                  borderLeftColor: '#3b82f6',
                }}
              >
                <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: '#3b82f6' }} />
                <div className="flex-1">
                  <h4 className="font-semibold mb-1" style={{ color: '#113543' }}>
                    Invoice In Review
                  </h4>
                  <p className="text-sm" style={{ color: '#113543' }}>
                    ✓ Your action has been recorded. This invoice is now under review and will not be automatically closed while in review status.
                  </p>
                </div>
              </div>
            )}

            {/* Urgent Warning Banner */}
            {isUrgent && paymentStatus !== 'review' && (
              <div
                className="mb-6 p-4 rounded-lg border-l-4 flex items-start space-x-3"
                style={{
                  backgroundColor: '#FFF9E6',
                  borderLeftColor: '#C2A558',
                }}
              >
                <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: '#C2A558' }} />
                <div className="flex-1">
                  <h4 className="font-semibold mb-1" style={{ color: '#113543' }}>
                    Immediate Action Required
                  </h4>
                  <p className="text-sm mb-2" style={{ color: '#113543' }}>
                    This invoice is {daysSinceExpected} days overdue. You must add a note and mark payment status before closing.
                  </p>
                  {isNearAutoClose ? (
                    <p className="text-sm font-medium" style={{ color: '#C2A558' }}>
                      ⚠️ This invoice will be automatically closed due to inactivity as it has exceeded 30 days.
                    </p>
                  ) : (
                    <p className="text-sm" style={{ color: '#819291' }}>
                      ⚠️ If no action is taken, this invoice will be automatically closed after 30 days ({daysUntilAutoClose} days remaining).
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Invoice Information */}
            <div className="mb-6">
              <h3 className="text-lg font-medium mb-4" style={{ color: '#113543' }}>
                Invoice Information
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm mb-1" style={{ color: '#819291' }}>
                    Invoice Number
                  </p>
                  <p className="font-medium" style={{ color: '#113543' }}>
                    {invoice.invoice_number}
                  </p>
                </div>
                {invoice.load_number && (
                  <div>
                    <p className="text-sm mb-1" style={{ color: '#819291' }}>
                      Load Number
                    </p>
                    <p className="font-medium" style={{ color: '#113543' }}>
                      {invoice.load_number}
                    </p>
                  </div>
                )}
                <div>
                  <p className="text-sm mb-1" style={{ color: '#819291' }}>
                    Invoice Date
                  </p>
                  <p className="font-medium" style={{ color: '#113543' }}>
                    {formatDate(invoice.invoice_date)}
                  </p>
                </div>
                <div>
                  <p className="text-sm mb-1" style={{ color: '#819291' }}>
                    Expected Payment Date
                  </p>
                  <p className="font-medium" style={{ color: '#113543' }}>
                    {formatDate(invoice.expected_payment_date)}
                  </p>
                </div>
                <div>
                  <p className="text-sm mb-1" style={{ color: '#819291' }}>
                    Broker
                  </p>
                  <p className="font-medium" style={{ color: '#113543' }}>
                    {invoice.broker_name}
                  </p>
                </div>
                <div>
                  <p className="text-sm mb-1" style={{ color: '#819291' }}>
                    Amount
                  </p>
                  <p className="font-medium text-lg" style={{ color: '#113543' }}>
                    {formatCurrency(invoice.amount)}
                  </p>
                </div>
              </div>
            </div>

            {/* Documents Section */}
            {documents.length > 0 && (
              <div className="mb-6">
                <button
                  onClick={() => setShowDocumentViewer(true)}
                  className="flex items-center space-x-2 px-4 py-2 rounded transition-colors"
                  style={{
                    backgroundColor: '#C2A558',
                    color: '#FFFFFF',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#b89547'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#C2A558'
                  }}
                >
                  <FileText className="w-4 h-4" />
                  <span>View Documents</span>
                </button>
              </div>
            )}

            {/* Add Note Section */}
            <div className="mb-6">
              <h3 className="text-lg font-medium mb-4 flex items-center" style={{ color: '#113543' }}>
                <MessageSquare className="w-5 h-5 mr-2" />
                Add Note {isUrgent && <span className="text-sm font-normal ml-2" style={{ color: '#C2A558' }}>(Required)</span>}
              </h3>
              <div className="space-y-3">
                <textarea
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder={isUrgent ? "Required: Add a note about payment status..." : "Add a note about this invoice..."}
                  rows={4}
                  required={isUrgent}
                  className="w-full px-4 py-3 text-sm border rounded focus:outline-none focus:ring-2"
                  style={{
                    borderColor: isUrgent && !newNote.trim() ? '#C2A558' : '#819291',
                    color: '#113543',
                    backgroundColor: '#FFFFFF',
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = '#C2A558'
                    e.currentTarget.style.boxShadow = '0 0 0 2px rgba(194, 165, 88, 0.2)'
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = isUrgent && !newNote.trim() ? '#C2A558' : '#819291'
                    e.currentTarget.style.boxShadow = 'none'
                  }}
                />
                {isUrgent && !newNote.trim() && (
                  <p className="text-xs" style={{ color: '#C2A558' }}>
                    * A note is required for invoices over 25 days overdue
                  </p>
                )}
                <div className="flex justify-end space-x-2">
                  {isUrgent && onMarkNotReceived && (
                    <button
                      onClick={handleMarkNotReceived}
                      disabled={!newNote.trim() || isSubmittingNote}
                      className="flex items-center space-x-2 px-4 py-2 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{
                        backgroundColor: '#819291',
                        color: '#FFFFFF',
                      }}
                      onMouseEnter={(e) => {
                        if (!e.currentTarget.disabled) {
                          e.currentTarget.style.backgroundColor = '#6b7a7a'
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!e.currentTarget.disabled) {
                          e.currentTarget.style.backgroundColor = '#819291'
                        }
                      }}
                    >
                      <XCircle className="w-4 h-4" />
                      <span>Mark Payment Not Received</span>
                    </button>
                  )}
                  <button
                    onClick={handleAddNote}
                    disabled={!newNote.trim() || isSubmittingNote}
                    className="flex items-center space-x-2 px-4 py-2 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{
                      backgroundColor: '#C2A558',
                      color: '#FFFFFF',
                    }}
                    onMouseEnter={(e) => {
                      if (!e.currentTarget.disabled) {
                        e.currentTarget.style.backgroundColor = '#b89547'
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!e.currentTarget.disabled) {
                        e.currentTarget.style.backgroundColor = '#C2A558'
                      }
                    }}
                  >
                    <Send className="w-4 h-4" />
                    <span>{isSubmittingNote ? 'Adding...' : 'Add Note'}</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Previous Notes Section */}
            {invoice.notes_history && invoice.notes_history.length > 0 && (
              <div className="mb-6">
                <h3 className="text-lg font-medium mb-4" style={{ color: '#113543' }}>
                  Previous Notes
                </h3>
                <div className="space-y-3">
                  {invoice.notes_history
                    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                    .map((note: InvoiceNote) => (
                      <div
                        key={note.id}
                        className="p-4 border rounded"
                        style={{
                          borderColor: '#819291',
                          backgroundColor: '#f8f9fa',
                        }}
                      >
                        <div className="flex justify-between items-start mb-2">
                          <p className="text-sm font-medium" style={{ color: '#113543' }}>
                            {note.created_by}
                          </p>
                          <p className="text-xs" style={{ color: '#819291' }}>
                            {formatDate(note.created_at)}
                          </p>
                        </div>
                        <p className="text-sm" style={{ color: '#113543' }}>
                          {note.note}
                        </p>
                        {note.type && note.type !== 'note' && (
                          <span
                            className="inline-block mt-2 px-2 py-1 text-xs rounded"
                            style={{
                              backgroundColor: '#819291',
                              color: '#FFFFFF',
                            }}
                          >
                            {note.type === 'approval' ? 'Approval' : note.type === 'rejection' ? 'Rejection' : 'Hold Reason'}
                          </span>
                        )}
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* Confirm Payment Button */}
            {onConfirmPayment && (
              <div className="mt-6 pt-6 border-t" style={{ borderColor: '#819291' }}>
                <button
                  onClick={handleConfirmPayment}
                  className="w-full flex items-center justify-center space-x-2 px-4 py-3 rounded transition-colors"
                  style={{
                    backgroundColor: '#C2A558',
                    color: '#FFFFFF',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#b89547'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#C2A558'
                  }}
                >
                  <Send className="w-4 h-4" />
                  <span>Confirm Payment Received</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Document Viewer Modal */}
      {showDocumentViewer && documents.length > 0 && (
        <DocumentViewer
          isOpen={showDocumentViewer}
          onClose={() => setShowDocumentViewer(false)}
          documents={documents.map(doc => ({
            id: doc.id,
            name: doc.name,
            type: doc.type,
            size: doc.size || 0,
          }))}
          invoiceNumber={invoice.invoice_number}
          title="Invoice Documents"
        />
      )}

      {/* Close Warning Modal */}
      {showCloseWarning && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black bg-opacity-50" onClick={() => setShowCloseWarning(false)} />
          <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="flex items-start space-x-3 mb-4">
              <AlertTriangle className="w-6 h-6 flex-shrink-0 mt-0.5" style={{ color: '#C2A558' }} />
              <div>
                <h3 className="text-lg font-semibold mb-2" style={{ color: '#113543' }}>
                  Action Required
                </h3>
                <p className="text-sm mb-4" style={{ color: '#113543' }}>
                  This invoice is {daysSinceExpected} days overdue. You must add a note and mark the payment status before closing this window.
                </p>
                {isNearAutoClose ? (
                  <p className="text-sm font-medium mb-4" style={{ color: '#C2A558' }}>
                    ⚠️ This invoice will be automatically closed due to inactivity as it has exceeded 30 days.
                  </p>
                ) : (
                  <p className="text-sm mb-4" style={{ color: '#819291' }}>
                    ⚠️ If no action is taken, this invoice will be automatically closed after 30 days ({daysUntilAutoClose} days remaining).
                  </p>
                )}
              </div>
            </div>
            <div className="flex justify-end space-x-2">
              <button
                onClick={() => setShowCloseWarning(false)}
                className="px-4 py-2 text-sm rounded transition-colors"
                style={{
                  backgroundColor: '#819291',
                  color: '#FFFFFF',
                }}
              >
                I Understand
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

