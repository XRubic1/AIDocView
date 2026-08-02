import { ChevronRight } from 'lucide-react'
import type { Payment } from '../../types/payment'
import { formatCurrency, formatDate } from '../../utils/format'
import {
  getReceiptConfirmationDaysLeft,
  PAYMENT_STATUS_LABELS,
} from '../../utils/paymentStatus'

interface MobilePaymentListCardProps {
  payment: Payment
  /** Invoice face amount when known. */
  invoiceAmount?: number
  selected?: boolean
  onClick: () => void
}

/** Short status label for mobile payment cards. */
function statusLabel(payment: Payment): string {
  if (payment.status === 'awaiting_receipt') return 'CONFIRM PAYMENT'
  if (payment.status === 'confirmed') return 'CONFIRMED'
  if (payment.status === 'pending') return 'PENDING'
  if (payment.status === 'disputed') return 'DISPUTED'
  return (PAYMENT_STATUS_LABELS[payment.status] ?? payment.status).toUpperCase()
}

/**
 * Spacious mobile payment row — mirrors invoice list cards.
 * Header: invoice# + status · Body: amount + broker · Footer: method · dates
 */
export default function MobilePaymentListCard({
  payment,
  invoiceAmount,
  selected = false,
  onClick,
}: MobilePaymentListCardProps) {
  const awaiting = payment.status === 'awaiting_receipt'
  const daysLeft = awaiting ? getReceiptConfirmationDaysLeft(payment) : null
  const statusKey = payment.status.replace(/_/g, '-')
  const method =
    payment.payment_method === 'credit_card'
      ? 'Card'
      : payment.payment_method
        ? payment.payment_method.charAt(0).toUpperCase() + payment.payment_method.slice(1)
        : '—'

  return (
    <button
      type="button"
      className={`mobile-payment-list-card${selected ? ' is-selected' : ''}${
        awaiting ? ' is-confirm-payment' : ''
      }${payment.status === 'disputed' ? ' is-disputed' : ''}`}
      onClick={onClick}
    >
      <div className="mobile-payment-list-card__header">
        <span className="mobile-payment-list-card__inv">#{payment.invoice_number}</span>
        <span
          className={`mobile-payment-list-card__status mobile-payment-list-card__status--${statusKey}`}
        >
          {statusLabel(payment)}
        </span>
      </div>

      <p className="mobile-payment-list-card__amount tabular-nums">
        {formatCurrency(payment.amount)}
      </p>

      <p className="mobile-payment-list-card__broker" title={payment.broker_name}>
        {payment.broker_name}
      </p>

      <div className="mobile-payment-list-card__footer">
        <span>{method}</span>
        <span aria-hidden>·</span>
        <span>Paid {formatDate(payment.payment_date)}</span>
        {invoiceAmount != null && invoiceAmount > 0 ? (
          <>
            <span aria-hidden>·</span>
            <span>Inv {formatCurrency(invoiceAmount)}</span>
          </>
        ) : null}
        {daysLeft != null ? (
          <>
            <span aria-hidden>·</span>
            <span className="mobile-payment-list-card__deadline">
              {daysLeft === 0 ? 'Due today' : `${daysLeft}d left`}
            </span>
          </>
        ) : null}
        <ChevronRight
          className="mobile-payment-list-card__chevron"
          size={16}
          strokeWidth={2}
          aria-hidden
        />
      </div>
    </button>
  )
}
