import { ChevronRight } from 'lucide-react'
import type { EnrichedInvoice } from '../../utils/invoiceAging'
import { formatCurrency } from '../../utils/format'
import {
  formatMobileInvoiceDate,
  getMobileInvoiceHeroAmount,
  getMobileInvoiceStatusLabel,
} from '../../utils/invoiceMobileInsights'
import { getClientVisibleDueDate } from '../../utils/ppwSent'

interface MobileInvoiceListCardProps {
  invoice: EnrichedInvoice
  payDate?: string | null
  /** Posted date while awaiting confirmation — shown as Pay date (pending). */
  pendingPayDate?: string | null
  /** Credyx posted payment — carrier needs to confirm receipt. */
  awaitingReceipt?: boolean
  selected?: boolean
  highlighted?: boolean
  onClick: () => void
}

/**
 * Spacious mobile invoice row — easy to scan, not cramped.
 * Header: invoice# + status
 * Body: amount + broker
 * Footer: load · due · pay (one quiet line)
 */
export default function MobileInvoiceListCard({
  invoice,
  payDate,
  pendingPayDate,
  awaitingReceipt = false,
  selected = false,
  highlighted = false,
  onClick,
}: MobileInvoiceListCardProps) {
  const statusLabel = awaitingReceipt
    ? 'CONFIRM PAYMENT'
    : getMobileInvoiceStatusLabel(invoice, invoice)
  const statusKey = awaitingReceipt
    ? 'confirm-payment'
    : (invoice.displayStatus || invoice.status || 'pending').replace(/_/g, '-')
  const amount = getMobileInvoiceHeroAmount(invoice)
  const load = invoice.load_number?.trim() || '—'
  const visibleDueDate = getClientVisibleDueDate(invoice)
  const due = visibleDueDate ? formatMobileInvoiceDate(visibleDueDate) : '—'
  const pay = pendingPayDate
    ? `${formatMobileInvoiceDate(pendingPayDate)} (pending)`
    : payDate
      ? formatMobileInvoiceDate(payDate)
      : '—'

  return (
    <button
      type="button"
      className={`mobile-invoice-list-card${selected ? ' is-selected' : ''}${
        highlighted ? ' is-highlighted' : ''
      }${invoice.isOverdue && !awaitingReceipt ? ' is-overdue' : ''}${
        invoice.isForceCloseEligible ? ' is-force-close' : ''
      }${awaitingReceipt ? ' is-confirm-payment' : ''}`}
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

      <p className="mobile-invoice-list-card__amount tabular-nums">{formatCurrency(amount)}</p>

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
