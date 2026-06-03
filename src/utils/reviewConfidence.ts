import { DocumentReviewResult } from '../types/documentReview'
import { bolAuditMeetsDeliveryRequirements } from './bolAuditSanitizer'

/** Adjust model self-reported confidence using verification outcomes (models often over-score). */
export function computeDocumentReviewConfidence(
  doc: DocumentReviewResult,
  options?: { crossOverall?: string | null }
): number {
  const scores: number[] = []

  const modelConf = doc.extraction.confidence
  if (Number.isFinite(modelConf)) scores.push(modelConf)

  const rateFields = doc.extraction.rateConFields
  if (rateFields) {
    Object.values(rateFields).forEach((field) => {
      if (field && typeof field.confidence === 'number') scores.push(field.confidence)
    })
  }

  const pages = doc.extraction.pageClassifications
  if (pages?.length) {
    scores.push(pages.reduce((sum, page) => sum + page.confidence, 0) / pages.length)
  }

  let base = scores.length > 0 ? Math.min(...scores) : 0.5

  const bol = doc.extraction.bolAudit
  const bolOk =
    !bol || bolAuditMeetsDeliveryRequirements(bol, doc.extraction.rateConParse)

  if (bol) {
    if (!bolOk) base = Math.min(base, 0.52)
    if (bol.overall === 'NEEDS_REVIEW') base = Math.min(base, 0.62)
    if (bol.signatures.receiver === 'UNCLEAR') base = Math.min(base, 0.48)
    if (bol.signatures.receiver === 'MISSING') base = Math.min(base, 0.35)
    if (bol.page_count === 'INCOMPLETE' || bol.page_count === 'FAIL') {
      base = Math.min(base, 0.45)
    }
  }

  const cross = options?.crossOverall
  if (cross === 'REJECTED') base = Math.min(base, 0.4)
  else if (cross === 'NEEDS_REVIEW') base = Math.min(base, 0.58)

  const allClear = bolOk && cross === 'APPROVED'
  if (!allClear && base > 0.78) base = 0.78
  if (
    !allClear &&
    base > 0.65 &&
    (bol?.overall === 'NEEDS_REVIEW' || cross === 'NEEDS_REVIEW' || cross === 'REJECTED')
  ) {
    base = Math.min(base, 0.65)
  }

  return Math.round(Math.max(0.12, Math.min(0.92, base)) * 100) / 100
}

export function computeBatchOverallConfidence(
  documents: DocumentReviewResult[],
  crossOverall?: string | null
): number {
  if (documents.length === 0) return 0
  const sum = documents.reduce(
    (acc, doc) => acc + computeDocumentReviewConfidence(doc, { crossOverall }),
    0
  )
  return Math.round((sum / documents.length) * 100) / 100
}
