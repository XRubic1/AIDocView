import { RateConFieldKey } from '../config/rateConRules'
import { RateConFields, RawExtractedField, parseRawField } from '../types/documentReview'
import { RateConParse } from '../types/documentPipeline'
import { applyBrokerAgencyCorrection } from './brokerExtractionRules'

export function formatAddress(parts: {
  name?: string
  address?: string
  city?: string
  state?: string
  zip?: string
}): string {
  const line = [parts.address, parts.city, parts.state, parts.zip].filter(Boolean).join(', ')
  if (parts.name && line) return `${parts.name}, ${line}`
  return parts.name || line || ''
}

/** Coerce API origin/destination (string or address object) to a single line. */
export function coerceLocationString(value: unknown): string | undefined {
  if (value == null) return undefined
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed || undefined
  }
  if (typeof value === 'object' && !Array.isArray(value)) {
    const formatted = formatAddress(value as Parameters<typeof formatAddress>[0])
    return formatted || undefined
  }
  if (Array.isArray(value) && value.length > 0) {
    return coerceLocationString(value[0])
  }
  return undefined
}

/** Coerce optional string fields from mixed API shapes. */
export function coerceStringField(value: unknown): string | undefined {
  if (value == null) return undefined
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed || undefined
  }
  if (typeof value === 'number' && !Number.isNaN(value)) {
    return String(value)
  }
  return undefined
}

/** Map Prompt 2 rate con JSON into legacy RateConFields for the training UI. */
export function rateConParseToFields(
  parse: RateConParse,
  rawFields?: Record<string, RawExtractedField>,
  sourcePage = 1
): RateConFields {
  const pickupFromOrigin = parse.origin ? formatAddress(parse.origin) : ''
  const dropFromDest =
    parse.destinations?.[0] ? formatAddress(parse.destinations[0]) : ''

  const fromRaw = (key: RateConFieldKey) =>
    rawFields?.[key] ? parseRawField<string | number>(rawFields[key]) : undefined

  const fromRawString = (key: RateConFieldKey) => {
    const field = fromRaw(key)
    if (!field) return undefined
    const value = field.value
    return { ...field, value: value == null ? undefined : String(value) }
  }

  const fromRawNumber = (key: RateConFieldKey) => {
    const field = fromRaw(key)
    if (!field) return undefined
    const raw = field.value
    const num = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN
    return { ...field, value: Number.isFinite(num) ? num : undefined }
  }

  const fields: RateConFields = {
    carrier: fromRawString('carrier') ?? {
      value: parse.carrier_name ?? undefined,
      confidence: parse.confidence ?? 0.85,
      reasoning: 'From rate con carrier_name',
      sourcePage,
    },
    broker: fromRawString('broker') ?? {
      value: parse.broker_name ?? undefined,
      confidence: parse.confidence ?? 0.85,
      reasoning: 'From rate con broker_name',
      sourcePage,
    },
    rate: fromRawNumber('rate') ?? {
      value: parse.rate_total ?? undefined,
      confidence: parse.confidence ?? 0.85,
      reasoning: 'From rate con rate_total',
      sourcePage,
    },
    emailDomain: fromRawString('emailDomain'),
    loadNumber: fromRawString('loadNumber') ?? {
      value: parse.load_number ?? undefined,
      confidence: parse.confidence ?? 0.85,
      sourcePage,
    },
    pickup: fromRawString('pickup') ?? {
      value: pickupFromOrigin || undefined,
      confidence: parse.confidence ?? 0.85,
      reasoning: 'From rate con origin block',
      sourcePage,
    },
    drop: fromRawString('drop') ?? {
      value: dropFromDest || undefined,
      confidence: parse.confidence ?? 0.85,
      reasoning: 'From rate con first destination',
      sourcePage,
    },
  }

  return fields
}

/** Apply Landstar/agency broker fix and return updated parse + fields. */
export function finalizeRateConExtraction(
  parse: RateConParse,
  fields: RateConFields,
  rawFields?: Record<string, RawExtractedField>
): { parse: RateConParse; fields: RateConFields } {
  let nextFields = fields
  if (!nextFields.broker?.value && parse.broker_name) {
    nextFields = {
      ...nextFields,
      broker: parseRawField<string>({ value: parse.broker_name, confidence: parse.confidence ?? 0.85 }),
    }
  }

  const corrected = applyBrokerAgencyCorrection(parse, nextFields)
  let nextParse = corrected.parse
  nextFields = corrected.fields ?? nextFields

  if (corrected.corrected && rawFields?.broker) {
    nextFields = {
      ...nextFields,
      broker: {
        ...nextFields.broker!,
        value: 'Landstar',
        reasoning: nextFields.broker?.reasoning,
      },
    }
  }

  return { parse: nextParse, fields: nextFields }
}

export function rateConParseToFlat(parse: RateConParse): {
  loadNumber?: string
  rate?: number
  origin?: string
  destination?: string
} {
  const origin = parse.origin ? formatAddress(parse.origin) : undefined
  const destination = parse.destinations?.[0]
    ? formatAddress(parse.destinations[0])
    : undefined
  return {
    loadNumber: parse.load_number ?? undefined,
    rate: parse.rate_total ?? undefined,
    origin,
    destination,
  }
}
