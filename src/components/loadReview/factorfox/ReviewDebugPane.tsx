import { useMemo } from 'react'
import { FileSpreadsheet, FileText } from 'lucide-react'
import { BatchDocumentReviewResult, DocumentReviewResult } from '../../../types/documentReview'
import { ExcelMatchResult } from '../../../types/loadSheet'
import { buildInvoiceBilledMatch } from '../../../utils/invoiceBilledMatch'
import { buildStructuredLoadReview, collectLoadReviewIssues } from '../../../utils/loadReviewSummary'
import DocumentReviewDebugPanel from '../../client/DocumentReviewDebugPanel'
import PageClassificationPanel from '../../client/PageClassificationPanel'
import BolAuditPanel from '../../client/BolAuditPanel'
import ExcelMatchPanel from '../ExcelMatchPanel'
import LoadReviewChecksList from './LoadReviewChecksList'
import ExcelFieldDetectionList from './ExcelFieldDetectionList'
import { ff } from './factorFoxTheme'

interface ReviewDebugPaneProps {
  doc: DocumentReviewResult
  batchResult?: BatchDocumentReviewResult | null
  excelFileName?: string | null
}

function resolveExcelMatchForDocument(
  doc: DocumentReviewResult,
  batch?: BatchDocumentReviewResult | null
): ExcelMatchResult | undefined {
  if (!batch) return undefined
  const perInvoice = batch.multiInvoice?.verifications.find(
    (v) => v.unit.fileName === doc.fileName
  )?.excelMatch
  return perInvoice ?? batch.excelMatch
}

/** Inline technical / debug details for one document. */
export default function ReviewDebugPane({ doc, batchResult, excelFileName }: ReviewDebugPaneProps) {
  const excelMatch = useMemo(
    () => (batchResult ? resolveExcelMatchForDocument(doc, batchResult) : undefined),
    [doc, batchResult]
  )

  const excelProvided = Boolean(excelFileName)
  const perInvoiceMatch = batchResult?.multiInvoice?.verifications.find(
    (v) => v.unit.fileName === doc.fileName
  )?.excelMatch

  const invoiceBilledMatch = useMemo(() => {
    if (excelProvided) return undefined
    const invoice =
      doc.extraction.primaryInvoice ?? doc.extraction.invoicePageAudits?.[0]?.invoice
    const rateCon = doc.extraction.rateConParse
    if (!invoice) return undefined
    return buildInvoiceBilledMatch(invoice, rateCon)
  }, [doc, excelProvided])

  const structured = useMemo(
    () =>
      batchResult
        ? buildStructuredLoadReview(doc, batchResult, { excelFileName: excelFileName ?? batchResult.excelFileName })
        : null,
    [doc, batchResult, excelFileName]
  )

  const unifiedIssues = useMemo(
    () =>
      batchResult
        ? collectLoadReviewIssues(doc, batchResult)
        : [],
    [doc, batchResult]
  )

  const technicalChecks = useMemo(() => {
    if (!structured) return []
    return [
      ...structured.requiredFailed,
      ...structured.requiredPassed,
      ...structured.additional,
    ]
  }, [structured])

  return (
    <div className="space-y-5 overflow-y-auto h-full min-h-0 pr-1 pb-4">
      <p className="text-xs" style={{ color: ff.textMuted }}>
        Same required checklist as Summary, plus raw AI output below.
      </p>

      {batchResult?.excelDetectedColumns && batchResult.excelDetectedColumns.length > 0 && (
        <section>
          <h3 className="text-sm font-bold uppercase tracking-wide mb-2" style={{ color: ff.text, fontFamily: ff.fontDisplay }}>
            Excel fields detected
          </h3>
          <ExcelFieldDetectionList columns={batchResult.excelDetectedColumns} compact />
        </section>
      )}

      {structured && (
        <p className="text-xs font-mono" style={{ color: ff.textSubtle }}>
          {structured.requiredFailed.length} failed · {structured.requiredPassed.length} passed ·{' '}
          {structured.additional.length} additional
        </p>
      )}

      {unifiedIssues.length > 0 && (
        <div
          className="rounded-lg border px-3 py-2 space-y-1"
          style={{ borderColor: ff.amberBorder, backgroundColor: ff.amberLight }}
        >
          <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: ff.amber, fontFamily: ff.fontMono }}>
            Failed checks
          </p>
          <ul className="space-y-0.5">
            {unifiedIssues.map((issue, i) => (
              <li key={i} className="text-xs" style={{ color: ff.text }}>
                {issue}
              </li>
            ))}
          </ul>
        </div>
      )}

      <LoadReviewChecksList checks={technicalChecks} title="Required & additional checks" />

      {!excelProvided && invoiceBilledMatch && (
        <section>
          <div className="flex items-center gap-2 mb-2">
            <FileText className="w-4 h-4" style={{ color: ff.accent }} />
            <h3 className="text-sm font-bold uppercase tracking-wide" style={{ color: ff.text, fontFamily: ff.fontDisplay }}>
              Invoice billed check
            </h3>
          </div>
          <ExcelMatchPanel
            match={invoiceBilledMatch}
            title={`Invoice billed check — Load ${invoiceBilledMatch.row.loadNumber ?? '—'}`}
            sourceColumnLabel="Invoice"
            compareColumnLabel="Rate con"
            variant="dark"
          />
        </section>
      )}

      {excelProvided && (
        <section>
          <div className="flex items-center gap-2 mb-2">
            <FileSpreadsheet className="w-4 h-4" style={{ color: ff.accent }} />
            <h3 className="text-sm font-bold uppercase tracking-wide" style={{ color: ff.text, fontFamily: ff.fontDisplay }}>
              Excel cross-check (raw)
            </h3>
          </div>
          <p className="text-xs mb-2" style={{ color: ff.textMuted, fontFamily: ff.fontMono }}>
            {excelFileName}
            {perInvoiceMatch ? ' · row matched' : excelMatch ? ' · matched' : ' · no row match'}
          </p>
          {excelMatch ? (
            <ExcelMatchPanel match={excelMatch} variant="dark" />
          ) : (
            <div
              className="rounded-lg border px-4 py-3 text-sm"
              style={{ borderColor: ff.amberBorder, backgroundColor: ff.amberLight, color: ff.amber }}
            >
              No matching row in the Excel sheet for this document.
            </div>
          )}
        </section>
      )}

      {doc.extraction.pageClassifications && (
        <PageClassificationPanel pages={doc.extraction.pageClassifications} variant="dark" />
      )}
      {doc.extraction.bolAudit && <BolAuditPanel audit={doc.extraction.bolAudit} variant="dark" />}
      <DocumentReviewDebugPanel result={doc} defaultOpen variant="dark" />
    </div>
  )
}
