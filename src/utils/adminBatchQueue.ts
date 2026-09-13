import type { PendingBatch } from '../types/admin'

/** Toggle chips for the admin Batches list (invoice-style on/off filters). */
export const ADMIN_BATCH_CHIP_FILTERS = [
  'ready_to_post',
  'verification',
  'ai',
  'draft',
  'submitted',
  'processing',
  'documents_uploaded',
] as const

export type AdminBatchChipFilter = (typeof ADMIN_BATCH_CHIP_FILTERS)[number]

export type AdminBatchDisplayFlags = Record<AdminBatchChipFilter, boolean>

/** True when the batch still needs AI / DocSort attention. */
export function batchNeedsAiAttention(batch: PendingBatch): boolean {
  return (
    batch.sort_status === 'sorting' ||
    batch.sort_status === 'failed' ||
    Boolean(batch.unmatched_doc_ids && batch.unmatched_doc_ids.length > 0)
  )
}

/** Local calendar date as `YYYY-MM-DD` (avoids UTC day shift). */
export function toLocalDateKey(date: Date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Extract local `YYYY-MM-DD` from a batch `submitted_at` timestamp. */
export function batchSubmittedDateKey(submittedAt: string): string {
  const date = new Date(submittedAt)
  if (Number.isNaN(date.getTime())) return ''
  return toLocalDateKey(date)
}

/** True when submitted date falls within an inclusive from/to range. */
export function batchPassesDateRange(
  batch: PendingBatch,
  dateFrom: string,
  dateTo: string
): boolean {
  const key = batchSubmittedDateKey(batch.submitted_at)
  if (!key) return !dateFrom && !dateTo
  if (dateFrom && key < dateFrom) return false
  if (dateTo && key > dateTo) return false
  return true
}

/**
 * One display bucket per batch so chips are independent on/off switches.
 * AI-needs-attention wins over status so those stay visible under the AI chip.
 */
export function getAdminBatchDisplayBucket(
  batch: PendingBatch
): AdminBatchChipFilter | 'other' {
  if (batchNeedsAiAttention(batch)) return 'ai'

  const status = batch.status === 'approval' ? 'verification' : batch.status
  switch (status) {
    case 'ready_to_post':
    case 'verification':
    case 'draft':
    case 'submitted':
    case 'processing':
    case 'documents_uploaded':
      return status
    default:
      // AI-uploaded batches without urgent sort issues still surface under AI.
      if (batch.upload_mode === 'ai') return 'ai'
      return 'other'
  }
}

/** Every chip on, matching an open work queue by default. */
export function createAdminBatchDisplayFlags(on: boolean): AdminBatchDisplayFlags {
  return {
    ready_to_post: on,
    verification: on,
    ai: on,
    draft: on,
    submitted: on,
    processing: on,
    documents_uploaded: on,
  }
}

/** True when this batch's bucket chip is switched on. */
export function batchPassesDisplayFlags(
  batch: PendingBatch,
  flags: AdminBatchDisplayFlags
): boolean {
  const bucket = getAdminBatchDisplayBucket(batch)
  if (bucket === 'other') {
    return ADMIN_BATCH_CHIP_FILTERS.every((key) => flags[key])
  }
  return flags[bucket]
}

export function adminBatchFilterLabel(filter: AdminBatchChipFilter): string {
  switch (filter) {
    case 'ready_to_post':
      return 'Ready'
    case 'verification':
      return 'Verification'
    case 'ai':
      return 'AI'
    case 'draft':
      return 'Draft'
    case 'submitted':
      return 'Submitted'
    case 'processing':
      return 'Processing'
    case 'documents_uploaded':
      return 'Docs uploaded'
    default:
      return filter
  }
}

export type AdminBatchFilterCounts = Record<AdminBatchChipFilter, number>

/** Count batches per chip bucket (each batch in exactly one bucket). */
export function countAdminBatchFilters(batches: PendingBatch[]): AdminBatchFilterCounts {
  const counts: AdminBatchFilterCounts = {
    ready_to_post: 0,
    verification: 0,
    ai: 0,
    draft: 0,
    submitted: 0,
    processing: 0,
    documents_uploaded: 0,
  }

  for (const batch of batches) {
    const bucket = getAdminBatchDisplayBucket(batch)
    if (bucket !== 'other') {
      counts[bucket] += 1
    }
  }

  return counts
}

/** Workflow stage to open when selecting a batch from the unified list. */
export type AdminBatchWorkflowStage = 'ready_to_post' | 'verification' | 'ai'

export function resolveAdminBatchWorkflowStage(
  batch: PendingBatch
): AdminBatchWorkflowStage {
  if (batchNeedsAiAttention(batch) || batch.upload_mode === 'ai') {
    // Prefer status workflow when the batch is clearly in Ready / Verification.
    if (batch.status === 'ready_to_post') return 'ready_to_post'
    if (batch.status === 'verification' || batch.status === 'approval') return 'verification'
    return 'ai'
  }
  if (batch.status === 'ready_to_post') return 'ready_to_post'
  if (batch.status === 'verification' || batch.status === 'approval') return 'verification'
  return 'ready_to_post'
}
