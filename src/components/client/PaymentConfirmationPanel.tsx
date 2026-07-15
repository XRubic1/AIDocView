import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  X,
  ChevronLeft,
  ChevronRight,
  CheckCircle,
  AlertTriangle,
  Loader2,
  ArrowLeft,
  FileText,
  Boxes,
} from 'lucide-react'
import type { Invoice } from '../../types/invoice'
import type { Payment } from '../../types/payment'
import { isShortPayment } from '../../types/payment'
import { formatCurrency, formatDate } from '../../utils/format'
import { useClientTheme } from '../../theme/ThemeContext'
import { useClientSession } from '../../hooks/useClientSession'
import { PAYMENT_STATUS_LABELS } from '../../utils/paymentStatus'
import { getInvoiceReceivedAmount } from '../../utils/paymentVariance'
import { buildClientPaymentAuditTimeline } from '../../utils/clientPaymentAuditTimeline'
import { toClientVisibleInvoice } from '../../utils/clientInvoiceView'
import {
  getUnconfirmedPaymentTotal,
  getUnconfirmedShortPaymentTotal,
} from '../../data/mockPayments'
import { addClientInvoiceNote } from '../../services/clientInvoiceActions'
import { stashPaymentRestoreTarget } from '../../utils/paymentRestoreTarget'
import InvoiceBalanceSummary from './InvoiceBalanceSummary'
import { InvoiceNoteCompose } from './InvoiceNoteCompose'

const METHOD_LABELS: Record<string, string> = {
  check: 'Check',
  wire: 'Wire',
  ach: 'ACH',
  credit_card: 'Card',
}

const SUMMARY_TONE_CLASS: Partial<Record<Payment['status'], string>> = {
  confirmed: 'payment-confirmation-panel__summary--confirmed',
  awaiting_receipt: 'payment-confirmation-panel__summary--awaiting',
  disputed: 'payment-confirmation-panel__summary--disputed',
  pending: 'payment-confirmation-panel__summary--pending',
  rejected: 'payment-confirmation-panel__summary--rejected',
  reversed: 'payment-confirmation-panel__summary--reversed',
}

type TimelineFilter = 'all' | 'activity' | 'notes' | 'payments'

export interface PaymentConfirmationPanelProps {
  variant: 'sidebar' | 'mobile'
  payment: Payment
  invoice: Invoice | undefined
  invoicePayments: Payment[]
  navigationPayments: Payment[]
  onClose: () => void
  onNavigatePayment: (payment: Payment) => void
  canConfirmReceipt: boolean
  receiptActionLoading: boolean
  onConfirmReceipt: () => void
  onOpenDispute: () => void
  /** Refresh invoice notes / timeline after adding a note. */
  onInvoiceUpdated?: () => void
}

/** Payment detail — inline sidebar on desktop, full page on mobile. */
export default function PaymentConfirmationPanel({
  variant,
  payment,
  invoice,
  invoicePayments,
  navigationPayments,
  onClose,
  onNavigatePayment,
  canConfirmReceipt,
  receiptActionLoading,
  onConfirmReceipt,
  onOpenDispute,
  onInvoiceUpdated,
}: PaymentConfirmationPanelProps) {
  const c = useClientTheme()
  const navigate = useNavigate()
  const { clientName } = useClientSession()
  const isSidebar = variant === 'sidebar'
  const isMobile = variant === 'mobile'
  const [timelineFilter, setTimelineFilter] = useState<TimelineFilter>('all')
  const [newNote, setNewNote] = useState('')
  const [isAddingNote, setIsAddingNote] = useState(false)

  useEffect(() => {
    setTimelineFilter('all')
    setNewNote('')
  }, [payment.id])

  const visibleInvoice = useMemo(
    () => (invoice ? toClientVisibleInvoice(invoice) : undefined),
    [invoice]
  )

  const receivedAmount = useMemo(() => {
    if (!visibleInvoice) return 0
    return getInvoiceReceivedAmount(visibleInvoice, invoicePayments)
  }, [visibleInvoice, invoicePayments])

  const pendingConfirmation = useMemo(() => {
    if (!visibleInvoice) return 0
    return getUnconfirmedPaymentTotal(visibleInvoice.id)
  }, [visibleInvoice])

  const pendingShortCorrection = useMemo(() => {
    if (!visibleInvoice) return 0
    return getUnconfirmedShortPaymentTotal(visibleInvoice.id)
  }, [visibleInvoice])

  const awaitingOnInvoice = useMemo(
    () => invoicePayments.filter((p) => p.status === 'awaiting_receipt'),
    [invoicePayments]
  )

  const canConfirmOnInvoice =
    canConfirmReceipt &&
    (payment.status === 'awaiting_receipt' || awaitingOnInvoice.length > 0)

  const confirmAmount = useMemo(() => {
    if (payment.status === 'awaiting_receipt') return payment.amount
    return awaitingOnInvoice.reduce((sum, p) => sum + p.amount, 0)
  }, [payment, awaitingOnInvoice])

  const confirmIsShort =
    payment.status === 'awaiting_receipt'
      ? isShortPayment(payment)
      : awaitingOnInvoice.length > 0 && awaitingOnInvoice.every((p) => isShortPayment(p))

  const timeline = useMemo(() => {
    if (!visibleInvoice) return []
    return buildClientPaymentAuditTimeline(visibleInvoice, invoicePayments, payment.id)
  }, [visibleInvoice, invoicePayments, payment.id])

  const activityEntries = useMemo(
    () =>
      timeline.filter((entry) => {
        if (entry.kind !== 'activity') return false
        // Payment lifecycle lives under the Payments tab.
        if (
          entry.noteKind === 'payment' ||
          entry.id.startsWith('payment-') ||
          entry.id.startsWith('move-') ||
          entry.id.startsWith('reversal-') ||
          entry.id.startsWith('reject-') ||
          entry.id.startsWith('dispute-open-') ||
          entry.id.startsWith('dispute-resolved-')
        ) {
          return false
        }
        return true
      }),
    [timeline]
  )
  const noteEntries = useMemo(() => timeline.filter((entry) => entry.kind === 'note'), [timeline])
  const paymentEntries = useMemo(
    () =>
      timeline.filter((entry) => {
        if (entry.kind !== 'activity') return false
        return (
          entry.noteKind === 'payment' ||
          entry.id.startsWith('payment-') ||
          entry.id.startsWith('move-') ||
          entry.id.startsWith('reversal-') ||
          entry.id.startsWith('reject-') ||
          entry.id.startsWith('dispute-open-') ||
          entry.id.startsWith('dispute-resolved-')
        )
      }),
    [timeline]
  )

  const filteredTimeline =
    timelineFilter === 'all'
      ? timeline
      : timelineFilter === 'activity'
        ? activityEntries
        : timelineFilter === 'payments'
          ? paymentEntries
          : noteEntries

  const navIndex = navigationPayments.findIndex((p) => p.id === payment.id)
  const hasPrev = navIndex > 0
  const hasNext = navIndex >= 0 && navIndex < navigationPayments.length - 1

  const statusLabel = PAYMENT_STATUS_LABELS[payment.status] ?? payment.status
  const summaryToneClass =
    canConfirmOnInvoice && payment.status !== 'awaiting_receipt'
      ? 'payment-confirmation-panel__summary--awaiting'
      : (SUMMARY_TONE_CLASS[payment.status] ?? 'payment-confirmation-panel__summary--neutral')

  const isShortCorrection = confirmIsShort
  const displayPaymentAmount = isShortPayment(payment)
    ? `−${formatCurrency(payment.amount)}`
    : formatCurrency(payment.amount)

  const batchId = visibleInvoice?.batch_id || payment.batch_id
  const hasFooterActions = Boolean(canConfirmOnInvoice || visibleInvoice || batchId)

  const handleGoToInvoice = () => {
    if (!payment.invoice_id) return
    stashPaymentRestoreTarget({
      paymentId: payment.id,
      invoiceId: payment.invoice_id,
    })
    const params = new URLSearchParams({ highlight_invoice: payment.invoice_id })
    navigate(`/client/invoices?${params.toString()}`, {
      state: {
        returnTo: {
          to: `/client/payments?paymentId=${encodeURIComponent(payment.id)}`,
          label: 'Back to payment',
          paymentId: payment.id,
          invoiceId: payment.invoice_id,
        },
      },
    })
  }

  const handleGoToBatch = () => {
    if (!batchId) return
    stashPaymentRestoreTarget({
      paymentId: payment.id,
      invoiceId: payment.invoice_id,
    })
    const params = new URLSearchParams({
      tab: 'view',
      batch: batchId,
    })
    navigate(`/client/batches?${params.toString()}`, {
      state: {
        returnTo: {
          to: `/client/payments?paymentId=${encodeURIComponent(payment.id)}`,
          label: 'Back to payment',
          paymentId: payment.id,
          invoiceId: payment.invoice_id,
        },
      },
    })
  }

  const handleAddNote = async () => {
    if (!visibleInvoice || !newNote.trim() || isAddingNote) return
    setIsAddingNote(true)
    try {
      addClientInvoiceNote(visibleInvoice.id, newNote.trim(), clientName)
      setNewNote('')
      setTimelineFilter('notes')
      onInvoiceUpdated?.()
    } catch (error) {
      console.error('Failed to add note:', error)
    } finally {
      setIsAddingNote(false)
    }
  }

  const panelBody = (
    <>
      <header
        className={`payment-confirmation-panel__header ${isSidebar ? 'payment-confirmation-panel__header--sidebar' : ''}`}
      >
        {isMobile ? (
          <button
            type="button"
            onClick={onClose}
            className="payment-confirmation-panel__icon-btn"
            aria-label="Back to payments"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
        ) : null}

        <div className="payment-confirmation-panel__header-main min-w-0">
          <p className="payment-confirmation-panel__eyebrow" style={{ color: c.secondary }}>
            Payment details
          </p>
          <p className="payment-confirmation-panel__context-line" style={{ color: c.primary }}>
            Invoice {payment.invoice_number}
            {(payment.load_number || visibleInvoice?.load_number) &&
              ` · Load ${payment.load_number || visibleInvoice?.load_number}`}
          </p>
          <p className="payment-confirmation-panel__context-sub" style={{ color: c.secondary }}>
            {payment.broker_name}
          </p>
        </div>

        <div className="payment-confirmation-panel__header-actions">
          {(isMobile || isSidebar) && (
            <div className="payment-confirmation-panel__nav">
              <button
                type="button"
                className="payment-confirmation-panel__icon-btn"
                disabled={!hasPrev}
                onClick={() => hasPrev && onNavigatePayment(navigationPayments[navIndex - 1])}
                aria-label="Previous payment"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span
                className="payment-confirmation-panel__nav-count tabular-nums"
                style={{ color: c.secondary }}
              >
                {navIndex >= 0 ? navIndex + 1 : 1}/{navigationPayments.length || 1}
              </span>
              <button
                type="button"
                className="payment-confirmation-panel__icon-btn"
                disabled={!hasNext}
                onClick={() => hasNext && onNavigatePayment(navigationPayments[navIndex + 1])}
                aria-label="Next payment"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={onClose}
            className="payment-confirmation-panel__icon-btn"
            aria-label={isMobile ? 'Back to payments' : 'Close payment details'}
          >
            {!isMobile ? <X className="w-4 h-4" /> : null}
          </button>
        </div>
      </header>

      <div className="payment-confirmation-panel__body">
        <section
          className={`payment-confirmation-panel__summary ${summaryToneClass}`}
          aria-label={`Payment status: ${statusLabel}`}
        >
          {visibleInvoice ? (
            <InvoiceBalanceSummary
              invoiceNumber={visibleInvoice.invoice_number}
              brokerName={visibleInvoice.broker_name}
              loadNumber={visibleInvoice.load_number}
              invoiceAmount={visibleInvoice.amount}
              receivedToDate={receivedAmount}
              pendingConfirmation={pendingConfirmation}
              pendingShortCorrection={pendingShortCorrection}
              clientView
              hideIdentity
            />
          ) : null}

          <dl className="payment-confirmation-panel__summary-grid payment-confirmation-panel__summary-grid--meta">
            <div className="payment-confirmation-panel__summary-cell">
              <dt>Date received</dt>
              <dd className="tabular-nums payment-confirmation-panel__summary-value">
                {formatDate(payment.received_date)}
              </dd>
            </div>
            <div className="payment-confirmation-panel__summary-cell">
              <dt>Reference #</dt>
              <dd
                className="tabular-nums truncate payment-confirmation-panel__summary-value"
                title={payment.payment_reference}
              >
                {payment.payment_reference?.trim() || '—'}
              </dd>
            </div>
            <div className="payment-confirmation-panel__summary-cell">
              <dt>This payment</dt>
              <dd className="tabular-nums payment-confirmation-panel__summary-value">
                {displayPaymentAmount}
              </dd>
            </div>
            <div className="payment-confirmation-panel__summary-cell">
              <dt>Method</dt>
              <dd className="payment-confirmation-panel__summary-value">
                {METHOD_LABELS[payment.payment_method] || payment.payment_method}
              </dd>
            </div>
          </dl>

          {payment.status === 'pending' && !canConfirmOnInvoice ? (
            <p className="payment-confirmation-panel__summary-meta">
              Awaiting Credyx confirmation before it applies to the invoice.
            </p>
          ) : null}
        </section>

        <section className="payment-confirmation-panel__notes">
          <div className="payment-confirmation-panel__notes-head">
            <h3 className="payment-confirmation-panel__notes-title" style={{ color: c.primary }}>
              Activity &amp; notes
            </h3>
            <div
              className="payment-confirmation-panel__notes-filters"
              role="group"
              aria-label="Filter timeline"
            >
              {(
                [
                  ['all', 'All', timeline.length],
                  ['notes', 'Notes', noteEntries.length],
                  ['activity', 'Activity', activityEntries.length],
                  ['payments', 'Payments', paymentEntries.length],
                ] as const
              ).map(([key, label, count]) => (
                <button
                  key={key}
                  type="button"
                  className={`payment-confirmation-panel__notes-filter ${
                    timelineFilter === key ? 'payment-confirmation-panel__notes-filter--active' : ''
                  }`}
                  onClick={() => setTimelineFilter(key)}
                  aria-pressed={timelineFilter === key}
                >
                  {label}
                  {count > 0 && (
                    <span className="payment-confirmation-panel__notes-filter-count">{count}</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {visibleInvoice ? (
            <InvoiceNoteCompose
              newNote={newNote}
              isAddingNote={isAddingNote}
              onChange={setNewNote}
              onSubmit={() => void handleAddNote()}
              compact
              collapsible
            />
          ) : null}

          <div className="payment-confirmation-panel__notes-scroll">
            {filteredTimeline.length === 0 ? (
              <p className="payment-confirmation-panel__notes-empty" style={{ color: c.mutedLight }}>
                {timelineFilter === 'all'
                  ? 'No activity or notes recorded for this invoice yet.'
                  : timelineFilter === 'activity'
                    ? 'No invoice activity recorded yet.'
                    : timelineFilter === 'payments'
                      ? 'No payment activity on this invoice yet.'
                      : 'No notes recorded for this invoice yet.'}
              </p>
            ) : (
              <ol className="payment-confirmation-panel__notes-list">
                {filteredTimeline.map((entry) => (
                  <li key={entry.id} className="payment-confirmation-panel__note">
                    {entry.source ? (
                      <span
                        className={`payment-confirmation-panel__note-source payment-confirmation-panel__note-source--${entry.source}`}
                        aria-label={entry.source === 'carrier' ? 'Carrier' : 'Credyx'}
                        title={entry.source === 'carrier' ? 'Carrier' : 'Credyx'}
                      >
                        <span className="payment-confirmation-panel__note-source-dot" aria-hidden />
                      </span>
                    ) : (
                      <span className="payment-confirmation-panel__note-source" aria-hidden>
                        <span className="payment-confirmation-panel__note-source-dot" />
                      </span>
                    )}
                    <div className="payment-confirmation-panel__note-head">
                      <div className="payment-confirmation-panel__note-title-row">
                        <span className="payment-confirmation-panel__note-title">{entry.title}</span>
                      </div>
                      <time
                        className="payment-confirmation-panel__note-date tabular-nums"
                        dateTime={entry.timestamp}
                      >
                        {formatDate(entry.timestamp)}
                      </time>
                    </div>
                    <p className="payment-confirmation-panel__note-detail">{entry.detail}</p>
                    {entry.meta ? (
                      <p className="payment-confirmation-panel__note-meta">{entry.meta}</p>
                    ) : null}
                  </li>
                ))}
              </ol>
            )}
          </div>
        </section>
      </div>

      {hasFooterActions ? (
        <footer className="payment-confirmation-panel__footer shrink-0" style={{ borderColor: c.border }}>
          <div className="payment-confirmation-panel__footer-actions">
            {canConfirmOnInvoice ? (
              <>
                <button
                  type="button"
                  onClick={onConfirmReceipt}
                  disabled={receiptActionLoading}
                  className="dashboard-btn-primary dashboard-btn-compact flex-1 min-w-[100px] inline-flex items-center justify-center gap-1 disabled:opacity-50"
                >
                  {receiptActionLoading ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <CheckCircle className="w-3 h-3" />
                  )}
                  {awaitingOnInvoice.length > 1 && payment.status !== 'awaiting_receipt'
                    ? `Confirm ${formatCurrency(confirmAmount)}`
                    : `Confirm ${isShortCorrection ? 'correction' : 'received'}`}
                </button>
                <button
                  type="button"
                  onClick={onOpenDispute}
                  disabled={receiptActionLoading || awaitingOnInvoice.length === 0}
                  className="dashboard-btn-secondary dashboard-btn-compact flex-1 min-w-[88px] inline-flex items-center justify-center gap-1 disabled:opacity-50"
                  style={{ color: c.error, borderColor: c.error }}
                >
                  <AlertTriangle className="w-3 h-3" />
                  Dispute
                </button>
              </>
            ) : null}
            {visibleInvoice ? (
              <button
                type="button"
                onClick={handleGoToInvoice}
                className="dashboard-btn-secondary dashboard-btn-compact flex-1 min-w-[88px] inline-flex items-center justify-center gap-1"
              >
                <FileText className="w-3 h-3" />
                Invoice
              </button>
            ) : null}
            {batchId ? (
              <button
                type="button"
                onClick={handleGoToBatch}
                className="dashboard-btn-secondary dashboard-btn-compact flex-1 min-w-[88px] inline-flex items-center justify-center gap-1"
              >
                <Boxes className="w-3 h-3" />
                Batch
              </button>
            ) : null}
          </div>
        </footer>
      ) : null}
    </>
  )

  if (variant === 'mobile') {
    return (
      <div className="payment-confirmation-panel payment-confirmation-panel--mobile flex flex-col min-h-0 flex-1 overflow-hidden">
        {panelBody}
      </div>
    )
  }

  return (
    <div
      className="payment-confirmation-panel payment-confirmation-panel--sidebar flex flex-col min-h-0 h-full overflow-hidden"
      style={{ backgroundColor: c.card }}
      role="region"
      aria-label={`Payment details for invoice ${payment.invoice_number}`}
    >
      {panelBody}
    </div>
  )
}
