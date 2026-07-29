import { useState } from 'react'
import { AlertTriangle, CheckCircle, Loader2, X } from 'lucide-react'
import type { Payment } from '../../types/payment'
import { formatCurrency, formatDate } from '../../utils/format'
import { useClientTheme } from '../../theme/ThemeContext'
import {
  getReceiptConfirmationDaysLeft,
  isReceiptConfirmationOverdue,
  PAYMENT_STATUS_LABELS,
} from '../../utils/paymentStatus'
import {
  PAYMENT_RECEIPT_DISPUTE_REASONS,
  confirmPaymentReceipt,
  openPaymentReceiptDispute,
} from '../../services/paymentReceiptConfirmationService'

const METHOD_LABELS: Record<string, string> = {
  check: 'Check',
  wire: 'Wire',
  ach: 'ACH',
  credit_card: 'Card',
}

interface ConfirmPaymentReceiptModalProps {
  payment: Payment
  clientName: string
  onClose: () => void
  onUpdated: () => void
}

/**
 * Modal with payment details + confirm / dispute for awaiting-receipt payments.
 * Opened from invoice detail when Credyx has posted a payment for the carrier to confirm.
 */
export default function ConfirmPaymentReceiptModal({
  payment,
  clientName,
  onClose,
  onUpdated,
}: ConfirmPaymentReceiptModalProps) {
  const c = useClientTheme()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showDispute, setShowDispute] = useState(false)
  const [disputeReason, setDisputeReason] = useState(PAYMENT_RECEIPT_DISPUTE_REASONS[0].value)
  const [disputeDescription, setDisputeDescription] = useState('')

  const daysLeft = getReceiptConfirmationDaysLeft(payment)
  const overdue = isReceiptConfirmationOverdue(payment)
  const methodLabel = METHOD_LABELS[payment.payment_method] || payment.payment_method || '—'

  const handleConfirm = async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const result = confirmPaymentReceipt(payment.id, clientName)
      if (!result) {
        setError('Could not confirm payment. Please try again.')
        return
      }
      onUpdated()
      onClose()
    } catch {
      setError('Could not confirm payment. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  const handleDispute = async () => {
    if (busy || !disputeDescription.trim()) {
      setError('Describe the issue before submitting a dispute.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const result = openPaymentReceiptDispute(
        payment.id,
        disputeReason,
        disputeDescription.trim(),
        clientName
      )
      if (!result) {
        setError('Could not open dispute. Please try again.')
        return
      }
      onUpdated()
      onClose()
    } catch {
      setError('Could not open dispute. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="invoice-dispute-modal-overlay"
      onClick={() => !busy && onClose()}
      role="presentation"
    >
      <div
        className="invoice-dispute-modal confirm-payment-receipt-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="confirm-payment-modal-title"
      >
        <div className="invoice-dispute-modal-header">
          <h3
            id="confirm-payment-modal-title"
            className="text-base font-semibold"
            style={{ color: c.primary }}
          >
            Confirm payment
          </h3>
          <button
            type="button"
            onClick={() => !busy && onClose()}
            className="p-1.5 rounded-lg transition-colors"
            style={{ color: c.secondary }}
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="invoice-dispute-modal-body space-y-4">
          <p className="text-sm" style={{ color: c.secondary }}>
            Credyx posted this payment. Confirm when the funds arrive in your account, or dispute if
            something looks wrong.
          </p>

          <dl className="confirm-payment-receipt-modal__grid">
            <div>
              <dt>Invoice</dt>
              <dd>#{payment.invoice_number}</dd>
            </div>
            <div>
              <dt>Amount</dt>
              <dd className="tabular-nums">{formatCurrency(payment.amount)}</dd>
            </div>
            <div>
              <dt>Broker</dt>
              <dd title={payment.broker_name}>{payment.broker_name || '—'}</dd>
            </div>
            <div>
              <dt>Method</dt>
              <dd>{methodLabel}</dd>
            </div>
            <div>
              <dt>Posted</dt>
              <dd className="tabular-nums">
                {formatDate(payment.received_date || payment.payment_date)}
              </dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{PAYMENT_STATUS_LABELS[payment.status] || payment.status}</dd>
            </div>
            {payment.payment_reference ? (
              <div className="confirm-payment-receipt-modal__span">
                <dt>Reference</dt>
                <dd className="tabular-nums">{payment.payment_reference}</dd>
              </div>
            ) : null}
            {payment.load_number ? (
              <div>
                <dt>Load</dt>
                <dd className="tabular-nums">{payment.load_number}</dd>
              </div>
            ) : null}
          </dl>

          <p
            className="text-xs font-semibold"
            style={{ color: overdue ? c.error : c.warning }}
          >
            {overdue
              ? 'Confirmation overdue — will auto-confirm soon'
              : daysLeft != null
                ? `${daysLeft} day${daysLeft !== 1 ? 's' : ''} until auto-confirm payment`
                : 'Awaiting your confirmation'}
          </p>

          {showDispute ? (
            <div className="space-y-3">
              <label className="client-label" htmlFor="confirm-pay-dispute-reason">
                Dispute reason
              </label>
              <select
                id="confirm-pay-dispute-reason"
                className="client-input w-full"
                value={disputeReason}
                onChange={(e) => setDisputeReason(e.target.value)}
                disabled={busy}
                style={{ backgroundColor: c.card }}
              >
                {PAYMENT_RECEIPT_DISPUTE_REASONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <label className="client-label" htmlFor="confirm-pay-dispute-desc">
                Details
              </label>
              <textarea
                id="confirm-pay-dispute-desc"
                className="client-input w-full"
                rows={3}
                value={disputeDescription}
                onChange={(e) => setDisputeDescription(e.target.value)}
                disabled={busy}
                placeholder="What happened with this payment?"
                style={{ backgroundColor: c.card, resize: 'vertical' }}
              />
            </div>
          ) : null}

          {error ? (
            <p className="text-sm" style={{ color: c.error }} role="alert">
              {error}
            </p>
          ) : null}
        </div>

        <div className="invoice-dispute-modal-footer">
          {showDispute ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setShowDispute(false)
                  setError(null)
                }}
                disabled={busy}
                className="dashboard-btn-secondary"
                style={{ height: 40, fontSize: 13 }}
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => void handleDispute()}
                disabled={busy}
                className="dashboard-btn-secondary inline-flex items-center gap-1.5"
                style={{ height: 40, fontSize: 13, color: c.error, borderColor: c.error }}
              >
                {busy ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <AlertTriangle className="w-4 h-4" />
                )}
                {busy ? 'Submitting…' : 'Submit dispute'}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setShowDispute(true)}
                disabled={busy}
                className="dashboard-btn-secondary inline-flex items-center gap-1.5"
                style={{ height: 40, fontSize: 13, color: c.error, borderColor: c.error }}
              >
                <AlertTriangle className="w-4 h-4" />
                Dispute
              </button>
              <button
                type="button"
                onClick={() => void handleConfirm()}
                disabled={busy}
                className="confirm-payment-receipt-modal__confirm-btn inline-flex items-center gap-1.5"
              >
                {busy ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle className="w-4 h-4" />
                )}
                {busy ? 'Confirming…' : 'Confirm received'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
