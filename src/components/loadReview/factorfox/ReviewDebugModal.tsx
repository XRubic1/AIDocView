import { useEffect, useMemo } from 'react'
import { FileSpreadsheet, FileText, X } from 'lucide-react'
import { BatchDocumentReviewResult, DocumentReviewResult } from '../../../types/documentReview'
import { ExcelMatchResult } from '../../../types/loadSheet'
import { buildInvoiceBilledMatch } from '../../../utils/invoiceBilledMatch'
import DocumentReviewDebugPanel from '../../client/DocumentReviewDebugPanel'
import PageClassificationPanel from '../../client/PageClassificationPanel'
import BolAuditPanel from '../../client/BolAuditPanel'
import ExcelMatchPanel from '../ExcelMatchPanel'
import { ff } from './factorFoxTheme'

interface ReviewDebugModalProps {
  doc: DocumentReviewResult | null
  batchResult?: BatchDocumentReviewResult | null
  excelFileName?: string | null
  onClose: () => void
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

/** Full-screen debug / technical details for one reviewed document. */
export default function ReviewDebugModal({
  doc,
  batchResult,
  excelFileName,
  onClose,
}: ReviewDebugModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  const excelMatch = useMemo(
    () => (doc && batchResult ? resolveExcelMatchForDocument(doc, batchResult) : undefined),
    [doc, batchResult]
  )

  const excelProvided = Boolean(excelFileName)
  const perInvoiceMatch = batchResult?.multiInvoice?.verifications.find(
    (v) => v.unit.fileName === doc?.fileName
  )?.excelMatch

  const invoiceBilledMatch = useMemo(() => {
    if (!doc || excelProvided) return undefined
    const invoice =
      doc.extraction.primaryInvoice ??
      doc.extraction.invoicePageAudits?.[0]?.invoice
    const rateCon = doc.extraction.rateConParse
    if (!invoice) return undefined
    return buildInvoiceBilledMatch(invoice, rateCon)
  }, [doc, excelProvided])

  if (!doc) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-center p-0 sm:p-4"
      style={{ backgroundColor: ff.overlay }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="debug-modal-title"
      onClick={onClose}
    >
      <div
        className="flex flex-col w-full max-w-5xl sm:my-4 sm:rounded-2xl overflow-hidden shadow-2xl"
        style={{ backgroundColor: ff.mainBg, maxHeight: '100vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex-shrink-0 flex items-center justify-between px-5 py-4 border-b"
          style={{ borderColor: ff.border }}
        >
          <div>
            <h2 id="debug-modal-title" className="text-lg font-bold" style={{ color: ff.text }}>
              Technical details
            </h2>
            <p className="text-sm" style={{ color: ff.textMuted }}>
              {doc.fileName}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg engine-hover-surface transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" style={{ color: ff.textMuted }} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {!excelProvided && invoiceBilledMatch && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <FileText className="w-4 h-4" style={{ color: ff.blue }} />
                <h3 className="text-sm font-bold" style={{ color: ff.text }}>
                  Invoice billed check
                </h3>
              </div>
              <p className="text-xs mb-3" style={{ color: ff.textMuted }}>
                No Excel sheet — billed load #, amount, and broker are taken from the carrier
                invoice and compared to the rate con.
              </p>
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
              <div className="flex items-center gap-2 mb-3">
                <FileSpreadsheet className="w-4 h-4" style={{ color: ff.blue }} />
                <h3 className="text-sm font-bold" style={{ color: ff.text }}>
                  Excel cross-check
                </h3>
              </div>
              <p className="text-xs mb-3" style={{ color: ff.textMuted }}>
                Sheet: {excelFileName}
                {perInvoiceMatch
                  ? ' · Row auto-matched for this invoice'
                  : excelMatch
                    ? ' · Row matched for this upload'
                    : ''}
              </p>
              {excelMatch ? (
                <ExcelMatchPanel match={excelMatch} variant="dark" />
              ) : (
                <div
                  className="rounded-lg border px-4 py-3 text-sm"
                  style={{
                    borderColor: ff.border,
                    backgroundColor: ff.amberLight,
                    color: ff.amber,
                  }}
                >
                  No matching row found in the Excel sheet for this document. Check that load
                  number, invoice number, broker, and amount appear on a row in the sheet.
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
      </div>
    </div>
  )
}
