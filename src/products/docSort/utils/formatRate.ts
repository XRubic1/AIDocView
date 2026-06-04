import type { DocSortFingerprint, DocSortLoadGroup } from '../types'

/** Parse rate from vision JSON (number or currency string). */
export function parseRateAmount(raw: unknown): number | undefined {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) return raw
  if (typeof raw === 'string') {
    const cleaned = raw.replace(/[^0-9.]/g, '')
    const n = Number.parseFloat(cleaned)
    if (Number.isFinite(n) && n > 0) return n
  }
  return undefined
}

/** Best rate con in a group for display / invoice prefill. */
export function primaryRateCon(group: DocSortLoadGroup): DocSortFingerprint | undefined {
  const withRate = group.rateCons.find((rc) => rc.rateAmount != null && rc.rateAmount > 0)
  return withRate ?? group.rateCons[0]
}

/** Formatted currency for UI, or null if not extracted. */
export function formatExtractedRate(fp: DocSortFingerprint | undefined): string | null {
  if (!fp?.rateAmount || fp.rateAmount <= 0) return null
  const currency = fp.rateCurrency?.trim() || 'USD'
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(fp.rateAmount)
  } catch {
    return `$${fp.rateAmount.toFixed(2)}`
  }
}
