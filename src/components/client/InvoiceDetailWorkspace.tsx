import { useState } from 'react'
import { Invoice, InvoiceNote } from '../../types/invoice'
import { formatCurrency, formatDate, formatDateTime } from '../../utils/format'
import {
  addClientInvoiceNote,
  openClientInvoiceDispute,
  markClientInvoiceAsPaid,
  uploadClientInvoiceDocuments,
  getOpenDisputes,
  getDisputeReasonLabel,
  getInvoiceDisputeRowBadge,
  DISPUTE_REASON_OPTIONS,
  type ClientMarkPaidOptions,
} from '../../services/clientInvoiceActions'
import { getInvoiceDocuments } from '../../services/invoiceDocumentStore'
import InvoiceDocumentUploadModal from './InvoiceDocumentUploadModal'
import { Eye, Search, Filter, ChevronLeft, X, MessageSquarePlus, AlertTriangle, CircleCheck, Maximize2, Upload } from 'lucide-react'
import { enrichInvoice, getOverdueSeverityLabel, isOpenArInvoice, AR_POLICY, getDaysOutstandingColor } from '../../utils/invoiceAging'
import { clientTheme as c } from '../../theme/clientTheme'

const NOTE_TYPE_LABELS: Record<string, string> = {
  note: 'Note',
  client_note: 'Client Note',
  hold_reason: 'On Hold',
  approval: 'Approved',
  rejection: 'Rejected',
  dispute: 'Dispute',
}

const inputCompactStyle = {
  backgroundColor: c.card,
  height: 34,
  paddingTop: 6,
  paddingBottom: 6,
  fontSize: 13,
} as const

function getInvoiceNoteEntries(invoice: Invoice): InvoiceNote[] {
  if (invoice.notes_history?.length) {
    return [...invoice.notes_history].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
  }

  const fallback: InvoiceNote[] = []
  if (invoice.hold_reason) {
    fallback.push({
      id: 'hold-fallback',
      note: invoice.hold_reason,
      created_by: invoice.reviewed_by || 'Credyx',
      created_at: invoice.reviewed_at || invoice.updated_at || invoice.created_at,
      type: 'hold_reason',
    })
  }
  if (invoice.notes) {
    fallback.push({
      id: 'note-fallback',
      note: invoice.notes,
      created_by: invoice.reviewed_by || 'Credyx',
      created_at: invoice.created_at,
      type: 'note',
    })
  }
  return fallback
}

export function getInvoiceStatusBadge(status: string) {
  const classMap: Record<string, string> = {
    pending: 'status-pill status-pill--pending',
    approved: 'status-pill status-pill--approved',
    hold: 'status-pill status-pill--hold',
    paid: 'status-pill status-pill--approved',
    rejected: 'status-pill status-pill--overdue',
    overdue: 'status-pill status-pill--overdue',
    force_closed: 'status-pill status-pill--hold',
  }
  const labels: Record<string, string> = {
    pending: 'Pending',
    approved: 'Approved',
    hold: 'On Hold',
    paid: 'Paid',
    rejected: 'Rejected',
    overdue: 'Overdue',
    force_closed: 'Force Closed',
  }
  return (
    <span className={classMap[status] || 'status-pill status-pill--pending'}>
      {labels[status] || status}
    </span>
  )
}

/** Status badge using enriched display status when available. */
export function getInvoiceRowStatusBadge(invoice: Invoice & { displayStatus?: string }) {
  return getInvoiceStatusBadge(invoice.displayStatus || invoice.status)
}

const DISPUTE_BADGE_CLASS: Record<string, string> = {
  open: 'status-pill--overdue',
  reviewing: 'status-pill--hold',
  responded: 'status-pill--approved',
}

/** One dispute pill for invoice list / table rows. */
export function InvoiceDisputeBadges({ invoice }: { invoice: Invoice }) {
  const badge = getInvoiceDisputeRowBadge(invoice)
  if (!badge) return null

  return (
    <span
      className={`status-pill status-pill--compact ${DISPUTE_BADGE_CLASS[badge.variant] || 'status-pill--pending'}`}
      title={badge.label}
    >
      {badge.label}
    </span>
  )
}

type NoticeType = 'hold' | 'force_close' | 'overdue' | 'dispute'

function getInvoiceNotice(
  invoice: Invoice,
  enriched: ReturnType<typeof enrichInvoice>,
  openDisputeCount: number
): { type: NoticeType; message: string } | null {
  if (invoice.status === 'hold') {
    return {
      type: 'hold',
      message: invoice.hold_reason
        ? `On hold — ${invoice.hold_reason}`
        : 'This invoice is currently on hold.',
    }
  }
  if (enriched.isForceCloseEligible) {
    return {
      type: 'force_close',
      message: `${enriched.daysOutstanding} days past expected pay — eligible for force close (${AR_POLICY.forceCloseDays}+ days).`,
    }
  }
  if (enriched.isOverdue && enriched.overdueSeverity !== 'none') {
    return {
      type: 'overdue',
      message:
        enriched.overdueSeverity === 'force_close'
          ? `${enriched.daysOutstanding} days past expected pay.`
          : getOverdueSeverityLabel(enriched.overdueSeverity),
    }
  }
  if (openDisputeCount > 0) {
    return {
      type: 'dispute',
      message: `${openDisputeCount} open dispute${openDisputeCount !== 1 ? 's' : ''} — Credyx is reviewing.`,
    }
  }
  return null
}

interface InvoiceNotesTimelineProps {
  noteEntries: InvoiceNote[]
  openDisputes: ReturnType<typeof getOpenDisputes>
}

function InvoiceNotesTimeline({ noteEntries, openDisputes }: InvoiceNotesTimelineProps) {
  return (
    <>
      {openDisputes.length > 0 && (
        <div className="invoice-detail-disputes">
          {openDisputes.map((dispute) => (
            <div key={dispute.id} className="invoice-detail-dispute-entry">
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-xs font-semibold" style={{ color: '#991b1b' }}>
                  {getDisputeReasonLabel(dispute.reason)}
                </span>
                <span className="text-[11px]" style={{ color: c.secondary }}>
                  {formatDateTime(dispute.created_at)}
                </span>
              </div>
                      <p className="invoice-detail-note-text">{dispute.description}</p>
                      {dispute.response?.trim() && (
                        <div className="invoice-detail-dispute-response">
                          <span className="invoice-detail-dispute-response-label">Credyx response</span>
                          <p className="invoice-detail-note-text">{dispute.response}</p>
                          {(dispute.responded_at || dispute.responded_by) && (
                            <p className="invoice-detail-note-meta">
                              {dispute.responded_at ? formatDateTime(dispute.responded_at) : ''}
                              {dispute.responded_by ? ` · ${dispute.responded_by}` : ''}
                            </p>
                          )}
                        </div>
                      )}
            </div>
          ))}
        </div>
      )}

      {noteEntries.length === 0 ? (
        <p className="invoice-detail-empty">No notes on this invoice yet</p>
      ) : (
        <div className="invoice-detail-timeline">
          {noteEntries.map((entry) => {
            const typeKey = entry.type || 'note'
            return (
              <div
                key={entry.id}
                className={`invoice-detail-timeline-item invoice-detail-timeline-item--${typeKey}`}
              >
                <div className="invoice-detail-timeline-content">
                  <div className="invoice-detail-timeline-head">
                    <span className="invoice-detail-timeline-type">
                      {NOTE_TYPE_LABELS[typeKey] || 'Note'}
                    </span>
                    <span className="invoice-detail-timeline-time">
                      {formatDateTime(entry.created_at)}
                    </span>
                  </div>
                  <p className="invoice-detail-note-text">{entry.note}</p>
                  {entry.created_by && (
                    <p className="invoice-detail-note-meta">{entry.created_by}</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}

interface InvoiceNoteComposeProps {
  newNote: string
  isAddingNote: boolean
  onChange: (value: string) => void
  onSubmit: () => void
  compact?: boolean
}

function InvoiceNoteCompose({
  newNote,
  isAddingNote,
  onChange,
  onSubmit,
  compact = false,
}: InvoiceNoteComposeProps) {
  return (
    <div className={`invoice-detail-note-compose ${compact ? 'invoice-detail-note-compose--compact' : ''}`}>
      <div className="invoice-detail-note-compose-row">
        <textarea
          value={newNote}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Add a note for Credyx..."
          rows={compact ? 1 : 2}
          className="client-input invoice-detail-note-input"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              onSubmit()
            }
          }}
        />
        <button
          type="button"
          onClick={onSubmit}
          disabled={!newNote.trim() || isAddingNote}
          className="dashboard-btn-primary dashboard-btn-compact invoice-detail-add-note-btn"
          title="Add note"
        >
          <MessageSquarePlus className="w-3 h-3" />
          <span className="hidden sm:inline">{isAddingNote ? 'Adding...' : 'Add'}</span>
        </button>
      </div>
    </div>
  )
}

interface InvoiceDetailPaneProps {
  invoice: Invoice
  clientName: string
  onViewDocuments?: () => void
  onBack?: () => void
  onInvoiceUpdated?: () => void
  onAddNote?: (invoiceId: string, note: string) => void | Promise<void>
  onOpenDispute?: (invoiceId: string, reason: string, description: string) => void | Promise<void>
  onMarkAsPaid?: (invoiceId: string, options: ClientMarkPaidOptions) => void | Promise<void>
  enableClientActions?: boolean
}

function InvoiceDetailPane({
  invoice,
  clientName,
  onViewDocuments,
  onBack,
  onInvoiceUpdated,
  onAddNote,
  onOpenDispute,
  onMarkAsPaid,
  enableClientActions = true,
}: InvoiceDetailPaneProps) {
  const enriched = enrichInvoice(invoice)
  const noteEntries = getInvoiceNoteEntries(invoice)
  const openDisputes = getOpenDisputes(invoice)
  const [newNote, setNewNote] = useState('')
  const [isAddingNote, setIsAddingNote] = useState(false)
  const [showDisputeModal, setShowDisputeModal] = useState(false)
  const [disputeReason, setDisputeReason] = useState<string>(DISPUTE_REASON_OPTIONS[0].value)
  const [disputeDescription, setDisputeDescription] = useState('')
  const [isOpeningDispute, setIsOpeningDispute] = useState(false)
  const [disputeError, setDisputeError] = useState<string | null>(null)
  const [showPaidModal, setShowPaidModal] = useState(false)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentNote, setPaymentNote] = useState('')
  const [isMarkingPaid, setIsMarkingPaid] = useState(false)
  const [paidError, setPaidError] = useState<string | null>(null)
  const [showNotesModal, setShowNotesModal] = useState(false)
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [isUploadingDocs, setIsUploadingDocs] = useState(false)
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null)

  const invoiceDocuments = getInvoiceDocuments(invoice.id)
  const documentCount = Math.max(invoice.documents_count || 0, invoiceDocuments.length)
  const canMarkAsPaid = enableClientActions && isOpenArInvoice(invoice)
  const canViewDocuments = documentCount > 0 && !!onViewDocuments

  const notice = getInvoiceNotice(invoice, enriched, openDisputes.length)

  const handleUploadDocuments = async (files: File[]) => {
    if (isUploadingDocs || files.length === 0) return
    setIsUploadingDocs(true)
    try {
      const updated = uploadClientInvoiceDocuments(invoice.id, files, clientName)
      if (!updated) throw new Error('Upload failed')
      setUploadSuccess(
        `${files.length} file${files.length > 1 ? 's' : ''} uploaded — Credyx has been notified.`
      )
      window.setTimeout(() => setUploadSuccess(null), 5000)
      onInvoiceUpdated?.()
    } finally {
      setIsUploadingDocs(false)
    }
  }
  const headerMeta = [
    invoice.broker_name,
    invoice.load_number ? `Load ${invoice.load_number}` : null,
    invoice.batch_number ? `Batch ${invoice.batch_number}` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  const handleAddNote = async () => {
    if (!newNote.trim() || isAddingNote) return
    setIsAddingNote(true)
    try {
      if (onAddNote) {
        await onAddNote(invoice.id, newNote.trim())
      } else {
        addClientInvoiceNote(invoice.id, newNote.trim(), clientName)
      }
      setNewNote('')
      onInvoiceUpdated?.()
    } catch (error) {
      console.error('Failed to add note:', error)
    } finally {
      setIsAddingNote(false)
    }
  }

  const handleOpenDispute = async () => {
    if (!disputeDescription.trim() || isOpeningDispute) return
    setIsOpeningDispute(true)
    setDisputeError(null)
    try {
      if (onOpenDispute) {
        await onOpenDispute(invoice.id, disputeReason, disputeDescription.trim())
      } else {
        const updated = openClientInvoiceDispute(
          invoice.id,
          disputeReason,
          disputeDescription.trim(),
          clientName
        )
        if (!updated) {
          setDisputeError('Could not open dispute. Please try again.')
          return
        }
      }
      setShowDisputeModal(false)
      setDisputeDescription('')
      setDisputeReason(DISPUTE_REASON_OPTIONS[0].value)
      onInvoiceUpdated?.()
    } catch (error) {
      console.error('Failed to open dispute:', error)
      setDisputeError('Could not open dispute. Please try again.')
    } finally {
      setIsOpeningDispute(false)
    }
  }

  const handleMarkAsPaid = async () => {
    if (isMarkingPaid) return

    const amountReceived = parseFloat(paymentAmount)
    if (!Number.isFinite(amountReceived) || amountReceived <= 0) {
      setPaidError('Enter a valid amount received.')
      return
    }

    setIsMarkingPaid(true)
    setPaidError(null)
    try {
      const options: ClientMarkPaidOptions = {
        amountReceived,
        optionalNote: paymentNote.trim() || undefined,
      }
      if (onMarkAsPaid) {
        await onMarkAsPaid(invoice.id, options)
      } else {
        const updated = markClientInvoiceAsPaid(invoice.id, clientName, options)
        if (!updated) {
          setPaidError('Could not mark invoice as paid. Only approved invoices can be updated.')
          return
        }
      }
      setShowPaidModal(false)
      setPaymentAmount('')
      setPaymentNote('')
      onInvoiceUpdated?.()
    } catch (error) {
      console.error('Failed to mark invoice as paid:', error)
      setPaidError('Could not mark invoice as paid. Please try again.')
    } finally {
      setIsMarkingPaid(false)
    }
  }

  const openPaidModal = () => {
    setPaymentAmount(String(invoice.amount))
    setPaymentNote('')
    setPaidError(null)
    setShowPaidModal(true)
  }

  return (
    <div className="invoice-detail-pane">
      <div className="invoice-detail-header">
        <div className="invoice-detail-header-row">
          <div className="invoice-detail-header-title">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="lg:hidden p-1.5 rounded-lg hover:bg-slate-100 transition-colors shrink-0"
                style={{ color: c.secondary }}
                aria-label="Back to list"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-bold leading-tight" style={{ color: c.primary }}>
                  {invoice.invoice_number}
                </h2>
                {getInvoiceRowStatusBadge(enriched)}
              </div>
              {headerMeta && (
                <p className="text-xs mt-0.5 truncate" style={{ color: c.secondary }}>
                  {headerMeta}
                </p>
              )}
            </div>
          </div>
          <div className="invoice-detail-header-actions">
            {canMarkAsPaid && (
              <button
                type="button"
                onClick={openPaidModal}
                className="dashboard-btn-primary"
                style={{ height: 32, fontSize: 12, paddingLeft: 12, paddingRight: 12 }}
              >
                <CircleCheck className="w-3.5 h-3.5" />
                Mark Paid
              </button>
            )}
            {enableClientActions && (
              <button
                type="button"
                onClick={() => setShowDisputeModal(true)}
                className="dashboard-btn-secondary"
                style={{ height: 32, fontSize: 12, paddingLeft: 10, paddingRight: 10 }}
                title="Open dispute"
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Dispute</span>
              </button>
            )}
            {enableClientActions && (
              <button
                type="button"
                onClick={() => setShowUploadModal(true)}
                className="dashboard-btn-secondary"
                style={{ height: 32, fontSize: 12, paddingLeft: 10, paddingRight: 10 }}
                title="Upload additional documents"
              >
                <Upload className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Upload</span>
              </button>
            )}
            {canViewDocuments && (
              <button
                type="button"
                onClick={onViewDocuments}
                className="dashboard-btn-secondary"
                style={{ height: 32, fontSize: 12, paddingLeft: 10, paddingRight: 10 }}
                title="View documents"
              >
                <Eye className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Docs</span>
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="invoice-detail-panel-scroll">
        <div className="invoice-detail-panel-top">
          <div className="invoice-detail-overview">
            <div className="invoice-detail-overview-main">
              <div
                className={`invoice-detail-overview-hero ${
                  invoice.status === 'paid' ? 'invoice-detail-overview-hero--paid' : ''
                }`}
              >
                {invoice.status === 'paid' && (
                  <span className="invoice-detail-paid-label">Paid</span>
                )}
                <span className="invoice-detail-field-label">Amount</span>
                <div
                  className="invoice-detail-hero-amount tabular-nums"
                  style={{ color: invoice.status === 'paid' ? '#047857' : c.primary }}
                >
                  {formatCurrency(
                    invoice.status === 'paid' && invoice.paid_amount != null
                      ? invoice.paid_amount
                      : invoice.amount
                  )}
                </div>
                {invoice.status === 'paid' &&
                  invoice.paid_amount != null &&
                  Math.abs(invoice.paid_amount - invoice.amount) >= 0.01 && (
                    <p className="invoice-detail-paid-subamount">
                      Invoice {formatCurrency(invoice.amount)}
                    </p>
                  )}
              </div>

              <div className="invoice-detail-stat-grid">
                {notice && (
                  <div className={`invoice-detail-stat-notice invoice-detail-stat-notice--${notice.type}`}>
                    {notice.message}
                  </div>
                )}
                <div className="invoice-detail-stat">
                  <span className="invoice-detail-field-label">Invoice Date</span>
                  <span className="invoice-detail-stat-value">{formatDate(invoice.invoice_date)}</span>
                </div>
                <div className="invoice-detail-stat">
                  <span className="invoice-detail-field-label">Due Date</span>
                  <span className="invoice-detail-stat-value">
                    {invoice.due_date ? formatDate(invoice.due_date) : '—'}
                  </span>
                </div>
                <div className="invoice-detail-stat">
                  <span className="invoice-detail-field-label">Expected Pay</span>
                  <span className="invoice-detail-stat-value">
                    {invoice.expected_payment_date ? formatDate(invoice.expected_payment_date) : '—'}
                  </span>
                </div>
                <div className="invoice-detail-stat">
                  <span className="invoice-detail-field-label">Invoice Age</span>
                  <span className="invoice-detail-stat-value tabular-nums">{enriched.invoiceAgeDays} days</span>
                </div>
                <div className="invoice-detail-stat">
                  <span className="invoice-detail-field-label">Days Out</span>
                  <span
                    className="invoice-detail-stat-value tabular-nums"
                    style={{
                      color:
                        isOpenArInvoice(invoice) && enriched.isOverdue
                          ? getDaysOutstandingColor(enriched.overdueSeverity)
                          : undefined,
                    }}
                  >
                    {!isOpenArInvoice(invoice) || invoice.status === 'force_closed'
                      ? '—'
                      : `${enriched.daysOutstanding} days`}
                  </span>
                </div>
                <div className="invoice-detail-stat invoice-detail-stat--documents">
                  <span className="invoice-detail-field-label">Documents</span>
                  <div className="invoice-detail-documents-row">
                    <span className="invoice-detail-stat-value">{documentCount}</span>
                    {enableClientActions && (
                      <button
                        type="button"
                        onClick={() => setShowUploadModal(true)}
                        className="invoice-detail-documents-upload"
                      >
                        <Upload className="w-3 h-3" />
                        Add
                      </button>
                    )}
                    {canViewDocuments && (
                      <button
                        type="button"
                        onClick={onViewDocuments}
                        className="invoice-detail-documents-view"
                      >
                        View
                      </button>
                    )}
                  </div>
                  {uploadSuccess && (
                    <p className="invoice-detail-upload-success">{uploadSuccess}</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="invoice-detail-columns">
          <div className="invoice-detail-column invoice-detail-column--notes">
            <div className="invoice-detail-section-title invoice-detail-section-title--row">
              <span>Notes & activity</span>
              <button
                type="button"
                onClick={() => setShowNotesModal(true)}
                className="invoice-detail-section-action"
                title="Open notes in popup"
              >
                <Maximize2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Popup</span>
              </button>
            </div>

            {enableClientActions && (
              <InvoiceNoteCompose
                newNote={newNote}
                isAddingNote={isAddingNote}
                onChange={setNewNote}
                onSubmit={handleAddNote}
                compact
              />
            )}

            <div className="invoice-detail-notes-scroll">
              <InvoiceNotesTimeline noteEntries={noteEntries} openDisputes={openDisputes} />
            </div>
          </div>

          <div className="invoice-detail-column invoice-detail-column--history">
            <div className="invoice-detail-section-title invoice-detail-section-title--row">
              <span>Send history</span>
              {invoice.broker_contacted && (
                <span className="invoice-detail-section-meta">
                  Broker contacted
                  {invoice.last_broker_contact ? ` · ${formatDate(invoice.last_broker_contact)}` : ''}
                </span>
              )}
            </div>
            <div className="invoice-detail-history-scroll">
              {invoice.document_send_history && invoice.document_send_history.length > 0 ? (
                <div className="invoice-detail-send-list">
                  {invoice.document_send_history.map((send, idx) => (
                    <div key={idx} className="invoice-detail-send-item">
                      <div className="invoice-detail-send-email truncate">{send.email_address}</div>
                      <div className="invoice-detail-send-meta">
                        <span>{formatDate(send.sent_at)}</span>
                        {send.status && (
                          <span
                            className={`status-pill ${
                              send.status === 'delivered'
                                ? 'status-pill--approved'
                                : send.status === 'failed'
                                  ? 'status-pill--overdue'
                                  : 'status-pill--pending'
                            }`}
                          >
                            {send.status}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="invoice-detail-empty">No documents sent yet</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {showUploadModal && (
        <InvoiceDocumentUploadModal
          isOpen={showUploadModal}
          invoiceNumber={invoice.invoice_number}
          onClose={() => setShowUploadModal(false)}
          onUpload={handleUploadDocuments}
        />
      )}

      {showNotesModal && (
        <div
          className="invoice-dispute-modal-overlay"
          onClick={() => setShowNotesModal(false)}
          role="presentation"
        >
          <div
            className="invoice-notes-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-labelledby="notes-modal-title"
          >
            <div className="invoice-dispute-modal-header">
              <div>
                <h3 id="notes-modal-title" className="text-base font-semibold" style={{ color: c.primary }}>
                  Notes & activity
                </h3>
                <p className="text-xs mt-0.5" style={{ color: c.secondary }}>
                  {invoice.invoice_number}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowNotesModal(false)}
                className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
                style={{ color: c.secondary }}
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {enableClientActions && (
              <InvoiceNoteCompose
                newNote={newNote}
                isAddingNote={isAddingNote}
                onChange={setNewNote}
                onSubmit={handleAddNote}
              />
            )}

            <div className="invoice-notes-modal-body">
              <InvoiceNotesTimeline noteEntries={noteEntries} openDisputes={openDisputes} />
            </div>
          </div>
        </div>
      )}

      {showPaidModal && (
        <div
          className="invoice-dispute-modal-overlay"
          onClick={() => !isMarkingPaid && setShowPaidModal(false)}
          role="presentation"
        >
          <div
            className="invoice-dispute-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-labelledby="paid-modal-title"
          >
            <div className="invoice-dispute-modal-header">
              <h3 id="paid-modal-title" className="text-base font-semibold" style={{ color: c.primary }}>
                Confirm Payment Received
              </h3>
              <button
                type="button"
                onClick={() => setShowPaidModal(false)}
                className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
                style={{ color: c.secondary }}
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="invoice-dispute-modal-body">
              <p className="text-sm mb-4" style={{ color: c.secondary }}>
                Confirm payment for {invoice.invoice_number}. Invoice amount{' '}
                <strong style={{ color: c.primary }}>{formatCurrency(invoice.amount)}</strong>.
              </p>
              <label className="client-label" htmlFor="paid-amount-received">
                Amount received
              </label>
              <input
                id="paid-amount-received"
                type="number"
                min="0"
                step="0.01"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                className="client-input w-full mb-4 tabular-nums"
              />
              {paymentAmount &&
                parseFloat(paymentAmount) !== invoice.amount &&
                Number.isFinite(parseFloat(paymentAmount)) && (
                  <p className="text-xs mb-4" style={{ color: c.secondary }}>
                    {parseFloat(paymentAmount) < invoice.amount
                      ? `Short by ${formatCurrency(invoice.amount - parseFloat(paymentAmount))}`
                      : `Over by ${formatCurrency(parseFloat(paymentAmount) - invoice.amount)}`}
                  </p>
                )}
              <label className="client-label" htmlFor="paid-note">
                Note (optional)
              </label>
              <textarea
                id="paid-note"
                value={paymentNote}
                onChange={(e) => setPaymentNote(e.target.value)}
                placeholder="Why the amount differs, check number, etc."
                rows={3}
                className="client-input w-full"
              />
              {paidError && (
                <p className="text-sm mt-2" style={{ color: '#DC2626' }}>
                  {paidError}
                </p>
              )}
            </div>
            <div className="invoice-dispute-modal-footer">
              <button
                type="button"
                onClick={() => setShowPaidModal(false)}
                className="dashboard-btn-secondary"
                style={{ height: 36, fontSize: 13 }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleMarkAsPaid}
                disabled={isMarkingPaid}
                className="dashboard-btn-primary"
                style={{ height: 36, fontSize: 13 }}
              >
                {isMarkingPaid ? 'Confirming...' : 'Confirm Payment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showDisputeModal && (
        <div
          className="invoice-dispute-modal-overlay"
          onClick={() => !isOpeningDispute && setShowDisputeModal(false)}
          role="presentation"
        >
          <div
            className="invoice-dispute-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-labelledby="dispute-modal-title"
          >
            <div className="invoice-dispute-modal-header">
              <h3 id="dispute-modal-title" className="text-base font-semibold" style={{ color: c.primary }}>
                Open Dispute
              </h3>
              <button
                type="button"
                onClick={() => setShowDisputeModal(false)}
                className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
                style={{ color: c.secondary }}
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="invoice-dispute-modal-body">
              <p className="text-sm mb-4" style={{ color: c.secondary }}>
                Tell us what is wrong with this invoice. Credyx will review and follow up with the broker if needed.
              </p>
              <label className="client-label">Reason</label>
              <select
                value={disputeReason}
                onChange={(e) => setDisputeReason(e.target.value)}
                className="client-input w-full mb-4"
              >
                {DISPUTE_REASON_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <label className="client-label">Description</label>
              <textarea
                value={disputeDescription}
                onChange={(e) => setDisputeDescription(e.target.value)}
                placeholder="Describe the issue in detail..."
                rows={4}
                className="client-input w-full"
              />
              {disputeError && (
                <p className="text-sm mt-2" style={{ color: '#DC2626' }}>
                  {disputeError}
                </p>
              )}
            </div>
            <div className="invoice-dispute-modal-footer">
              <button
                type="button"
                onClick={() => setShowDisputeModal(false)}
                className="dashboard-btn-secondary"
                style={{ height: 36, fontSize: 13 }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleOpenDispute}
                disabled={!disputeDescription.trim() || isOpeningDispute}
                className="dashboard-btn-primary"
                style={{ height: 36, fontSize: 13 }}
              >
                {isOpeningDispute ? 'Submitting...' : 'Submit Dispute'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export interface InvoiceDetailWorkspaceProps {
  isOpen: boolean
  onClose: () => void
  invoices: Invoice[]
  selectedInvoice: Invoice | null
  onSelectInvoice: (invoice: Invoice) => void
  onViewDocuments?: (invoice: Invoice) => void
  highlightedInvoiceId?: string | null
  title?: string
  clientName: string
  onInvoiceUpdated?: () => void
  onAddNote?: (invoiceId: string, note: string) => void | Promise<void>
  onOpenDispute?: (invoiceId: string, reason: string, description: string) => void | Promise<void>
  onMarkAsPaid?: (invoiceId: string, options: ClientMarkPaidOptions) => void | Promise<void>
  enableClientActions?: boolean
  /** Sync search/filter with parent (e.g. invoices page). Omit for local-only filtering. */
  searchTerm?: string
  onSearchChange?: (value: string) => void
  statusFilter?: string
  onStatusFilterChange?: (value: string) => void
  showStatusFilter?: boolean
}

export default function InvoiceDetailWorkspace({
  isOpen,
  onClose,
  invoices,
  selectedInvoice,
  onSelectInvoice,
  onViewDocuments,
  highlightedInvoiceId,
  title = 'Invoice Details',
  clientName,
  onInvoiceUpdated,
  onAddNote,
  onOpenDispute,
  onMarkAsPaid,
  enableClientActions = true,
  searchTerm: externalSearchTerm,
  onSearchChange: externalOnSearchChange,
  statusFilter: externalStatusFilter,
  onStatusFilterChange: externalOnStatusFilterChange,
  showStatusFilter = true,
}: InvoiceDetailWorkspaceProps) {
  const [mobileListMode, setMobileListMode] = useState(false)
  const [localSearchTerm, setLocalSearchTerm] = useState('')
  const [localStatusFilter, setLocalStatusFilter] = useState('all')

  const searchTerm = externalSearchTerm ?? localSearchTerm
  const onSearchChange = externalOnSearchChange ?? setLocalSearchTerm
  const statusFilter = externalStatusFilter ?? localStatusFilter
  const onStatusFilterChange = externalOnStatusFilterChange ?? setLocalStatusFilter

  if (!isOpen || !selectedInvoice) return null

  const filteredList = invoices.filter((invoice) => {
    const enriched = enrichInvoice(invoice)
    const matchesSearch =
      invoice.invoice_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      invoice.broker_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      invoice.load_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      invoice.batch_number?.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesStatus =
      !showStatusFilter ||
      statusFilter === 'all' ||
      (statusFilter === 'overdue' ? enriched.isOverdue : invoice.status === statusFilter)
    return matchesSearch && matchesStatus
  })

  const handleClose = () => {
    setMobileListMode(false)
    onClose()
  }

  return (
    <div className="invoice-detail-overlay" role="dialog" aria-modal="true" aria-label={title}>
      <div className="invoice-detail-overlay-header">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={handleClose}
            className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors shrink-0"
            style={{ color: c.secondary }}
            aria-label="Close invoice details"
          >
            <X className="w-5 h-5" />
          </button>
          <h2 className="text-sm font-semibold truncate" style={{ color: c.primary }}>
            {title}
          </h2>
        </div>
        <span className="text-xs font-medium shrink-0" style={{ color: c.secondary }}>
          {filteredList.length} invoice{filteredList.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="invoice-workspace invoice-workspace--overlay">
        <div
          className={`invoice-workspace-body ${
            selectedInvoice && !mobileListMode ? 'invoice-workspace-body--detail-open' : ''
          }`}
        >
          <aside className="invoice-list-panel">
            <div className="invoice-list-toolbar">
              <div className="relative mb-2">
                <Search
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5"
                  style={{ color: c.secondary }}
                />
                <input
                  type="text"
                  placeholder="Search invoices..."
                  value={searchTerm}
                  onChange={(e) => onSearchChange(e.target.value)}
                  className="client-input pl-8 w-full"
                  style={inputCompactStyle}
                />
              </div>
              {showStatusFilter && (
                <div className="flex items-center gap-2">
                  <Filter className="w-3.5 h-3.5 shrink-0" style={{ color: c.secondary }} />
                  <select
                    value={statusFilter}
                    onChange={(e) => onStatusFilterChange(e.target.value)}
                    className="client-input flex-1 min-w-0"
                    style={inputCompactStyle}
                  >
                    <option value="all">All Status</option>
                    <option value="overdue">Overdue</option>
                    <option value="pending">Pending</option>
                    <option value="approved">Approved</option>
                    <option value="hold">On Hold</option>
                    <option value="paid">Paid</option>
                  </select>
                </div>
              )}
            </div>

            <div className="invoice-list-scroll">
              {filteredList.length === 0 ? (
                <p className="invoice-detail-empty p-4">No invoices found</p>
              ) : (
                filteredList.map((invoice) => {
                  const enriched = enrichInvoice(invoice)
                  const isActive = selectedInvoice.id === invoice.id
                  const isHighlighted = highlightedInvoiceId === invoice.id
                  return (
                    <button
                      key={invoice.id}
                      type="button"
                      onClick={() => {
                        onSelectInvoice(invoice)
                        setMobileListMode(false)
                      }}
                      className={`invoice-list-item ${isActive ? 'invoice-list-item--active' : ''} ${
                        isHighlighted ? 'invoice-list-item--highlight' : ''
                      } ${enriched.isForceCloseEligible ? 'invoice-list-item--force-close' : enriched.isOverdue ? 'invoice-list-item--overdue' : ''}`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1 min-w-0">
                        <span className="text-sm font-semibold truncate" style={{ color: c.primary }}>
                          {invoice.invoice_number}
                        </span>
                        <div className="flex items-center gap-1 shrink-0 max-w-[58%] justify-end">
                          {getInvoiceRowStatusBadge(enriched)}
                          <InvoiceDisputeBadges invoice={invoice} />
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="truncate" style={{ color: c.secondary }}>
                          {invoice.broker_name}
                        </span>
                        <span className="font-semibold tabular-nums shrink-0" style={{ color: c.primary }}>
                          {formatCurrency(invoice.amount)}
                          {isOpenArInvoice(invoice) && enriched.daysOutstanding > 0 && (
                            <span
                              className="ml-1.5 font-medium"
                              style={{
                                color: enriched.isOverdue
                                  ? getDaysOutstandingColor(enriched.overdueSeverity)
                                  : c.secondary,
                              }}
                            >
                              · {enriched.daysOutstanding}d
                            </span>
                          )}
                        </span>
                      </div>
                    </button>
                  )
                })
              )}
            </div>
          </aside>

          <section className="invoice-detail-panel">
            <InvoiceDetailPane
              key={selectedInvoice.id}
              invoice={selectedInvoice}
              clientName={clientName}
              onViewDocuments={onViewDocuments ? () => onViewDocuments(selectedInvoice) : undefined}
              onBack={() => setMobileListMode(true)}
              onInvoiceUpdated={onInvoiceUpdated}
              onAddNote={onAddNote}
              onOpenDispute={onOpenDispute}
              onMarkAsPaid={onMarkAsPaid}
              enableClientActions={enableClientActions}
            />
          </section>
        </div>
      </div>
    </div>
  )
}
