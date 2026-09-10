import { useState } from 'react'
import { Check, X } from 'lucide-react'
import type { Invoice } from '../../types/invoice'
import { useClientTheme } from '../../theme/ThemeContext'
import {
  acceptHoldPaperwork,
  rejectHoldPaperwork,
} from '../../services/holdPaperworkReview'
import { invoiceHasPendingHoldPaperworkReview } from '../../utils/holdPaperworkReview'

type HoldPaperworkReviewBannerProps = {
  invoice: Invoice
  reviewedBy: string
  onDone: () => void
}

/**
 * Credyx accept / reject for carrier docs uploaded on an invoice.
 */
export default function HoldPaperworkReviewBanner({
  invoice,
  reviewedBy,
  onDone,
}: HoldPaperworkReviewBannerProps) {
  const c = useClientTheme()
  const [rejectOpen, setRejectOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!invoiceHasPendingHoldPaperworkReview(invoice)) return null

  const handleAccept = async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const result = await acceptHoldPaperwork(invoice.id, reviewedBy)
      if (result.packetError) {
        setError(`Documents accepted. Packet not sent: ${result.packetError}`)
      }
      onDone()
    } catch (err) {
      console.error('Failed to accept hold documents:', err)
      setError('Could not accept documents. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  const handleReject = () => {
    if (busy || !reason.trim()) return
    setBusy(true)
    setError(null)
    try {
      rejectHoldPaperwork(invoice.id, reason.trim(), reviewedBy)
      setRejectOpen(false)
      setReason('')
      onDone()
    } catch (err) {
      console.error('Failed to reject hold documents:', err)
      setError('Could not reject documents. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="shrink-0 border-b px-4 py-3 space-y-2"
      style={{ borderColor: c.border, backgroundColor: c.stat.amber }}
    >
      <p className="text-sm font-semibold" style={{ color: c.primary }}>
        Carrier uploaded paperwork
      </p>
      <p className="text-xs leading-snug" style={{ color: c.secondary }}>
        Confirm to {invoice.status === 'hold' ? 'release the hold and send' : 'send'} the packet
        to the broker, or reject and tell the carrier why.
      </p>
      {error ? (
        <p className="text-xs" style={{ color: c.error }}>
          {error}
        </p>
      ) : null}
      {rejectOpen ? (
        <div className="space-y-2">
          <textarea
            className="client-input w-full text-sm"
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason for the carrier (required)"
            disabled={busy}
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="dashboard-btn-secondary !py-1.5 !px-3 !text-xs inline-flex items-center gap-1"
              style={{ color: c.error, borderColor: c.error }}
              disabled={busy || !reason.trim()}
              onClick={handleReject}
            >
              <X className="w-3.5 h-3.5" />
              Reject and notify carrier
            </button>
            <button
              type="button"
              className="dashboard-btn-secondary !py-1.5 !px-3 !text-xs"
              disabled={busy}
              onClick={() => setRejectOpen(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="dashboard-btn-primary !py-1.5 !px-3 !text-xs inline-flex items-center gap-1"
            disabled={busy}
            onClick={() => void handleAccept()}
          >
            <Check className="w-3.5 h-3.5" />
            {busy ? 'Working…' : 'Accept and send packet'}
          </button>
          <button
            type="button"
            className="dashboard-btn-secondary !py-1.5 !px-3 !text-xs inline-flex items-center gap-1"
            disabled={busy}
            onClick={() => setRejectOpen(true)}
          >
            <X className="w-3.5 h-3.5" />
            Reject
          </button>
        </div>
      )}
    </div>
  )
}
