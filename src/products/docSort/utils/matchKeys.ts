import { paperworkFileStem } from '../../../utils/batchPaperworkFile'
import { loadNumberFromFileName, loadNumbersFromFileName } from '../../../utils/extractBatchFields'
import type { DocSortFingerprint } from '../types'

/** Load / PO keys shorter than this are trailer, truck, or unit codes — not packet ids. */
export const MIN_LOAD_KEY_LEN = 5

/** Normalize load # for grouping (digits only, trim leading zeros). */
export function normalizeLoadKey(value?: string | null): string {
  const digits = (value ?? '').replace(/\D/g, '')
  if (!digits) return ''
  const trimmed = digits.replace(/^0+/, '')
  return trimmed || digits
}

export function isStrongLoadKey(key: string): boolean {
  return key.length >= MIN_LOAD_KEY_LEN
}

/** True when two load references likely refer to the same broker load. */
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

/** Loose broker/carrier name overlap. */
export function namesOverlap(a?: string, b?: string): boolean {
  const left = normalizeName(a)
  const right = normalizeName(b)
  if (!left || !right || left.length < 4 || right.length < 4) return false
  return left.includes(right) || right.includes(left)
}

function normalizeLane(value?: string): string {
  return (value ?? '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/** Pickup/delivery lane overlap (city, state). */
export function lanesOverlap(a?: string, b?: string): boolean {
  const left = normalizeLane(a)
  const right = normalizeLane(b)
  if (!left || !right || left.length < 5) return false
  return left === right || left.includes(right) || right.includes(left)
}

/** Calendar date to YYYY-MM-DD, or empty if not parseable. */
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

function docDeliveryDate(fp: DocSortFingerprint): string {
  return normalizeDocDate(fp.deliveryDate) || normalizeDocDate(fp.pickupDate)
}

/** Collect strong load keys for a fingerprint (AI + filename). */
export function allLoadKeys(fp: DocSortFingerprint): string[] {
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

export function primaryLoadLabel(fp: DocSortFingerprint): string {
  const keys = [...allLoadKeys(fp)].sort((a, b) => b.length - a.length)
  return keys[0] ?? paperworkFileStem(fp.fileName)
}

/**
 * Family id for split scanner pages like `15882-2.pdf` / `15882-3.jpg`.
 * Empty when the name is not a load + short page suffix.
 */
export function documentFamilyKey(fileName: string): string {
  const stem = paperworkFileStem(fileName)
  const stripped = stem.replace(/[-_\s]+(?:p(?:age)?)?[-_\s]*\d{1,2}$/i, '')
  if (stripped === stem) return ''
  const load = loadNumberFromFileName(`${stripped}.pdf`)
  const key = normalizeLoadKey(load)
  return isStrongLoadKey(key) ? key : ''
}

/** True when two files look like pages of the same scanned document. */
export function sameDocumentFamily(a: DocSortFingerprint, b: DocSortFingerprint): boolean {
  const left = documentFamilyKey(a.fileName)
  const right = documentFamilyKey(b.fileName)
  return Boolean(left && right && left === right)
}

/** True when two fingerprints share a strong load / PO reference. */
export function loadsOverlap(a: DocSortFingerprint, b: DocSortFingerprint): boolean {
  const aKeys = allLoadKeys(a)
  const bKeys = allLoadKeys(b)
  return aKeys.some((ak) => bKeys.some((bk) => loadKeysMatch(ak, bk)))
}

export interface FingerprintLinkExplain {
  linked: boolean
  reasons: string[]
  blockers: string[]
}

/** Why two docs should (or should not) sit in the same invoice packet. */
export function explainFingerprintsLink(
  a: DocSortFingerprint,
  b: DocSortFingerprint
): FingerprintLinkExplain {
  const reasons: string[] = []
  const blockers: string[] = []

  const aKeys = allLoadKeys(a)
  const bKeys = allLoadKeys(b)
  const shared = aKeys.filter((ak) => bKeys.some((bk) => loadKeysMatch(ak, bk)))
  if (shared.length > 0) {
    reasons.push(`shared load # ${shared[0]}`)
  }

  if (sameDocumentFamily(a, b)) {
    reasons.push(`filename family ${documentFamilyKey(a.fileName)}`)
  }

  if (a.broker?.trim() && b.broker?.trim() && !namesOverlap(a.broker, b.broker)) {
    blockers.push(`different brokers (“${a.broker.trim()}” vs “${b.broker.trim()}”)`)
  }

  const dateA = docDeliveryDate(a)
  const dateB = docDeliveryDate(b)
  if (dateA && dateB && dateA !== dateB) {
    blockers.push(`different dates (${dateA} vs ${dateB})`)
  }

  if (blockers.length > 0) {
    return { linked: false, reasons, blockers }
  }
  if (reasons.length > 0) {
    return { linked: true, reasons, blockers }
  }
  return {
    linked: false,
    reasons,
    blockers: ['no shared load # or split-page filename'],
  }
}

/** Same load packet: strong load overlap or split scanner pages, unless broker/date conflict. */
export function fingerprintsBelongTogether(a: DocSortFingerprint, b: DocSortFingerprint): boolean {
  return explainFingerprintsLink(a, b).linked
}

/** Union-find clusters of documents that belong in one invoice packet. */
export function clusterFingerprints(items: DocSortFingerprint[]): DocSortFingerprint[][] {
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

  const buckets = new Map<number, DocSortFingerprint[]>()
  items.forEach((item, index) => {
    const root = find(index)
    const bucket = buckets.get(root)
    if (bucket) bucket.push(item)
    else buckets.set(root, [item])
  })
  return [...buckets.values()]
}
