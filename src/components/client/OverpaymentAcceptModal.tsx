import { useState } from 'react'
import { X, CircleCheck } from 'lucide-react'
import { formatCurrency } from '../../utils/format'
import { useClientTheme } from '../../theme/ThemeContext'

interface OverpaymentAcceptModalProps {
  isOpen: boolean
  invoiceNumber: string
  invoiceAmount: number
  receivedAmount: number
  overageAmount: number
  onClose: () => void
  onConfirm: (note: string) => Promise<void>
}

/** Confirm accepting excess payment above the invoiced load amount. */
export default function OverpaymentAcceptModal({
  isOpen,
  invoiceNumber,
  invoiceAmount,
  receivedAmount,
  overageAmount,
  onClose,
  onConfirm,
}: OverpaymentAcceptModalProps) {
  const c = useClientTheme()
  const [note, setNote] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!isOpen) return null

  const handleSubmit = async () => {
    if (!note.trim()) {
      setError('A note is required — e.g. detention paid, fuel surcharge, or broker correction.')
      return
    }
    setIsSubmitting(true)
    setError(null)
    try {
      await onConfirm(note.trim())
      setNote('')
      onClose()
    } catch {
      setError('Could not accept this overpayment. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="invoice-dispute-modal-overlay" onClick={onClose} role="presentation">
      <div
        className="invoice-dispute-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="over-accept-title"
      >
        <div className="invoice-dispute-modal-header">
          <div>
            <h3 id="over-accept-title" className="text-base font-semibold" style={{ color: c.primary }}>
              Accept overpayment
            </h3>
            <p className="text-xs mt-0.5" style={{ color: c.secondary }}>
              {invoiceNumber}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
            style={{ color: c.secondary }}
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="invoice-dispute-modal-body space-y-3">
          <p className="text-sm" style={{ color: c.secondary }}>
            The broker paid more than the invoiced load amount. Accepting records the excess for
            your books and closes this variance.
          </p>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg px-2 py-2" style={{ backgroundColor: c.stat.slate }}>
              <p className="text-[10px] uppercase tracking-wide" style={{ color: c.mutedLight }}>
                Invoiced
              </p>
              <p className="text-sm font-bold tabular-nums" style={{ color: c.primary }}>
                {formatCurrency(invoiceAmount)}
              </p>
            </div>
            <div className="rounded-lg px-2 py-2" style={{ backgroundColor: c.stat.green }}>
              <p className="text-[10px] uppercase tracking-wide" style={{ color: c.mutedLight }}>
                Received
              </p>
              <p className="text-sm font-bold tabular-nums" style={{ color: c.success }}>
                {formatCurrency(receivedAmount)}
              </p>
            </div>
            <div className="rounded-lg px-2 py-2" style={{ backgroundColor: c.stat.blue }}>
              <p className="text-[10px] uppercase tracking-wide" style={{ color: c.mutedLight }}>
                Excess
              </p>
              <p className="text-sm font-bold tabular-nums" style={{ color: c.info }}>
                {formatCurrency(overageAmount)}
              </p>
            </div>
          </div>
          <label className="client-label" htmlFor="over-accept-note">
            Note (required)
          </label>
          <textarea
            id="over-accept-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Broker included detention pay not on original invoice."
            rows={4}
            className="client-input w-full"
          />
          {error && (
            <p className="text-sm" style={{ color: c.error }}>
              {error}
            </p>
          )}
        </div>

        <div className="invoice-dispute-modal-footer">
          <button
            type="button"
            onClick={onClose}
            className="dashboard-btn-secondary"
            style={{ height: 36, fontSize: 13 }}
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting || !note.trim()}
            className="dashboard-btn-primary"
            style={{ height: 36, fontSize: 13 }}
          >
            <CircleCheck className="w-3.5 h-3.5" />
            {isSubmitting ? 'Saving...' : 'Accept overpayment'}
          </button>
        </div>
      </div>
    </div>
  )
}
