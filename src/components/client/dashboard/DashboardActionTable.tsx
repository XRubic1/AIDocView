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

type Urgency = 'urgent' | 'soon' | 'normal'

type ActionWithUrgency = RequiredAction & {
  urgency: Urgency
  daysOverdue?: number
}

type DashboardActionTableProps = {
  invoices: Invoice[]
  payments: Payment[]
}

const FILTERS: { id: FilterId; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'held', label: 'Held' },
  { id: 'overdue', label: 'Overdue' },
  { id: 'confirm', label: 'Confirm' },
]

function actionPill(action: RequiredAction): { label: string; tone: string } {
  if (action.type === 'held_invoice') return { label: 'Held', tone: 'warn' }
  if (action.type === 'overdue_invoice') return { label: 'Overdue', tone: 'danger' }
  return { label: 'Confirm', tone: 'info' }
}

function actionTitle(action: RequiredAction): string {
  const parts = action.label.split(' · ')
  return parts.length > 1 ? parts.slice(1).join(' · ') : action.label
}

function actionAmount(action: RequiredAction): string {
  return action.detail.split(' · ')[0]?.trim() || ''
}

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
 * Compute urgency based on action type and days overdue.
 * - Urgent: overdue >30 days, or held >45 days
 * - Soon: overdue 7-30 days, or held 15-45 days
 * - Normal: everything else
 */
function computeUrgency(action: RequiredAction, invoices: Invoice[]): ActionWithUrgency {
  // Extract invoice number from action label
  const invoiceNumber = action.label.split(' · ')[1]?.trim() || action.label
  const invoice = invoices.find(
    (inv) => inv.invoice_number === invoiceNumber || action.label.includes(inv.invoice_number)
  )

  if (!invoice) {
    return { ...action, urgency: 'normal' as const }
  }

  const now = new Date()
  const expectedDate = invoice.expected_payment_date || invoice.due_date
  
  if (action.type === 'overdue_invoice' && expectedDate) {
    const overdueDays = Math.floor(
      (now.getTime() - new Date(expectedDate).getTime()) / (1000 * 60 * 60 * 24)
    )
    if (overdueDays > 30) {
      return { ...action, urgency: 'urgent' as const, daysOverdue: overdueDays }
    }
    if (overdueDays > 7) {
      return { ...action, urgency: 'soon' as const, daysOverdue: overdueDays }
    }
    return { ...action, urgency: 'normal' as const, daysOverdue: overdueDays }
  }

  if (action.type === 'held_invoice' && invoice.invoice_date) {
    const daysSinceInvoice = Math.floor(
      (now.getTime() - new Date(invoice.invoice_date).getTime()) / (1000 * 60 * 60 * 24)
    )
    if (daysSinceInvoice > 45) {
      return { ...action, urgency: 'urgent' as const, daysOverdue: daysSinceInvoice }
    }
    if (daysSinceInvoice > 15) {
      return { ...action, urgency: 'soon' as const, daysOverdue: daysSinceInvoice }
    }
  }

  // Payment confirms are always normal priority (quick wins)
  return { ...action, urgency: 'normal' as const }
}

/**
 * Single actionable list — held, overdue, and payment confirms with filters and urgency badges.
 * Replaces the three overlapping side panels.
 */
export default function DashboardActionTable({
  invoices,
  payments,
}: DashboardActionTableProps) {
  const navigate = useNavigate()
  const [filter, setFilter] = useState<FilterId>('all')

  const actionsWithUrgency = useMemo(() => {
    const attention = computeAttentionActions({ invoices, payments })
    const confirms = computeConfirmPaymentActions(payments)
    const allActions = [...confirms, ...attention]
    
    // Add urgency and sort: urgent first, then soon, then normal
    const withUrgency = allActions.map((action) => computeUrgency(action, invoices))
    return withUrgency.sort((a, b) => {
      const urgencyOrder = { urgent: 0, soon: 1, normal: 2 }
      return urgencyOrder[a.urgency] - urgencyOrder[b.urgency]
    })
  }, [invoices, payments])

  const counts = useMemo(() => {
    let held = 0
    let overdue = 0
    let confirm = 0
    for (const a of actionsWithUrgency) {
      if (a.type === 'held_invoice') held += 1
      else if (a.type === 'overdue_invoice') overdue += 1
      else confirm += 1
    }
    return { all: actionsWithUrgency.length, held, overdue, confirm }
  }, [actionsWithUrgency])

  const rows = useMemo(
    () => actionsWithUrgency.filter((a) => matchesFilter(a, filter)),
    [actionsWithUrgency, filter]
  )

  return (
    <section className="cd-actions" aria-label="Actions">
      <header className="cd-actions__head">
        <div className="cd-actions__title-row">
          <h2>Actions</h2>
          {counts.all > 0 ? (
            <span className="cd-actions__count tabular-nums">{counts.all}</span>
          ) : null}
        </div>
        <div className="cd-actions__filters" role="tablist" aria-label="Action type">
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
                className={`cd-actions__filter${filter === f.id ? ' is-active' : ''}`}
                onClick={() => setFilter(f.id)}
              >
                {f.label}
                <span className="cd-actions__filter-n tabular-nums">{n}</span>
              </button>
            )
          })}
        </div>
      </header>

      {rows.length === 0 ? (
        <p className="cd-actions__empty">
          {filter === 'all'
            ? 'Nothing needs action right now.'
            : `No ${FILTERS.find((f) => f.id === filter)?.label.toLowerCase()} items.`}
        </p>
      ) : (
        <ul className="cd-actions__rows">
          {rows.map((action) => {
            const pill = actionPill(action)
            const broker = actionBroker(action)
            return (
              <li key={action.id}>
                <button
                  type="button"
                  className={`cd-actions__row cd-actions__row--${action.urgency}`}
                  title={action.detail}
                  onClick={() => navigate(action.navigateTo)}
                >
                  <span className={`cd-actions__pill tone-${pill.tone}`}>{pill.label}</span>
                  <span className="cd-actions__body">
                    <span className="cd-actions__label">{actionTitle(action)}</span>
                    {broker ? (
                      <>
                        <span className="cd-actions__sep" aria-hidden>
                          ·
                        </span>
                        <span className="cd-actions__meta">{broker}</span>
                      </>
                    ) : null}
                  </span>
                  <span className="cd-actions__amt tabular-nums">{actionAmount(action)}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
