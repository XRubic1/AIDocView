import { Loader2 } from 'lucide-react'
import { DocumentReviewResult } from '../../../types/documentReview'
import { InvoiceReviewJob } from '../../../types/invoiceReviewJob'
import { PerInvoiceTone } from '../../../utils/perInvoiceStatus'
import { getLoadDocIcons } from '../../../utils/loadDocIcons'

interface InvoiceReviewCardProps {
  displayId: string
  broker?: string
  destination?: string
  badge: { label: string; tone: PerInvoiceTone | 'reviewing' }
  job?: InvoiceReviewJob
  reviewedDoc?: DocumentReviewResult
  selected?: boolean
  canOpen?: boolean
  onOpen?: () => void
}

function toneToVerdict(tone: PerInvoiceTone | 'reviewing'): 'ok' | 'warn' | 'err' {
  if (tone === 'verified') return 'ok'
  if (tone === 'rejected') return 'err'
  return 'warn'
}

function toneToShort(tone: PerInvoiceTone | 'reviewing'): string {
  if (tone === 'verified') return 'OK'
  if (tone === 'rejected') return 'NO'
  if (tone === 'review') return 'REV'
  if (tone === 'reviewing') return '…'
  return '—'
}

/** Compact load row — one click to open summary. */
export default function InvoiceReviewCard({
  displayId,
  broker,
  destination,
  badge,
  job,
  reviewedDoc,
  selected,
  canOpen,
  onOpen,
}: InvoiceReviewCardProps) {
  const verdictClass = toneToVerdict(badge.tone)
  const verdictShort = toneToShort(badge.tone)
  const docIcons = getLoadDocIcons(reviewedDoc)
  const sub = [broker, destination].filter(Boolean).join(' · ')
  const isReviewing = job?.status === 'reviewing' || badge.tone === 'reviewing'

  return (
    <button
      type="button"
      className={`engine-load-item compact ${selected ? 'selected' : ''}`}
      onClick={canOpen ? onOpen : undefined}
      disabled={!canOpen}
      aria-pressed={selected}
      title={sub || displayId}
    >
      <div className="engine-load-row-compact">
        <span className="engine-load-id">{displayId}</span>
        {isReviewing ? (
          <Loader2 className="w-3 h-3 animate-spin flex-shrink-0" style={{ color: '#d4f53c' }} />
        ) : (
          <span className={`engine-load-status-dot ${verdictClass}`} aria-hidden />
        )}
        {reviewedDoc && (
          <span className="engine-load-doc-icons">
            {docIcons.map(({ code, present }) => (
              <span
                key={code}
                className={`engine-load-doc-icon ${present ? 'present' : 'missing'}`}
              >
                {code}
              </span>
            ))}
          </span>
        )}
        <span className={`engine-load-verdict mini ${verdictClass}`}>{verdictShort}</span>
      </div>
      {sub ? <div className="engine-load-sub">{sub}</div> : null}
    </button>
  )
}
