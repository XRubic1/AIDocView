import { useEffect, useState } from 'react'
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  ChevronRight,
  Clock,
  DollarSign,
  FileText,
  Mail,
  MessageSquare,
  PauseCircle,
  Shield,
  Upload,
  BanknoteArrowDown,
  BanknoteArrowUp,
} from 'lucide-react'
import type { Invoice } from '../../types/invoice'
import type { EnrichedInvoice } from '../../utils/invoiceAging'
import { formatCurrency } from '../../utils/format'
import { AMOUNT_EPSILON } from '../../utils/paymentVariance'
import {
  getInvoiceLifecycleSteps,
  type InvoiceLifecycleStep,
} from '../../utils/invoiceLifecycleSteps'
import { isReceiptDisputeHold } from '../../services/paymentReceiptConfirmationService'
import { getClientVisibleDueDate } from '../../utils/ppwSent'
import {
  formatMobileInvoiceDate,
  getCarrierInvoiceActionRequired,
  getInvoiceMobileInsights,
  getMobileInvoiceHeroAmount,
  type InvoiceMobileInsight,
} from '../../utils/invoiceMobileInsights'
import { getDocumentUploadOverviewMessage } from '../../utils/holdPaperworkReview'
import { getInvoiceBlueprintChaseTrack } from '../../utils/invoiceBlueprintChaseInsight'
import { getCarrierInvoiceJourney } from '../../utils/carrierInvoiceJourney'
import InvoiceBlueprintChaseTrackView from './InvoiceBlueprintChaseTrack'
import { BLUEPRINT_RUNS_CHANGED_EVENT, getStoredPrimaryRunForInvoice } from '../blueprints/blueprintRuns'
import type { BrokerRiskLevel } from '../../types/brokerRisk'
import {
  invoiceListPriorityStatusKey,
  invoiceListPriorityStatusLabel,
} from '../../utils/invoiceListPriority'
import {
  getOpenDisputedStatusLabelUpper,
} from '../../utils/clientInvoiceDisputeStatus'
import { getClientVisiblePayDate, getWillPayScheduledDate } from '../../utils/invoiceWillPay'
import { getInvoiceNoteStatusDisplay } from '../../utils/invoiceStatusHeadline'

interface MobileInvoiceOverviewProps {
  invoice: Invoice
  enriched: EnrichedInvoice
  payDate?: string | null
  /** Posted date while awaiting carrier confirmation. */
  pendingPayDate?: string | null
  receiptDaysLeft?: number | null
  hasAwaitingReceipt?: boolean
  /** Credyx-posted amount awaiting carrier confirm. */
  awaitingReceiptAmount?: number | null
  activityCount: number
  documentCount: number
  /** Shown after carrier uploads docs for Action Required. */
  uploadConfirmation?: string | null
  onOpenActivity: () => void
  /** Opens confirm-payment receipt modal when Credyx posted funds. */
  onConfirmPayment?: () => void
  onViewDocuments?: () => void
  /** Opens document upload when hold needs missing paperwork. */
  onUploadDocuments?: () => void
  /**
   * Desktop sidebar: skip hero/stepper/brand — only notification insight rows
   * under the existing summary block.
   */
  insightsOnly?: boolean
  /** Shortfall vs invoice total including pending confirmation. */
  shortfallAmount?: number | null
  /** Carrier-facing reason for the short pay. */
  shortPayReason?: string | null
  /** Overage vs invoice total including pending confirmation. */
  overageAmount?: number | null
  /** Awaiting short-correction amount (shows Short paid confirm card). */
  awaitingShortAmount?: number | null
  /** Carrier disputed a Credyx-posted remittance. */
  paymentDisputed?: boolean
  /** Payment-receipt dispute note for overview (when invoice.disputes is empty). */
  paymentDisputeDescription?: string | null
  /**
   * Admin only: client-reported payment awaiting Credyx confirmation.
   * Shows PENDING status + confirm CTA (not shown on carrier portal).
   */
  adminPendingPayment?: { amount: number; brokerName?: string } | null
  /** Admin: open confirm-pending-payment flow. */
  onConfirmAdminPendingPayment?: () => void
  /** Carrier-visible broker risk — medium/high shows a clickable overview row. */
  brokerRiskLevel?: BrokerRiskLevel | null
  /** Opens the Brokers tab for this invoice's broker. */
  onOpenBrokerRisk?: () => void
  /** Admin only: show the live blueprint's next chase on the overview. */
  showBlueprintChase?: boolean
}

/** Icon for a mobile insight row. */
function InsightIcon({ icon }: { icon: InvoiceMobileInsight['icon'] }) {
  const size = 18
  switch (icon) {
    case 'clock':
      return <Clock size={size} strokeWidth={2} />
    case 'mail':
      return <Mail size={size} strokeWidth={2} />
    case 'dollar':
      return <DollarSign size={size} strokeWidth={2} />
    case 'alert':
      return <AlertTriangle size={size} strokeWidth={2} />
    case 'check':
      return <CheckCircle2 size={size} strokeWidth={2} />
    case 'hold':
      return <PauseCircle size={size} strokeWidth={2} />
    case 'file':
      return <FileText size={size} strokeWidth={2} />
    case 'short_pay':
      return <BanknoteArrowDown size={size} strokeWidth={2} />
    case 'over_pay':
      return <BanknoteArrowUp size={size} strokeWidth={2} />
    case 'shield':
      return <Shield size={size} strokeWidth={2} />
    case 'activity':
    default:
      return <MessageSquare size={size} strokeWidth={2} />
  }
}

/** Minimal Submitted → Verified → Invoiced/Short paid → Paid/Confirm/Closed stepper. */
function LifecycleStepper({
  steps,
  variant = 'default',
  isShortPaid = false,
}: {
  steps: InvoiceLifecycleStep[]
  /** paid = green complete; closed = gray complete */
  variant?: 'default' | 'paid' | 'closed'
  /** Paid step labeled Short paid — red current styling. */
  isShortPaid?: boolean
}) {
  const allDone = steps.every((step) => step.state === 'done')
  const awaitingConfirm = steps.some((step) => step.state === 'confirm')
  const isPaidComplete = allDone && variant === 'paid'
  const isClosedComplete = allDone && variant === 'closed'

  return (
    <div
      className={`mobile-invoice-overview__lifecycle${
        isPaidComplete ? ' is-paid-complete' : ''
      }${isClosedComplete ? ' is-closed-complete' : ''}${
        awaitingConfirm ? ' is-awaiting-confirm' : ''
      }${isShortPaid ? ' is-short-paid' : ''}`}
      aria-label="Invoice progress"
    >
      {steps.map((step, index) => {
        const isPaidStep = isPaidComplete && step.id === 'paid'
        const isClosedStep = isClosedComplete && step.id === 'paid'
        const prev = index > 0 ? steps[index - 1] : null
        const lineComplete = prev?.state === 'done' || prev?.state === 'confirm'
        return (
          <div key={step.id} className="mobile-invoice-overview__lifecycle-item">
            {index > 0 ? (
              <span
                className={`mobile-invoice-overview__lifecycle-line${
                  lineComplete ? ' is-done' : ''
                }${isPaidComplete || isClosedComplete ? ' is-complete' : ''}`}
                aria-hidden
              />
            ) : null}
            <div
              className={`mobile-invoice-overview__lifecycle-step is-${step.state}${
                isPaidComplete || isClosedComplete ? ' is-complete' : ''
              }${isPaidStep ? ' is-paid-flash' : ''}${isClosedStep ? ' is-closed-end' : ''}`}
              aria-current={
                step.state === 'current' ||
                step.state === 'hold' ||
                step.state === 'confirm'
                  ? 'step'
                  : undefined
              }
              data-onboard-target={step.id === 'invoiced' ? 'invoiceLifecycleInvoiced' : undefined}
            >
              <span className="mobile-invoice-overview__lifecycle-dot" aria-hidden />
              <span className="mobile-invoice-overview__lifecycle-label">{step.label}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/**
 * Stats-first mobile invoice surface: hero card + insight rows.
 * Activity / notes live on a separate panel surface.
 */
export default function MobileInvoiceOverview({
  invoice,
  enriched,
  payDate,
  pendingPayDate,
  receiptDaysLeft,
  hasAwaitingReceipt,
  awaitingReceiptAmount = null,
  activityCount,
  documentCount,
  uploadConfirmation,
  onOpenActivity,
  onConfirmPayment,
  onViewDocuments,
  onUploadDocuments,
  insightsOnly = false,
  shortfallAmount = null,
  shortPayReason = null,
  overageAmount = null,
  awaitingShortAmount = null,
  paymentDisputed = false,
  paymentDisputeDescription = null,
  adminPendingPayment = null,
  onConfirmAdminPendingPayment,
  brokerRiskLevel = null,
  onOpenBrokerRisk,
  showBlueprintChase = false,
}: MobileInvoiceOverviewProps) {
  const [chaseRev, setChaseRev] = useState(0)
  useEffect(() => {
    if (!showBlueprintChase) return
    const refresh = () => setChaseRev((n) => n + 1)
    window.addEventListener(BLUEPRINT_RUNS_CHANGED_EVENT, refresh)
    return () => window.removeEventListener(BLUEPRINT_RUNS_CHANGED_EVENT, refresh)
  }, [showBlueprintChase])
  const chaseInvoiceId = invoice.id
  const chaseInvoiceNumber = invoice.invoice_number
  const chasePaperwork = invoice.email_lifecycle?.paperwork_status
  useEffect(() => {
    if (!showBlueprintChase || chasePaperwork !== 'good') return
    const run = getStoredPrimaryRunForInvoice({
      id: chaseInvoiceId,
      invoice_number: chaseInvoiceNumber,
    })
    if (!run || run.status === 'waiting' || run.status === 'active' || run.status === 'paused') return
    if (!/stopped · broker confirmed/i.test(run.currentStep)) return
    if (run.blueprintId === 'bp-standard-payment-chase' || /payment chase/i.test(run.blueprintName)) return
    void import('../blueprints/blueprintRunner').then((m) => m.startPaymentChaseAfterConfirm(chaseInvoiceId))
  }, [showBlueprintChase, chaseInvoiceId, chaseInvoiceNumber, chasePaperwork])
  const hasAdminPending = Boolean(
    adminPendingPayment && adminPendingPayment.amount > AMOUNT_EPSILON
  )

  const pendingPosted =
    hasAwaitingReceipt &&
    awaitingReceiptAmount != null &&
    awaitingReceiptAmount > AMOUNT_EPSILON
      ? awaitingReceiptAmount
      : null

  /** Confirm-payment variance vs invoice face. */
  const pendingFull =
    pendingPosted != null && Math.abs(pendingPosted - invoice.amount) < AMOUNT_EPSILON
  const pendingShort =
    pendingPosted != null && pendingPosted < invoice.amount - AMOUNT_EPSILON
  const pendingOver =
    pendingPosted != null && pendingPosted > invoice.amount + AMOUNT_EPSILON

  /** Settled short pay — remaining open balance. */
  const shortPaidOpen =
    !pendingPosted &&
    shortfallAmount != null &&
    shortfallAmount >= AMOUNT_EPSILON &&
    shortfallAmount < invoice.amount - AMOUNT_EPSILON
      ? shortfallAmount
      : null

  /** Open balance for short (settled or confirm-payment short). */
  const shortOpenBalance = pendingShort
    ? invoice.amount - pendingPosted!
    : shortPaidOpen

  /** Settled overpay difference (not full received). */
  const settledOverage =
    !pendingPosted &&
    overageAmount != null &&
    overageAmount >= AMOUNT_EPSILON
      ? overageAmount
      : null

  /** Confirm-payment over difference. */
  const pendingOverage = pendingOver ? pendingPosted! - invoice.amount : null

  const isShortPaid = shortOpenBalance != null
  const hasPaymentDispute = paymentDisputed || isReceiptDisputeHold(invoice)
  const noteStatus = getInvoiceNoteStatusDisplay(invoice, {
    paymentDisputed: hasPaymentDispute,
  })
  const showOpenDisputed = noteStatus === 'open_disputed'
  const showOnHold = noteStatus === 'on_hold'
  const showWillPay = noteStatus === 'will_pay' && !hasAdminPending
  const showCallBack = noteStatus === 'call_back' && !hasAdminPending

  const steps = getInvoiceLifecycleSteps(invoice, {
    awaitingReceipt: hasAwaitingReceipt,
    isShortPaid,
    paymentDisputed: hasPaymentDispute,
  })
  const statusLabel = showOpenDisputed
    ? getOpenDisputedStatusLabelUpper()
    : hasAdminPending
    ? 'PENDING'
    : pendingPosted
    ? invoiceListPriorityStatusLabel({
        awaitingReceipt: true,
        status: invoice.status,
        displayStatus: enriched.displayStatus,
        isOverdue: enriched.isOverdue,
      })
    : showOnHold
      ? 'ON HOLD'
    : showWillPay
      ? 'WILL PAY'
      : showCallBack
        ? 'CALL BACK'
        : isShortPaid
          ? 'SHORT PAID'
          : invoiceListPriorityStatusLabel({
          awaitingReceipt: hasAwaitingReceipt,
          status: invoice.status,
          displayStatus: enriched.displayStatus,
          isOverdue: enriched.isOverdue,
        })
  const amount = getMobileInvoiceHeroAmount(invoice)
  const visibleDueDate = getClientVisibleDueDate(invoice)
  const scheduledPayDate = getWillPayScheduledDate(invoice)
  const visiblePay = getClientVisiblePayDate(invoice, {
    confirmedPayDate: payDate,
    pendingPayDate,
  })
  const showScheduledPayRow =
    Boolean(scheduledPayDate) && visiblePay?.date !== scheduledPayDate
  const statusKey = showOpenDisputed
    ? 'disputed'
    : hasAdminPending
    ? 'pending-payment'
    : pendingPosted
    ? 'confirm-payment'
    : showOnHold
      ? 'hold'
    : showWillPay
      ? 'will-pay'
      : showCallBack
        ? 'call-back'
        : isShortPaid
          ? 'short-paid'
          : invoiceListPriorityStatusKey({
          awaitingReceipt: hasAwaitingReceipt,
          status: invoice.status,
          displayStatus: enriched.displayStatus,
          isOverdue: enriched.isOverdue,
        })

  /**
   * Hero layout:
   * - Confirm short: invoice + shortfall above, received total as main
   * - Confirmed short: invoice + shortfall above, open balance as main
   * - Over: invoice + overage above, received total as main
   * - Full confirm: invoice amount
   */
  const overageDiff = pendingOverage ?? settledOverage
  const isOverHero = overageDiff != null
  const overReceivedTotal = isOverHero ? invoice.amount + overageDiff! : null

  /** Shortfall beside invoice (settled or confirm short). */
  const shortfallDiff = shortOpenBalance
  /** Confirm-pending short: large = amount received. */
  const shortPendingReceived =
    pendingShort && shortfallDiff != null
      ? invoice.amount - shortfallDiff
      : null

  const heroAmount =
    shortPendingReceived != null
      ? shortPendingReceived
      : shortPaidOpen != null
        ? shortPaidOpen
        : overReceivedTotal != null
          ? overReceivedTotal
          : pendingFull
            ? invoice.amount
            : amount

  const showShortMarker = shortfallDiff != null
  const showOverMarker = isOverHero
  const actionRequired = getCarrierInvoiceActionRequired(invoice)
  const persistedUploadMessage = getDocumentUploadOverviewMessage(invoice)
  const docsUnderReview = Boolean(uploadConfirmation) || Boolean(persistedUploadMessage)
  const reviewBanner = uploadConfirmation || persistedUploadMessage
  const showActionRequired = Boolean(actionRequired) && !docsUnderReview

  const insights = getInvoiceMobileInsights({
    invoice,
    enriched,
    payDate,
    receiptDaysLeft,
    hasAwaitingReceipt,
    activityCount,
    documentCount,
    shortfallAmount,
    shortPayReason,
    overageAmount,
    awaitingShortAmount,
    paymentDisputeDescription,
    paymentDisputed: hasPaymentDispute,
    brokerRiskLevel,
    includeBlueprintChase: showBlueprintChase && chaseRev >= 0,
  })
  const chaseTrack = showBlueprintChase ? getInvoiceBlueprintChaseTrack(invoice) : null
  const carrierJourney = showBlueprintChase
    ? null
    : getCarrierInvoiceJourney(invoice, { dueDate: visibleDueDate })
  const chaseInsight = chaseTrack
    ? insights.find((insight) => insight.id === 'blueprint-chase')
    : null

  const handleInsight = (insight: InvoiceMobileInsight) => {
    if (insight.action === 'confirm_payment' && onConfirmPayment) {
      onConfirmPayment()
      return
    }
    if (insight.action === 'confirm_payment' && onConfirmAdminPendingPayment) {
      onConfirmAdminPendingPayment()
      return
    }
    if (insight.action === 'activity') {
      onOpenActivity()
      return
    }
    if (insight.action === 'docs' && onViewDocuments) {
      onViewDocuments()
      return
    }
    if (insight.action === 'broker_risk' && onOpenBrokerRisk) {
      onOpenBrokerRisk()
    }
  }

  const handleActionRequired = () => {
    if (actionRequired?.cta === 'upload' && onUploadDocuments) {
      onUploadDocuments()
      return
    }
    onOpenActivity()
  }

  const insightList = (
    <ul
      className={`mobile-invoice-overview__insights${
        insightsOnly ? ' mobile-invoice-overview__insights--sidebar' : ''
      }`}
      aria-label="Invoice notifications"
    >
      {hasAdminPending && adminPendingPayment ? (
        <li>
          <button
            type="button"
            className={`mobile-invoice-overview__insight is-alert${
              onConfirmAdminPendingPayment ? ' is-interactive' : ''
            }`}
            onClick={() => onConfirmAdminPendingPayment?.()}
            disabled={!onConfirmAdminPendingPayment}
            aria-label={`Pending payment ${formatCurrency(adminPendingPayment.amount)}. Confirm payment.`}
          >
            <span className="mobile-invoice-overview__insight-icon is-alert" aria-hidden>
              <DollarSign size={18} strokeWidth={2} />
            </span>
            <span className="mobile-invoice-overview__insight-copy">
              <span className="mobile-invoice-overview__insight-title">Pending payment</span>
              <span className="mobile-invoice-overview__insight-sub is-alert">
                Carrier reported {formatCurrency(adminPendingPayment.amount)}
                {adminPendingPayment.brokerName
                  ? ` · ${adminPendingPayment.brokerName}`
                  : ''}
                {' — confirm to apply'}
              </span>
            </span>
            {onConfirmAdminPendingPayment ? (
              <span className="mobile-invoice-overview__insight-badge" aria-hidden>
                Confirm
              </span>
            ) : (
              <span className="mobile-invoice-overview__insight-spacer" aria-hidden />
            )}
            {onConfirmAdminPendingPayment ? (
              <ChevronRight
                className="mobile-invoice-overview__insight-chevron"
                size={16}
                strokeWidth={2}
                aria-hidden
              />
            ) : null}
          </button>
        </li>
      ) : null}
      {reviewBanner ? (
        <li>
          <div
            className="mobile-invoice-overview__insight is-success"
            role="status"
            aria-live="polite"
          >
            <span className="mobile-invoice-overview__insight-icon is-success" aria-hidden>
              <CheckCircle2 size={18} strokeWidth={2} />
            </span>
            <span className="mobile-invoice-overview__insight-copy">
              <span className="mobile-invoice-overview__insight-title">
                Documents uploaded
              </span>
              <span className="mobile-invoice-overview__insight-sub">
                {reviewBanner}
              </span>
            </span>
            <span className="mobile-invoice-overview__insight-spacer" aria-hidden />
          </div>
        </li>
      ) : null}
      {showActionRequired && actionRequired ? (
        <li>
          <button
            type="button"
            className="mobile-invoice-overview__insight is-alert is-interactive"
            onClick={handleActionRequired}
            aria-label={`${actionRequired.title}. ${actionRequired.note}`}
            data-onboard-target="invoiceHoldAction"
          >
            <span className="mobile-invoice-overview__insight-icon is-alert" aria-hidden>
              {actionRequired.cta === 'upload' ? (
                <Upload size={18} strokeWidth={2} />
              ) : (
                <AlertTriangle size={18} strokeWidth={2} />
              )}
            </span>
            <span className="mobile-invoice-overview__insight-copy">
              <span className="mobile-invoice-overview__insight-title">
                {actionRequired.title}
              </span>
              <span className="mobile-invoice-overview__insight-sub is-alert mobile-invoice-overview__insight-sub--hold-note">
                {actionRequired.note}
              </span>
            </span>
            <span className="mobile-invoice-overview__insight-badge" aria-hidden>
              1
            </span>
            <ChevronRight
              className="mobile-invoice-overview__insight-chevron"
              size={18}
              strokeWidth={2}
              aria-hidden
            />
          </button>
        </li>
      ) : null}
      {chaseTrack && chaseTrack.steps.length > 0 ? (
        <li>
          <InvoiceBlueprintChaseTrackView
            track={chaseTrack}
            title={chaseInsight?.title || 'Next status'}
            subtitle={chaseInsight?.subtitle || chaseTrack.blueprintName}
          />
        </li>
      ) : null}
      {insights
        .filter((insight) => insight.id !== 'blueprint-chase' || !chaseTrack)
        .map((insight) => {
        const interactive =
          insight.action !== 'none' &&
          !(insight.action === 'confirm_payment' && !onConfirmPayment) &&
          !(insight.action === 'broker_risk' && !onOpenBrokerRisk)
        const iconTone =
          insight.action === 'confirm_payment' ? 'confirm' : insight.tone
        const className = `mobile-invoice-overview__insight is-${insight.tone}${
          interactive ? ' is-interactive' : ''
        }`
        const body = (
          <>
            <span
              className={`mobile-invoice-overview__insight-icon is-${iconTone}`}
              aria-hidden
            >
              <InsightIcon icon={insight.icon} />
            </span>
            <span className="mobile-invoice-overview__insight-copy">
              <span className="mobile-invoice-overview__insight-title">
                {insight.title}
              </span>
              <span
                className={`mobile-invoice-overview__insight-sub${
                  insight.tone === 'alert'
                    ? ' is-alert'
                    : insight.tone === 'success'
                      ? ' is-success'
                      : ''
                }`}
              >
                {insight.subtitle}
              </span>
            </span>
            {insight.badge != null && insight.badge > 0 ? (
              <span className="mobile-invoice-overview__insight-badge">
                {insight.badge > 99 ? '99+' : insight.badge}
              </span>
            ) : null}
            {interactive ? (
              <ChevronRight
                className="mobile-invoice-overview__insight-chevron"
                size={18}
                strokeWidth={2}
                aria-hidden
              />
            ) : (
              <span className="mobile-invoice-overview__insight-spacer" aria-hidden />
            )}
          </>
        )
        return (
          <li key={insight.id}>
            {interactive ? (
              <button type="button" className={className} onClick={() => handleInsight(insight)}>
                {body}
              </button>
            ) : (
              <div className={className}>{body}</div>
            )}
          </li>
        )
      })}
    </ul>
  )

  if (insightsOnly) {
    return (
      <div className="mobile-invoice-overview mobile-invoice-overview--insights-only">
        {insightList}
      </div>
    )
  }

  return (
    <div className="mobile-invoice-overview">
      <article
        className={`mobile-invoice-overview__hero${
          isShortPaid ? ' is-short-paid' : ''
        }`}
        aria-label="Invoice summary"
      >
        <div className="mobile-invoice-overview__hero-top">
          <span className="mobile-invoice-overview__eyebrow">Invoice</span>
          <span className="mobile-invoice-overview__inv-pill">
            #{invoice.invoice_number}
          </span>
        </div>

        <dl className="mobile-invoice-overview__meta">
          <div>
            <dt>Broker</dt>
            <dd title={invoice.broker_name}>{invoice.broker_name || '—'}</dd>
          </div>
          <div>
            <dt>Load</dt>
            <dd className="tabular-nums">{invoice.load_number?.trim() || '—'}</dd>
          </div>
          <div>
            <dt>Due date</dt>
            <dd className="tabular-nums">
              {visibleDueDate ? formatMobileInvoiceDate(visibleDueDate) : '—'}
            </dd>
          </div>
          <div>
            <dt>Pay date</dt>
            <dd className="tabular-nums">
              {visiblePay
                ? visiblePay.source === 'pending'
                  ? `${formatMobileInvoiceDate(visiblePay.date)} (pending)`
                  : visiblePay.source === 'scheduled'
                    ? `${formatMobileInvoiceDate(visiblePay.date)} (scheduled)`
                    : formatMobileInvoiceDate(visiblePay.date)
                : '—'}
            </dd>
          </div>
          {showScheduledPayRow ? (
          <div>
            <dt>Scheduled pay</dt>
            <dd className="tabular-nums">
              {scheduledPayDate ? formatMobileInvoiceDate(scheduledPayDate) : '—'}
            </dd>
          </div>
          ) : null}
        </dl>

        <div className="mobile-invoice-overview__amount-row">
          <div className="mobile-invoice-overview__amount-stack">
            {/* Short: invoice + shortfall; received (confirm) or open balance (settled) */}
            {showShortMarker && shortfallDiff != null ? (
              <p className="mobile-invoice-overview__amount-face mobile-invoice-overview__amount-face--variance-row tabular-nums">
                <span className="mobile-invoice-overview__amount-face-invoice">
                  {formatCurrency(invoice.amount)}
                </span>
                <span
                  className="mobile-invoice-overview__amount-face-mark is-short"
                  title={
                    pendingShort
                      ? 'Short payment pending — amount received below'
                      : 'Short paid — remaining open balance below'
                  }
                >
                  <ArrowDown size={11} strokeWidth={2.5} aria-hidden />
                  -{formatCurrency(shortfallDiff)} (short)
                </span>
              </p>
            ) : null}
            {/* Over: invoice + overage beside it; received total below */}
            {showOverMarker && overageDiff != null ? (
              <p className="mobile-invoice-overview__amount-face mobile-invoice-overview__amount-face--variance-row tabular-nums">
                <span className="mobile-invoice-overview__amount-face-invoice">
                  {formatCurrency(invoice.amount)}
                </span>
                <span
                  className="mobile-invoice-overview__amount-face-mark is-over"
                  title="Overpayment"
                >
                  <ArrowUp size={11} strokeWidth={2.5} aria-hidden />
                  +{formatCurrency(overageDiff)} (over)
                </span>
              </p>
            ) : null}
            <div className="mobile-invoice-overview__amount-main">
              <p className="mobile-invoice-overview__amount tabular-nums">
                {formatCurrency(heroAmount)}
              </p>
            </div>
          </div>
          <span
            className={`mobile-invoice-overview__status mobile-invoice-overview__status--${statusKey}`}
          >
            <span className="mobile-invoice-overview__status-dot" aria-hidden />
            <span className="mobile-invoice-overview__status-text">
              {statusLabel}
            </span>
          </span>
        </div>

        <LifecycleStepper
          steps={steps}
          isShortPaid={isShortPaid}
          variant={
            invoice.status === 'paid'
              ? 'paid'
              : invoice.status === 'force_closed' || invoice.status === 'written_off'
                ? 'closed'
                : 'default'
          }
        />
      </article>

      {carrierJourney ? (
        <section className="inv-carrier-journey" aria-label="What happens next">
          <p className="inv-carrier-journey__headline">{carrierJourney.headline}</p>
          <ol className="inv-carrier-journey__steps">
            {carrierJourney.steps.map((step, index) => (
              <li key={step.id} className={`inv-carrier-journey__step is-${step.state}`}>
                <span className="inv-carrier-journey__index">{index + 1}</span>
                <span>{step.label}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {insightList}

      <p className="mobile-invoice-overview__brand">
        <Shield size={12} strokeWidth={2} aria-hidden />
        Credyx A/R Solutions
      </p>
    </div>
  )
}
