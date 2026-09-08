import type { Payment } from '../../types/payment'
import { formatCurrency, formatDate } from '../../utils/format'
import { PAYMENT_STATUS_LABELS, PAYMENT_STATUS_PILL_CLASS } from '../../utils/paymentStatus'
import { useClientTheme } from '../../theme/ThemeContext'

const METHOD_LABELS: Record<Payment['payment_method'], string> = {
  check: 'Check',
  wire: 'Wire',
  ach: 'ACH',
  credit_card: 'Card',
}

interface PostPaymentPriorPaymentsProps {
  payments: Payment[]
}

/** Label for short / over / regular payment rows on an invoice. */
function getPaymentKindLabel(payment: Payment): string {
  if (payment.payment_kind === 'short') {
    return payment.short_pay_reason === 'chargeback' ? 'Chargeback' : 'Short'
  }
  if (payment.payment_kind === 'over') return 'Over'
  return 'Payment'
}

/**
 * Previous payments posted against the selected invoice.
 * Inputs: invoice payment rows. Output: dated list with amount, method, and status.
 */
export default function PostPaymentPriorPayments({ payments }: PostPaymentPriorPaymentsProps) {
  const c = useClientTheme()
  const rows = [...payments].sort((a, b) => {
    const aDate = a.received_date || a.payment_date || ''
    const bDate = b.received_date || b.payment_date || ''
    return bDate.localeCompare(aDate)
  })

  return (
    <section className="post-payment-context-card" aria-labelledby="post-payment-prior-heading">
      <h3 id="post-payment-prior-heading" className="post-payment-context-card__title">
        Previous payments
        {rows.length > 0 ? (
          <span className="post-payment-context-card__count">{rows.length}</span>
        ) : null}
      </h3>

      {rows.length === 0 ? (
        <p className="post-payment-context-card__empty" style={{ color: c.secondary }}>
          No payments have been posted to this invoice yet.
        </p>
      ) : (
        <ul className="post-payment-prior-list">
          {rows.map((payment) => (
            <li key={payment.id} className="post-payment-prior-list__row">
              <div className="post-payment-prior-list__main">
                <p className="post-payment-prior-list__amount financial-nums">
                  {payment.payment_kind === 'short' ? '−' : ''}
                  {formatCurrency(payment.amount)}
                </p>
                <p className="post-payment-prior-list__meta" style={{ color: c.secondary }}>
                  {getPaymentKindLabel(payment)}
                  {' · '}
                  {METHOD_LABELS[payment.payment_method]}
                  {payment.payment_reference ? ` · ${payment.payment_reference}` : ''}
                </p>
              </div>
              <div className="post-payment-prior-list__side">
                <span className={PAYMENT_STATUS_PILL_CLASS[payment.status]}>
                  {PAYMENT_STATUS_LABELS[payment.status]}
                </span>
                <time className="post-payment-prior-list__date" dateTime={payment.payment_date}>
                  {formatDate(payment.payment_date)}
                </time>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
