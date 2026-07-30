import { DollarSign } from 'lucide-react'
import type { AssistantPaymentStatusCard } from '../../../types/assistant'

interface AssistantPaymentStatusCardProps {
  status: AssistantPaymentStatusCard
  note?: string
  onOpenInvoice?: (invoiceId: string, invoiceNumber: string) => void
}

/** Clear payment truth — balance, confirmed, pending, and WHY from structured fields. */
export default function AssistantPaymentStatusCardView({
  status,
  note,
  onOpenInvoice,
}: AssistantPaymentStatusCardProps) {
  const showAwaiting =
    Boolean(status.postedAwaitingConfirmLabel) &&
    status.postedAwaitingConfirmLabel !== '$0.00'
  const showRemainingAfterPending =
    status.isPartialRemittance && Boolean(status.remainingAfterPendingLabel)

  return (
    <div className="assistant-pay-status">
      <div className="assistant-pay-status__head">
        <span className={`assistant-pay-status__chip assistant-pay-status__chip--${status.balanceTone}`}>
          <DollarSign className="w-3 h-3" aria-hidden />
          {status.headlineLabel}
        </span>
        <button
          type="button"
          className="assistant-pay-status__inv"
          onClick={() => onOpenInvoice?.(status.invoiceId, status.invoiceNumber)}
        >
          #{status.invoiceNumber}
          {status.brokerName ? ` · ${status.brokerName}` : ''}
        </button>
      </div>

      {note?.trim() ? <p className="assistant-pay-status__note">{note}</p> : null}

      <p className="assistant-pay-status__summary">{status.summary}</p>

      <dl className="assistant-pay-status__grid">
        <div>
          <dt>Invoice amount</dt>
          <dd>{status.faceAmountLabel}</dd>
        </div>
        <div>
          <dt>Confirmed received</dt>
          <dd>{status.confirmedReceivedLabel}</dd>
        </div>
        {showAwaiting ? (
          <div>
            <dt>Awaiting your confirmation</dt>
            <dd className="assistant-pay-status__pending">{status.postedAwaitingConfirmLabel}</dd>
          </div>
        ) : null}
        {showRemainingAfterPending ? (
          <div>
            <dt>Still due after this payment</dt>
            <dd className="assistant-pay-status__bal--short">
              {status.remainingAfterPendingLabel}
            </dd>
          </div>
        ) : (
          <div>
            <dt>Balance due</dt>
            <dd className={`assistant-pay-status__bal--${status.balanceTone}`}>
              {status.balanceDueLabel}
            </dd>
          </div>
        )}
        <div>
          <dt>Display status</dt>
          <dd>
            {status.displayStatus}
            {status.variance ? ` · ${status.variance.replace(/_/g, ' ')}` : ''}
          </dd>
        </div>
      </dl>

      {status.why?.reason || status.why?.paymentStatusLabel ? (
        <div className="assistant-pay-status__why">
          <p className="assistant-pay-status__why-label">Why</p>
          <p className="assistant-pay-status__why-body">
            {status.why.paymentStatusLabel ? `${status.why.paymentStatusLabel}. ` : ''}
            {status.why.reason || 'See payment history below.'}
            {status.why.reversalType ? ` (${status.why.reversalType})` : ''}
            {status.why.date ? ` · ${String(status.why.date).slice(0, 10)}` : ''}
          </p>
        </div>
      ) : null}

      {status.payments.length > 0 ? (
        <ul className="assistant-pay-status__list">
          {status.payments.map((p) => (
            <li key={p.id}>
              <span className="assistant-pay-status__pay-amt">{p.amountLabel}</span>
              <span className="assistant-pay-status__pay-st">{p.statusLabel}</span>
              <span className="assistant-pay-status__pay-dt">{p.date}</span>
              {p.reason ? (
                <span className="assistant-pay-status__pay-why">{p.reason}</span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="assistant-pay-status__empty">No payment rows on this invoice.</p>
      )}
    </div>
  )
}
