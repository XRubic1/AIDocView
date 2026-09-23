import { useState } from 'react'
import { Check, X, AlertTriangle } from 'lucide-react'
import type { Invoice } from '../../types/invoice'
import type { InvoiceAiReviewSnapshot } from '../../types/invoiceAiReview'
import type { LoadCheckRow } from '../../utils/loadReviewSummary'
import { isResolvablePacketCheck } from '../../utils/packetOnFileReview'
import InvoiceAiReviewDetailModal from './InvoiceAiReviewDetailModal'

interface InvoiceAiReviewOutcomePanelProps {
  invoice: Invoice
  snapshot: InvoiceAiReviewSnapshot | null
  summary?: string
  canResolve?: boolean
  onResolve?: () => void
}

function checkPassed(row: LoadCheckRow): boolean {
  return row.status === 'ok'
}

/** Compact label for failed resolvable rows: value · on file … */
function resolvableCheckLabel(row: LoadCheckRow): string {
  const paper = row.documentValue?.trim()
  const onFile = row.excelValue?.trim() || '—'
  if (paper) return `${row.label} ${paper} · on file ${onFile}`
  if (onFile !== '—') return `${row.label} · on file ${onFile}`
  return row.label
}

/**
 * Compact 7-check AI list under packet info, with a details modal for the full write-up.
 */
export default function InvoiceAiReviewOutcomePanel({
  invoice,
  snapshot,
  summary,
  canResolve = false,
  onResolve,
}: InvoiceAiReviewOutcomePanelProps) {
  const [detailsOpen, setDetailsOpen] = useState(false)
  const checks = snapshot?.requiredAll ?? []
  const passCount = snapshot?.passCount ?? checks.filter(checkPassed).length
  const total = snapshot?.requiredTotal || checks.length

  return (
    <section className="client-ai-verify__outcome">
      <div className="client-ai-verify__outcome-head">
        <h4 className="client-ai-verify__outcome-title">AI review outcome</h4>
        {snapshot && (
          <div className="client-ai-verify__outcome-tools">
            {canResolve && onResolve && (
              <button type="button" className="client-ai-verify__mini-btn" onClick={onResolve}>
                Resolve issues
              </button>
            )}
            <button
              type="button"
              className="client-ai-verify__mini-btn"
              onClick={() => setDetailsOpen(true)}
            >
              Details
            </button>
          </div>
        )}
      </div>

      {!snapshot ? (
        <p className="client-ai-verify__outcome-empty">
          {summary || 'Reviewing this packet. Checks appear here when AI finishes.'}
        </p>
      ) : (
        <>
          <p className="client-ai-verify__outcome-headline">
            {passCount}/{total || 7} checks passed
          </p>
          <ul className="client-ai-verify__checks">
            {checks.map((row, index) => {
              // Defensive: legacy snapshots may still hand us a string until rebuild lands.
              const normalized =
                typeof row === 'string'
                  ? {
                      id: `legacy_${index}`,
                      label: row,
                      status: 'ok' as const,
                      summary: row,
                    }
                  : row
              const ok = checkPassed(normalized)
              const resolvable = isResolvablePacketCheck(normalized)
              const label = resolvable ? resolvableCheckLabel(normalized) : normalized.label
              return (
                <li
                  key={normalized.id || `check-${index}`}
                  className={`client-ai-verify__check${
                    ok ? ' is-ok' : resolvable ? ' is-warn' : ' is-fail'
                  }`}
                  title={resolvable ? normalized.detail || normalized.summary : normalized.summary || undefined}
                >
                  {ok ? (
                    <Check className="w-3 h-3 shrink-0" />
                  ) : resolvable ? (
                    <span className="client-ai-verify__broker-warn" aria-hidden>
                      !
                    </span>
                  ) : (
                    <X className="w-3 h-3 shrink-0" />
                  )}
                  <span className="client-ai-verify__check-label">{label}</span>
                  {!ok && !resolvable && normalized.status === 'warning' && (
                    <AlertTriangle className="w-3 h-3 shrink-0 opacity-70" />
                  )}
                </li>
              )
            })}
          </ul>
        </>
      )}

      {detailsOpen && (
        <InvoiceAiReviewDetailModal invoice={invoice} onClose={() => setDetailsOpen(false)} />
      )}
    </section>
  )
}
