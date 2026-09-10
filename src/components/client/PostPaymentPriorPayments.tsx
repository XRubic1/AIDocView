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
        <div className="client-table-scroll post-payment-prior-table-scroll">
          <table className="dashboard-table dashboard-table--compact">
            <thead>
              <tr>
                <th className="text-right">Amount</th>
                <th>Date</th>
                <th>Method</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((payment) => (
                <tr key={payment.id}>
                  <td className="text-right tabular-nums post-payment-prior-list__amount">
                    {payment.payment_kind === 'short' ? '−' : ''}
                    {formatCurrency(payment.amount)}
                  </td>
                  <td>
                    <time dateTime={payment.payment_date}>{formatDate(payment.payment_date)}</time>
                  </td>
                  <td>
                    {getPaymentKindLabel(payment)}
                    {' · '}
                    {METHOD_LABELS[payment.payment_method]}
                  </td>
                  <td>
                    <span className={PAYMENT_STATUS_PILL_CLASS[payment.status]}>
                      {PAYMENT_STATUS_LABELS[payment.status]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
