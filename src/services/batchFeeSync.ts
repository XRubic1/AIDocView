import { syncBatchFeesFromLockedTerms } from '../utils/feeTermsLock'

/** Recompute batch fee_calculation from locked batch fee_terms (not live client). */
export function syncBatchFees(batchId: string): void {
  syncBatchFeesFromLockedTerms(batchId)
}
