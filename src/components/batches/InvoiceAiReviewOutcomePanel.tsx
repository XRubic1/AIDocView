import { useState } from 'react'
import { Check, X, AlertTriangle } from 'lucide-react'
import type { Invoice } from '../../types/invoice'
import type { InvoiceAiReviewSnapshot } from '../../types/invoiceAiReview'
import type { LoadCheckRow } from '../../utils/loadReviewSummary'
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

/**
 * Compact 6-check AI list under packet info, with a details modal for the full write-up.
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
            {passCount}/{total || 6} checks passed
          </p>
          <ul className="client-ai-verify__checks">
            {checks.map((row) => {
              const ok = checkPassed(row)
              return (
                <li
                  key={row.id}
                  className={`client-ai-verify__check${ok ? ' is-ok' : ' is-fail'}`}
                >
                  {ok ? <Check className="w-3 h-3 shrink-0" /> : <X className="w-3 h-3 shrink-0" />}
                  <span className="client-ai-verify__check-label">{row.label}</span>
                  {!ok && row.status === 'warning' && (
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
