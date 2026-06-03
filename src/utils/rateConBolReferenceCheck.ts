import { RateConParse } from '../types/documentPipeline'
import { loadNumbersMatch } from './extractBatchFields'

export interface RateConBolReferenceResult {
  allMatched: boolean
  partialMatch: boolean
  missing: string[]
  matched: string[]
}

function normalizeRef(value?: string | null): string {
  return (value ?? '').trim()
}

export function checkRateConBolReferences(
  rateConParse: RateConParse | undefined,
  bolReferences: string[]
): RateConBolReferenceResult {
  const rcRefs = [...new Set((rateConParse?.bol_reference_numbers ?? []).map(normalizeRef).filter(Boolean))]
  if (rcRefs.length === 0) {
    return { allMatched: true, partialMatch: false, missing: [], matched: [] }
  }
  const matched = rcRefs.filter((ref) =>
    bolReferences.some((bolRef) => loadNumbersMatch(ref, bolRef) || normalizeRef(ref) === normalizeRef(bolRef))
  )
  const missing = rcRefs.filter((ref) => !matched.includes(ref))
  return {
    allMatched: missing.length === 0,
    partialMatch: matched.length > 0 && missing.length > 0,
    missing,
    matched,
  }
}

export function validateRateLineItems(rateConParse?: RateConParse): {
  isValid: boolean
  expectedTotal?: number
  actualTotal?: number
  message?: string
} {
  const lineItems = rateConParse?.rate_line_items ?? []
  if (lineItems.length === 0 || rateConParse?.rate_total == null) {
    return { isValid: true }
  }
  const sum = lineItems.reduce((acc, row) => acc + (row.amount ?? 0), 0)
  const diff = Math.abs(sum - (rateConParse.rate_total ?? 0))
  if (diff <= 1) {
    return { isValid: true, expectedTotal: rateConParse.rate_total ?? undefined, actualTotal: sum }
  }
  return {
    isValid: false,
    expectedTotal: rateConParse.rate_total ?? undefined,
    actualTotal: sum,
    message: `Rate confirmation total ($${(rateConParse.rate_total ?? 0).toFixed(2)}) does not match its line items sum ($${sum.toFixed(2)}).`,
  }
}
