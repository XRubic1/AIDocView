/** Locked fee terms copied from client → batch → invoice. */

export type FeeBillingMode = 'trial' | 'billable'

/**
 * Snapshot of fee terms at batch/invoice creation (or after manual batch edit).
 * Later client Fee Terms / trial→active changes do not rewrite existing rows.
 */
export interface FeeTermsSnapshot {
  fee_type: 'percentage' | 'flat'
  fee_percentage?: number
  flat_fee_amount?: number
  /** Trial locks mean collection fees are waived for these invoices. */
  billing_mode: FeeBillingMode
  locked_at: string
}

/** Client-level negotiated terms (live; used only when creating new batches). */
export type ClientFeeTerms = {
  fee_percentage?: number
  fee_type?: 'percentage' | 'flat'
  flat_fee_amount?: number
}
