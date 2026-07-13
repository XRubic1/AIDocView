import { getBatchById, updateBatch, type Batch } from '../data/mockBatches'
import { isBatchFullyProcessed, isUnprocessedBatchStatus } from '../utils/batchLifecycle'

const DEFAULT_ADMIN = 'Credyx'

/** Unprocessed batches only — processed batches cannot be voided. */
export function canVoidAdminBatch(status: string): boolean {
  return isUnprocessedBatchStatus(status)
}

export { isBatchFullyProcessed }

/**
 * Void an unprocessed batch from Credyx ops — removes it from workflow queues.
 * Does not change invoice statuses; invoices stay pending until a batch is processed.
 */
export function voidAdminBatch(
  batchId: string,
  options?: { voidedBy?: string; reason?: string }
): Batch | undefined {
  const batch = getBatchById(batchId)
  if (!batch || !canVoidAdminBatch(batch.status)) return batch

  const voidedBy = options?.voidedBy?.trim() || DEFAULT_ADMIN
  const now = new Date().toISOString()

  return updateBatch(batchId, {
    status: 'voided',
    reviewed_at: now,
    reviewed_by: voidedBy,
    in_use: false,
    in_use_by: undefined,
  })
}
