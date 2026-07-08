import { useState } from 'react'
import { AlertTriangle, CheckCircle, Clock, Loader2 } from 'lucide-react'
import type { Payment } from '../../types/payment'
import { formatCurrency, formatDate } from '../../utils/format'
import { useClientTheme } from '../../theme/ThemeContext'
import {
  getReceiptConfirmationDaysLeft,
  isReceiptConfirmationOverdue,
} from '../../utils/paymentStatus'
import {
  PAYMENT_RECEIPT_DISPUTE_REASONS,
  confirmPaymentReceipt,
  openPaymentReceiptDispute,
} from '../../services/paymentReceiptConfirmationService'

interface PaymentReceiptConfirmationPanelProps {
  payments: Payment[]
  clientName: string
  onUpdated: () => void
  onViewPayment?: (payment: Payment) => void
}

/** Managed-client banner listing Credyx-posted payments awaiting receipt confirmation. */
export default function PaymentReceiptConfirmationPanel({
  payments,
  clientName,
  onUpdated,
  onViewPayment,
}: PaymentReceiptConfirmationPanelProps) {
  const c = useClientTheme()
  const awaiting = payments.filter((p) => p.status === 'awaiting_receipt')
  const disputed = payments.filter((p) => p.status === 'disputed')

  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [disputeTarget, setDisputeTarget] = useState<Payment | null>(null)
  const [disputeReason, setDisputeReason] = useState<string>(PAYMENT_RECEIPT_DISPUTE_REASONS[0].value)
  const [disputeDescription, setDisputeDescription] = useState('')
  const [disputeSubmitting, setDisputeSubmitting] = useState(false)
  const [disputeError, setDisputeError] = useState<string | null>(null)

  if (awaiting.length === 0 && disputed.length === 0) return null

  const handleConfirm = async (payment: Payment) => {
    setConfirmingId(payment.id)
    try {
      const result = confirmPaymentReceipt(payment.id, clientName)
      if (result) onUpdated()
    } finally {
      setConfirmingId(null)
    }
  }

  const handleOpenDispute = (payment: Payment) => {
    setDisputeTarget(payment)
    setDisputeReason(PAYMENT_RECEIPT_DISPUTE_REASONS[0].value)
    setDisputeDescription('')
    setDisputeError(null)
  }

  const handleSubmitDispute = async () => {
    if (!disputeTarget || !disputeDescription.trim() || disputeSubmitting) return
    setDisputeSubmitting(true)
    setDisputeError(null)
    try {
      const result = openPaymentReceiptDispute(
        disputeTarget.id,
        disputeReason,
        disputeDescription,
        clientName
      )
      if (!result) {
        setDisputeError('Could not open dispute. Please try again.')
        return
      }
      setDisputeTarget(null)
      onUpdated()
    } catch {
      setDisputeError('Could not open dispute. Please try again.')
    } finally {
      setDisputeSubmitting(false)
    }
  }

  return (
    <>
      <section
        className="shrink-0 px-4 py-3 border-b space-y-3"
        style={{ borderColor: c.border, backgroundColor: c.stat.amber }}
      >
        <div className="flex items-start gap-3">
          <Clock className="w-5 h-5 shrink-0 mt-0.5" style={{ color: c.warning }} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold" style={{ color: c.primary }}>
              Confirm received payments
            </p>
            <p className="text-xs mt-0.5" style={{ color: c.secondary }}>
              Credyx has posted payments for your review. You have 30 days to confirm funds were
              received or open a dispute. Unconfirmed payments auto-confirm after 30 days.
            </p>
          </div>
        </div>

        {awaiting.length > 0 && (
          <ul className="space-y-2">
            {awaiting.map((payment) => {
              const daysLeft = getReceiptConfirmationDaysLeft(payment)
              const overdue = isReceiptConfirmationOverdue(payment)
              return (
                <li
                  key={payment.id}
                  className="rounded-lg border px-3 py-2.5 flex flex-col sm:flex-row sm:items-center gap-3"
                  style={{ borderColor: c.border, backgroundColor: c.card }}
                >
                  <button
                    type="button"
                    className="flex-1 min-w-0 text-left"
                    onClick={() => onViewPayment?.(payment)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold truncate" style={{ color: c.primary }}>
                        {payment.invoice_number}
                      </span>
                      <span className="text-sm font-semibold tabular-nums shrink-0" style={{ color: c.primary }}>
                        {formatCurrency(payment.amount)}
                      </span>
                    </div>
                    <p className="text-xs mt-0.5 truncate" style={{ color: c.secondary }}>
                      {payment.broker_name} · Posted {formatDate(payment.received_date)}
                    </p>
                    <p
                      className="text-xs mt-1 font-medium"
                      style={{ color: overdue ? c.error : c.warning }}
                    >
                      {overdue
                        ? 'Confirmation overdue — will auto-confirm soon'
                        : daysLeft != null
                          ? `${daysLeft} day${daysLeft !== 1 ? 's' : ''} left to confirm`
                          : 'Awaiting your confirmation'}
                    </p>
                  </button>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleConfirm(payment)}
                      disabled={confirmingId === payment.id}
                      className="dashboard-btn-primary !h-8 !px-3 !text-xs inline-flex items-center gap-1.5 disabled:opacity-50"
                    >
                      {confirmingId === payment.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <CheckCircle className="w-3.5 h-3.5" />
                      )}
                      Confirm received
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOpenDispute(payment)}
                      className="dashboard-btn-secondary !h-8 !px-3 !text-xs inline-flex items-center gap-1.5"
                      style={{ color: c.error, borderColor: c.error }}
                    >
                      <AlertTriangle className="w-3.5 h-3.5" />
                      Dispute
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}

        {disputed.length > 0 && (
          <div
            className="rounded-lg border px-3 py-2 text-xs flex items-start gap-2"
            style={{ borderColor: c.error, backgroundColor: c.card, color: c.secondary }}
          >
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: c.error }} />
            <p>
              {disputed.length} payment{disputed.length !== 1 ? 's' : ''} under dispute — funds on
              hold until Credyx resolves.
            </p>
          </div>
        )}
      </section>

      {disputeTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div
            className="rounded-lg shadow-xl max-w-md w-full"
            style={{ backgroundColor: c.card, boxShadow: c.shadow.cardHover }}
          >
            <div className="p-5 border-b" style={{ borderColor: c.border }}>
              <h3 className="text-base font-semibold" style={{ color: c.primary }}>
                Dispute payment receipt
              </h3>
              <p className="text-xs mt-1" style={{ color: c.secondary }}>
                {disputeTarget.invoice_number} · {formatCurrency(disputeTarget.amount)} — funds will
                be placed on hold.
              </p>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: c.secondary }}>
                  Reason
                </label>
                <select
                  value={disputeReason}
                  onChange={(e) => setDisputeReason(e.target.value)}
                  className="client-input w-full"
                >
                  {PAYMENT_RECEIPT_DISPUTE_REASONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: c.secondary }}>
                  Description <span style={{ color: c.error }}>*</span>
                </label>
                <textarea
                  value={disputeDescription}
                  onChange={(e) => setDisputeDescription(e.target.value)}
                  rows={3}
                  className="client-input w-full resize-none"
                  placeholder="Explain why funds were not received or are incorrect…"
                />
              </div>
              {disputeError && (
                <p className="text-xs" style={{ color: c.error }}>
                  {disputeError}
                </p>
              )}
            </div>
            <div className="flex justify-end gap-2 p-5 border-t" style={{ borderColor: c.border }}>
              <button
                type="button"
                onClick={() => setDisputeTarget(null)}
                className="dashboard-btn-secondary"
                disabled={disputeSubmitting}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmitDispute}
                disabled={!disputeDescription.trim() || disputeSubmitting}
                className="dashboard-btn-primary inline-flex items-center gap-1.5 disabled:opacity-50"
                style={{ backgroundColor: c.error }}
              >
                {disputeSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <AlertTriangle className="w-4 h-4" />
                )}
                Submit dispute
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
