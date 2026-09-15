import type {
  ExtractedDocumentData,
  DocumentReviewResult,
  ReviewImageInfo,
} from '../../../types/documentReview'
import type { InvoiceParse, RateConParse } from '../../../types/documentPipeline'
import { loadNumberFromFileName } from '../../../utils/extractBatchFields'
import { formatRateConStop } from '../../../utils/locationMatch'
import type { DocSortFingerprint, DocSortKind } from '../types'
import { parseRateAmount } from './formatRate'
import { normalizeDocDate } from './matchKeys'

function pushLoad(target: string[], value?: string | null) {
  const trimmed = (value ?? '').trim()
  if (trimmed && !target.includes(trimmed)) target.push(trimmed)
}

function formatAddress(
  stop?: { city?: string; state?: string; address?: string; name?: string } | null
): string | undefined {
  if (!stop) return undefined
  const line = formatRateConStop(stop)
  if (line?.trim()) return line.trim()
  const parts = [stop.name, stop.city, stop.state].filter((p) => p?.trim())
  return parts.length > 0 ? parts.join(', ') : undefined
}

/** Classify a file from the full extract (RC / BOL / invoice / lumper). */
export function docSortKindFromExtraction(extraction: ExtractedDocumentData): DocSortKind {
  const type = extraction.documentType
  if (type === 'rate_confirmation') return 'rate_confirmation'
  if (
    type === 'bill_of_lading' ||
    type === 'proof_of_delivery' ||
    type === 'delivery_confirmation'
  ) {
    return 'bill_of_lading'
  }
  if (type === 'lumper') return 'lumper'

  const pages = extraction.pageClassifications ?? []
  if (pages.some((page) => page.pageType === 'rate_confirmation')) return 'rate_confirmation'
  if (
    pages.some(
      (page) =>
        page.pageType === 'bill_of_lading' ||
        page.pageType === 'proof_of_delivery' ||
        page.pageType === 'delivery_confirmation'
    )
  ) {
    return 'bill_of_lading'
  }
  if (pages.some((page) => page.pageType === 'lumper')) return 'lumper'

  const hasInvoice =
    Boolean(
      extraction.primaryInvoice?.invoice_number ||
        extraction.primaryInvoice?.amount_total ||
        extraction.primaryInvoice?.load_number
    ) || (extraction.invoicePageAudits?.length ?? 0) > 0
  if (hasInvoice || pages.some((page) => page.pageType === 'invoice')) return 'invoice'

  return 'other'
}

function bestInvoice(extraction: ExtractedDocumentData): InvoiceParse | undefined {
  if (extraction.primaryInvoice) return extraction.primaryInvoice
  return extraction.invoicePageAudits?.[0]?.invoice
}

function bestLumper(extraction: ExtractedDocumentData): {
  amount?: number
  vendor?: string
} {
  const first = extraction.lumperPageAudits?.[0]
  return { amount: first?.amount, vendor: first?.vendor }
}

/** Load / PO / BOL refs used to match unsorted files into one packet. */
export function loadNumbersFromExtraction(
  extraction: ExtractedDocumentData,
  fileName: string
): string[] {
  const loads: string[] = []
  const rateCon = extraction.rateConParse
  const bol = extraction.bolAudit
  const invoice = bestInvoice(extraction)

  pushLoad(loads, extraction.loadNumber)
  pushLoad(loads, rateCon?.load_number)
  pushLoad(loads, bol?.load_number)
  pushLoad(loads, invoice?.load_number)
  rateCon?.bol_reference_numbers?.forEach((n) => pushLoad(loads, n))
  bol?.reference_numbers?.forEach((n) => pushLoad(loads, n))
  extraction.invoicePageAudits?.forEach((page) => pushLoad(loads, page.invoice.load_number))
  extraction.bolPageAudits?.forEach((page) => pushLoad(loads, page.audit.load_number))

  const fromFile = loadNumberFromFileName(fileName)
  if (fromFile) pushLoad(loads, fromFile)
  return loads
}

function payableRate(extraction: ExtractedDocumentData): number | undefined {
  const fromRc = parseRateAmount(extraction.rateConParse?.rate_total)
  if (fromRc) return fromRc
  const fromField = parseRateAmount(extraction.rate)
  if (fromField) return fromField
  const fromInvoice = parseRateAmount(bestInvoice(extraction)?.amount_total)
  if (fromInvoice) return fromInvoice
  return parseRateAmount(bestLumper(extraction).amount)
}

/**
 * Compact fingerprint + full extract JSON for matching and later verification
 * (no second vision pass).
 */
export function fingerprintFromExtraction(
  docId: string,
  fileName: string,
  extraction: ExtractedDocumentData,
  confidenceFallback = 0.7
): DocSortFingerprint {
  const rateCon: RateConParse | undefined = extraction.rateConParse
  const invoice = bestInvoice(extraction)
  const lumper = bestLumper(extraction)
  const origin =
    formatAddress(rateCon?.origin) || extraction.origin || extraction.shipFrom || undefined
  const lastStop = rateCon?.destinations?.[rateCon.destinations.length - 1]
  const delivery =
    formatAddress(lastStop) ||
    extraction.destination ||
    extraction.shipTo ||
    extraction.bolAudit?.ship_to ||
    undefined

  return {
    docId,
    fileName,
    kind: docSortKindFromExtraction(extraction),
    confidence: Math.max(
      0,
      Math.min(1, Number(extraction.confidence ?? rateCon?.confidence ?? confidenceFallback))
    ),
    loadNumbers: loadNumbersFromExtraction(extraction, fileName),
    broker:
      rateCon?.broker_name?.trim() ||
      invoice?.broker_name?.trim() ||
      extraction.rateConFields?.broker?.value?.trim() ||
      undefined,
    carrier:
      rateCon?.carrier_name?.trim() ||
      invoice?.carrier_name?.trim() ||
      extraction.rateConFields?.carrier?.value?.trim() ||
      undefined,
    pickup: origin,
    delivery,
    pickupDate:
      normalizeDocDate(rateCon?.origin?.pickup_date) ||
      normalizeDocDate(extraction.receivingDate) ||
      undefined,
    deliveryDate:
      normalizeDocDate(lastStop?.delivery_date) ||
      normalizeDocDate(invoice?.invoice_date) ||
      undefined,
    rateAmount: payableRate(extraction),
    rateCurrency: rateCon?.rate_currency?.trim().toUpperCase() || (payableRate(extraction) ? 'USD' : undefined),
    notes: extraction.notes?.trim() || invoice?.notes?.trim() || undefined,
    extract: extraction,
    invoiceNumber: invoice?.invoice_number?.trim() || undefined,
    lumperAmount: lumper.amount,
    lumperVendor: lumper.vendor,
  }
}

export function fingerprintFromReview(result: DocumentReviewResult): DocSortFingerprint {
  return fingerprintFromExtraction(result.documentId, result.fileName, result.extraction)
}

function stubReviewImage(fileName: string): ReviewImageInfo {
  return {
    previewDataUrl: '',
    sourceType: 'image',
    pageNumber: 1,
    totalPages: 1,
    imageWidth: 1,
    imageHeight: 1,
    fileName,
    fileSize: 0,
    mimeType: 'application/pdf',
  }
}

/** Rebuild a review result from the JSON stored at DocSort time. */
export function reviewResultFromFingerprint(fp: DocSortFingerprint): DocumentReviewResult | null {
  if (!fp.extract) return null
  return {
    documentId: fp.docId,
    fileName: fp.fileName,
    modelUsed: 'doc-sort-extract',
    upgradedFromMini: false,
    extraction: fp.extract,
    debugLog: {
      image: stubReviewImage(fp.fileName),
      attempts: [],
      promptNote: 'Reused DocSort extract JSON — skipped second vision pass.',
    },
  }
}
