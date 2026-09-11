/** Standalone DocSort product types — not used by AIDocView review engine. */

export type DocSortKind = 'rate_confirmation' | 'bill_of_lading' | 'other'

export type DocSortStatus = 'pending' | 'scanning' | 'done' | 'error'

/** One uploaded PDF before or after AI fingerprint. */
export interface DocSortUpload {
  id: string
  file: File
  fileName: string
  status: DocSortStatus
  error?: string
}

/** Match keys extracted from the file (up to the first 4 pages). */
export interface DocSortFingerprint {
  docId: string
  fileName: string
  kind: DocSortKind
  confidence: number
  loadNumbers: string[]
  broker?: string
  carrier?: string
  pickup?: string
  delivery?: string
  /** Pickup date as printed, normalized to YYYY-MM-DD when possible. */
  pickupDate?: string
  /** Delivery / ship date as printed, normalized to YYYY-MM-DD when possible. */
  deliveryDate?: string
  /** Linehaul / total rate from rate con (AI-extracted — verify manually). */
  rateAmount?: number
  rateCurrency?: string
  notes?: string
}

/** Rate con grouped with its matched BOL(s). */
export interface DocSortLoadGroup {
  groupId: string
  label: string
  rateCons: DocSortFingerprint[]
  bols: DocSortFingerprint[]
  others?: DocSortFingerprint[]
  matchReason: string
  matchScore: number
}
export interface DocSortResult {
  sortedAt: string
  groups: DocSortLoadGroup[]
  unmatchedRateCons: DocSortFingerprint[]
  unmatchedBols: DocSortFingerprint[]
  otherDocuments: DocSortFingerprint[]
  totalDocuments: number
}

export interface DocSortProgress {
  phase: 'idle' | 'scanning' | 'matching' | 'complete' | 'error'
  completed: number
  total: number
  message?: string
}
