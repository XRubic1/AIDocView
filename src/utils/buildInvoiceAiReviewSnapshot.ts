import type { BatchDocumentReviewResult, DocumentReviewResult } from '../types/documentReview'
import type { InvoiceAiReviewSnapshot } from '../types/invoiceAiReview'
import type { StructuredLoadReview } from './loadReviewSummary'

/** Build JSON-safe snapshot for invoice persistence + detail modal. */
export function buildInvoiceAiReviewSnapshot(
  primaryDoc: DocumentReviewResult,
  result: BatchDocumentReviewResult,
  structured: StructuredLoadReview,
  headline: string,
  detail: string,
  ready: boolean
): InvoiceAiReviewSnapshot {
  return {
    headline,
    detail,
    ready,
    passCount: structured.requiredPassed.length,
    requiredTotal: structured.requiredTotal,
    requiredAll: structured.requiredAll,
    requiredFailed: structured.requiredFailed,
    requiredPassed: structured.requiredPassed,
    additional: structured.additional,
    issues: result.issues ?? [],
    warnings: result.warnings ?? [],
    overallConfidence: result.overallConfidence,
    reviewedAt: result.reviewedAt,
    primaryFileName: primaryDoc.fileName,
    hasExcel: structured.hasExcel,
  }
}
