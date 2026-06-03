import { useMemo } from 'react'
import { BatchDocumentReviewResult, DocumentReviewResult } from '../../../types/documentReview'
import { buildLoadDetailView } from '../../../utils/loadDetailView'
import { getApprovalGateMessage, LoadCheckRow } from '../../../utils/loadReviewSummary'
import TechnicalLogPane from './TechnicalLogPane'

interface LoadDetailSummaryProps {
  doc: DocumentReviewResult
  batchResult: BatchDocumentReviewResult
  excelFileName?: string | null
  hideHeader?: boolean
  onCorrectAi?: () => void
}

/** One-glance labels for the 6 required checks. */
const GLANCE_LABEL: Record<string, string> = {
  req_load: 'Load #',
  req_broker: 'Broker',
  req_amount: 'Amount',
  req_bol: 'BOL',
  req_stops: 'Stops',
  req_carrier: 'Carrier',
}

function primaryValue(check: LoadCheckRow, showExcel: boolean): string {
  if (check.id === 'req_bol') {
    if (check.status === 'ok') return 'Signed'
    if (check.status === 'missing') return 'Missing'
    return 'Not OK'
  }
  if (check.id === 'req_stops' && check.documentValue && check.documentValue !== '—') {
    return check.documentValue
  }
  if (check.documentValue && check.documentValue !== '—') return check.documentValue
  if (showExcel && check.excelValue) return check.excelValue
  return '—'
}

function excelDocLine(check: LoadCheckRow, showExcel: boolean): string | null {
  if (!showExcel) return null
  const parts: string[] = []
  if (check.excelValue) parts.push(`X ${check.excelValue}`)
  if (check.documentValue && check.documentValue !== '—') parts.push(`Doc ${check.documentValue}`)
  return parts.length ? parts.join(' · ') : null
}

function failHint(check: LoadCheckRow): string | null {
  if (check.status === 'ok') return null
  const s = check.summary
  return s.length > 42 ? `${s.slice(0, 42)}…` : s
}

function CheckCell({
  check,
  showExcel,
  onCorrectAi,
}: {
  check: LoadCheckRow
  showExcel: boolean
  onCorrectAi?: () => void
}) {
  const ok = check.status === 'ok'
  const fail = check.status === 'issue' || check.status === 'missing'
  const value = primaryValue(check, showExcel)
  const xdoc = excelDocLine(check, showExcel)
  const hint = failHint(check)

  return (
    <div
      className={`engine-glance-check ${ok ? 'pass' : fail ? 'fail' : 'warn'}${check.id === 'req_stops' ? ' engine-glance-check--stops' : ''}`}
      role="listitem"
      title={[check.documentValue, check.summary].filter(Boolean).join(' — ')}
    >
      <div className="engine-glance-check-top">
        <span className="engine-glance-icon" aria-hidden>
          {ok ? '✓' : fail ? '✗' : '!'}
        </span>
        <span className="engine-glance-label">{GLANCE_LABEL[check.id] ?? check.label}</span>
      </div>
      <div className="engine-glance-value">{value}</div>
      {xdoc && showExcel && <div className="engine-glance-xdoc">{xdoc}</div>}
      {hint && <div className="engine-glance-hint">{hint}</div>}
      {fail && onCorrectAi && (
        <button type="button" className="engine-glance-fix" onClick={onCorrectAi}>
          Fix
        </button>
      )}
    </div>
  )
}

const META_SKIP = /invoice|amount|load number/i

const META_LABELS: Record<string, string> = {
  add_pickup: 'Pickup',
  add_delivery: 'Delivery',
}

/** Full-height summary — 6 glance checks + slim approval bar. */
export default function LoadDetailSummary({
  doc,
  batchResult,
  excelFileName,
  onCorrectAi,
}: LoadDetailSummaryProps) {
  const view = useMemo(
    () => buildLoadDetailView(doc, batchResult, { excelFileName }),
    [doc, batchResult, excelFileName]
  )

  const { review } = view
  const passCount = review.requiredPassed.length
  const total = review.requiredTotal
  const gate = getApprovalGateMessage(passCount, total)
  const showExcel = review.hasExcel
  const failLeft = total - passCount

  const laneMeta = (['add_pickup', 'add_delivery'] as const)
    .map((id) => review.additional.find((a) => a.id === id && a.summary))
    .filter((a): a is LoadCheckRow => Boolean(a))
  const metaRows =
    laneMeta.length > 0
      ? laneMeta
      : review.additional
          .filter((a) => a.summary && a.status === 'info' && !META_SKIP.test(a.label))
          .slice(0, 4)

  return (
    <div className="engine-summary-panel" role="region" aria-label="Load review summary">
      <div className={`engine-summary-gate slim ${gate.ready ? 'ready' : 'blocked'}`}>
        <span className="engine-summary-gate-headline">
          <span className="engine-summary-load-tag">{view.title}</span>
          {gate.ready ? ' · Approve' : ` · ${failLeft} left`}
        </span>
        <span className="engine-summary-gate-score-inline">
          <span className="passed">{passCount}</span>
          <span className="sep">/</span>
          <span>{total}</span>
          <span className="lbl">checks</span>
        </span>
      </div>

      <div className="engine-glance-checks" role="list" aria-label="Required checks">
        {review.requiredAll.map((check) => (
          <CheckCell
            key={check.id}
            check={check}
            showExcel={showExcel}
            onCorrectAi={failCheck(check) ? onCorrectAi : undefined}
          />
        ))}
      </div>

      {metaRows.length > 0 && (
        <div className="engine-summary-meta slim" aria-label="Lane details">
          {metaRows.map((item) => (
            <div key={item.id} className="engine-summary-meta-cell">
              <span className="engine-summary-meta-key">
                {META_LABELS[item.id] ?? item.label.replace(/ \(paperwork\)/i, '').split(' ')[0]}
              </span>
              <span
                className={`engine-summary-meta-val${
                  item.summary.includes(' · 2.') || /^\d+\.\s/.test(item.summary)
                    ? ' engine-summary-meta-val--multi'
                    : ''
                }`}
                title={item.summary}
              >
                {item.summary}
              </span>
            </div>
          ))}
        </div>
      )}

      <section className="engine-summary-tech" aria-label="Technical pipeline log">
        <div className="engine-summary-tech-head">Technical</div>
        <TechnicalLogPane
          doc={doc}
          batchResult={batchResult}
          excelFileName={excelFileName}
          embedded
        />
      </section>
    </div>
  )
}

function failCheck(check: LoadCheckRow): boolean {
  return check.status === 'issue' || check.status === 'missing'
}
