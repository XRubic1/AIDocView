import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Invoice } from '../../../types/invoice'
import { formatCurrency } from '../../../utils/format'
import { isReceiptDisputeHold } from '../../../services/paymentReceiptConfirmationService'

type DashboardInvoiceListProps = {
  invoices: Invoice[]
  /** Max rows to show (default 5). */
  limit?: number
}

function statusPill(invoice: Invoice): { label: string; tone: string } {
  const now = Date.now()
  const due = invoice.due_date ? new Date(invoice.due_date).getTime() : NaN
  const isOverdue =
    invoice.status !== 'paid' &&
    invoice.status !== 'force_closed' &&
    Number.isFinite(due) &&
    due < now

  // Payment receipt disputes must not look like paperwork holds.
  if (isReceiptDisputeHold(invoice)) {
    return { label: 'Disputed', tone: 'danger' }
  }
  if (invoice.status === 'hold') return { label: 'Held', tone: 'warn' }
  if (isOverdue) return { label: 'Overdue', tone: 'danger' }
  if (invoice.status === 'paid') return { label: 'Paid', tone: 'success' }
  if (invoice.status === 'approved') return { label: 'Open', tone: 'info' }
  if (invoice.status === 'pending') return { label: 'Pending', tone: 'neutral' }
  return { label: 'Open', tone: 'neutral' }
}

/** Open invoices first (held/overdue), then newest — capped. */
function selectInvoiceRows(invoices: Invoice[], limit: number): Invoice[] {
  const now = Date.now()
  return [...invoices]
    .filter((inv) => inv.status !== 'force_closed')
    .sort((a, b) => {
      const score = (inv: Invoice) => {
        if (inv.status === 'hold') return 0
        const due = inv.due_date ? new Date(inv.due_date).getTime() : NaN
        if (inv.status !== 'paid' && Number.isFinite(due) && due < now) return 1
        if (inv.status === 'paid') return 3
        return 2
      }
      const diff = score(a) - score(b)
      if (diff !== 0) return diff
      return new Date(b.invoice_date).getTime() - new Date(a.invoice_date).getTime()
    })
    .slice(0, limit)
}

/**
 * Compact invoice peek — #, status, $ only.
 */
export default function DashboardInvoiceList({
  invoices,
  limit = 5,
}: DashboardInvoiceListProps) {
  const navigate = useNavigate()
  const rows = useMemo(() => selectInvoiceRows(invoices, limit), [invoices, limit])

  return (
    <section className="cd-invoice-list" aria-label="Invoices">
      <header className="cd-invoice-list__head">
        <h2>Invoices</h2>
        <button
          type="button"
          className="cd-invoice-list__all"
          onClick={() => navigate('/client/invoices')}
        >
          View all
        </button>
      </header>

      {rows.length === 0 ? (
        <p className="cd-invoice-list__empty">No invoices yet.</p>
      ) : (
        <ul className="cd-invoice-list__rows">
          {rows.map((invoice) => {
            const pill = statusPill(invoice)
            return (
              <li key={invoice.id}>
                <button
                  type="button"
                  className="cd-invoice-list__row"
                  onClick={() =>
                    navigate(
                      `/client/invoices?highlight_invoice=${encodeURIComponent(invoice.id)}`
                    )
                  }
                >
                  <span className="cd-invoice-list__num">{invoice.invoice_number}</span>
                  <span className={`cd-invoice-list__pill tone-${pill.tone}`}>{pill.label}</span>
                  <span className="cd-invoice-list__amt tabular-nums">
                    {formatCurrency(invoice.amount)}
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
