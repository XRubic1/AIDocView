import { useMemo } from 'react'
import { AlertCircle, CheckCircle2, ClipboardList, XCircle } from 'lucide-react'
import { BatchDocumentReviewResult, DocumentReviewResult } from '../../../types/documentReview'
import { buildLoadDetailView } from '../../../utils/loadDetailView'
import DocumentViewerPane from './DocumentViewerPane'
import LoadDetailSummary from './LoadDetailSummary'
import CorrectAiPane from './CorrectAiPane'
export type InspectorTab = 'summary' | 'documents' | 'teach'

const TABS: { id: InspectorTab; label: string }[] = [
  { id: 'summary', label: 'Summary' },
  { id: 'documents', label: 'Documents' },
  { id: 'teach', label: 'Correct AI' },
]

interface LoadInspectorProps {
  doc: DocumentReviewResult | null
  file: File | null
  pageCount?: number
  batchResult: BatchDocumentReviewResult | null
  excelFileName?: string | null
  tab: InspectorTab
  onTabChange: (tab: InspectorTab) => void
  onDocChange: (updated: DocumentReviewResult) => void
  hasReviewResult: boolean
}

function verdictClassFromLabel(label: string): 'ok' | 'warn' | 'err' {
  if (label === 'Verified') return 'ok'
  if (label === 'Rejected') return 'err'
  return 'warn'
}

/** Right panel — detail header, score bar, tabbed body. */
export default function LoadInspector({
  doc,
  file,
  pageCount,
  batchResult,
  excelFileName,
  tab,
  onTabChange,
  onDocChange,
  hasReviewResult,
}: LoadInspectorProps) {
  const view = useMemo(
    () => (doc && batchResult && hasReviewResult ? buildLoadDetailView(doc, batchResult, { excelFileName }) : null),
    [doc, batchResult, hasReviewResult, excelFileName]
  )

  if (!doc) {
    return (
      <div className="engine-workbench-inspector flex items-center justify-center">
        <div className="text-center px-6">
          <ClipboardList className="w-10 h-10 mx-auto mb-3" style={{ color: '#3a3935' }} />
          <p className="text-sm font-medium" style={{ color: '#eceae2' }}>
            Select a load from the queue
          </p>
          <p className="text-xs mt-1 max-w-xs" style={{ color: '#6b6960' }}>
            After you run review, click any load to see its verdict, documents, and corrections here.
          </p>
        </div>
      </div>
    )
  }

  const canShowSummary = Boolean(batchResult && hasReviewResult && view)
  const review = view?.review
  const failCount = review?.requiredFailed.length ?? 0
  const passCount = review?.requiredPassed.length ?? 0
  const totalChecks = review?.requiredTotal ?? 6
  const scorePct = totalChecks > 0 ? Math.round((passCount / totalChecks) * 100) : 0

  const pages = doc.extraction.pageClassifications?.length ?? pageCount ?? 0
  const docTypes = new Set((doc.extraction.pageClassifications ?? []).map((p) => p.pageType))
  const detectedDocs = docTypes.size || (doc.extraction.rateConParse ? 1 : 0) + (doc.extraction.primaryInvoice ? 1 : 0)

  const displayId = view?.title ?? doc.fileName.replace(/\.pdf$/i, '')
  const verdictLabel = view?.statusLabel ?? 'Pending'
  const verdictClass = verdictClassFromLabel(verdictLabel)
  const VerdictIcon =
    verdictClass === 'ok' ? CheckCircle2 : verdictClass === 'err' ? XCircle : AlertCircle

  const tabCounts: Partial<Record<InspectorTab, number>> = {
    summary: totalChecks,
    documents: Math.max(detectedDocs, docTypes.size),
  }

  return (
    <div className="engine-workbench-inspector">
      <div
        className={`engine-detail-header ${
          tab === 'summary' || tab === 'teach' ? 'engine-detail-header--summary-only' : ''
        }`}
      >
        <div className="engine-detail-top">
          <div className="min-w-0">
            {tab !== 'summary' && (
              <>
                <div className="engine-detail-load-num">{displayId}</div>
                <div className="engine-detail-filename">
                  {doc.fileName}
                  {pages > 0 ? ` · ${pages} page${pages === 1 ? '' : 's'}` : ''}
                  {hasReviewResult ? ` · ${detectedDocs} document${detectedDocs === 1 ? '' : 's'} detected` : ''}
                </div>
              </>
            )}
          </div>
          {hasReviewResult && view && tab !== 'summary' && (
            <div className={`engine-detail-verdict ${verdictClass}`}>
              <VerdictIcon className="w-3.5 h-3.5" strokeWidth={2} />
              {verdictLabel === 'Verified' ? 'Approved' : verdictLabel}
            </div>
          )}
        </div>

        {canShowSummary && review && tab !== 'summary' && (
          <div className="engine-score-bar-wrap">
            <div className="engine-score-fraction">
              <span className={failCount > 0 ? 'failed' : 'passed'}>
                {failCount > 0
                  ? `${failCount} must pass to approve`
                  : `${passCount}/${totalChecks} required passed`}
              </span>
            </div>
            <div className="engine-score-bar">
              <div className="engine-score-bar-fill" style={{ width: `${scorePct}%` }} />
            </div>
          </div>
        )}

        <nav className="engine-tabs" role="tablist" aria-label="Load views">
          {TABS.map(({ id, label }) => {
            const disabled = id === 'summary' && !canShowSummary
            const active = tab === id
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={active}
                disabled={disabled}
                title={disabled ? 'Run review first' : undefined}
                onClick={() => onTabChange(id)}
                className={`engine-tab ${active ? 'active' : ''}`}
              >
                {label}
                {tabCounts[id] != null && tabCounts[id]! > 0 && (
                  <span className="engine-tab-count">{tabCounts[id]}</span>
                )}
              </button>
            )
          })}
        </nav>
      </div>

      <div
        className={`engine-detail-body ${
          tab === 'summary' || tab === 'teach' ? 'engine-detail-body--fill' : ''
        }`}
      >
        {tab === 'summary' && canShowSummary && batchResult && (
          <LoadDetailSummary
            doc={doc}
            batchResult={batchResult}
            excelFileName={excelFileName}
            onCorrectAi={() => onTabChange('teach')}
          />
        )}

        {tab === 'summary' && !canShowSummary && (
          <div className="flex flex-col items-center justify-center py-16 text-center px-4">
            <p className="text-sm" style={{ color: '#6b6960' }}>
              Run review to see the summary for this load.
            </p>
          </div>
        )}

        {tab === 'documents' && (
          <div className="h-full min-h-[320px] p-4">
            <DocumentViewerPane doc={doc} file={file} className="h-full min-h-[280px]" />
          </div>
        )}

        {tab === 'teach' && <CorrectAiPane doc={doc} onDocChange={onDocChange} />}
      </div>
    </div>
  )
}
