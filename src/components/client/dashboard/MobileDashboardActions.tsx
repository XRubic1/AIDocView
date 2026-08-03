import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Invoice } from '../../../types/invoice'
import type { Payment } from '../../../types/payment'
import {
  computeAttentionActions,
  computeConfirmPaymentActions,
  type RequiredAction,
} from '../../../utils/clientActivityMetrics'

type FilterId = 'all' | 'held' | 'overdue' | 'confirm'

const FILTERS: { id: FilterId; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'confirm', label: 'Confirm' },
  { id: 'held', label: 'On hold' },
  { id: 'overdue', label: 'Overdue' },
]

type MobileDashboardActionsProps = {
  invoices: Invoice[]
  payments: Payment[]
  loading?: boolean
}

/** Short status pill for an action row. */
function actionPill(action: RequiredAction): { label: string; tone: string } {
  if (action.type === 'held_invoice') return { label: 'On hold', tone: 'warn' }
  if (action.type === 'overdue_invoice') return { label: 'Overdue', tone: 'danger' }
  return { label: 'Confirm', tone: 'info' }
}

/** Invoice # / title without category prefix. */
function actionTitle(action: RequiredAction): string {
  const parts = action.label.split(' · ')
  return parts.length > 1 ? parts.slice(1).join(' · ') : action.label
}

/** Amount is the first segment of detail. */
function actionAmount(action: RequiredAction): string {
  return action.detail.split(' · ')[0]?.trim() || ''
}

/** Broker name from detail segments. */
function actionBroker(action: RequiredAction): string {
  const parts = action.detail.split(' · ').map((p) => p.trim())
  return parts[1] || ''
}

function matchesFilter(action: RequiredAction, filter: FilterId): boolean {
  if (filter === 'all') return true
  if (filter === 'held') return action.type === 'held_invoice'
  if (filter === 'overdue') return action.type === 'overdue_invoice'
  return action.type === 'confirm_payment'
}

/**
 * Compact Actions panel for the mobile dashboard carousel —
 * held / overdue / confirm rows with quick filters.
 */
export default function MobileDashboardActions({
  invoices,
  payments,
  loading = false,
}: MobileDashboardActionsProps) {
  const navigate = useNavigate()
  const [filter, setFilter] = useState<FilterId>('all')

  const actions = useMemo(() => {
    const attention = computeAttentionActions({ invoices, payments })
    const confirms = computeConfirmPaymentActions(payments)
    return [...confirms, ...attention]
  }, [invoices, payments])

  const counts = useMemo(() => {
    let held = 0
    let overdue = 0
    let confirm = 0
    for (const a of actions) {
      if (a.type === 'held_invoice') held += 1
      else if (a.type === 'overdue_invoice') overdue += 1
      else confirm += 1
    }
    return { all: actions.length, held, overdue, confirm }
  }, [actions])

  const rows = useMemo(
    () => actions.filter((a) => matchesFilter(a, filter)),
    [actions, filter]
  )

  if (loading) {
    return (
      <div className="cd-mobile-actions is-loading" aria-busy="true">
        <p className="cd-mobile-actions__empty">Loading actions…</p>
      </div>
    )
  }

  return (
    <div className="cd-mobile-actions">
      <div className="cd-mobile-actions__filters" role="tablist" aria-label="Action type">
        {FILTERS.map((f) => {
          const n =
            f.id === 'all'
              ? counts.all
              : f.id === 'held'
                ? counts.held
                : f.id === 'overdue'
                  ? counts.overdue
                  : counts.confirm
          return (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={filter === f.id}
              className={`cd-mobile-actions__filter${filter === f.id ? ' is-active' : ''}`}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
              <span className="cd-mobile-actions__filter-n tabular-nums">{n}</span>
            </button>
          )
        })}
      </div>

      {rows.length === 0 ? (
        <p className="cd-mobile-actions__empty">
          {filter === 'all'
            ? 'Nothing needs action right now.'
            : `No ${FILTERS.find((f) => f.id === filter)?.label.toLowerCase()} items.`}
        </p>
      ) : (
        <ul className="cd-mobile-actions__rows">
          {rows.map((action) => {
            const pill = actionPill(action)
            const broker = actionBroker(action)
            return (
              <li key={action.id}>
                <button
                  type="button"
                  className="cd-mobile-actions__row"
                  title={action.detail}
                  onClick={() => navigate(action.navigateTo)}
                >
                  <span className={`cd-mobile-actions__pill tone-${pill.tone}`}>
                    {pill.label}
                  </span>
                  <span className="cd-mobile-actions__body">
                    <span className="cd-mobile-actions__label">{actionTitle(action)}</span>
                    {broker ? (
                      <span className="cd-mobile-actions__meta">{broker}</span>
                    ) : null}
                  </span>
                  <span className="cd-mobile-actions__amt tabular-nums">
                    {actionAmount(action)}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
