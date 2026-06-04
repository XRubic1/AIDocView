import { DocumentReviewResult } from '../types/documentReview'
import { RateConParse } from '../types/documentPipeline'
import { extractBatchContext } from '../services/crossValidationService'
import { coerceRateValue } from './effectiveRateAmount'
import { InvoiceUnit } from './multiInvoiceValidation'

/** Fields pulled from AI-reviewed documents for Excel / cross-check. */
export interface ExtractedBatchFields {
  loadNumber?: string
  /** Load # from an invoice page only (not rate con). */
  invoiceLoadNumber?: string
  broker?: string
  carrier?: string
  amount?: number
  invoiceNumber?: string
  invoiceDate?: string
}

function normalizeLoadNumber(value?: string | null): string {
  const digits = (value ?? '').replace(/\D/g, '')
  if (!digits) return ''
  const trimmed = digits.replace(/^0+/, '')
  return trimmed || digits
}

export function loadNumbersMatch(a?: string | null, b?: string | null): boolean {
  const left = normalizeLoadNumber(a)
  const right = normalizeLoadNumber(b)
  if (!left || !right) return false
  if (left === right) return true
  if (left.endsWith(right) || right.endsWith(left)) return true
  // Broker PO often prefixed on one doc only (e.g. "TQL4873729787" vs "4873729787")
  if (Math.min(left.length, right.length) >= 6) {
    if (left.includes(right) || right.includes(left)) return true
  }
  return false
}

/** Load number from PDF filename stem (e.g. 14503.pdf → 14503). */
export function loadNumberFromFileName(fileName: string): string | undefined {
  const stem = fileName.replace(/\.pdf$/i, '').trim()
  const match = stem.match(/(\d{4,})/)
  return match?.[1]
}

/** Try to read invoice number from filename (e.g. INV-12345.pdf). */
export function invoiceNumberFromFileName(fileName: string): string | undefined {
  const match =
    fileName.match(/\b(inv(?:oice)?[-_\s]?)?(\d{4,})\b/i) ??
    fileName.match(/\b(\d{5,})\b/)
  return match?.[2] ?? match?.[1]
}

/** Aggregate load, broker, amount, and invoice hints from a batch review. */
export function extractBatchFields(documents: DocumentReviewResult[]): ExtractedBatchFields {
  const { rateConDoc, rateConParse } = extractBatchContext(documents)

  const rate = rateConParse ?? rateConDoc?.extraction.rateConParse
  const fields = rateConDoc?.extraction.rateConFields

  let loadNumber = rate?.load_number ?? fields?.loadNumber?.value?.toString()
  let broker = rate?.broker_name ?? fields?.broker?.value?.toString()
  let carrier = rate?.carrier_name ?? fields?.carrier?.value?.toString()
  let amount =
    coerceRateValue(fields?.rate?.value) ??
    rate?.rate_total ??
    (typeof fields?.rate?.value === 'number' ? fields.rate.value : undefined)

  let invoiceLoadNumber: string | undefined

  for (const doc of documents) {
    const primaryInv = doc.extraction.primaryInvoice ?? doc.extraction.invoicePageAudits?.[0]?.invoice
    if (primaryInv?.load_number) {
      invoiceLoadNumber = primaryInv.load_number
    }
    if (primaryInv?.amount_total != null && amount == null) {
      amount = primaryInv.amount_total
    }

    const hasInvoicePage = doc.extraction.pageClassifications?.some(
      (page) => page.pageType === 'invoice'
    )
    if (!invoiceLoadNumber && hasInvoicePage && doc.extraction.loadNumber) {
      invoiceLoadNumber = String(doc.extraction.loadNumber)
    }

    if (!loadNumber && doc.extraction.loadNumber && !hasInvoicePage) {
      loadNumber = String(doc.extraction.loadNumber)
    }
    if (!broker && doc.extraction.rateConFields?.broker?.value) {
      broker = String(doc.extraction.rateConFields.broker.value)
    }
    if (!carrier && doc.extraction.rateConFields?.carrier?.value) {
      carrier = String(doc.extraction.rateConFields.carrier.value)
    }
    if (amount == null && doc.extraction.rate != null) {
      amount = doc.extraction.rate
    }
  }

  const invoiceDoc = documents.find((doc) =>
    doc.extraction.pageClassifications?.some((page) => page.pageType === 'invoice')
  )
  let invoiceNumber: string | undefined
  if (invoiceDoc) {
    invoiceNumber =
      invoiceNumberFromFileName(invoiceDoc.fileName) ??
      (invoiceDoc.extraction.loadNumber ? String(invoiceDoc.extraction.loadNumber) : undefined)
  }

  return {
    loadNumber: loadNumber ?? undefined,
    invoiceLoadNumber: invoiceLoadNumber ?? undefined,
    broker: broker ?? undefined,
    carrier: carrier ?? undefined,
    amount: amount ?? undefined,
    invoiceNumber,
  }
}

/** Fields from one invoice (and its PDF rate con) for Excel row lookup. */
export function extractFieldsForInvoiceUnit(
  unit: InvoiceUnit,
  rateCon?: RateConParse
): ExtractedBatchFields {
  const inv = unit.invoice
  const stemLoad = loadNumberFromFileName(unit.fileName)
  return {
    loadNumber: inv.load_number ?? stemLoad ?? rateCon?.load_number,
    invoiceLoadNumber: inv.load_number ?? stemLoad,
    broker: inv.broker_name ?? rateCon?.broker_name,
    carrier: inv.carrier_name ?? rateCon?.carrier_name,
    amount: inv.amount_total ?? rateCon?.rate_total,
    invoiceNumber: inv.invoice_number ?? invoiceNumberFromFileName(unit.fileName),
    invoiceDate: inv.invoice_date,
  }
}

/** Fields from a single uploaded PDF (rate con + invoice pages in that file). */
export function extractFieldsForDocument(
  documents: DocumentReviewResult[],
  documentId: string
): ExtractedBatchFields {
  const doc = documents.find((d) => d.documentId === documentId)
  if (!doc) return {}
  return extractBatchFields([doc])
}

export function amountsMatchCents(a?: number | null, b?: number | null): boolean {
  if (a == null || b == null) return false
  return Math.abs(a - b) <= 0.01
}
