/**
 * Server-side port of the DocSort matching logic for the browser-free pipeline.
 *
 * Faithful copy of the pure matching rules from:
 *   src/products/docSort/utils/matchKeys.ts
 *   src/products/docSort/utils/bolRateConMatch.ts
 *   src/products/docSort/services/docSortMatcher.ts
 *   src/products/docSort/utils/invoiceDraftGroups.ts
 *   src/utils/locationMatch.ts (destinationsMatch)
 *   src/utils/extractBatchFields.ts (loadNumbersMatch / filename loads)
 *
 * KEEP IN SYNC: when matching rules change in src/, mirror them here.
 * No DOM / browser APIs — safe for Deno edge functions.
 */

export type DocSortKind =
  | 'rate_confirmation'
  | 'bill_of_lading'
  | 'invoice'
  | 'lumper'
  | 'other'

export function isSupportDocKind(kind: DocSortKind): boolean {
  return kind === 'invoice' || kind === 'lumper' || kind === 'other'
}

export interface RateConAddress {
  name?: string
  address?: string
  city?: string
  state?: string
  zip?: string
}

/** Loose extract JSON shape — only the fields matching needs. */
export interface ExtractData {
  documentType?: string
  loadNumber?: string
  origin?: string
  destination?: string
  shipFrom?: string
  shipTo?: string
  rateConParse?: {
    load_number?: string
    broker_name?: string
    carrier_name?: string
    rate_total?: number
    bol_reference_numbers?: string[]
    destinations?: RateConAddress[]
    origin?: RateConAddress
  }
  rateConFields?: {
    loadNumber?: { value?: unknown }
    pickup?: { value?: string }
    drop?: { value?: string }
    rate?: { value?: unknown }
  }
  bolAudit?: {
    load_number?: string
    reference_numbers?: string[]
    ship_to?: string
    ship_from?: string
  }
  bolPageAudits?: Array<{
    shipTo?: string
    audit: {
      load_number?: string
      reference_numbers?: string[]
      ship_to?: string
    }
  }>
  primaryInvoice?: {
    load_number?: string
    amount_total?: number
  }
  pageClassifications?: Array<{ pageNumber?: number; pageType?: string }>
}

export interface MatchFingerprint {
  docId: string
  fileName: string
  kind: DocSortKind
  confidence: number
  loadNumbers: string[]
  broker?: string
  carrier?: string
  pickup?: string
  delivery?: string
  pickupDate?: string
  deliveryDate?: string
  rateAmount?: number
  rateCurrency?: string
  invoiceNumber?: string
  extract?: ExtractData
}

export interface MatchLoadGroup {
  groupId: string
  label: string
  rateCons: MatchFingerprint[]
  bols: MatchFingerprint[]
  others?: MatchFingerprint[]
  matchReason: string
  matchScore: number
}

export interface MatchSortResult {
  sortedAt: string
  groups: MatchLoadGroup[]
  unmatchedRateCons: MatchFingerprint[]
  unmatchedBols: MatchFingerprint[]
  otherDocuments: MatchFingerprint[]
  totalDocuments: number
}

// ---------------------------------------------------------------------------
// filename helpers (src/utils/batchPaperworkFile.ts / extractBatchFields.ts)
// ---------------------------------------------------------------------------

const PAPERWORK_EXT = /\.(pdf|jpe?g|png)$/i

export function paperworkFileStem(fileName: string): string {
  return fileName.replace(PAPERWORK_EXT, '').trim()
}

const MIN_FILENAME_LOAD_LEN = 5

export function loadNumbersFromFileName(fileName: string): string[] {
  const stem = paperworkFileStem(fileName)
  const runs = [...stem.matchAll(/(\d{4,})/g)].map((match) => match[1])
  const strong = runs.filter((run) => {
    const trimmed = run.replace(/^0+/, '') || run
    return trimmed.length >= MIN_FILENAME_LOAD_LEN
  })
  return strong.sort((a, b) => b.length - a.length)
}

export function loadNumberFromFileName(fileName: string): string | undefined {
  return loadNumbersFromFileName(fileName)[0]
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
  if (Math.min(left.length, right.length) >= 6) {
    if (left.includes(right) || right.includes(left)) return true
  }
  return false
}

// ---------------------------------------------------------------------------
// location matching (src/utils/locationMatch.ts)
// ---------------------------------------------------------------------------

function normalizeLocation(value?: string | null): string | undefined {
  if (!value) return undefined
  return value
    .trim()
    .toLowerCase()
    .replace(/[.,#]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function formatRateConStop(stop?: RateConAddress | null): string | undefined {
  if (!stop) return undefined
  const parts = [stop.name, stop.address, stop.city, stop.state, stop.zip].filter(Boolean)
  return parts.length > 0 ? parts.join(', ') : undefined
}

export function formatRateConStopCityState(stop?: RateConAddress | null): string {
  if (!stop) return '—'
  const city = stop.city?.trim()
  const state = stop.state?.trim()
  if (city && state) return `${city}, ${state}`
  if (city) return city
  if (state) return state
  return formatRateConStop(stop) ?? '—'
}

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

// ---------------------------------------------------------------------------
// match keys (src/products/docSort/utils/matchKeys.ts)
// ---------------------------------------------------------------------------

export const MIN_LOAD_KEY_LEN = 5

export function normalizeLoadKey(value?: string | null): string {
  const digits = (value ?? '').replace(/\D/g, '')
  if (!digits) return ''
  const trimmed = digits.replace(/^0+/, '')
  return trimmed || digits
}

export function isStrongLoadKey(key: string): boolean {
  return key.length >= MIN_LOAD_KEY_LEN
}

export function loadKeysMatch(a?: string | null, b?: string | null): boolean {
  const left = normalizeLoadKey(a)
  const right = normalizeLoadKey(b)
  if (!left || !right) return false
  if (!isStrongLoadKey(left) || !isStrongLoadKey(right)) return false
  if (left === right) return true
  if (Math.min(left.length, right.length) >= 6) {
    if (left.endsWith(right) || right.endsWith(left)) return true
    if (left.includes(right) || right.includes(left)) return true
  }
  return false
}

function normalizeName(value?: string): string {
  return (value ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .trim()
}

export function namesOverlap(a?: string, b?: string): boolean {
  const left = normalizeName(a)
  const right = normalizeName(b)
  if (!left || !right || left.length < 4 || right.length < 4) return false
  return left.includes(right) || right.includes(left)
}

export function normalizeDocDate(value?: string | null): string {
  const raw = (value ?? '').trim()
  if (!raw) return ''
  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (iso) {
    return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`
  }
  const us = raw.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/)
  if (us) {
    const year = us[3].length === 2 ? `20${us[3]}` : us[3]
    return `${year}-${us[1].padStart(2, '0')}-${us[2].padStart(2, '0')}`
  }
  return ''
}

function docDeliveryDate(fp: MatchFingerprint): string {
  return normalizeDocDate(fp.deliveryDate) || normalizeDocDate(fp.pickupDate)
}

export function allLoadKeys(fp: MatchFingerprint): string[] {
  const keys = new Set<string>()
  fp.loadNumbers.forEach((n) => {
    const k = normalizeLoadKey(n)
    if (isStrongLoadKey(k)) keys.add(k)
  })
  const extractLoads = [
    fp.extract?.loadNumber,
    fp.extract?.rateConParse?.load_number,
    fp.extract?.bolAudit?.load_number,
    fp.extract?.primaryInvoice?.load_number,
    ...(fp.extract?.rateConParse?.bol_reference_numbers ?? []),
    ...(fp.extract?.bolAudit?.reference_numbers ?? []),
  ]
  extractLoads.forEach((n) => {
    const k = normalizeLoadKey(n)
    if (isStrongLoadKey(k)) keys.add(k)
  })
  loadNumbersFromFileName(fp.fileName).forEach((n) => {
    const k = normalizeLoadKey(n)
    if (isStrongLoadKey(k)) keys.add(k)
  })
  return [...keys]
}

export function preferredPacketLoadNumber(fp: MatchFingerprint): string | undefined {
  const preferred = [
    fp.extract?.rateConParse?.load_number,
    typeof fp.extract?.rateConFields?.loadNumber?.value === 'string'
      ? fp.extract.rateConFields.loadNumber.value
      : fp.extract?.rateConFields?.loadNumber?.value != null
        ? String(fp.extract.rateConFields.loadNumber.value)
        : undefined,
    fp.extract?.loadNumber,
    fp.extract?.primaryInvoice?.load_number,
    fp.extract?.bolAudit?.load_number,
  ]
  for (const raw of preferred) {
    const display = String(raw ?? '').trim()
    if (!display) continue
    if (isStrongLoadKey(normalizeLoadKey(display))) return display
  }
  return undefined
}

export function primaryLoadLabel(fp: MatchFingerprint): string {
  const preferred = preferredPacketLoadNumber(fp)
  if (preferred) return preferred
  const keys = [...allLoadKeys(fp)].sort((a, b) => a.length - b.length || a.localeCompare(b))
  return keys[0] ?? paperworkFileStem(fp.fileName)
}

export function documentFamilyKey(fileName: string): string {
  const stem = paperworkFileStem(fileName)
  const stripped = stem.replace(/[-_\s]+(?:p(?:age)?)?[-_\s]*\d{1,2}$/i, '')
  if (stripped === stem) return ''
  const load = loadNumberFromFileName(`${stripped}.pdf`)
  const key = normalizeLoadKey(load)
  return isStrongLoadKey(key) ? key : ''
}

export function sameDocumentFamily(a: MatchFingerprint, b: MatchFingerprint): boolean {
  const left = documentFamilyKey(a.fileName)
  const right = documentFamilyKey(b.fileName)
  return Boolean(left && right && left === right)
}

export function loadsOverlap(a: MatchFingerprint, b: MatchFingerprint): boolean {
  const aKeys = allLoadKeys(a)
  const bKeys = allLoadKeys(b)
  return aKeys.some((ak) => bKeys.some((bk) => loadKeysMatch(ak, bk)))
}

/** Same load packet: strong load overlap or split scanner pages, unless broker/date/family conflict. */
export function fingerprintsBelongTogether(a: MatchFingerprint, b: MatchFingerprint): boolean {
  const aKeys = allLoadKeys(a)
  const bKeys = allLoadKeys(b)
  const shared = aKeys.filter((ak) => bKeys.some((bk) => loadKeysMatch(ak, bk)))

  const reasons: string[] = []
  if (shared.length > 0) reasons.push('load')
  if (sameDocumentFamily(a, b)) reasons.push('family')

  // Pages from two different source scans never share a packet without a real shared load #.
  const familyA = documentFamilyKey(a.fileName)
  const familyB = documentFamilyKey(b.fileName)
  if (familyA && familyB && familyA !== familyB && shared.length === 0) return false

  if (a.broker?.trim() && b.broker?.trim() && !namesOverlap(a.broker, b.broker)) return false

  const dateA = docDeliveryDate(a)
  const dateB = docDeliveryDate(b)
  if (dateA && dateB && dateA !== dateB) return false

  return reasons.length > 0
}

export function clusterFingerprints(items: MatchFingerprint[]): MatchFingerprint[][] {
  if (items.length === 0) return []
  const parent = items.map((_, index) => index)
  const find = (index: number): number => {
    if (parent[index] !== index) parent[index] = find(parent[index])
    return parent[index]
  }
  const union = (left: number, right: number) => {
    const a = find(left)
    const b = find(right)
    if (a !== b) parent[a] = b
  }
  for (let i = 0; i < items.length; i += 1) {
    for (let j = i + 1; j < items.length; j += 1) {
      if (fingerprintsBelongTogether(items[i], items[j])) union(i, j)
    }
  }
  const buckets = new Map<number, MatchFingerprint[]>()
  items.forEach((item, index) => {
    const root = find(index)
    const bucket = buckets.get(root)
    if (bucket) bucket.push(item)
    else buckets.set(root, [item])
  })
  return [...buckets.values()]
}

// ---------------------------------------------------------------------------
// BOL ↔ RC scoring (src/products/docSort/utils/bolRateConMatch.ts)
// ---------------------------------------------------------------------------

const MIN_NUMERIC_REF_LEN = 5
const MIN_ALPHA_REF_LEN = 4
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

function pushStop(target: string[], stop?: RateConAddress | null) {
  const cityState = formatRateConStopCityState(stop)
  if (cityState && cityState !== '—') pushUnique(target, cityState)
  const full = formatRateConStop(stop)
  if (full) pushUnique(target, full)
}

export function rateConReferenceNumbers(fp: MatchFingerprint): string[] {
  const refs: string[] = []
  fp.loadNumbers.forEach((n) => pushUnique(refs, n))
  pushUnique(refs, fp.extract?.loadNumber)
  pushUnique(refs, fp.extract?.rateConParse?.load_number)
  fp.extract?.rateConParse?.bol_reference_numbers?.forEach((n) => pushUnique(refs, n))
  return refs.filter(isUsableRef)
}

export function bolReferenceNumbers(fp: MatchFingerprint): string[] {
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

export function sharedReferenceNumbers(
  rateCon: MatchFingerprint,
  bol: MatchFingerprint
): string[] {
  const rcRefs = rateConReferenceNumbers(rateCon)
  const bolRefs = bolReferenceNumbers(bol)
  return rcRefs.filter((rcRef) => bolRefs.some((bolRef) => refsMatch(rcRef, bolRef)))
}

export function rateConDestinations(fp: MatchFingerprint): string[] {
  const stops: string[] = []
  fp.extract?.rateConParse?.destinations?.forEach((stop) => pushStop(stops, stop))
  pushUnique(stops, fp.delivery)
  pushUnique(stops, fp.extract?.destination)
  pushUnique(stops, fp.extract?.rateConFields?.drop?.value)
  return stops
}

export function rateConOrigins(fp: MatchFingerprint): string[] {
  const stops: string[] = []
  pushStop(stops, fp.extract?.rateConParse?.origin)
  pushUnique(stops, fp.pickup)
  pushUnique(stops, fp.extract?.origin)
  pushUnique(stops, fp.extract?.shipFrom)
  pushUnique(stops, fp.extract?.rateConFields?.pickup?.value)
  return stops
}

export function bolDestinations(fp: MatchFingerprint): string[] {
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

export function bolOrigins(fp: MatchFingerprint): string[] {
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
  bol: MatchFingerprint,
  rateCon: MatchFingerprint
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

  // Pages split from two different source scans are different loads unless a
  // real reference number ties them together.
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

export function bolBelongsWithRateCon(bol: MatchFingerprint, rateCon: MatchFingerprint): boolean {
  return scoreBolToRateCon(bol, rateCon).score >= BOL_RC_MATCH_THRESHOLD
}

// ---------------------------------------------------------------------------
// matcher (src/products/docSort/services/docSortMatcher.ts)
// ---------------------------------------------------------------------------

export function matchSortedDocuments(fingerprints: MatchFingerprint[]): MatchSortResult {
  const rateCons = fingerprints.filter((f) => f.kind === 'rate_confirmation')
  const bols = fingerprints.filter((f) => f.kind === 'bill_of_lading')
  const otherDocuments = fingerprints.filter((f) => isSupportDocKind(f.kind))

  const groups: MatchLoadGroup[] = []

  clusterFingerprints(rateCons).forEach((cluster, index) => {
    const label = primaryLoadLabel(
      cluster.find((rc) => rc.broker?.trim()) ??
        cluster.find((rc) => (rc.rateAmount ?? 0) > 0) ??
        cluster[0]
    )
    const key = allLoadKeys(cluster[0])[0] ?? `rc-${index}`
    groups.push({
      groupId: `load-${key}-${index}`,
      label,
      rateCons: cluster,
      bols: [],
      matchScore: 100,
      matchReason: cluster.length > 1 ? 'rate confirmation pages' : 'rate confirmation anchor',
    })
  })

  const unmatchedBols: MatchFingerprint[] = []

  for (const bol of bols) {
    let bestGroup: MatchLoadGroup | undefined
    let bestScore = 0
    let bestReason = ''
    let secondScore = 0

    for (const group of groups) {
      for (const anchor of group.rateCons) {
        const { score, reason } = scoreBolToRateCon(bol, anchor)
        if (score > bestScore) {
          secondScore = bestScore
          bestScore = score
          bestGroup = group
          bestReason = reason
        } else if (score > secondScore) {
          secondScore = score
        }
      }
    }

    const uniqueWinner = bestScore > secondScore
    if (bestGroup && bestScore >= BOL_RC_MATCH_THRESHOLD && uniqueWinner) {
      bestGroup.bols.push(bol)
      bestGroup.matchScore = Math.min(bestGroup.matchScore, bestScore)
      if (bestReason !== 'rate confirmation anchor') {
        bestGroup.matchReason = bestReason
      }
    } else {
      unmatchedBols.push(bol)
    }
  }

  const matchedGroups = groups.filter((g) => g.bols.length > 0)
  const unmatchedRateCons = groups.filter((g) => g.bols.length === 0).flatMap((g) => g.rateCons)

  return {
    sortedAt: new Date().toISOString(),
    groups: matchedGroups,
    unmatchedRateCons,
    unmatchedBols,
    otherDocuments,
    totalDocuments: fingerprints.length,
  }
}

// ---------------------------------------------------------------------------
// invoice draft groups (src/products/docSort/utils/invoiceDraftGroups.ts)
// ---------------------------------------------------------------------------

/**
 * Combined RC+BOL+invoice PDFs must wait for Doc Splitter — never become packets.
 * In the server pipeline everything is already split to single pages, so this
 * only triggers on legacy multi-kind extracts.
 */
function isCombinedForSplitter(fp: MatchFingerprint): boolean {
  const pages = fp.extract?.pageClassifications ?? []
  if (pages.length < 2) return false
  const kinds = new Set<string>()
  for (const page of pages) {
    const t = (page.pageType ?? '').toLowerCase()
    if (t.includes('rate')) kinds.add('rate_confirmation')
    else if (t.includes('bol') || t.includes('lading')) kinds.add('bill_of_lading')
    else if (t.includes('invoice')) kinds.add('invoice')
  }
  if (!kinds.has('bill_of_lading') && kinds.has('invoice') && fp.kind === 'rate_confirmation') {
    kinds.delete('invoice')
  }
  return kinds.size >= 2
}

function peelCombinedFingerprints(list: MatchFingerprint[]): {
  clean: MatchFingerprint[]
  combined: MatchFingerprint[]
} {
  const clean: MatchFingerprint[] = []
  const combined: MatchFingerprint[] = []
  for (const fp of list) {
    if (isCombinedForSplitter(fp)) combined.push(fp)
    else clean.push(fp)
  }
  return { clean, combined }
}

function groupMembers(group: MatchLoadGroup): MatchFingerprint[] {
  return [...group.rateCons, ...group.bols, ...(group.others ?? [])]
}

function pairBelongsTogether(left: MatchFingerprint, right: MatchFingerprint): boolean {
  if (left.kind === 'bill_of_lading' && right.kind === 'rate_confirmation') {
    return bolBelongsWithRateCon(left, right)
  }
  if (right.kind === 'bill_of_lading' && left.kind === 'rate_confirmation') {
    return bolBelongsWithRateCon(right, left)
  }
  return fingerprintsBelongTogether(left, right)
}

function fingerprintOverlapsGroup(fp: MatchFingerprint, group: MatchLoadGroup): boolean {
  return groupMembers(group).some((member) => pairBelongsTogether(fp, member))
}

/** Only core RC / BOL docs decide whether two packets are the same load. */
function groupCoreMembers(group: MatchLoadGroup): MatchFingerprint[] {
  const core = [...group.rateCons, ...group.bols]
  return core.length > 0 ? core : groupMembers(group)
}

function groupsBelongTogether(a: MatchLoadGroup, b: MatchLoadGroup): boolean {
  return groupCoreMembers(a).some((left) =>
    groupCoreMembers(b).some((right) => pairBelongsTogether(left, right))
  )
}

function bestPacketLabel(fps: MatchFingerprint[], fallback: string): string {
  const withBroker = fps.find((fp) => fp.broker?.trim())
  const withRate = fps.find((fp) => (fp.rateAmount ?? 0) > 0)
  const withLoad = fps.find((fp) => fp.loadNumbers.some((n) => n.trim()))
  const anchor = withBroker ?? withRate ?? withLoad ?? fps[0]
  return anchor ? primaryLoadLabel(anchor) : fallback
}

function mergeLoadGroups(a: MatchLoadGroup, b: MatchLoadGroup): MatchLoadGroup {
  const rateCons = [...a.rateCons, ...b.rateCons]
  const bols = [...a.bols, ...b.bols]
  const others = [...(a.others ?? []), ...(b.others ?? [])]
  return {
    groupId: a.groupId,
    label: bestPacketLabel([...rateCons, ...bols, ...others], a.label),
    rateCons,
    bols,
    others,
    matchReason: a.matchReason || b.matchReason,
    matchScore: Math.max(a.matchScore, b.matchScore),
  }
}

function clusterLoadGroups(groups: MatchLoadGroup[]): MatchLoadGroup[] {
  if (groups.length <= 1) return groups
  const parent = groups.map((_, index) => index)
  const find = (index: number): number => {
    if (parent[index] !== index) parent[index] = find(parent[index])
    return parent[index]
  }
  const union = (left: number, right: number) => {
    const a = find(left)
    const b = find(right)
    if (a !== b) parent[a] = b
  }
  for (let i = 0; i < groups.length; i += 1) {
    for (let j = i + 1; j < groups.length; j += 1) {
      if (groupsBelongTogether(groups[i], groups[j])) union(i, j)
    }
  }
  const buckets = new Map<number, MatchLoadGroup>()
  groups.forEach((group, index) => {
    const root = find(index)
    const existing = buckets.get(root)
    buckets.set(root, existing ? mergeLoadGroups(existing, group) : group)
  })
  return [...buckets.values()]
}

function isInvoiceWorthy(fps: MatchFingerprint[]): boolean {
  return fps.some((fp) => {
    const hasLoad = allLoadKeys(fp).length > 0
    const hasRate = (fp.rateAmount ?? 0) > 0
    const hasBroker = Boolean(fp.broker?.trim())
    return hasLoad || hasRate || hasBroker
  })
}

function takeMatching(pool: MatchFingerprint[], group: MatchLoadGroup) {
  const taken: MatchFingerprint[] = []
  const rest: MatchFingerprint[] = []
  for (const fp of pool) {
    if (fingerprintOverlapsGroup(fp, group)) taken.push(fp)
    else rest.push(fp)
  }
  return { taken, rest }
}

export function toInvoiceLoadGroup(
  groupId: string,
  fps: MatchFingerprint[],
  reason: string
): MatchLoadGroup {
  const rateCons = fps.filter((f) => f.kind === 'rate_confirmation')
  const bols = fps.filter((f) => f.kind === 'bill_of_lading')
  const others = fps.filter((f) => isSupportDocKind(f.kind))
  const anchor = rateCons[0] ?? bols[0] ?? others[0]
  return {
    groupId,
    label: anchor ? primaryLoadLabel(anchor) : groupId,
    rateCons,
    bols,
    others,
    matchReason: reason,
    matchScore: 70,
  }
}

export function invoiceDraftGroupsFromSort(sort: MatchSortResult): {
  groups: MatchLoadGroup[]
  unmatched: {
    rateCons: MatchFingerprint[]
    bols: MatchFingerprint[]
    other: MatchFingerprint[]
  }
} {
  const peeledGroups: MatchLoadGroup[] = []
  const combinedHeld: MatchFingerprint[] = []

  for (const group of sort.groups) {
    const rc = peelCombinedFingerprints(group.rateCons)
    const bol = peelCombinedFingerprints(group.bols)
    const oth = peelCombinedFingerprints(group.others ?? [])
    combinedHeld.push(...rc.combined, ...bol.combined, ...oth.combined)
    if (rc.clean.length === 0 && bol.clean.length === 0 && oth.clean.length === 0) continue
    peeledGroups.push({
      ...group,
      rateCons: rc.clean,
      bols: bol.clean,
      others: oth.clean,
    })
  }

  const peeledUnmatchedRc = peelCombinedFingerprints(sort.unmatchedRateCons)
  const peeledUnmatchedBol = peelCombinedFingerprints(sort.unmatchedBols)
  const peeledOther = peelCombinedFingerprints(sort.otherDocuments)
  combinedHeld.push(
    ...peeledUnmatchedRc.combined,
    ...peeledUnmatchedBol.combined,
    ...peeledOther.combined
  )

  let others = [...peeledOther.clean]
  const groups: MatchLoadGroup[] = []

  for (const group of peeledGroups) {
    const { taken, rest } = takeMatching(others, group)
    others = rest
    groups.push(
      taken.length > 0
        ? { ...group, others: [...(group.others ?? []), ...taken] }
        : { ...group, others: [...(group.others ?? [])] }
    )
  }

  const leftoverRcs: MatchFingerprint[] = []
  for (const rc of peeledUnmatchedRc.clean) {
    const host = groups.find((group) => fingerprintOverlapsGroup(rc, group))
    if (host) host.rateCons.push(rc)
    else leftoverRcs.push(rc)
  }

  for (const cluster of clusterFingerprints(leftoverRcs)) {
    if (!isInvoiceWorthy(cluster)) {
      others.push(...cluster)
      continue
    }
    const seed = toInvoiceLoadGroup(
      `solo-rc-${cluster[0].docId}`,
      cluster,
      cluster.length > 1 ? 'rate confirmation pages' : 'rate confirmation'
    )
    seed.label = bestPacketLabel(cluster, seed.label)
    const { taken, rest } = takeMatching(others, seed)
    others = rest
    groups.push(
      taken.length > 0
        ? { ...seed, others: [...(seed.others ?? []), ...taken] }
        : seed
    )
  }

  const leftoverBols: MatchFingerprint[] = []
  for (const bol of peeledUnmatchedBol.clean) {
    const host = groups.find((group) => fingerprintOverlapsGroup(bol, group))
    if (host) {
      host.bols.push(bol)
    } else {
      leftoverBols.push(bol)
    }
  }

  const unmatchedBols: MatchFingerprint[] = []
  for (const cluster of clusterFingerprints(leftoverBols)) {
    const seed = toInvoiceLoadGroup(
      `solo-bol-${cluster[0].docId}`,
      cluster,
      cluster.length > 1 ? 'matched from extract JSON' : 'bill of lading'
    )
    seed.label = bestPacketLabel(cluster, seed.label)
    const { taken, rest } = takeMatching(others, seed)
    if (taken.length === 0) {
      unmatchedBols.push(...cluster)
      continue
    }
    others = rest
    groups.push({ ...seed, others: [...(seed.others ?? []), ...taken] })
  }

  const leftoverOthers: MatchFingerprint[] = []
  for (const fp of others) {
    const host = groups.find((group) => fingerprintOverlapsGroup(fp, group))
    if (host) {
      host.others = [...(host.others ?? []), fp]
      continue
    }
    const hasLoad = allLoadKeys(fp).length > 0
    const hasRate = (fp.rateAmount ?? 0) > 0
    if (hasLoad && hasRate && !isCombinedForSplitter(fp)) {
      groups.push(toInvoiceLoadGroup(`solo-other-${fp.docId}`, [fp], 'extracted from document'))
    } else {
      leftoverOthers.push(fp)
    }
  }

  return {
    groups: clusterLoadGroups(groups),
    unmatched: {
      rateCons: [],
      bols: unmatchedBols,
      other: [...leftoverOthers, ...combinedHeld],
    },
  }
}
