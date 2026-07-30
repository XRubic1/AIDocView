import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Invoice } from '../../../types/invoice'
import type { Payment } from '../../../types/payment'
import {
  computeAttentionActions,
  type RequiredAction,
} from '../../../utils/clientActivityMetrics'

type DashboardAttentionListProps = {
  invoices: Invoice[]
  payments: Payment[]
  /** Max rows (default 50 — show all held/overdue that fit). */
  limit?: number
}

/** Maps action type → short status pill. */
function actionPill(action: RequiredAction): { label: string; tone: string } {
  if (action.type === 'held_invoice') return { label: 'Held', tone: 'warn' }
  return { label: 'Overdue', tone: 'danger' }
}

/** Invoice # without the category prefix. */
function actionTitle(action: RequiredAction): string {
  const parts = action.label.split(' · ')
  return parts.length > 1 ? parts.slice(1).join(' · ') : action.label
}

/** Amount is the first segment of detail (`$1.2k · Broker · …`). */
function actionAmount(action: RequiredAction): string {
  return action.detail.split(' · ')[0]?.trim() || ''
}

/**
 * Held + overdue invoices — open A/R items that need attention.
 * Payment confirmations live in a separate card below.
 */
export default function DashboardAttentionList({
  invoices,
  payments,
  limit = 50,
}: DashboardAttentionListProps) {
  const navigate = useNavigate()

  const actions = useMemo(
    () => computeAttentionActions({ invoices, payments }, limit),
    [invoices, payments, limit]
  )

  return (
    <section className="cd-attention" aria-label="Needs attention">
      <header className="cd-attention__head">
        <div className="cd-attention__title-row">
          <h2>Needs attention</h2>
          {actions.length > 0 ? (
            <span className="cd-attention__count tabular-nums" aria-hidden>
              {actions.length}
            </span>
          ) : null}
        </div>
        <button
          type="button"
          className="cd-attention__all"
          onClick={() => navigate('/client/invoices')}
        >
          View all
        </button>
      </header>

      {actions.length === 0 ? (
        <p className="cd-attention__empty">No held or overdue invoices right now.</p>
      ) : (
        <ul className="cd-attention__rows">
          {actions.map((action) => {
            const pill = actionPill(action)
            return (
              <li key={action.id}>
                <button
                  type="button"
                  className="cd-attention__row"
                  title={action.detail}
                  onClick={() => navigate(action.navigateTo)}
                >
                  <span className="cd-attention__label">{actionTitle(action)}</span>
                  <span className={`cd-attention__pill tone-${pill.tone}`}>{pill.label}</span>
                  <span className="cd-attention__amt tabular-nums">{actionAmount(action)}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
