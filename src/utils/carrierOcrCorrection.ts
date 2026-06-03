import { CrossValidationFlag, RateConParse } from '../types/documentPipeline'
import { brokerSimilarity, brokersFuzzyMatch, normalizeBrokerName } from './brokerFuzzyMatch'
import { InvoiceUnit } from './multiInvoiceValidation'

export interface CarrierOcrCorrectionResult {
  carrier_name?: string | null
  corrected: boolean
  original?: string
  note?: string
}

/** Characters often confused by OCR on carrier names (0/O/U, 5/S, etc.). */
const OCR_EQUIVALENT_GROUPS = [
  ['0', 'o', 'u'],
  ['5', 's'],
  ['1', 'i', 'l'],
  ['8', 'b'],
]

function ocrEquivalentChars(a: string, b: string): boolean {
  if (a === b) return true
  const left = a.toLowerCase()
  const right = b.toLowerCase()
  if (left === right) return true
  return OCR_EQUIVALENT_GROUPS.some(
    (group) => group.includes(left) && group.includes(right)
  )
}

/** Compare compact tokens allowing OCR character substitutions (e.g. 405 ≈ 4US). */
export function tokenOcrSimilarity(a?: string | null, b?: string | null): number {
  const left = (a ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
  const right = (b ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
  if (!left || !right) return 0
  if (left === right) return 1

  const maxLen = Math.max(left.length, right.length)
  const minLen = Math.min(left.length, right.length)
  if (maxLen - minLen > 2) return 0

  let matches = 0
  for (let i = 0; i < minLen; i += 1) {
    if (ocrEquivalentChars(left[i], right[i])) matches += 1
  }
  return matches / maxLen
}

/**
 * Similarity between extracted and reference carrier (Excel, invoice, etc.).
 * Uses token OCR match on the first word plus standard broker fuzzy match on the full name.
 */
export function carrierOcrSimilarity(
  extracted?: string | null,
  reference?: string | null
): number {
  if (!extracted?.trim() || !reference?.trim()) return 0

  const fullSim = brokerSimilarity(extracted, reference)
  if (fullSim >= 0.9) return fullSim

  const extractedTokens = extracted.trim().split(/\s+/)
  const referenceTokens = reference.trim().split(/\s+/)
  const firstTokenSim = tokenOcrSimilarity(extractedTokens[0], referenceTokens[0])
  const tailSim = brokerSimilarity(
    extractedTokens.slice(1).join(' '),
    referenceTokens.slice(1).join(' ')
  )

  return Math.max(fullSim, firstTokenSim * 0.55 + tailSim * 0.45)
}

/**
 * True when the carrier name looks like a vision OCR glitch (digits/letters mixed in the first token).
 * Examples: 405 Freight, 4OS Freight, 4O5 Logistics.
 */
export function looksLikeAmbiguousCarrierOcr(carrierName?: string | null): boolean {
  const first = carrierName?.trim().split(/\s+/)[0] ?? ''
  if (!first) return false

  const compact = first.replace(/[^a-zA-Z0-9]/g, '')
  const hasDigit = /\d/.test(compact)
  const hasLetter = /[a-zA-Z]/.test(compact)
  if (hasDigit && hasLetter) return true

  return /^4[0-9oOsS5]{1,3}$/i.test(compact)
}

const EXCEL_OCR_MATCH_THRESHOLD = 0.65
const EXCEL_OCR_MATCH_THRESHOLD_AMBIGUOUS = 0.55

/**
 * If extracted carrier is an OCR variant of a reference name (Excel row, invoice), use the reference.
 */
export function correctCarrierFromReference(
  extracted?: string | null,
  reference?: string | null,
  sourceLabel = 'Excel'
): CarrierOcrCorrectionResult {
  const original = extracted?.trim()
  const ref = reference?.trim()
  if (!original || !ref) {
    return { carrier_name: extracted, corrected: false }
  }

  if (brokersFuzzyMatch(original, ref)) {
    return { carrier_name: original, corrected: false }
  }

  const similarity = carrierOcrSimilarity(original, ref)
  const ambiguous = looksLikeAmbiguousCarrierOcr(original)
  const threshold = ambiguous ? EXCEL_OCR_MATCH_THRESHOLD_AMBIGUOUS : EXCEL_OCR_MATCH_THRESHOLD

  if (similarity >= threshold) {
    return {
      carrier_name: ref,
      corrected: true,
      original,
      note: `Carrier aligned to ${sourceLabel} "${ref}" (OCR similarity ${Math.round(similarity * 100)}% vs "${original}").`,
    }
  }

  return { carrier_name: original, corrected: false }
}

export function collectAlternateCarrierNames(
  rateConParse?: RateConParse,
  invoiceUnits?: InvoiceUnit[]
): string[] {
  const names = new Set<string>()
  if (rateConParse?.carrier_name) names.add(rateConParse.carrier_name)
  invoiceUnits?.forEach((unit) => {
    if (unit.invoice.carrier_name) names.add(unit.invoice.carrier_name)
  })
  return [...names]
}

/**
 * Prefer Excel carrier when OCR-matched; otherwise try invoice carrier names.
 */
export function reconcileCarrierNameAcrossDocuments(
  rateConParse: RateConParse | undefined,
  invoiceUnits: InvoiceUnit[],
  excelCarrier?: string | null
): { parse?: RateConParse; flag?: CrossValidationFlag } {
  if (!rateConParse?.carrier_name) return {}

  const invoiceCarriers = invoiceUnits
    .map((unit) => unit.invoice.carrier_name)
    .filter(Boolean) as string[]

  if (excelCarrier) {
    const excelFix = correctCarrierFromReference(
      rateConParse.carrier_name,
      excelCarrier,
      'Excel'
    )
    if (excelFix.corrected) {
      return {
        parse: { ...rateConParse, carrier_name: excelFix.carrier_name },
        flag: {
          level: 'INFO',
          field: 'carrier_excel',
          message: excelFix.note ?? `Carrier updated from Excel.`,
        },
      }
    }
  }

  for (const invoiceCarrier of invoiceCarriers) {
    const invoiceFix = correctCarrierFromReference(
      rateConParse.carrier_name,
      invoiceCarrier,
      'invoice'
    )
    if (invoiceFix.corrected) {
      return {
        parse: { ...rateConParse, carrier_name: invoiceFix.carrier_name },
        flag: {
          level: 'INFO',
          field: 'carrier_reconcile',
          message: invoiceFix.note ?? `Carrier aligned to invoice.`,
        },
      }
    }
  }

  return {}
}

/** Normalize for display / comparison logging. */
export function normalizeCarrierName(value?: string | null): string {
  return normalizeBrokerName(value)
}
