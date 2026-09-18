import type { PendingBatch } from '../types/admin'
import { getBatchById } from '../data/mockBatches'
import { getInvoicesByBatchId } from '../data/mockInvoices'
import { settleBatchAiGate } from '../services/credyx/batchAiReviewService'
import { batchNeedsDocSplit } from './batchDocSplit'

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

/** True when the batch still needs AI / DocSort attention (open work only). */
export function batchNeedsAiAttention(batch: PendingBatch): boolean {
  // Processed batches leave the AI / Rework queue even with leftover sort flags.
  if (
    batch.status === 'submitted' ||
    batch.status === 'processing' ||
    batch.status === 'documents_uploaded'
  ) {
    return false
  }
  return (
    batch.status === 'creating' ||
    batch.status === 'rework' ||
    batch.sort_status === 'sorting' ||
    batch.sort_status === 'failed' ||
    batch.sort_status === 'needs_split' ||
    Boolean(batch.needs_doc_split) ||
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
  if (batchNeedsAiAttention(batch) || batch.status === 'creating') return 'ai'

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
      if (batch.upload_mode === 'ai' || batch.upload_mode === 'handoff') return 'ai'
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
      return 'AI Verify'
    case 'ai':
      return 'AI / Rework'
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
  if (
    batch.status === 'submitted' ||
    batch.status === 'processing' ||
    batch.status === 'documents_uploaded'
  ) {
    return 'verification'
  }
  if (batchNeedsAiAttention(batch) || batch.upload_mode === 'ai' || batch.status === 'creating') {
    // Rework opens Packet Rework (handled in Batches.select); list stage hint unused.
    if (batch.status === 'rework') return 'ai'
    if (batch.status === 'ready_to_post') return 'ready_to_post'
    if (batch.status === 'verification' || batch.status === 'approval') return 'verification'
    return 'ai'
  }
  if (batch.status === 'ready_to_post') return 'ready_to_post'
  if (batch.status === 'verification' || batch.status === 'approval') return 'verification'
  return 'ready_to_post'
}

/** Invoice AI review progress for admin list / AI chip (e.g. 4 of 6). */
export function getAdminBatchAiReviewProgress(batchId: string): {
  completed: number
  total: number
  running: boolean
  label: string | null
} {
  const invoices = getInvoicesByBatchId(batchId)
  const total = invoices.length
  if (total === 0) {
    return { completed: 0, total: 0, running: false, label: null }
  }
  const completed = invoices.filter(
    (inv) => inv.ai_review_status === 'ready' || inv.ai_review_status === 'needs_work'
  ).length
  const running = invoices.some((inv) => inv.ai_review_status === 'running')
  return {
    completed,
    total,
    running,
    label: `${completed} of ${total} docs reviewed`,
  }
}

/**
 * Packet rework is available after intake finished (or Manual creation / rework),
 * and AI is not mid-sort / mid-review. Blocked while Doc Splitter is required.
 */
export function canOpenPacketRework(batch: PendingBatch): boolean {
  if (batch.status === 'draft') return false

  // Clear interrupted reviews + stuck sorting so Packets cannot lock forever.
  settleBatchAiGate(batch.id)
  const live = getBatchById(batch.id) ?? batch

  if (live.status === 'creating') return false
  if (live.sort_status === 'sorting') return false

  // Combined PDFs must be split in Doc Splitter first.
  if (batchNeedsDocSplit(live)) return false

  const invoices = getInvoicesByBatchId(live.id)
  if (invoices.some((inv) => inv.ai_review_status === 'running')) return false

  // Manual / failed AI path: open Packets with 0 invoices and all docs unassigned.
  if (invoices.length === 0) {
    if (live.status === 'rework' || live.sort_status === 'failed') return true
    if (live.unmatched_doc_ids && live.unmatched_doc_ids.length > 0) return true
    return false
  }

  const aiPath = live.upload_mode === 'ai' || live.upload_mode === 'handoff'
  if (
    aiPath &&
    live.sort_status &&
    live.sort_status !== 'ready' &&
    live.sort_status !== 'failed'
  ) {
    // pending / needs_split / other non-ready states stay locked for Packets
    return false
  }
  return true
}

/** Doc Splitter unlocks when combined PDFs were detected (or still flagged). */
export function canOpenDocSplitter(batch: PendingBatch): boolean {
  if (batch.status === 'draft') return false
  if (batch.status === 'creating' && batch.sort_status === 'sorting') return false
  return batchNeedsDocSplit(batch)
}
