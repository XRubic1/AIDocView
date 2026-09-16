import type { DocSortFingerprint, DocSortLoadGroup } from '../types'
import { preferredPacketLoadNumber, primaryLoadLabel } from './matchKeys'

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

/** First usable broker email domain across packet fingerprints. */
export function emailDomainFromFingerprints(
  fingerprints: DocSortFingerprint[]
): string | undefined {
  for (const fp of fingerprints) {
    const domain = fp.emailDomain?.trim()
    if (domain?.includes('.')) return domain.toLowerCase()
  }
  return undefined
}

/** Load #, broker, and payable rate from any fingerprint in a sorted load group. */
export function invoiceFieldsFromLoadGroup(group: DocSortLoadGroup): {
  loadNumber: string
  brokerName: string
  carrierName: string
  rateAmount: number
  emailDomain?: string
} {
  const fingerprints = [...group.rateCons, ...group.bols, ...(group.others ?? [])]
  const rateCon = primaryRateCon(group)
  const withRate = fingerprints.find((fp) => fp.rateAmount != null && fp.rateAmount > 0)
  const withBroker = fingerprints.find((fp) => {
    const name = fp.broker?.trim()
    return Boolean(name) && name.toLowerCase() !== 'broker'
  })
  // Prefer RC load # — never let a longer BOL PRO / reference become the packet load.
  const loadNumber =
    (rateCon ? preferredPacketLoadNumber(rateCon) : undefined) ||
    (rateCon ? primaryLoadLabel(rateCon) : undefined) ||
    group.label?.trim() ||
    ''
  const carrier =
    fingerprints.find((fp) => fp.carrier?.trim())?.carrier?.trim() ||
    rateCon?.carrier?.trim() ||
    'Carrier'

  return {
    loadNumber,
    brokerName: withBroker?.broker?.trim() || rateCon?.broker?.trim() || '',
    carrierName: carrier,
    rateAmount: withRate?.rateAmount ?? 0,
    emailDomain: emailDomainFromFingerprints(fingerprints),
  }
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
