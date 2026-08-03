import { useState } from 'react'
import { X, Ban } from 'lucide-react'
import { formatCurrency } from '../../utils/format'
import { useClientTheme } from '../../theme/ThemeContext'

interface ShortPaymentCloseModalProps {
  isOpen: boolean
  invoiceNumber: string
  invoiceAmount: number
  receivedAmount: number
  shortfallAmount: number
  onClose: () => void
  onConfirm: (note: string) => Promise<void>
}

/** Confirm writing off the remaining balance on a short-paid invoice. */
export default function ShortPaymentCloseModal({
  isOpen,
  invoiceNumber,
  invoiceAmount,
  receivedAmount,
  shortfallAmount,
  onClose,
  onConfirm,
}: ShortPaymentCloseModalProps) {
  const c = useClientTheme()
  const [note, setNote] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!isOpen) return null

  const handleSubmit = async () => {
    if (!note.trim()) {
      setError('A note is required explaining why this balance is uncollectable.')
      return
    }
    setIsSubmitting(true)
    setError(null)
    try {
      await onConfirm(note.trim())
      setNote('')
      onClose()
    } catch {
      setError('Could not close this invoice. Please try again.')
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
        aria-labelledby="short-close-title"
      >
        <div className="invoice-dispute-modal-header">
          <div>
            <h3 id="short-close-title" className="text-base font-semibold" style={{ color: c.primary }}>
              Close as uncollectable
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
            This marks the remaining balance as uncollectable and sends a write-off request to Credyx
            for approval. You will not continue chasing this amount.
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
            <div className="rounded-lg px-2 py-2" style={{ backgroundColor: c.stat.red }}>
              <p className="text-[10px] uppercase tracking-wide" style={{ color: c.mutedLight }}>
                Write-off
              </p>
              <p className="text-sm font-bold tabular-nums" style={{ color: c.error }}>
                {formatCurrency(shortfallAmount)}
              </p>
            </div>
          </div>
          <label className="client-label" htmlFor="short-close-note">
            Note (required)
          </label>
          <textarea
            id="short-close-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Broker refused to pay detention — accepting short pay."
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
            <Ban className="w-3.5 h-3.5" />
            {isSubmitting ? 'Closing...' : 'Mark uncollectable'}
          </button>
        </div>
      </div>
    </div>
  )
}
