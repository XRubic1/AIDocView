import PageClassificationPanel from './PageClassificationPanel'
import DocumentReviewDebugPanel from './DocumentReviewDebugPanel'
import DocumentFieldTrainingSection from './DocumentFieldTrainingSection'
import AnalysisProgressMessage from './AnalysisProgressMessage'
import LoadAuditSummaryPanel from './LoadAuditSummaryPanel'
import ExcelMatchPanel from '../loadReview/ExcelMatchPanel'
import BolAuditPanel from './BolAuditPanel'
import { AlertCircle, CheckCircle, Sparkles } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { getReviewModelSummary } from '../../config/aiReview'
import { BatchDocumentReviewResult, DocumentReviewResult } from '../../types/documentReview'
import { DocumentCategory, getCategoryLabel } from '../../utils/documentCategories'
import { useReviewTimeEstimate } from '../../utils/estimateReviewTime'

interface DocumentReviewResultsProps {
  result: BatchDocumentReviewResult | null
  isReviewing: boolean
  error: string | null
  onRunReview: () => void
  canReview: boolean
  aiEnabled: boolean
  reviewFiles?: File[]
}

function formatDocumentType(type: string): string {
  return getCategoryLabel(type as DocumentCategory)
}

export default function DocumentReviewResults({
  result,
  isReviewing,
  error,
  onRunReview,
  canReview,
  aiEnabled,
  reviewFiles = [],
}: DocumentReviewResultsProps) {
  const [reviewedDocs, setReviewedDocs] = useState<DocumentReviewResult[]>([])
  const reviewEstimate = useReviewTimeEstimate(reviewFiles)
  const reviewFileKey = useMemo(
    () => reviewFiles.map((file) => `${file.name}-${file.size}-${file.lastModified}`).join('|'),
    [reviewFiles]
  )

  useEffect(() => {
    setReviewedDocs(result?.documents ?? [])
  }, [result])

  const updateDocResult = (documentId: string, updated: DocumentReviewResult) => {
    setReviewedDocs((prev) =>
      prev.map((doc) => (doc.documentId === documentId ? updated : doc))
    )
  }

  return (
    <div className="mb-6 rounded border p-4" style={{ borderColor: '#819291', backgroundColor: '#f8f9fa' }}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h4 className="text-sm font-semibold flex items-center gap-2" style={{ color: '#113543' }}>
            <Sparkles className="w-4 h-4" style={{ color: '#C2A558' }} />
            AI Document Review
          </h4>
          <p className="text-xs mt-1" style={{ color: '#819291' }}>
            Pipeline: Classify → Rate con → BOL audit → Cross-validate → Summary. Uses{' '}
            {getReviewModelSummary()}.
          </p>
        </div>
        <button
          onClick={onRunReview}
          disabled={!canReview || !aiEnabled || isReviewing}
          className="px-3 py-1.5 text-xs font-medium text-white rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ backgroundColor: '#113543' }}
        >
          {isReviewing ? 'Reviewing...' : reviewEstimate ? `Run AI Review (${reviewEstimate})` : 'Run AI Review'}
        </button>
      </div>

      {!aiEnabled && (
        <p className="text-xs rounded p-2" style={{ backgroundColor: '#FFF8E1', color: '#113543' }}>
          Add <code>VITE_OPENAI_API_KEY</code> to a <code>.env</code> file to enable AI document review.
        </p>
      )}

      {isReviewing && (
        <AnalysisProgressMessage
          key={reviewFileKey}
          files={reviewFiles}
          message="Running document pipeline: classify pages, extract rate con, audit BOL, cross-validate..."
        />
      )}

      {error && (
        <div className="flex items-start gap-2 text-xs rounded p-2 mt-2" style={{ backgroundColor: '#FEE2E2', color: '#991B1B' }}>
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {result && !isReviewing && (
        <div className="space-y-3 mt-3">
          <LoadAuditSummaryPanel result={result} />
          <ExcelMatchPanel match={result.excelMatch} />

          <div className="flex flex-wrap gap-3 text-xs">
            <span className="font-medium" style={{ color: '#113543' }}>
              Overall confidence: {Math.round(result.overallConfidence * 100)}%
            </span>
            {result.destinationMatch === true && (
              <span className="inline-flex items-center gap-1" style={{ color: '#166534' }}>
                <CheckCircle className="w-3.5 h-3.5" />
                Rate con destination matches BOL Ship To
              </span>
            )}
            {result.destinationMatch === false && (
              <span className="inline-flex items-center gap-1" style={{ color: '#991B1B' }}>
                <AlertCircle className="w-3.5 h-3.5" />
                Rate con vs BOL Ship To mismatch
              </span>
            )}
          </div>

          {(result.rateConDestination || result.bolShipTo) && (
            <div className="text-xs rounded border p-2 space-y-1" style={{ borderColor: '#819291', backgroundColor: '#FFFFFF' }}>
              {result.rateConDestination && (
                <div style={{ color: '#113543' }}>
                  Rate con destination: <span className="font-medium">{result.rateConDestination}</span>
                </div>
              )}
              {result.bolShipTo && (
                <div style={{ color: '#113543' }}>
                  BOL Ship To: <span className="font-medium">{result.bolShipTo}</span>
                </div>
              )}
            </div>
          )}

          {result.issues.map((issue) => (
            <div
              key={issue}
              className="text-xs rounded p-2"
              style={{ backgroundColor: '#FEE2E2', color: '#991B1B' }}
            >
              {issue}
            </div>
          ))}

          {result.warnings.map((warning) => (
            <div
              key={warning}
              className="text-xs rounded p-2"
              style={{ backgroundColor: '#FFF8E1', color: '#113543' }}
            >
              {warning}
            </div>
          ))}

          <div className="space-y-2">
            {reviewedDocs.map((doc) => (
              <div
                key={doc.documentId}
                className="rounded border p-2 text-xs"
                style={{ borderColor: '#819291', backgroundColor: '#FFFFFF' }}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="font-medium" style={{ color: '#113543' }}>
                    {doc.fileName}
                  </span>
                  <span style={{ color: '#819291' }}>
                    {doc.modelUsed}
                    {doc.upgradedFromMini ? ' (upgraded)' : ''}
                  </span>
                </div>
                <div style={{ color: '#819291' }}>
                  Type: {formatDocumentType(doc.extraction.documentType)} · Confidence:{' '}
                  {Math.round(doc.extraction.confidence * 100)}%
                </div>
                {doc.extraction.pageClassifications && (
                  <PageClassificationPanel pages={doc.extraction.pageClassifications} />
                )}
                {doc.extraction.bolAudit && <BolAuditPanel audit={doc.extraction.bolAudit} />}
                <DocumentFieldTrainingSection
                  documentId={doc.documentId}
                  fileName={doc.fileName}
                  aiResult={doc}
                  onAiResultChange={(updated) => updateDocResult(doc.documentId, updated)}
                />
                {doc.extraction.documentType === 'bill_of_lading' && (
                  <>
                    {doc.extraction.shipFrom && (
                      <div style={{ color: '#113543' }}>Ship From: {doc.extraction.shipFrom}</div>
                    )}
                    {(doc.extraction.shipTo || doc.extraction.destination) && (
                      <div style={{ color: '#113543' }}>
                        Ship To: {doc.extraction.shipTo || doc.extraction.destination}
                      </div>
                    )}
                    {(doc.extraction.totalPagesInFile ?? 1) > 1 && (
                      <div style={{ color: doc.extraction.isFullyLegible ? '#166534' : '#C2A558' }}>
                        {doc.extraction.pagesReviewed ?? 1} of {doc.extraction.totalPagesInFile} pages
                        reviewed ·{' '}
                        {doc.extraction.isFullyLegible ? 'All legible' : 'Legibility issues possible'}
                      </div>
                    )}
                    <div
                      style={{
                        color:
                          doc.extraction.hasReceiverSignature || doc.extraction.receivingDate
                            ? '#166534'
                            : '#991B1B',
                      }}
                    >
                      Receiver signature:{' '}
                      {doc.extraction.hasReceiverSignature ? 'Yes' : 'No'}
                      {doc.extraction.receivingDate
                        ? ` · Receiving date: ${doc.extraction.receivingDate}`
                        : ''}
                    </div>
                  </>
                )}
                {doc.extraction.documentType !== 'bill_of_lading' &&
                  !doc.extraction.rateConFields &&
                  doc.extraction.destination && (
                  <div style={{ color: '#113543' }}>Destination: {doc.extraction.destination}</div>
                )}
                <DocumentReviewDebugPanel result={doc} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
