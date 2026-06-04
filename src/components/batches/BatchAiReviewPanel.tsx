import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { isAIReviewEnabled } from '../../config/aiReview'
import {
  runBatchAiReview,
  type BatchAiReviewProgress,
  type InvoiceAiReviewOutcome,
} from '../../services/credyx/batchAiReviewService'
import { getInvoiceById, getInvoicesByBatchId } from '../../data/mockInvoices'
import type { Invoice } from '../../types/invoice'
import InvoiceAiReviewDetailModal from './InvoiceAiReviewDetailModal'

interface BatchAiReviewPanelProps {
  batchId: string
  onComplete?: () => void
}

/** Admin: run AIDocView review on every invoice in a batch. */
export default function BatchAiReviewPanel({ batchId, onComplete }: BatchAiReviewPanelProps) {
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<BatchAiReviewProgress | null>(null)
  const [outcomes, setOutcomes] = useState<InvoiceAiReviewOutcome[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [detailInvoice, setDetailInvoice] = useState<Invoice | null>(null)

  const invoices = getInvoicesByBatchId(batchId)

  const handleReview = async () => {
    setRunning(true)
    setError(null)
    setOutcomes(null)
    try {
      const results = await runBatchAiReview(batchId, setProgress)
      setOutcomes(results)
      onComplete?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI review failed')
    } finally {
      setRunning(false)
      setProgress(null)
    }
  }

  if (!isAIReviewEnabled()) {
    return (
      <p className="text-xs" style={{ color: '#819291' }}>
        Configure VITE_OPENAI_API_KEY to enable AI review.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        disabled={running || invoices.length === 0}
        onClick={handleReview}
        className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-white transition-colors"
        style={{
          backgroundColor: running ? '#cccccc' : '#113543',
          cursor: running || invoices.length === 0 ? 'not-allowed' : 'pointer',
        }}
      >
        <Sparkles className="w-4 h-4" />
        <span>{running ? 'AI Review running…' : 'AI Review batch'}</span>
      </button>
      {progress && running && (
        <p className="text-xs" style={{ color: '#819291' }}>
          {progress.currentInvoiceNumber
            ? `Reviewing ${progress.currentInvoiceNumber} (${progress.completed + 1}/${progress.total})`
            : `Progress ${progress.completed}/${progress.total}`}
        </p>
      )}
      {error && (
        <p className="text-xs" style={{ color: '#b91c1c' }}>
          {error}
        </p>
      )}
      {outcomes && outcomes.length > 0 && (
        <div className="border rounded p-2 text-xs max-h-48 overflow-y-auto" style={{ borderColor: '#819291' }}>
          {outcomes.map((o) => (
            <button
              key={o.invoiceId}
              type="button"
              className="w-full flex justify-between gap-2 py-1 px-1 border-b last:border-0 text-left rounded hover:bg-gray-50"
              style={{ borderColor: '#eee' }}
              onClick={() => {
                const inv = getInvoiceById(o.invoiceId)
                if (inv) setDetailInvoice(inv)
              }}
            >
              <span className="underline" style={{ color: '#113543' }}>
                {o.invoiceNumber}
              </span>
              <span
                className="shrink-0 px-1.5 py-0.5 rounded font-medium"
                style={{
                  backgroundColor: o.status === 'ready' ? '#3ddb7a' : '#C2A558',
                  color: '#fff',
                }}
              >
                {o.status === 'ready' ? 'Good to go' : 'Needs work'}
              </span>
            </button>
          ))}
        </div>
      )}

      {detailInvoice && (
        <InvoiceAiReviewDetailModal invoice={detailInvoice} onClose={() => setDetailInvoice(null)} />
      )}
    </div>
  )
}

function badgeForStatus(status?: string) {
  if (status === 'ready') {
    return { label: 'Good to go', bg: '#3ddb7a' }
  }
  if (status === 'needs_work') {
    return { label: 'Needs work', bg: '#C2A558' }
  }
  if (status === 'running') {
    return { label: 'Reviewing…', bg: '#819291' }
  }
  return { label: 'Not run', bg: '#cccccc' }
}

/** Clickable badge — opens AI review detail modal (AIDocView-style checks). */
export function InvoiceAiReviewBadge({
  invoice,
  status,
}: {
  invoice: Invoice
  status?: string
}) {
  const [open, setOpen] = useState(false)
  const b = badgeForStatus(status)
  const clickable = status === 'ready' || status === 'needs_work'

  if (!clickable) {
    return (
      <span
        className="inline-flex px-2 py-0.5 text-xs font-medium rounded"
        style={{ backgroundColor: b.bg, color: '#fff' }}
      >
        {b.label}
      </span>
    )
  }

  return (
    <>
      <button
        type="button"
        className="inline-flex px-2 py-0.5 text-xs font-medium rounded underline-offset-2 hover:underline cursor-pointer"
        style={{ backgroundColor: b.bg, color: '#fff' }}
        title="View AI review details"
        onClick={(e) => {
          e.stopPropagation()
          setOpen(true)
        }}
      >
        {b.label}
      </button>
      {open && (
        <InvoiceAiReviewDetailModal
          invoice={getInvoiceById(invoice.id) ?? invoice}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}
