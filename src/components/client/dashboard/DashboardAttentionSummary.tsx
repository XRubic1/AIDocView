import { useMemo } from 'react'
import type { Invoice } from '../../../types/invoice'
import type { Payment } from '../../../types/payment'
import { computeAttentionSummary } from '../../../utils/clientActivityMetrics'
import { formatCurrency } from '../../../utils/format'

type DashboardAttentionSummaryProps = {
  invoices: Invoice[]
  payments: Payment[]
}

/**
 * Compact rollup under Needs attention + Confirm payments.
 */
export default function DashboardAttentionSummary({
  invoices,
  payments,
}: DashboardAttentionSummaryProps) {
  const summary = useMemo(
    () => computeAttentionSummary({ invoices, payments }),
    [invoices, payments]
  )

  const rows = [
    {
      key: 'held',
      label: 'Held',
      count: summary.heldCount,
      amount: summary.heldAmount,
      tone: 'warn',
    },
    {
      key: 'overdue',
      label: 'Overdue',
      count: summary.overdueCount,
      amount: summary.overdueAmount,
      tone: 'danger',
    },
    {
      key: 'confirm',
      label: 'Confirm',
      count: summary.confirmCount,
      amount: summary.confirmAmount,
      tone: 'info',
    },
  ] as const

  return (
    <section className="cd-attention-summary" aria-label="Action summary">
      <header className="cd-attention-summary__head">
        <h2>Summary</h2>
        <span className="cd-attention-summary__total tabular-nums">
          {summary.totalCount} open
        </span>
      </header>

      <ul className="cd-attention-summary__rows">
        {rows.map((row) => (
          <li key={row.key} className="cd-attention-summary__row">
            <span className={`cd-attention-summary__pill tone-${row.tone}`}>{row.label}</span>
            <span className="cd-attention-summary__count tabular-nums">{row.count}</span>
            <span className="cd-attention-summary__amt tabular-nums">
              {row.count > 0 ? formatCurrency(row.amount) : '—'}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
