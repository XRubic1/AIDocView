import { loadNumberFromFileName } from '../../../utils/extractBatchFields'
import type { DocSortFingerprint } from '../types'

/** Normalize load # for grouping (digits only, trim leading zeros). */
export function normalizeLoadKey(value?: string | null): string {
  const digits = (value ?? '').replace(/\D/g, '')
  if (!digits) return ''
  const trimmed = digits.replace(/^0+/, '')
  return trimmed || digits
}

/** True when two load references likely refer to the same broker load. */
export function loadKeysMatch(a?: string | null, b?: string | null): boolean {
  const left = normalizeLoadKey(a)
  const right = normalizeLoadKey(b)
  if (!left || !right) return false
  if (left === right) return true
  if (left.endsWith(right) || right.endsWith(left)) return true
  if (Math.min(left.length, right.length) >= 6) {
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

/** Collect all load keys for a fingerprint (AI + filename). */
export function allLoadKeys(fp: DocSortFingerprint): string[] {
  const keys = new Set<string>()
  fp.loadNumbers.forEach((n) => {
    const k = normalizeLoadKey(n)
    if (k) keys.add(k)
  })
  const fromFile = loadNumberFromFileName(fp.fileName)
  if (fromFile) keys.add(normalizeLoadKey(fromFile))
  return [...keys]
}

export function primaryLoadLabel(fp: DocSortFingerprint): string {
  const keys = allLoadKeys(fp)
  return keys[0] ?? fp.fileName.replace(/\.pdf$/i, '')
}
