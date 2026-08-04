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
  Menu,
} from 'lucide-react'
import type { Invoice } from '../../types/invoice'
import type { Payment } from '../../types/payment'
import { isShortPayment } from '../../types/payment'
import { formatCurrency, formatDate } from '../../utils/format'
import { useClientTheme } from '../../theme/ThemeContext'
import { useClientSession } from '../../hooks/useClientSession'
import { PAYMENT_STATUS_LABELS } from '../../utils/paymentStatus'
import { getPaymentTimingInfo } from '../../utils/paymentTiming'
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
import { InvoiceActivityNoteList } from './InvoiceActivityNoteList'

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
type DetailSurface = 'overview' | 'notes'

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
  const [detailSurface, setDetailSurface] = useState<DetailSurface>('overview')
  const [timelineFilter, setTimelineFilter] = useState<TimelineFilter>('all')
  const [newNote, setNewNote] = useState('')
  const [isAddingNote, setIsAddingNote] = useState(false)

  useEffect(() => {
    setDetailSurface('overview')
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
      if (isMobile) setDetailSurface('notes')
      onInvoiceUpdated?.()
    } catch (error) {
      console.error('Failed to add note:', error)
    } finally {
      setIsAddingNote(false)
    }
  }

  const overviewSection = (
    <section
      className={`payment-confirmation-panel__summary ${
        isMobile
          ? 'payment-confirmation-panel__summary--mobile-clean'
          : summaryToneClass
      }`}
      aria-label={`Payment status: ${statusLabel}`}
    >
      {isMobile ? (
        <div className="payment-confirmation-panel__mobile-identity">
          <div className="payment-confirmation-panel__mobile-identity-row">
            <span className="payment-confirmation-panel__mobile-identity-label">Payment</span>
            <span
              className={`payment-confirmation-panel__mobile-status payment-confirmation-panel__mobile-status--${payment.status.replace(/_/g, '-')}`}
            >
              {statusLabel}
            </span>
          </div>
          <p className="payment-confirmation-panel__mobile-identity-amount tabular-nums">
            {displayPaymentAmount}
          </p>
          <p className="payment-confirmation-panel__mobile-identity-meta">
            Invoice {payment.invoice_number}
            {(payment.load_number || visibleInvoice?.load_number)
              ? ` · Load ${payment.load_number || visibleInvoice?.load_number}`
              : ''}
          </p>
          <p className="payment-confirmation-panel__mobile-identity-broker">
            {payment.broker_name}
          </p>
        </div>
      ) : null}

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
      {(payment.status === 'awaiting_receipt' || payment.status === 'confirmed') && (
        <p className="payment-confirmation-panel__summary-meta">
          {getPaymentTimingInfo(payment.payment_method).summary}
        </p>
      )}
    </section>
  )

  const notesSection = (
    <section
      className={`payment-confirmation-panel__notes${
        isMobile ? ' payment-confirmation-panel__notes--mobile-surface' : ''
      }`}
    >
      <div className="payment-confirmation-panel__notes-head">
        {!isMobile ? (
          <h3 className="payment-confirmation-panel__notes-title" style={{ color: c.primary }}>
            Activity &amp; notes
          </h3>
        ) : null}
        <div
          className={`payment-confirmation-panel__notes-filters${
            isMobile ? ' payment-confirmation-panel__notes-filters--segmented' : ''
          }`}
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

      <div className="payment-confirmation-panel__notes-scroll">
        <InvoiceActivityNoteList
          entries={filteredTimeline}
          emptyMessage={
            timelineFilter === 'all'
              ? 'No activity or notes recorded for this invoice yet.'
              : timelineFilter === 'activity'
                ? 'No invoice activity recorded yet.'
                : timelineFilter === 'payments'
                  ? 'No payment activity on this invoice yet.'
                  : 'No notes recorded for this invoice yet.'
          }
          emptyColor={c.mutedLight}
        />
      </div>

      {visibleInvoice ? (
        <InvoiceNoteCompose
          newNote={newNote}
          isAddingNote={isAddingNote}
          onChange={setNewNote}
          onSubmit={() => void handleAddNote()}
          compact={!isMobile}
          collapsible={!isMobile}
          mobileEasy={isMobile}
        />
      ) : null}
    </section>
  )

  const panelBody = (
    <>
      <header
        className={`payment-confirmation-panel__header ${
          isSidebar ? 'payment-confirmation-panel__header--sidebar' : ''
        } ${isMobile ? 'payment-confirmation-panel__header--mobile-topbar' : ''}`}
      >
        {isMobile ? (
          <button
            type="button"
            onClick={() => {
              if (detailSurface === 'notes') {
                setDetailSurface('overview')
                return
              }
              onClose()
            }}
            className="payment-confirmation-panel__icon-btn"
            aria-label={
              detailSurface === 'notes' ? 'Back to payment overview' : 'Back to payments'
            }
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
        ) : null}

        {isMobile ? (
          <>
            <div className="payment-confirmation-panel__mobile-top-spacer" aria-hidden />
            <span
              className="payment-confirmation-panel__mobile-pager-count tabular-nums"
              aria-label={`Payment ${navIndex >= 0 ? navIndex + 1 : 1} of ${navigationPayments.length || 1}`}
            >
              {navIndex >= 0 ? navIndex + 1 : 1}/{navigationPayments.length || 1}
            </span>
            <button
              type="button"
              className="payment-confirmation-panel__icon-btn payment-confirmation-panel__mobile-menu-btn"
              onClick={() => window.dispatchEvent(new Event('credyx:open-client-menu'))}
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" strokeWidth={1.75} aria-hidden />
            </button>
          </>
        ) : (
          <>
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
              {isSidebar ? (
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
              ) : null}
              <button
                type="button"
                onClick={onClose}
                className="payment-confirmation-panel__icon-btn"
                aria-label="Close payment details"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </>
        )}
      </header>

      <div className="payment-confirmation-panel__body">
        {isMobile ? (
          <>
            <div
              className="payment-confirmation-panel__mobile-surface-tabs"
              role="tablist"
              aria-label="Payment detail views"
            >
              <button
                type="button"
                role="tab"
                aria-selected={detailSurface === 'overview'}
                className={`payment-confirmation-panel__mobile-surface-tab${
                  detailSurface === 'overview'
                    ? ' payment-confirmation-panel__mobile-surface-tab--active'
                    : ''
                }`}
                onClick={() => setDetailSurface('overview')}
              >
                Overview
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={detailSurface === 'notes'}
                className={`payment-confirmation-panel__mobile-surface-tab${
                  detailSurface === 'notes'
                    ? ' payment-confirmation-panel__mobile-surface-tab--active'
                    : ''
                }`}
                onClick={() => setDetailSurface('notes')}
              >
                Notes
                {timeline.length > 0 ? (
                  <span className="payment-confirmation-panel__mobile-surface-tab-count">
                    {timeline.length}
                  </span>
                ) : null}
              </button>
            </div>
            {detailSurface === 'overview' ? overviewSection : notesSection}
          </>
        ) : (
          <>
            {overviewSection}
            {notesSection}
          </>
        )}
      </div>

      {hasFooterActions ? (
        <footer
          className={`payment-confirmation-panel__footer shrink-0${
            isMobile ? ' payment-confirmation-panel__footer--mobile' : ''
          }`}
          style={{ borderColor: c.border }}
        >
          <div className="payment-confirmation-panel__footer-actions">
            {canConfirmOnInvoice ? (
              <button
                type="button"
                onClick={onConfirmReceipt}
                disabled={receiptActionLoading}
                className="dashboard-btn-primary dashboard-btn-compact flex-1 min-w-[100px] inline-flex items-center justify-center gap-1 disabled:opacity-50"
                data-onboard-target="paymentConfirmBtn"
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
            ) : null}
            {/* Always offer Dispute — receipt dispute when awaiting, else open invoice */}
            <button
              type="button"
              onClick={() => {
                if (canConfirmOnInvoice && awaitingOnInvoice.length > 0) {
                  onOpenDispute()
                  return
                }
                handleGoToInvoice()
              }}
              disabled={receiptActionLoading || (!canConfirmOnInvoice && !visibleInvoice)}
              className="dashboard-btn-secondary dashboard-btn-compact payment-confirmation-panel__footer-dispute flex-1 min-w-[88px] inline-flex items-center justify-center gap-1 disabled:opacity-50"
            >
              <AlertTriangle className="w-3 h-3" />
              Dispute
            </button>
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
