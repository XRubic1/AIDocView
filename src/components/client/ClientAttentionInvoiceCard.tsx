import { ChevronRight, Mail } from 'lucide-react'
import type { Invoice } from '../../types/invoice'
import { formatCurrency, formatDate } from '../../utils/format'

type ClientAttentionInvoiceCardProps = {
  invoice: Invoice
  /** Currently open in the detail pane. */
  selected?: boolean
  /** Deep-linked from a Credyx paperwork email. */
  fromEmail?: boolean
  /** Stagger index for enter animation. */
  index?: number
  onClick: () => void
}

/**
 * Needs-attention list row — invoice, hold reason, and upload affordance.
 */
export default function ClientAttentionInvoiceCard({
  invoice,
  selected = false,
  fromEmail = false,
  index = 0,
  onClick,
}: ClientAttentionInvoiceCardProps) {
  const load = invoice.load_number?.trim() || '—'
  const reason = invoice.hold_reason?.trim()

  return (
    <button
      type="button"
      onClick={onClick}
      className={`client-attention-card${selected ? ' is-selected' : ''}${
        fromEmail ? ' is-from-email' : ''
      }`}
      style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
    >
      <div className="client-attention-card__top">
        <div className="client-attention-card__ids">
          <span className="client-attention-card__inv">#{invoice.invoice_number}</span>
          {fromEmail ? (
            <span className="client-attention-card__email">
              <Mail className="w-3 h-3" aria-hidden />
              From email
            </span>
          ) : null}
        </div>
        <span className="status-pill status-pill--hold status-pill--compact">On hold</span>
      </div>

      <p className="client-attention-card__amount tabular-nums">{formatCurrency(invoice.amount)}</p>

      <p className="client-attention-card__meta">
        Load {load}
        <span aria-hidden> · </span>
        {invoice.broker_name}
        <span aria-hidden> · </span>
        {formatDate(invoice.invoice_date)}
      </p>

      {reason ? <p className="client-attention-card__reason">{reason}</p> : null}

      <span className="client-attention-card__cta">
        Upload documents
        <ChevronRight className="w-3.5 h-3.5" aria-hidden />
      </span>
    </button>
  )
}
