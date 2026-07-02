import { BolAudit, CrossValidationFlag, RateConParse } from '../types/documentPipeline'
import { DocumentReviewResult, ExtractedDocumentData, PageClassification } from '../types/documentReview'
import {
  countDeliveryProofPages,
  isDeliveryProofPageType,
} from './deliveryProofPages'

export interface RequiredDocumentInput {
  rateConParse?: RateConParse
  bolAudit?: BolAudit
  bolPageCount?: number
  pageClassifications?: PageClassification[]
  /** At least one invoice page was extracted in this review run. */
  hasExtractedInvoice?: boolean
  /** Excel load sheet was uploaded for billed-amount cross-check. */
  hasExcelBilling?: boolean
  /** Per-PDF results — used to detect BOL on combined invoice/rate-con/BOL packets. */
  reviewDocuments?: DocumentReviewResult[]
  /** When true, attach missing-BOL errors to the PDF that lacks BOL (not the whole batch). */
  multiLoadUpload?: boolean
}

export interface RequiredDocumentResult {
  hasRateCon: boolean
  hasBol: boolean
  hasInvoice: boolean
  bolPageCount: number
  flags: CrossValidationFlag[]
  /** Minimum status from required-document rules alone. */
  documentGate: 'APPROVED' | 'NEEDS_REVIEW' | 'REJECTED'
}

function documentHasLumperEvidence(extraction: ExtractedDocumentData): boolean {
  if ((extraction.lumperPageAudits?.length ?? 0) > 0) return true
  return (extraction.pageClassifications ?? []).some((p) => p.pageType === 'lumper')
}

function rateConMentionsLumper(rate?: RateConParse): boolean {
  if (!rate) return false
  const lineItemLumper = (rate.rate_line_items ?? []).some((row) =>
    /(lumper|unload|unloading|detention|dock)/i.test(`${row.description ?? ''} ${row.category ?? ''}`)
  )
  const instructionLumper = /(lumper|unload|unloading|detention|dock)/i.test(
    rate.special_instructions ?? ''
  )
  return lineItemLumper || instructionLumper
}

function countPageType(pages: PageClassification[] | undefined, type: string): number {
  return pages?.filter((page) => page.pageType === type).length ?? 0
}

/** True when this PDF has BOL evidence (audit, pages, or ship-to extraction). */
export function documentHasBolEvidence(extraction: ExtractedDocumentData): boolean {
  if (extraction.bolAudit) return true
  if (extraction.bolPageAudits?.length) return true
  if (extraction.documentType === 'bill_of_lading') return true
  const pages = extraction.pageClassifications ?? []
  return pages.some(
    (p) => isDeliveryProofPageType(p.pageType)
  )
}

/** Detect TONU / truck-order-not-used style loads where BOL may not apply. */
export function isTonuLoad(rate?: RateConParse): boolean {
  const text = [
    rate?.special_instructions,
    rate?.commodity,
    rate?.load_number,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  return /\btonu\b|truck\s+order\s+not\s+used|load\s+cancelled|cancelled\s+load/.test(text)
}

/**
 * Required paperwork for standard freight (AIDocView §7).
 * Rate con present → BOL required unless TONU.
 */
export function evaluateRequiredDocuments(input: RequiredDocumentInput): RequiredDocumentResult {
  const pages = input.pageClassifications ?? []
  const reviewDocs = input.reviewDocuments ?? []
  const bolPageCount =
    input.bolPageCount ?? countDeliveryProofPages(pages)
  const hasRateCon = Boolean(
    input.rateConParse?.load_number ||
      input.rateConParse?.carrier_name ||
      reviewDocs.some(
        (d) => d.extraction.rateConParse?.load_number || d.extraction.rateConParse?.carrier_name
      )
  )
  let hasBol =
    bolPageCount > 0 ||
    Boolean(input.bolAudit?.ship_to || input.bolAudit?.ship_from) ||
    Boolean(input.bolAudit)
  if (reviewDocs.length) {
    hasBol = hasBol || reviewDocs.some((d) => documentHasBolEvidence(d.extraction))
  }
  const hasInvoice =
    countPageType(pages, 'invoice') > 0 || Boolean(input.hasExtractedInvoice)
  const tonu = isTonuLoad(input.rateConParse)

  const flags: CrossValidationFlag[] = []
  let documentGate: RequiredDocumentResult['documentGate'] = 'APPROVED'

  if (input.multiLoadUpload && reviewDocs.length > 0) {
    reviewDocs.forEach((doc) => {
      const docRate = doc.extraction.rateConParse
      const docHasRateCon = Boolean(docRate?.load_number || docRate?.carrier_name)
      if (!docHasRateCon) return
      const docHasBol = documentHasBolEvidence(doc.extraction)
      const docTonu = isTonuLoad(docRate)
      if (!docHasBol && !docTonu) {
        flags.push({
          level: 'ERROR',
          field: `packet_${doc.fileName}_missing_bol`,
          message: `${doc.fileName}: A bill of lading is required for this load but was not found in this PDF.`,
        })
        documentGate = 'REJECTED'
      }
    })
  } else if (hasRateCon && !hasBol && !tonu) {
    flags.push({
      level: 'ERROR',
      field: 'missing_bol',
      message:
        'A bill of lading is required for this load but was not found in the upload. Cannot approve without it.',
    })
    documentGate = 'REJECTED'
  }

  if (tonu && !hasBol) {
    flags.push({
      level: 'INFO',
      field: 'tonu_no_bol',
      message: 'TONU / cancelled load detected — BOL not required.',
    })
  }

  const hasExcelBilling = Boolean(input.hasExcelBilling)

  if (hasRateCon && !hasInvoice && !hasExcelBilling) {
    flags.push({
      level: 'ERROR',
      field: 'missing_billed_info',
      message:
        'No billing information found. Add a carrier invoice in the PDF or upload an Excel load sheet so we can verify load number, amount, and broker.',
    })
    documentGate = 'REJECTED'
  } else if (hasRateCon && !hasInvoice && hasExcelBilling) {
    flags.push({
      level: 'INFO',
      field: 'excel_billed_source',
      message: 'Billed amounts verified from Excel load sheet (no carrier invoice page in upload).',
    })
  } else if (hasRateCon && hasInvoice && !hasExcelBilling) {
    flags.push({
      level: 'INFO',
      field: 'invoice_billed_source',
      message: 'Billed amounts verified from carrier invoice (no Excel sheet provided).',
    })
  }

  if (!hasRateCon && hasBol) {
    flags.push({
      level: 'WARNING',
      field: 'missing_rate_con',
      message: 'Rate confirmation not detected — BOL present without rate con.',
    })
    if (documentGate === 'APPROVED') documentGate = 'NEEDS_REVIEW'
  }

  const hasLumperDoc = reviewDocs.some((doc) => documentHasLumperEvidence(doc.extraction))
  const expectsLumper = reviewDocs.some((doc) => rateConMentionsLumper(doc.extraction.rateConParse))
  if (expectsLumper && !hasLumperDoc) {
    flags.push({
      level: 'WARNING',
      field: 'missing_lumper_receipt',
      message:
        'Rate confirmation includes unloading/lumper charges, but no lumper receipt was found in the upload.',
    })
    if (documentGate === 'APPROVED') documentGate = 'NEEDS_REVIEW'
  }

  return {
    hasRateCon,
    hasBol,
    hasInvoice,
    bolPageCount,
    flags,
    documentGate,
  }
}

/** Merge document gate into cross-validation overall status. */
export function mergeOverallStatus(
  crossOverall: 'APPROVED' | 'NEEDS_REVIEW' | 'REJECTED',
  documentGate: 'APPROVED' | 'NEEDS_REVIEW' | 'REJECTED'
): 'APPROVED' | 'NEEDS_REVIEW' | 'REJECTED' {
  if (crossOverall === 'REJECTED' || documentGate === 'REJECTED') return 'REJECTED'
  if (crossOverall === 'NEEDS_REVIEW' || documentGate === 'NEEDS_REVIEW') return 'NEEDS_REVIEW'
  return 'APPROVED'
}
