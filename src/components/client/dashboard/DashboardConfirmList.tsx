import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Payment } from '../../../types/payment'
import { computeConfirmPaymentActions } from '../../../utils/clientActivityMetrics'

type DashboardConfirmListProps = {
  payments: Payment[]
  /** Max rows (default 50). */
  limit?: number
}

/** Invoice # without the category prefix. */
function actionTitle(label: string): string {
  const parts = label.split(' · ')
  return parts.length > 1 ? parts.slice(1).join(' · ') : label
}

/** Amount is the first segment of detail. */
function actionAmount(detail: string): string {
  return detail.split(' · ')[0]?.trim() || ''
}

/**
 * Payments awaiting client receipt confirmation — separate from held/overdue.
 */
export default function DashboardConfirmList({
  payments,
  limit = 50,
}: DashboardConfirmListProps) {
  const navigate = useNavigate()

  const actions = useMemo(
    () => computeConfirmPaymentActions(payments, limit),
    [payments, limit]
  )

  return (
    <section className="cd-attention cd-attention--confirm" aria-label="Confirm payments">
      <header className="cd-attention__head">
        <div className="cd-attention__title-row">
          <h2>Confirm payments</h2>
          {actions.length > 0 ? (
            <span className="cd-attention__count cd-attention__count--info tabular-nums" aria-hidden>
              {actions.length}
            </span>
          ) : null}
        </div>
        <button
          type="button"
          className="cd-attention__all"
          onClick={() => navigate('/client/payments?status=awaiting_receipt')}
        >
          View all
        </button>
      </header>

      {actions.length === 0 ? (
        <p className="cd-attention__empty">No payments waiting for confirmation.</p>
      ) : (
        <ul className="cd-attention__rows">
          {actions.map((action) => (
            <li key={action.id}>
              <button
                type="button"
                className="cd-attention__row"
                title={action.detail}
                onClick={() => navigate(action.navigateTo)}
              >
                <span className="cd-attention__label">{actionTitle(action.label)}</span>
                <span className="cd-attention__pill tone-info">Confirm</span>
                <span className="cd-attention__amt tabular-nums">
                  {actionAmount(action.detail)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
