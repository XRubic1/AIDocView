import { BatchDocumentReviewResult, DocumentReviewResult } from '../types/documentReview'
import { LoadSheetRow, ParsedLoadSheet } from '../types/loadSheet'

/** Compact review payload for the explainability chat (avoid huge base64 images). */
export function buildReviewChatContext(input: {
  batchResult: BatchDocumentReviewResult | null
  reviewedDocs: DocumentReviewResult[]
  loadSheet?: ParsedLoadSheet | null
  selectedRow?: LoadSheetRow | null
}): string {
  const { batchResult, reviewedDocs, loadSheet, selectedRow } = input

  const documents = reviewedDocs.map((doc) => ({
    fileName: doc.fileName,
    modelUsed: doc.modelUsed,
    upgradedFromMini: doc.upgradedFromMini,
    extraction: {
      documentType: doc.extraction.documentType,
      loadNumber: doc.extraction.loadNumber,
      origin: doc.extraction.origin,
      destination: doc.extraction.destination,
      shipFrom: doc.extraction.shipFrom,
      shipTo: doc.extraction.shipTo,
      rate: doc.extraction.rate,
      confidence: doc.extraction.confidence,
      fieldsFound: doc.extraction.fieldsFound,
      pageClassifications: doc.extraction.pageClassifications,
      rateConFields: doc.extraction.rateConFields,
      rateConParse: doc.extraction.rateConParse,
      bolAudit: doc.extraction.bolAudit,
      bolPageAudits: doc.extraction.bolPageAudits,
      invoicePageAudits: doc.extraction.invoicePageAudits,
      primaryInvoice: doc.extraction.primaryInvoice,
      notes: doc.extraction.notes,
      totalPagesInFile: doc.extraction.totalPagesInFile,
      pagesReviewed: doc.extraction.pagesReviewed,
    },
    debugSummary: {
      promptNote: doc.debugLog.promptNote,
      attemptCount: doc.debugLog.attempts.length,
      attempts: doc.debugLog.attempts.map((attempt) => ({
        model: attempt.model,
        promptKind: attempt.promptKind,
        confidence: attempt.confidence,
        usedForResult: attempt.usedForResult,
        usage: attempt.usage,
      })),
    },
  }))

  const payload = {
    auditSummary: batchResult?.auditSummary,
    crossValidation: batchResult?.crossValidation,
    multiStopBol: batchResult?.multiStopBol,
    multiInvoice: batchResult?.multiInvoice,
    excelMatch: batchResult?.excelMatch,
    reviewCost: batchResult?.reviewCost,
    issues: batchResult?.issues,
    warnings: batchResult?.warnings,
    destinationMatch: batchResult?.destinationMatch,
    rateConDestination: batchResult?.rateConDestination,
    bolShipTo: batchResult?.bolShipTo,
    excelLoadSheet: loadSheet
      ? { fileName: loadSheet.fileName, rowCount: loadSheet.rows.length, selectedRow }
      : null,
    documents,
  }

  return JSON.stringify(payload, null, 2)
}
