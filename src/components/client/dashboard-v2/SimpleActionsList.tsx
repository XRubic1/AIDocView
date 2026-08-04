import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Invoice } from '../../../types/invoice'
import type { Payment } from '../../../types/payment'
import {
  computeAttentionActions,
  computeConfirmPaymentActions,
  type RequiredAction,
} from '../../../utils/clientActivityMetrics'
import { formatCurrency } from '../../../utils/format'
import { AMOUNT_EPSILON, getInvoiceOpenArBalance } from '../../../utils/paymentVariance'

type FilterId = 'all' | 'confirm' | 'held' | 'overdue'

type SimpleActionsListProps = {
  invoices: Invoice[]
  payments: Payment[]
  loading?: boolean
}

const FILTERS: { id: FilterId; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'confirm', label: 'Confirm' },
  { id: 'held', label: 'On hold' },
  { id: 'overdue', label: 'Overdue' },
]

function actionPill(action: RequiredAction): { label: string; tone: string } {
  if (action.type === 'held_invoice') return { label: 'On hold', tone: 'warn' }
  if (action.type === 'overdue_invoice') return { label: 'Overdue', tone: 'danger' }
  return { label: 'Confirm', tone: 'info' }
}

function actionTitle(action: RequiredAction): string {
  const parts = action.label.split(' · ')
  return parts.length > 1 ? parts.slice(1).join(' · ') : action.label
}

function actionBroker(action: RequiredAction): string {
  const parts = action.detail.split(' · ').map((p) => p.trim())
  return parts[1] || ''
}

/** Resolve full-precision amount for consistent formatting with KPI cards. */
function actionAmountValue(
  action: RequiredAction,
  invoices: Invoice[],
  payments: Payment[]
): number {
  if (action.type === 'confirm_payment') {
    const paymentId = action.id.replace(/^confirm-/, '')
    const payment = payments.find((p) => p.id === paymentId)
    return payment?.amount ?? 0
  }
  if (action.type === 'held_invoice') {
    const invoiceId = action.id.replace(/^held-/, '')
    const invoice = invoices.find((inv) => inv.id === invoiceId)
    if (!invoice) return 0
    const balance = getInvoiceOpenArBalance(invoice, payments)
    return balance > AMOUNT_EPSILON ? balance : invoice.amount
  }
  const invoiceId = action.id.replace(/^overdue-/, '')
  const invoice = invoices.find((inv) => inv.id === invoiceId)
  if (!invoice) return 0
  return getInvoiceOpenArBalance(invoice, payments)
}

function matchesFilter(action: RequiredAction, filter: FilterId): boolean {
  if (filter === 'all') return true
  if (filter === 'held') return action.type === 'held_invoice'
  if (filter === 'overdue') return action.type === 'overdue_invoice'
  return action.type === 'confirm_payment'
}

function countFor(filter: FilterId, counts: { all: number; held: number; overdue: number; confirm: number }) {
  if (filter === 'all') return counts.all
  if (filter === 'held') return counts.held
  if (filter === 'overdue') return counts.overdue
  return counts.confirm
}

/**
 * Fixed-width actions list — the only to-do surface on the calm dashboard.
 */
export default function SimpleActionsList({
  invoices,
  payments,
  loading = false,
}: SimpleActionsListProps) {
  const navigate = useNavigate()
  const [filter, setFilter] = useState<FilterId>('all')

  const actions = useMemo(() => {
    const confirms = computeConfirmPaymentActions(payments)
    const attention = computeAttentionActions({ invoices, payments })
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

  // If the active tab drops to zero (e.g. after confirming), fall back to All.
  useEffect(() => {
    if (filter !== 'all' && countFor(filter, counts) === 0) {
      setFilter('all')
    }
  }, [filter, counts])

  const rows = useMemo(
    () => actions.filter((a) => matchesFilter(a, filter)),
    [actions, filter]
  )

  const visibleFilters = FILTERS.filter((f) => {
    if (f.id === 'all') return true
    return countFor(f.id, counts) > 0
  })

  return (
    <section className={`cdv2-actions${loading ? ' is-loading' : ''}`} aria-label="Needs your action">
      <header className="cdv2-actions__head">
        <div className="cdv2-actions__title-row">
          <h2 className="cdv2-actions__title">Needs your action</h2>
          {counts.all > 0 ? (
            <span className="cdv2-actions__count tabular-nums">{counts.all}</span>
          ) : null}
        </div>
        <div className="cdv2-actions__filters" role="tablist" aria-label="Action type">
          {visibleFilters.map((f) => {
            const n = countFor(f.id, counts)
            return (
              <button
                key={f.id}
                type="button"
                role="tab"
                aria-selected={filter === f.id}
                className={`cdv2-actions__filter${filter === f.id ? ' is-active' : ''}`}
                onClick={() => setFilter(f.id)}
              >
                {f.label}
                <span className="cdv2-actions__filter-n tabular-nums">{n}</span>
              </button>
            )
          })}
        </div>
      </header>

      {loading ? (
        <p className="cdv2-actions__empty">Loading actions…</p>
      ) : rows.length === 0 ? (
        <p className="cdv2-actions__empty">
          {filter === 'all'
            ? 'Nothing needs action right now.'
            : `No ${FILTERS.find((f) => f.id === filter)?.label.toLowerCase()} items.`}
        </p>
      ) : (
        <ul className="cdv2-actions__rows">
          {rows.map((action) => {
            const pill = actionPill(action)
            const broker = actionBroker(action)
            const amount = actionAmountValue(action, invoices, payments)
            return (
              <li key={action.id}>
                <button
                  type="button"
                  className="cdv2-actions__row"
                  title={action.detail}
                  onClick={() => navigate(action.navigateTo)}
                >
                  <span className={`cdv2-actions__pill tone-${pill.tone}`}>{pill.label}</span>
                  <span className="cdv2-actions__body">
                    <span className="cdv2-actions__label">{actionTitle(action)}</span>
                    {broker ? (
                      <span className="cdv2-actions__meta">{broker}</span>
                    ) : null}
                  </span>
                  <span className="cdv2-actions__amt tabular-nums">
                    {formatCurrency(amount)}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
