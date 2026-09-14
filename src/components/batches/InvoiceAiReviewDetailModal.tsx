import { useMemo } from 'react'
import { X, Sparkles, CheckCircle, AlertCircle, AlertTriangle } from 'lucide-react'
import type { Invoice } from '../../types/invoice'
import type { InvoiceAiReviewSnapshot } from '../../types/invoiceAiReview'
import { getInvoiceAiReviewCache } from '../../data/invoiceAiReviewCache'
import LoadAuditSummaryPanel from '../client/LoadAuditSummaryPanel'
import type { LoadCheckRow } from '../../utils/loadReviewSummary'

interface InvoiceAiReviewDetailModalProps {
  invoice: Invoice
  onClose: () => void
}

function parseSnapshot(invoice: Invoice): InvoiceAiReviewSnapshot | null {
  if (!invoice.ai_review_snapshot) return null
  try {
    return JSON.parse(invoice.ai_review_snapshot) as InvoiceAiReviewSnapshot
  } catch {
    return null
  }
}

function statusStyle(status?: string) {
  if (status === 'ready') {
    return { label: 'OK', bg: '#3ddb7a', Icon: CheckCircle }
  }
  if (status === 'needs_work') {
    return { label: 'Needs review', bg: '#C2A558', Icon: AlertTriangle }
  }
  if (status === 'running') {
    return { label: 'Reviewing', bg: '#819291', Icon: Sparkles }
  }
  return { label: 'Reviewing', bg: '#cccccc', Icon: AlertCircle }
}

function checkStatusIcon(status: LoadCheckRow['status']) {
  if (status === 'ok') return { glyph: '✓', color: '#3ddb7a' }
  if (status === 'issue' || status === 'missing') return { glyph: '✗', color: '#b91c1c' }
  if (status === 'warning') return { glyph: '!', color: '#C2A558' }
  return { glyph: '·', color: '#819291' }
}

/** Credyx-styled AI review detail — same data as AIDocView, admin palette. */
export default function InvoiceAiReviewDetailModal({
  invoice,
  onClose,
}: InvoiceAiReviewDetailModalProps) {
  const cached = getInvoiceAiReviewCache(invoice.id)
  const snapshot = useMemo(
    () => cached?.snapshot ?? parseSnapshot(invoice),
    [cached, invoice]
  )

  const st = statusStyle(invoice.ai_review_status)
  const StatusIcon = st.Icon
  const batchResult = cached?.batchResult

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="bg-white rounded-lg w-full max-w-3xl max-h-[90vh] flex flex-col shadow-xl"
        style={{ borderColor: '#819291' }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="ai-review-modal-title"
      >
        <div
          className="flex items-start justify-between gap-3 px-4 py-3 border-b shrink-0"
          style={{ borderColor: '#819291' }}
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Sparkles className="w-4 h-4 shrink-0" style={{ color: '#C2A558' }} />
              <h2 id="ai-review-modal-title" className="text-base font-bold truncate" style={{ color: '#113543' }}>
                AI review — {invoice.invoice_number}
              </h2>
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded"
                style={{ backgroundColor: st.bg, color: '#fff' }}
              >
                <StatusIcon className="w-3 h-3" />
                {st.label}
              </span>
            </div>
            <p className="text-xs mt-0.5" style={{ color: '#819291' }}>
              Load {invoice.load_number || '—'} · {invoice.broker_name}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-100 shrink-0"
            aria-label="Close"
          >
            <X className="w-5 h-5" style={{ color: '#819291' }} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-3 text-xs">
          {!snapshot ? (
            <div className="rounded p-3" style={{ backgroundColor: '#f8f9fa', color: '#819291' }}>
              {invoice.ai_review_summary || 'No AI review details yet. Run AI Review batch on this batch.'}
            </div>
          ) : (
            <>
              <div
                className="rounded px-3 py-2 flex flex-wrap items-center justify-between gap-2"
                style={{
                  backgroundColor: snapshot.ready ? 'rgba(61, 219, 122, 0.12)' : 'rgba(194, 165, 88, 0.12)',
                  border: `1px solid ${snapshot.ready ? '#3ddb7a' : '#C2A558'}`,
                }}
              >
                <span className="font-semibold" style={{ color: '#113543' }}>
                  {snapshot.headline}
                </span>
                <span style={{ color: '#819291' }}>
                  {snapshot.passCount}/{snapshot.requiredTotal} required checks
                  {snapshot.overallConfidence != null &&
                    ` · ${Math.round(snapshot.overallConfidence * 100)}% confidence`}
                </span>
              </div>
              <p style={{ color: '#819291' }}>{snapshot.detail}</p>

              {batchResult && <LoadAuditSummaryPanel result={batchResult} />}

              {snapshot.issues.length > 0 && (
                <div>
                  <div className="font-semibold mb-1" style={{ color: '#b91c1c' }}>
                    Issues
                  </div>
                  <ul className="space-y-1">
                    {snapshot.issues.map((issue) => (
                      <li
                        key={issue}
                        className="rounded px-2 py-1"
                        style={{ backgroundColor: '#FEE2E2', color: '#991B1B' }}
                      >
                        {issue}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {snapshot.warnings.length > 0 && (
                <div>
                  <div className="font-semibold mb-1" style={{ color: '#C2A558' }}>
                    Warnings
                  </div>
                  <ul className="space-y-1">
                    {snapshot.warnings.map((w) => (
                      <li
                        key={w}
                        className="rounded px-2 py-1"
                        style={{ backgroundColor: '#FFF8E1', color: '#113543' }}
                      >
                        {w}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div>
                <div className="font-semibold mb-2 text-sm" style={{ color: '#113543' }}>
                  Required checks
                </div>
                <div className="border rounded overflow-hidden" style={{ borderColor: '#819291' }}>
                  <table className="w-full border-collapse">
                    <thead style={{ backgroundColor: '#f0f2f2' }}>
                      <tr>
                        <th className="text-left py-1.5 px-2 w-8" />
                        <th className="text-left py-1.5 px-2 font-semibold" style={{ color: '#113543' }}>
                          Check
                        </th>
                        <th className="text-left py-1.5 px-2 font-semibold" style={{ color: '#113543' }}>
                          Result
                        </th>
                        {snapshot.hasExcel && (
                          <th className="text-left py-1.5 px-2 font-semibold" style={{ color: '#113543' }}>
                            Excel / Doc
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {snapshot.requiredAll.map((check) => (
                        <CheckRow key={check.id} check={check} showExcel={!!snapshot.hasExcel} />
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {snapshot.additional.length > 0 && (
                <div>
                  <div className="font-semibold mb-2 text-sm" style={{ color: '#113543' }}>
                    Additional checks
                  </div>
                  <div className="border rounded overflow-hidden" style={{ borderColor: '#819291' }}>
                    <table className="w-full border-collapse">
                      <tbody>
                        {snapshot.additional.map((check) => (
                          <CheckRow key={check.id} check={check} showExcel={!!snapshot.hasExcel} />
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {batchResult && batchResult.documents.length > 0 && (
                <div>
                  <div className="font-semibold mb-1 text-sm" style={{ color: '#113543' }}>
                    Documents reviewed
                  </div>
                  <ul className="space-y-1">
                    {batchResult.documents.map((doc) => (
                      <li
                        key={doc.documentId}
                        className="flex justify-between gap-2 rounded border px-2 py-1"
                        style={{ borderColor: '#e8ecec', color: '#113543' }}
                      >
                        <span className="truncate">{doc.fileName}</span>
                        <span className="shrink-0" style={{ color: '#819291' }}>
                          {Math.round(doc.extraction.confidence * 100)}%
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {snapshot.primaryFileName && !batchResult && (
                <p style={{ color: '#819291' }}>
                  Primary document: {snapshot.primaryFileName}
                  {snapshot.reviewedAt && ` · Reviewed ${new Date(snapshot.reviewedAt).toLocaleString()}`}
                </p>
              )}
            </>
          )}

          {!snapshot && invoice.ai_review_status === 'needs_work' && (
            <p className="text-xs" style={{ color: '#819291' }}>
              Re-run <strong>AI Review batch</strong> to refresh detailed check results.
            </p>
          )}
        </div>

        <div
          className="px-4 py-2 border-t shrink-0 flex justify-end"
          style={{ borderColor: '#819291' }}
        >
          <button
            type="button"
            className="px-4 py-1.5 text-sm font-medium rounded"
            style={{ backgroundColor: '#113543', color: '#FFFFFF' }}
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

function CheckRow({ check, showExcel }: { check: LoadCheckRow; showExcel: boolean }) {
  const icon = checkStatusIcon(check.status)
  return (
    <tr className="border-t" style={{ borderColor: '#eee' }}>
      <td className="py-1.5 px-2 text-center font-bold" style={{ color: icon.color }}>
        {icon.glyph}
      </td>
      <td className="py-1.5 px-2 font-medium" style={{ color: '#113543' }}>
        {check.label}
      </td>
      <td className="py-1.5 px-2" style={{ color: '#113543' }}>
        <div>{check.summary}</div>
        {check.detail && (
          <div className="mt-0.5" style={{ color: '#819291' }}>
            {check.detail}
          </div>
        )}
      </td>
      {showExcel && (
        <td className="py-1.5 px-2" style={{ color: '#819291' }}>
          {check.excelValue && <div>Excel: {check.excelValue}</div>}
          {check.documentValue && check.documentValue !== '—' && (
            <div>Doc: {check.documentValue}</div>
          )}
        </td>
      )}
    </tr>
  )
}
