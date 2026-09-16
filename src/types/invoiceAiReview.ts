import type { LoadCheckRow } from '../utils/loadReviewSummary'

/** JSON-safe AI review detail stored on invoice after admin batch review. */
export interface InvoiceAiReviewSnapshot {
  headline: string
  detail: string
  ready: boolean
  passCount: number
  requiredTotal: number
  requiredAll: LoadCheckRow[]
  requiredFailed: LoadCheckRow[]
  requiredPassed: LoadCheckRow[]
  additional: LoadCheckRow[]
  issues: string[]
  warnings: string[]
  overallConfidence?: number
  reviewedAt?: string
  primaryFileName?: string
  hasExcel?: boolean
  /** Values read from paperwork so Resolve issues can update the packet. */
  paperwork?: {
    loadNumber?: string
    amount?: number
    brokerName?: string
    /** Email domain read from rate con / invoice paperwork. */
    brokerDomain?: string
    carrierName?: string
    /** Compact pickup / origin line(s) from the rate con. */
    pickup?: string
    /** Compact delivery destination(s) from the rate con. */
    destinations?: string
  }
}
