import { useState } from 'react'
import { ChevronDown, ChevronUp, Ban, CircleCheck } from 'lucide-react'
import type { Payment } from '../../types/payment'
import { formatCurrency } from '../../utils/format'
import {
  acceptClientOverpayment,
  closeClientInvoiceAsUncollectable,
} from '../../services/clientInvoiceActions'
import {
  canAcceptOverpayment,
} from '../../utils/overPayments'
import { getOverageAmount } from '../../utils/paymentVariance'
import {
  canCloseShortPaymentAsUncollectable,
  getInvoiceReceivedAmount,
  getShortfallAmount,
  isShortPaymentInvoice,
} from '../../utils/shortPayments'
import type { PostPaymentResult } from '../../services/clientPaymentService'
import { useClientTheme } from '../../theme/ThemeContext'

interface PaymentVarianceResolutionProps {
  result: PostPaymentResult
  payments: Payment[]
  authorName: string
  onResolved: () => void
  onDismiss: () => void
}

/** Inline short/over resolution after a payment post — optional, same screen. */
export default function PaymentVarianceResolution({
  result,
  payments,
  authorName,
  onResolved,
  onDismiss,
}: PaymentVarianceResolutionProps) {
  const c = useClientTheme()
  const [expanded, setExpanded] = useState(true)
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const invoice = result.invoice
  const received = getInvoiceReceivedAmount(invoice, payments)

  if (result.variance === 'full') return null

  const isShort = result.variance === 'short'
  const canResolveShort =
    isShort && isShortPaymentInvoice(invoice, payments) && canCloseShortPaymentAsUncollectable(invoice)
  const canResolveOver = !isShort && canAcceptOverpayment(invoice, payments)

  const handleResolve = async () => {
    if (!note.trim()) {
      setError('A note is required.')
      return
    }
    setIsSubmitting(true)
    setError(null)
    try {
      const updated = isShort
        ? closeClientInvoiceAsUncollectable(invoice.id, authorName, { note: note.trim() }, payments)
        : acceptClientOverpayment(invoice.id, authorName, { note: note.trim() }, payments)
      if (!updated) {
        setError('Could not resolve this variance. Try again or handle it from Pay variances.')
        return
      }
      setNote('')
      onResolved()
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const varianceAmount = isShort
    ? getShortfallAmount(invoice, received)
    : getOverageAmount(invoice, received)

  return (
    <div
      className="payment-variance-resolution"
      style={{ borderColor: c.border, backgroundColor: isShort ? c.stat.amber : c.stat.red }}
    >
      <button
        type="button"
        className="payment-variance-resolution__toggle"
        onClick={() => setExpanded((open) => !open)}
        aria-expanded={expanded}
      >
        <span className="text-sm font-semibold" style={{ color: c.primary }}>
          {isShort ? 'Short payment — resolve now?' : 'Overpayment — accept excess now?'}
        </span>
        <span className="text-xs financial-nums" style={{ color: c.secondary }}>
          {formatCurrency(varianceAmount)} {isShort ? 'outstanding' : 'excess'}
        </span>
        {expanded ? (
          <ChevronUp className="w-4 h-4 shrink-0" style={{ color: c.muted }} />
        ) : (
          <ChevronDown className="w-4 h-4 shrink-0" style={{ color: c.muted }} />
        )}
      </button>

      {expanded && (
        <div className="payment-variance-resolution__body">
          <p className="text-xs" style={{ color: c.secondary }}>
            {isShort
              ? `Invoice ${invoice.invoice_number} received ${formatCurrency(received)} of ${formatCurrency(invoice.amount)}. Writing off marks the remaining balance as uncollectable. You can also dismiss and handle this later in Pay variances.`
              : `Broker paid ${formatCurrency(received)} on a ${formatCurrency(invoice.amount)} invoice. Accept the excess or dismiss to review later.`}
          </p>

          {(canResolveShort || canResolveOver) && (
            <>
              <label className="client-label" htmlFor="variance-resolution-note">
                Resolution note
              </label>
              <textarea
                id="variance-resolution-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                className="client-input w-full text-sm"
                placeholder={
                  isShort
                    ? 'Why is this remaining balance uncollectable?'
                    : 'Detention, fuel surcharge, broker correction…'
                }
              />
              {error && (
                <p className="text-xs" style={{ color: c.error }}>
                  {error}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleResolve}
                  disabled={isSubmitting}
                  className="dashboard-btn-primary dashboard-btn-compact"
                >
                  {isShort ? (
                    <>
                      <Ban className="w-3.5 h-3.5" />
                      Write off as uncollectable
                    </>
                  ) : (
                    <>
                      <CircleCheck className="w-3.5 h-3.5" />
                      Accept overpayment
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={onDismiss}
                  className="dashboard-btn-secondary dashboard-btn-compact"
                  disabled={isSubmitting}
                >
                  Handle later
                </button>
              </div>
            </>
          )}

          {!canResolveShort && !canResolveOver && (
            <button
              type="button"
              onClick={onDismiss}
              className="dashboard-btn-secondary dashboard-btn-compact"
            >
              Dismiss
            </button>
          )}
        </div>
      )}
    </div>
  )
}
