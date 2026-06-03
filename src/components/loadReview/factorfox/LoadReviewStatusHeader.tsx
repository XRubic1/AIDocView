import { CheckCircle2, AlertCircle, XCircle, Loader2 } from 'lucide-react'
import { BatchDocumentReviewResult } from '../../../types/documentReview'
import {
  getBatchLevelRejectionReasons,
  summarizeBatchStatuses,
} from '../../../utils/perInvoiceStatus'
import { ff } from './factorFoxTheme'

interface LoadReviewStatusHeaderProps {
  result?: BatchDocumentReviewResult | null
  isReviewing?: boolean
  totalInvoices?: number
  completedInvoices?: number
  /** Uploaded PDF names for per-file status rollup. */
  fileNames?: string[]
  /** Narrow sidebar: smaller type, hide per-load rejection list. */
  compact?: boolean
}

export default function LoadReviewStatusHeader({
  result,
  isReviewing,
  totalInvoices = 0,
  completedInvoices = 0,
  fileNames = [],
  compact = false,
}: LoadReviewStatusHeaderProps) {
  const titleClass = compact ? 'text-sm font-bold' : 'text-2xl font-bold'

  if (isReviewing) {
    const progressLabel =
      totalInvoices > 0
        ? `${completedInvoices} of ${totalInvoices} reviewed`
        : 'AI extracting'
    return (
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className={`${titleClass} tracking-tight uppercase`} style={{ color: ff.text, fontFamily: ff.fontDisplay }}>
          Reviewing
        </h1>
        <span
          className="inline-flex items-center gap-1.5 text-[10px] font-medium px-2 py-1 rounded-full"
          style={{ backgroundColor: ff.blueLight, color: ff.blue, fontFamily: ff.fontMono }}
        >
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          {progressLabel}
        </span>
      </div>
    )
  }

  const summary = result?.auditSummary
  const rollup =
    result && fileNames.length > 0
      ? summarizeBatchStatuses(result, fileNames)
      : null
  const batchLevelReasons =
    result && fileNames.length > 0
      ? getBatchLevelRejectionReasons(result, fileNames)
      : []

  const pill = (() => {
    if (rollup) {
      if (rollup.rejectedCount === 0 && rollup.reviewCount === 0) {
        return { label: 'All clear', bg: ff.greenLight, color: ff.green, Icon: CheckCircle2 }
      }
      if (rollup.rejectedCount > 0) {
        return {
          label:
            rollup.rejectedCount === 1
              ? '1 rejected'
              : `${rollup.rejectedCount} rejected`,
          bg: ff.redLight,
          color: ff.red,
          Icon: XCircle,
        }
      }
      return {
        label: `${rollup.reviewCount} need review`,
        bg: ff.amberLight,
        color: ff.amber,
        Icon: AlertCircle,
      }
    }
    const status =
      result?.auditSummary?.overallStatus ?? result?.crossValidation?.overall ?? 'NEEDS_REVIEW'
    if (status === 'APPROVED') {
      return { label: 'All clear', bg: ff.greenLight, color: ff.green, Icon: CheckCircle2 }
    }
    if (status === 'REJECTED') {
      return { label: 'Rejected', bg: ff.redLight, color: ff.red, Icon: XCircle }
    }
    return { label: 'Needs review', bg: ff.amberLight, color: ff.amber, Icon: AlertCircle }
  })()

  const PillIcon = pill.Icon

  return (
    <div className={compact ? 'space-y-2' : 'space-y-3'}>
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <h1 className={`${titleClass} tracking-tight uppercase`} style={{ color: ff.text, fontFamily: ff.fontDisplay }}>
            {result ? (compact ? 'Batch' : 'Risk verification') : compact ? 'Loads' : 'Pending invoices'}
          </h1>
          {summary && (
            <p className="text-sm mt-1" style={{ color: ff.textMuted }}>
              {typeof summary.loadNumber === 'string' && summary.loadNumber.includes('loads') ? (
                <span className="font-semibold" style={{ color: ff.text }}>
                  {summary.loadNumber}
                </span>
              ) : (
                <>
                  Load{' '}
                  <span className="font-semibold" style={{ color: ff.text }}>
                    {summary.loadNumber}
                  </span>
                  {summary.broker ? ` · ${summary.broker}` : ''}
                  {summary.amount != null ? ` · $${summary.amount.toLocaleString()}` : ''}
                </>
              )}
            </p>
          )}
          {rollup && fileNames.length > 1 && (
            <p className="text-xs mt-1" style={{ color: ff.textMuted }}>
              {rollup.verifiedCount} verified
              {rollup.rejectedCount > 0 ? ` · ${rollup.rejectedCount} rejected` : ''}
              {rollup.reviewCount > 0 ? ` · ${rollup.reviewCount} need review` : ''}
            </p>
          )}
        </div>
        {result && (
          <span
            className={`inline-flex items-center gap-1.5 font-semibold rounded-full ${compact ? 'text-[10px] px-2 py-0.5' : 'text-sm px-4 py-2'}`}
            style={{ backgroundColor: pill.bg, color: pill.color, fontFamily: compact ? ff.fontMono : undefined }}
          >
            <PillIcon className={compact ? 'w-3 h-3' : 'w-4 h-4'} />
            {pill.label}
          </span>
        )}
      </div>

      {!compact &&
        rollup &&
        (rollup.rejected.length > 0 || batchLevelReasons.length > 0) && (
        <div
          className="rounded-lg border px-3 py-2.5 space-y-2"
          style={{ backgroundColor: ff.redLight, borderColor: ff.redBorder }}
        >
          <p className="text-xs font-bold uppercase tracking-wide" style={{ color: ff.red }}>
            Why rejected
          </p>
          <ul className="space-y-1.5">
            {rollup.rejected.map((item) => {
              const invId =
                result?.multiInvoice?.verifications.find((v) => v.unit.fileName === item.fileName)
                  ?.unit.invoice.invoice_number ??
                item.fileName.replace(/\.pdf$/i, '')
              return (
                <li key={item.fileName} className="text-xs space-y-1" style={{ color: ff.text }}>
                  <div>
                    <span className="font-semibold">{invId}</span>
                    <span style={{ color: ff.textMuted }}> ({item.fileName})</span>
                  </div>
                  <ul className="list-disc pl-4 space-y-0.5" style={{ color: ff.textMuted }}>
                    {(item.reasons.length > 0 ? item.reasons : ['This load did not pass verification.']).map(
                      (reason, i) => (
                        <li key={i}>{reason}</li>
                      )
                    )}
                  </ul>
                </li>
              )
            })}
            {batchLevelReasons.map((reason, i) => (
              <li key={`batch-${i}`} className="text-xs" style={{ color: ff.textMuted }}>
                {reason}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
