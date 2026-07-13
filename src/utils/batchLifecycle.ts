/** Batch statuses still in Credyx ops workflow (not yet fully processed). */
const UNPROCESSED_BATCH_STATUSES = new Set([
  'draft',
  'ready_to_post',
  'documents_uploaded',
  'verification',
  'approval',
])

/** Batch has completed Credyx processing (posted / in processing). */
export function isBatchFullyProcessed(status: string): boolean {
  return status === 'submitted' || status === 'processing'
}

/** True while the batch is still in the pre-process workflow. */
export function isUnprocessedBatchStatus(status: string): boolean {
  return UNPROCESSED_BATCH_STATUSES.has(status)
}
