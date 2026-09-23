import { loadNumbersMatch } from '../../../utils/extractBatchFields'
import { destinationsMatch, formatRateConStop, formatRateConStopCityState } from '../../../utils/locationMatch'
import type { DocSortFingerprint } from '../types'
import { documentFamilyKey, namesOverlap, sameDocumentFamily } from './matchKeys'

const MIN_NUMERIC_REF_LEN = 5
const MIN_ALPHA_REF_LEN = 4
/** Dest-only or pickup+delivery must clear this to attach a BOL. */
export const BOL_RC_MATCH_THRESHOLD = 50

function compactRef(value?: string | null): string {
  return (value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').trim()
}

function isUsableRef(value?: string | null): boolean {
  const compact = compactRef(value)
  if (compact.length < MIN_ALPHA_REF_LEN) return false
  const digits = compact.replace(/\D/g, '')
  if (digits.length === compact.length) return digits.length >= MIN_NUMERIC_REF_LEN
  return compact.length >= MIN_ALPHA_REF_LEN
}

function pushUnique(target: string[], value?: string | null) {
  const trimmed = (value ?? '').trim()
  if (!trimmed) return
  if (!target.some((item) => item.toUpperCase() === trimmed.toUpperCase())) {
    target.push(trimmed)
  }
}

function pushStop(target: string[], stop?: { name?: string; address?: string; city?: string; state?: string; zip?: string } | null) {
  const cityState = formatRateConStopCityState(stop)
  if (cityState && cityState !== '—') pushUnique(target, cityState)
  const full = formatRateConStop(stop)
  if (full) pushUnique(target, full)
}

/** RC load # plus every BOL/PO/ref printed on the rate con. */
export function rateConReferenceNumbers(fp: DocSortFingerprint): string[] {
  const refs: string[] = []
  fp.loadNumbers.forEach((n) => pushUnique(refs, n))
  pushUnique(refs, fp.extract?.loadNumber)
  pushUnique(refs, fp.extract?.rateConParse?.load_number)
  fp.extract?.rateConParse?.bol_reference_numbers?.forEach((n) => pushUnique(refs, n))
  return refs.filter(isUsableRef)
}

/** BOL load/PO/PRO and every reference number on the bill. */
export function bolReferenceNumbers(fp: DocSortFingerprint): string[] {
  const refs: string[] = []
  fp.loadNumbers.forEach((n) => pushUnique(refs, n))
  pushUnique(refs, fp.extract?.loadNumber)
  pushUnique(refs, fp.extract?.bolAudit?.load_number)
  fp.extract?.bolAudit?.reference_numbers?.forEach((n) => pushUnique(refs, n))
  fp.extract?.bolPageAudits?.forEach((page) => {
    pushUnique(refs, page.audit.load_number)
    page.audit.reference_numbers?.forEach((n) => pushUnique(refs, n))
  })
  return refs.filter(isUsableRef)
}

function refsMatch(left: string, right: string): boolean {
  if (loadNumbersMatch(left, right)) return true
  const a = compactRef(left)
  const b = compactRef(right)
  return Boolean(a && b && a === b)
}

export function sharedReferenceNumbers(rateCon: DocSortFingerprint, bol: DocSortFingerprint): string[] {
  const rcRefs = rateConReferenceNumbers(rateCon)
  const bolRefs = bolReferenceNumbers(bol)
  return rcRefs.filter((rcRef) => bolRefs.some((bolRef) => refsMatch(rcRef, bolRef)))
}

/** Every delivery stop on the rate con (multi-stop included). */
export function rateConDestinations(fp: DocSortFingerprint): string[] {
  const stops: string[] = []
  fp.extract?.rateConParse?.destinations?.forEach((stop) => pushStop(stops, stop))
  pushUnique(stops, fp.delivery)
  pushUnique(stops, fp.extract?.destination)
  pushUnique(stops, fp.extract?.rateConFields?.drop?.value)
  return stops
}

export function rateConOrigins(fp: DocSortFingerprint): string[] {
  const stops: string[] = []
  pushStop(stops, fp.extract?.rateConParse?.origin)
  pushUnique(stops, fp.pickup)
  pushUnique(stops, fp.extract?.origin)
  pushUnique(stops, fp.extract?.shipFrom)
  pushUnique(stops, fp.extract?.rateConFields?.pickup?.value)
  return stops
}

export function bolDestinations(fp: DocSortFingerprint): string[] {
  const stops: string[] = []
  pushUnique(stops, fp.extract?.bolAudit?.ship_to)
  pushUnique(stops, fp.delivery)
  pushUnique(stops, fp.extract?.shipTo)
  pushUnique(stops, fp.extract?.destination)
  fp.extract?.bolPageAudits?.forEach((page) => {
    pushUnique(stops, page.shipTo)
    pushUnique(stops, page.audit.ship_to)
  })
  return stops
}

export function bolOrigins(fp: DocSortFingerprint): string[] {
  const stops: string[] = []
  pushUnique(stops, fp.extract?.bolAudit?.ship_from)
  pushUnique(stops, fp.pickup)
  pushUnique(stops, fp.extract?.shipFrom)
  pushUnique(stops, fp.extract?.origin)
  return stops
}

function anyDestinationMatch(left: string[], right: string[]): string | undefined {
  for (const a of left) {
    for (const b of right) {
      if (destinationsMatch(a, b) === true) return `${a} ↔ ${b}`
    }
  }
  return undefined
}

export function scoreBolToRateCon(
  bol: DocSortFingerprint,
  rateCon: DocSortFingerprint
): { score: number; reason: string } {
  if (
    rateCon.broker?.trim() &&
    bol.broker?.trim() &&
    !namesOverlap(rateCon.broker, bol.broker)
  ) {
    return {
      score: 0,
      reason: `different brokers (“${rateCon.broker.trim()}” vs “${bol.broker.trim()}”)`,
    }
  }

  let score = 0
  const reasons: string[] = []

  const sharedRefs = sharedReferenceNumbers(rateCon, bol)

  // Pages split from two different source scans (e.g. 14503-p2 vs 14504-p3) are
  // different loads unless a real reference number ties them together. This stops
  // destination-only matches from attaching a BOL to another load's rate con.
  const rcFamily = documentFamilyKey(rateCon.fileName)
  const bolFamily = documentFamilyKey(bol.fileName)
  if (rcFamily && bolFamily && rcFamily !== bolFamily && sharedRefs.length === 0) {
    return {
      score: 0,
      reason: `different source documents (${bolFamily} vs ${rcFamily})`,
    }
  }

  if (sameDocumentFamily(bol, rateCon)) {
    score += 90
    reasons.push(`same scanned document ${rcFamily}`)
  }

  if (sharedRefs.length > 0) {
    score += 90
    reasons.push(`ref ${sharedRefs[0]}`)
  }

  const destHit = anyDestinationMatch(rateConDestinations(rateCon), bolDestinations(bol))
  if (destHit) {
    score += 70
    reasons.push(`destination ${destHit}`)
  }

  const originHit = anyDestinationMatch(rateConOrigins(rateCon), bolOrigins(bol))
  if (originHit) {
    score += 25
    reasons.push(`pickup ${originHit}`)
  }

  return {
    score,
    reason: reasons.length > 0 ? reasons.join(' + ') : 'no destination or ref match',
  }
}

export function bolBelongsWithRateCon(bol: DocSortFingerprint, rateCon: DocSortFingerprint): boolean {
  return scoreBolToRateCon(bol, rateCon).score >= BOL_RC_MATCH_THRESHOLD
}
