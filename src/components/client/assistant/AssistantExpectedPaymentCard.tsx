import type { AssistantExpectedPayment } from '../../../types/assistant'
import { useNavigate } from 'react-router-dom'
import { useClientSession } from '../../../hooks/useClientSession'
import {
  clientInvoiceDetailPath,
  resolveClientInvoice,
} from '../../../utils/openClientInvoice'

interface AssistantExpectedPaymentCardProps {
  payment: AssistantExpectedPayment
  /** Optional supporting sentence under the date. */
  note?: string
}

/** Expected payment card — distinguishes confirmed vs forecast. */
export default function AssistantExpectedPaymentCard({
  payment,
  note,
}: AssistantExpectedPaymentCardProps) {
  const navigate = useNavigate()
  const { clientId, clientName } = useClientSession()
  const sourceLabel = payment.source === 'confirmed' ? 'Confirmed' : 'Forecast'

  const openInvoice = () => {
    const match = resolveClientInvoice(clientId, clientName, {
      invoiceId: payment.invoiceId,
      invoiceNumber: payment.invoiceNumber,
    })
    navigate(
      clientInvoiceDetailPath(match?.id ?? (payment.invoiceId || payment.invoiceNumber))
    )
  }

  return (
    <div className="assistant-pay-card">
      <div className="assistant-pay-card__head">
        <span className={`assistant-pay-chip assistant-pay-chip--${payment.source}`}>
          {sourceLabel}
        </span>
        <span className="assistant-pay-card__confidence">
          Confidence:{' '}
          {payment.confidence.charAt(0).toUpperCase() + payment.confidence.slice(1)}
        </span>
      </div>
      <p className="assistant-pay-card__date">{payment.dateLabel}</p>
      <p className="assistant-pay-card__sub">
        Invoice #{payment.invoiceNumber} · {payment.brokerName}
      </p>
      {note && <p className="assistant-pay-card__note">{note}</p>}
      <button
        type="button"
        className="dashboard-btn-secondary assistant-pay-card__btn"
        onClick={openInvoice}
      >
        Open invoice
      </button>
    </div>
  )
}
