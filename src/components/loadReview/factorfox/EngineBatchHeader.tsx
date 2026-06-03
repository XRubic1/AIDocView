import { Loader2 } from 'lucide-react'
import { BatchDocumentReviewResult } from '../../../types/documentReview'
import { summarizeBatchStatuses } from '../../../utils/perInvoiceStatus'

interface EngineBatchHeaderProps {
  result?: BatchDocumentReviewResult | null
  isReviewing?: boolean
  completedInvoices?: number
  totalInvoices?: number
  fileNames?: string[]
}

/** Compact batch line + status chips (center rail). */
export default function EngineBatchHeader({
  result,
  isReviewing,
  completedInvoices = 0,
  totalInvoices = 0,
  fileNames = [],
}: EngineBatchHeaderProps) {
  const summary = result?.auditSummary
  const rollup =
    result && fileNames.length > 0 ? summarizeBatchStatuses(result, fileNames) : null

  let batchLine = 'Upload PDFs to start'
  if (isReviewing) {
    batchLine =
      totalInvoices > 0
        ? `${completedInvoices}/${totalInvoices} reviewing…`
        : 'Reviewing…'
  } else if (summary?.loadNumber) {
    const load = summary.loadNumber
    if (typeof load === 'string' && load.includes('loads')) {
      batchLine = load
    } else {
      const parts = [load]
      if (summary.broker) parts.push(summary.broker)
      if (summary.amount != null) parts.push(`$${summary.amount.toLocaleString()}`)
      batchLine = parts.join(' · ')
    }
  } else if (fileNames.length > 0) {
    batchLine = `${fileNames.length} load${fileNames.length === 1 ? '' : 's'} queued`
  }

  const reviewCount = rollup?.reviewCount ?? 0
  const rejectedCount = rollup?.rejectedCount ?? 0
  const verifiedCount = rollup?.verifiedCount ?? 0
  const allOk = reviewCount === 0 && rejectedCount === 0 && verifiedCount > 0

  return (
    <div className="engine-center-header compact">
      <div className="engine-batch-row">
        {isReviewing ? (
          <Loader2 className="w-3 h-3 animate-spin flex-shrink-0" style={{ color: '#d4f53c' }} />
        ) : null}
        <span className="engine-batch-info compact">{batchLine}</span>
        {(rollup || result) && !isReviewing && (
          <span className="engine-batch-meta inline">
            {reviewCount > 0 && <span className="engine-batch-pill warn">{reviewCount} review</span>}
            {rejectedCount > 0 && (
              <span className="engine-batch-pill warn">{rejectedCount} rej</span>
            )}
            {verifiedCount > 0 && (
              <span className="engine-batch-pill ok">{verifiedCount} ok</span>
            )}
            {allOk && <span className="engine-batch-pill ok">all ok</span>}
          </span>
        )}
      </div>
    </div>
  )
}
