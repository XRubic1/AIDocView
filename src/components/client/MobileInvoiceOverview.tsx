import {
  AlertTriangle,
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
import {
  getInvoiceLifecycleSteps,
  type InvoiceLifecycleStep,
} from '../../utils/invoiceLifecycleSteps'
import { getClientVisibleDueDate } from '../../utils/ppwSent'
import {
  formatMobileInvoiceDate,
  getCarrierInvoiceActionRequired,
  getInvoiceMobileInsights,
  getMobileInvoiceHeroAmount,
  getMobileInvoiceStatusLabel,
  type InvoiceMobileInsight,
} from '../../utils/invoiceMobileInsights'

interface MobileInvoiceOverviewProps {
  invoice: Invoice
  enriched: EnrichedInvoice
  payDate?: string | null
  /** Posted date while awaiting carrier confirmation — shown with (pending). */
  pendingPayDate?: string | null
  receiptDaysLeft?: number | null
  hasAwaitingReceipt?: boolean
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
    case 'activity':
    default:
      return <MessageSquare size={size} strokeWidth={2} />
  }
}

/** Minimal Submitted → Verified → Invoiced → Paid/Confirm/Closed stepper. */
function LifecycleStepper({
  steps,
  variant = 'default',
}: {
  steps: InvoiceLifecycleStep[]
  /** paid = green complete; closed = gray complete */
  variant?: 'default' | 'paid' | 'closed'
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
      }`}
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
}: MobileInvoiceOverviewProps) {
  const steps = getInvoiceLifecycleSteps(invoice, {
    awaitingReceipt: hasAwaitingReceipt,
  })
  const statusLabel = hasAwaitingReceipt
    ? 'CONFIRM PAYMENT'
    : getMobileInvoiceStatusLabel(enriched, invoice)
  const amount = getMobileInvoiceHeroAmount(invoice)
  const visibleDueDate = getClientVisibleDueDate(invoice)
  const statusKey = hasAwaitingReceipt
    ? 'confirm-payment'
    : (enriched.displayStatus || invoice.status || 'pending').replace(/_/g, '-')
  const actionRequired = getCarrierInvoiceActionRequired(invoice)
  // After upload, replace Action Required with the reviewing confirmation.
  const showActionRequired = Boolean(actionRequired) && !uploadConfirmation

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
  })

  const handleInsight = (insight: InvoiceMobileInsight) => {
    if (insight.action === 'confirm_payment' && onConfirmPayment) {
      onConfirmPayment()
      return
    }
    if (insight.action === 'activity') {
      onOpenActivity()
      return
    }
    if (insight.action === 'docs' && onViewDocuments) {
      onViewDocuments()
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
      {uploadConfirmation ? (
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
                {uploadConfirmation}
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
      {insights.map((insight) => {
        const interactive =
          insight.action !== 'none' &&
          !(insight.action === 'confirm_payment' && !onConfirmPayment)
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
      <article className="mobile-invoice-overview__hero" aria-label="Invoice summary">
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
              {payDate
                ? formatMobileInvoiceDate(payDate)
                : pendingPayDate
                  ? `${formatMobileInvoiceDate(pendingPayDate)} (pending)`
                  : '—'}
            </dd>
          </div>
        </dl>

        <div className="mobile-invoice-overview__amount-row">
          <p className="mobile-invoice-overview__amount tabular-nums">
            {formatCurrency(amount)}
          </p>
          <span
            className={`mobile-invoice-overview__status mobile-invoice-overview__status--${statusKey}`}
          >
            <span className="mobile-invoice-overview__status-dot" aria-hidden />
            {statusLabel}
          </span>
        </div>

        <LifecycleStepper
          steps={steps}
          variant={
            invoice.status === 'paid'
              ? 'paid'
              : invoice.status === 'force_closed' || invoice.status === 'written_off'
                ? 'closed'
                : 'default'
          }
        />
      </article>

      {insightList}

      <p className="mobile-invoice-overview__brand">
        <Shield size={12} strokeWidth={2} aria-hidden />
        Credyx A/R Solutions
      </p>
    </div>
  )
}
