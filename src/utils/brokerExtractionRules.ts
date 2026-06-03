import { RateConFields } from '../types/documentReview'
import { RateConParse } from '../types/documentPipeline'

const AGENCY_OFFICE_PATTERN =
  /transsouth|agency\s*name|agency\s*office|\btsx\b|agent\s*office|logistics\s*llc\s*-\s*tsx/i

/** True when the extracted "broker" looks like an agency office, not the freight broker. */
export function looksLikeAgencyNotBroker(name: string, reasoning?: string): boolean {
  const combined = `${name} ${reasoning ?? ''}`
  return AGENCY_OFFICE_PATTERN.test(combined) || /\bagency\b/i.test(reasoning ?? '')
}

/** Detect Landstar-branded rate con from extracted data. */
export function isLandstarBrandedDocument(parse: RateConParse, fields?: RateConFields): boolean {
  const blob = [
    parse.broker_name,
    parse.carrier_name,
    parse.special_instructions,
    parse.load_number,
    fields?.emailDomain?.value,
    fields?.broker?.labelHint,
    fields?.broker?.reasoning,
  ]
    .filter(Boolean)
    .join(' ')

  return /landstar/i.test(blob) || /@landstar\.com/i.test(blob)
}

/**
 * Landstar rate cons: broker is Landstar — not "Agency Name" (e.g. Transsouth Logistics / TSX).
 */
export function applyBrokerAgencyCorrection(
  parse: RateConParse,
  fields?: RateConFields
): { parse: RateConParse; fields?: RateConFields; corrected: boolean } {
  const brokerValue = String(parse.broker_name ?? fields?.broker?.value ?? '').trim()
  if (!brokerValue) return { parse, fields, corrected: false }

  const landstarDoc = isLandstarBrandedDocument(parse, fields)
  const agencyMislabel = looksLikeAgencyNotBroker(brokerValue, fields?.broker?.reasoning)

  if (!landstarDoc || !agencyMislabel) {
    return { parse, fields, corrected: false }
  }

  const updatedParse: RateConParse = { ...parse, broker_name: 'Landstar' }
  const updatedFields = fields
    ? {
        ...fields,
        broker: {
          ...fields.broker,
          value: 'Landstar',
          confidence: Math.max(fields.broker?.confidence ?? 0.85, 0.85),
          reasoning:
            'On Landstar rate cons, the broker is Landstar (or Landstar Ranger Inc.), not the Agency Name. Transsouth Logistics / TSX is an agency office.',
          labelHint: 'Landstar broker branding / header — not Agency Name field',
        },
      }
    : fields

  return { parse: updatedParse, fields: updatedFields, corrected: true }
}
