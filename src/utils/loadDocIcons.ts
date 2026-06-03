import { DocumentReviewResult } from '../types/documentReview'
import { documentHasBolEvidence } from './requiredDocuments'

export interface LoadDocIcon {
  code: string
  present: boolean
}

/** Compact doc-type chips for the load queue (RC, BOL, INV, POD). */
export function getLoadDocIcons(doc: DocumentReviewResult | undefined): LoadDocIcon[] {
  if (!doc) {
    return [
      { code: 'RC', present: false },
      { code: 'BOL', present: false },
      { code: 'INV', present: false },
      { code: 'POD', present: false },
    ]
  }

  const pages = doc.extraction.pageClassifications ?? []
  const hasRateCon =
    Boolean(doc.extraction.rateConParse) ||
    pages.some((p) => p.pageType === 'rate_confirmation')
  const hasBol = documentHasBolEvidence(doc.extraction)
  const hasInvoice =
    Boolean(doc.extraction.primaryInvoice) ||
    pages.some((p) => p.pageType === 'invoice')
  const hasPod =
    pages.some((p) => p.pageType === 'proof_of_delivery') ||
    doc.extraction.documentType === 'proof_of_delivery'

  return [
    { code: 'RC', present: hasRateCon },
    { code: 'BOL', present: hasBol },
    { code: 'INV', present: hasInvoice },
    { code: 'POD', present: hasPod },
  ]
}
