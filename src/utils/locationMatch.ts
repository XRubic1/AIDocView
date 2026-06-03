import { RateConAddress } from '../types/documentPipeline'

/** Normalize address/location strings for fuzzy comparison. */
export function normalizeLocation(value?: string | null): string | undefined {
  if (!value) return undefined
  return value
    .trim()
    .toLowerCase()
    .replace(/[.,#]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Build one line from structured rate con origin/destination. */
export function formatRateConStop(stop?: RateConAddress | null): string | undefined {
  if (!stop) return undefined
  const parts = [stop.name, stop.address, stop.city, stop.state, stop.zip].filter(Boolean)
  return parts.length > 0 ? parts.join(', ') : undefined
}

/** City and state only — used when several stops must fit in the summary glance. */
export function formatRateConStopCityState(stop?: RateConAddress | null): string {
  if (!stop) return '—'
  const city = stop.city?.trim()
  const state = stop.state?.trim()
  if (city && state) return `${city}, ${state}`
  if (city) return city
  if (state) return state
  return formatRateConStop(stop) ?? '—'
}

export interface StopsSummaryInput {
  origin?: RateConAddress | null
  originFallback?: string
  destinations?: RateConAddress[]
  deliveryFallback?: string
}

function hasStopData(stop?: RateConAddress | null): boolean {
  return Boolean(stop && (stop.city || stop.state || stop.address || stop.name || stop.zip))
}

/** Parse trailing "City, ST" from a single-line address string. */
function compactCityStateFromText(text?: string): string | undefined {
  if (!text?.trim()) return undefined
  const trimmed = text.trim()
  const cityCommaState = trimmed.match(
    /,\s*([^,]+?),\s*([A-Za-z]{2})\b(?:\s+\d{5}(?:-\d{4})?)?\s*$/i
  )
  if (cityCommaState) {
    return `${cityCommaState[1].trim()}, ${cityCommaState[2].toUpperCase()}`
  }
  const citySpaceState = trimmed.match(/,\s*([^,]+?)\s+([A-Za-z]{2})\s*$/i)
  if (citySpaceState) {
    return `${citySpaceState[1].trim()}, ${citySpaceState[2].toUpperCase()}`
  }
  return undefined
}

/**
 * City and state for compact summary UI (meta bar, stops glance).
 * Uses structured rate-con stop when possible; otherwise parses free-text addresses.
 */
export function formatLocationCompact(
  structured?: RateConAddress | null,
  fallback?: string
): string | undefined {
  if (structured && (structured.city || structured.state)) {
    const compact = formatRateConStopCityState(structured)
    if (compact !== '—') return compact
  }
  return compactCityStateFromText(fallback)
}

function dedupeLocationLabels(values: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of values) {
    const key = value.toLowerCase()
    if (!seen.has(key)) {
      seen.add(key)
      out.push(value)
    }
  }
  return out
}

/** Split free-text that lists several addresses (semicolon, pipe, or newline). */
export function splitAddressSegments(text?: string): string[] {
  if (!text?.trim()) return []
  const trimmed = text.trim()
  const parts = trimmed.split(/\s*;\s*|\s*\|\s*|\r?\n+/).map((p) => p.trim()).filter(Boolean)
  return parts.length > 1 ? parts : [trimmed]
}

function compactFromTextSegments(text?: string): string[] {
  return dedupeLocationLabels(
    splitAddressSegments(text)
      .map((seg) => compactCityStateFromText(seg) ?? formatLocationCompact(undefined, seg))
      .filter((s): s is string => Boolean(s))
  )
}

/**
 * One or many stops as city, state — e.g. "Dallas, TX" or "1. Dallas, TX · 2. Houston, TX".
 */
export function formatLocationsCompactLine(
  structured?: RateConAddress[],
  fallback?: string
): string | undefined {
  const fromStructured = dedupeLocationLabels(
    (structured?.filter(hasStopData) ?? [])
      .map((s) => formatRateConStopCityState(s))
      .filter((s) => s !== '—')
  )

  const fromText = compactFromTextSegments(fallback)
  const all = dedupeLocationLabels([...fromStructured, ...fromText])

  if (all.length === 0) {
    return formatLocationCompact(structured?.[0], fallback)
  }
  if (all.length === 1) return all[0]
  return all.map((s, i) => `${i + 1}. ${s}`).join(' · ')
}

/**
 * Summary display for pickup + deliveries on the Stops glance cell.
 * Pickup always shown when known; all stops as city, state only.
 */
export function formatStopsForSummary(input: StopsSummaryInput): string {
  const parts: string[] = []

  const pickupLine = formatLocationsCompactLine(
    input.origin ? [input.origin] : undefined,
    input.originFallback
  )
  if (pickupLine) {
    parts.push(`PU ${pickupLine}`)
  }

  const deliveryLine = formatLocationsCompactLine(
    input.destinations?.filter(hasStopData),
    input.deliveryFallback
  )
  if (deliveryLine) {
    parts.push(`DL ${deliveryLine}`)
  }

  return parts.length > 0 ? parts.join(' · ') : '—'
}

/** Pull comparable tokens (zip, state, street number, significant words). */
function addressTokens(normalized: string): Set<string> {
  const tokens = new Set<string>()

  const zipMatches = normalized.match(/\b\d{5}(?:-\d{4})?\b/g)
  zipMatches?.forEach((zip) => tokens.add(zip))

  const stateMatch = normalized.match(/\b([a-z]{2})\b(?=\s+\d{5}\b|$)/)
  if (stateMatch) tokens.add(stateMatch[1])

  const streetNumbers = normalized.match(/\b\d{1,6}\b/g)
  streetNumbers?.forEach((num) => tokens.add(`n:${num}`))

  normalized
    .split(' ')
    .filter((word) => word.length > 2 && !/^\d+$/.test(word))
    .forEach((word) => tokens.add(word))

  return tokens
}

/** Token overlap score — 1 when addresses clearly refer to the same place. */
function tokenOverlapScore(left: string, right: string): number {
  const leftTokens = addressTokens(left)
  const rightTokens = addressTokens(right)
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0

  let overlap = 0
  leftTokens.forEach((token) => {
    if (rightTokens.has(token)) overlap += 1
  })

  return overlap / Math.min(leftTokens.size, rightTokens.size)
}

/** Compare two location strings — null if either missing. */
export function destinationsMatch(a?: string, b?: string): boolean | null {
  const left = normalizeLocation(a)
  const right = normalizeLocation(b)
  if (!left || !right) return null

  if (left === right || left.includes(right) || right.includes(left)) {
    return true
  }

  const overlap = tokenOverlapScore(left, right)
  if (overlap >= 0.55) return true

  const leftZip = left.match(/\b\d{5}\b/)?.[0]
  const rightZip = right.match(/\b\d{5}\b/)?.[0]
  if (leftZip && rightZip && leftZip === rightZip) {
    const leftCityState = left.replace(leftZip, '').trim()
    const rightCityState = right.replace(rightZip, '').trim()
    if (
      leftCityState.includes(rightCityState) ||
      rightCityState.includes(leftCityState) ||
      tokenOverlapScore(leftCityState, rightCityState) >= 0.5
    ) {
      return true
    }
  }

  return false
}

/** Same place when city, state, and street tokens align — ZIP+4 variants OK. */
export function coreAddressMatches(a?: string, b?: string): boolean {
  const left = normalizeLocation(a)
  const right = normalizeLocation(b)
  if (!left || !right) return false
  if (destinationsMatch(a, b) === true) return true

  const stripZip = (s: string) =>
    s.replace(/\b\d{5}(?:-\d{4})?\b/g, '').replace(/\s+/g, ' ').trim()
  const leftCore = stripZip(left)
  const rightCore = stripZip(right)
  if (!leftCore || !rightCore) return false
  if (leftCore === rightCore) return true
  return tokenOverlapScore(leftCore, rightCore) >= 0.5
}
