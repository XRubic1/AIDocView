import { ChevronRight } from 'lucide-react'
import type { EnrichedInvoice } from '../../utils/invoiceAging'
import { formatCurrency } from '../../utils/format'
import {
  formatMobileInvoiceDate,
  getMobileInvoiceHeroAmount,
} from '../../utils/invoiceMobileInsights'
import {
  invoiceListPriorityStatusKey,
  invoiceListPriorityStatusLabel,
} from '../../utils/invoiceListPriority'
import {
  getOpenDisputedStatusLabelUpper,
  invoiceHasOpenDisputedStatus,
} from '../../utils/clientInvoiceDisputeStatus'
import { getClientVisibleDueDate } from '../../utils/ppwSent'

interface MobileInvoiceListCardProps {
  invoice: EnrichedInvoice
  payDate?: string | null
  /** Posted date while awaiting confirmation — shown as Pay date (pending). */
  pendingPayDate?: string | null
  /** Credyx posted payment — carrier needs to confirm receipt. */
  awaitingReceipt?: boolean
  /** Carrier disputed a Credyx-posted remittance. */
  paymentDisputed?: boolean
  /** Partial payment received — remaining open balance. */
  isShortPaid?: boolean
  /** Remaining open A/R — shown as the list amount when short paid. */
  openAmount?: number | null
  selected?: boolean
  highlighted?: boolean
  /** Onboarding tour spotlight hook. */
  onboardTarget?: string
  onClick: () => void
}

/**
 * Spacious mobile invoice row — easy to scan, not cramped.
 * Status: Confirm (blue) → Short paid (red) → Open (gray) → On hold (amber) → Overdue (red).
 * Open A/R disputes show "OPEN DISPUTED" (never Invoiced).
 */
export default function MobileInvoiceListCard({
  invoice,
  payDate,
  pendingPayDate,
  awaitingReceipt = false,
  paymentDisputed = false,
  isShortPaid = false,
  openAmount = null,
  selected = false,
  highlighted = false,
  onboardTarget,
  onClick,
}: MobileInvoiceListCardProps) {
  const priorityInput = {
    awaitingReceipt,
    isShortPaid,
    paymentDisputed,
    status: invoice.status,
    displayStatus: invoice.displayStatus,
    isOverdue: invoice.isOverdue,
  }
  const showOpenDisputed = invoiceHasOpenDisputedStatus(invoice, { paymentDisputed })
  const statusLabel = showOpenDisputed
    ? getOpenDisputedStatusLabelUpper()
    : invoiceListPriorityStatusLabel(priorityInput)
  const statusKey = showOpenDisputed
    ? 'disputed'
    : invoiceListPriorityStatusKey(priorityInput)
  // Short paid: show remaining open balance, not the full invoice face amount.
  const amount =
    isShortPaid && openAmount != null && openAmount > 0
      ? openAmount
      : getMobileInvoiceHeroAmount(invoice)
  const load = invoice.load_number?.trim() || '—'
  const visibleDueDate = getClientVisibleDueDate(invoice)
  const due = visibleDueDate ? formatMobileInvoiceDate(visibleDueDate) : '—'
  const pay = payDate
    ? formatMobileInvoiceDate(payDate)
    : pendingPayDate
      ? `${formatMobileInvoiceDate(pendingPayDate)} (pending)`
      : '—'

  return (
    <button
      type="button"
      className={`mobile-invoice-list-card${selected ? ' is-selected' : ''}${
        highlighted ? ' is-highlighted' : ''
      }${statusKey === 'overdue' || statusKey === 'short-paid' ? ' is-overdue' : ''}${
        invoice.isForceCloseEligible ? ' is-force-close' : ''
      }${statusKey === 'confirm-payment' ? ' is-confirm-payment' : ''}${
        statusKey === 'hold' ? ' is-hold' : ''
      }${statusKey === 'disputed' ? ' is-disputed' : ''}${
        statusKey === 'short-paid' ? ' is-short-paid' : ''
      }`}
      data-onboard-target={onboardTarget}
      onClick={onClick}
    >
      <div className="mobile-invoice-list-card__header">
        <span className="mobile-invoice-list-card__inv">#{invoice.invoice_number}</span>
        <span
          className={`mobile-invoice-list-card__status mobile-invoice-list-card__status--${statusKey}`}
        >
          {statusLabel}
        </span>
      </div>

      <p
        className={`mobile-invoice-list-card__amount tabular-nums${
          isShortPaid ? ' is-short-paid' : ''
        }`}
      >
        {formatCurrency(amount)}
      </p>

      <p className="mobile-invoice-list-card__broker" title={invoice.broker_name}>
        {invoice.broker_name}
      </p>

      <div className="mobile-invoice-list-card__footer">
        <span>Load {load}</span>
        <span aria-hidden>·</span>
        <span>Due {due}</span>
        <span aria-hidden>·</span>
        <span>Pay {pay}</span>
        <ChevronRight
          className="mobile-invoice-list-card__chevron"
          size={16}
          strokeWidth={2}
          aria-hidden
        />
      </div>
    </button>
  )
}
