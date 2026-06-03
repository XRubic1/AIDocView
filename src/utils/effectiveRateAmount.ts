import { RateConParse } from '../types/documentPipeline'
import { DocumentReviewResult } from '../types/documentReview'

/** Coerce training field or API value to a rate number. */
export function coerceRateValue(value: unknown): number | undefined {
  if (value == null || value === '') return undefined
  if (typeof value === 'number' && !Number.isNaN(value)) return value
  const cleaned = String(value).replace(/[$,\s]/g, '')
  const parsed = Number(cleaned)
  return Number.isNaN(parsed) ? undefined : parsed
}

/** User-trained rate field overrides AI rate_con parse when present. */
export function applyEffectiveRateToParse(
  parse: RateConParse,
  rateConDoc?: DocumentReviewResult
): RateConParse {
  const trained = coerceRateValue(rateConDoc?.extraction.rateConFields?.rate?.value)
  if (trained == null) return parse
  return { ...parse, rate_total: trained }
}

export function getEffectiveRateFromDocument(doc: DocumentReviewResult): number | undefined {
  const trained = coerceRateValue(doc.extraction.rateConFields?.rate?.value)
  if (trained != null) return trained
  return doc.extraction.rateConParse?.rate_total ?? coerceRateValue(doc.extraction.rate)
}
