/**
 * When AI packet creation / review fails, move the batch to rework —
 * never a dead "failed" workflow state. Docs stay uploaded for Credyx.
 */

import { getBatchById, updateBatch } from '../data/mockBatches'
import { getBatchFiles } from '../data/batchFileStore'
import { notifyTenantDataUpdated } from './supabase/tenantDataLiveSync'
import { enqueueBatchProcessing, fetchBatchProcessingJob } from './credyx/batchProcessingJobs'
import { getSupabase, isSupabaseConfigured } from '../lib/supabase'
import { listHandoffDocumentMeta } from '../utils/resolveHandoffDocuments'

/** Admin-facing AI / pipeline error for a batch (from the latest processing job). */
export async function fetchBatchAiLastError(batchId: string): Promise<string | null> {
  try {
    const job = await fetchBatchProcessingJob(batchId)
    const msg = job?.last_error?.trim()
    return msg || null
  } catch (err) {
    console.warn('[fetchBatchAiLastError]', err)
    return null
  }
}

/** Persist batch as rework with optional admin-only error detail on the job row. */
export async function markBatchNeedsRework(
  batchId: string,
  errorMessage: string
): Promise<void> {
  const batch = getBatchById(batchId)
  if (!batch) return

  updateBatch(batchId, {
    status: 'rework',
    // Keep sort_status failed so admin AI tools know DocSort did not finish.
    sort_status: 'failed',
  })
  notifyTenantDataUpdated(['batches'], batch.client_id)

  if (!isSupabaseConfigured()) return
  const supabase = getSupabase()
  if (!supabase) return

  try {
    await supabase.rpc('mark_batch_processing_job', {
      p_batch_id: batchId,
      p_status: 'failed',
      p_last_error: errorMessage,
      p_locked_by: 'browser-pipeline',
    })
  } catch (err) {
    console.warn('[markBatchNeedsRework] job mark failed', err)
  }
}

/**
 * Admin: re-run DocSort / packet creation from uploaded docs.
 * Resets batch to creating/sorting and enqueues sort_and_verify.
 */
export async function retryBatchPacketCreation(batchId: string): Promise<void> {
  const batch = getBatchById(batchId)
  if (!batch) throw new Error('Batch not found')

  updateBatch(batchId, {
    status: 'creating',
    sort_status: 'sorting',
  })
  notifyTenantDataUpdated(['batches'], batch.client_id)

  await enqueueBatchProcessing({
    batchId,
    clientId: batch.client_id,
    kind: 'sort_and_verify',
  })
}

/** Collect uploaded doc ids (memory + handoff storage) for unmatched seeding. */
async function collectUploadedDocIds(batchId: string, clientId: string): Promise<string[]> {
  const ids = new Set<string>()
  for (const docId of getBatchFiles(batchId).keys()) {
    if (!docId.startsWith('invoice-pdf-')) ids.add(docId)
  }
  try {
    const listed = await listHandoffDocumentMeta(batchId, clientId)
    for (const item of listed) {
      if (item.docId && !item.docId.startsWith('invoice-pdf-')) ids.add(item.docId)
    }
  } catch (err) {
    console.warn('[collectUploadedDocIds]', err)
  }
  return [...ids]
}

/**
 * Admin: stop AI “Creating…” and open Packet Rework with all docs unassigned.
 * Credyx assigns each document manually into packets.
 */
export async function releaseBatchToManualCreation(batchId: string): Promise<void> {
  const batch = getBatchById(batchId)
  if (!batch) throw new Error('Batch not found')

  // Clear stuck mid-review flags so Packets unlock.
  try {
    const { settleBatchAiGate } = await import('./credyx/batchAiReviewService')
    settleBatchAiGate(batchId)
  } catch {
    /* optional */
  }

  const unmatchedDocIds = await collectUploadedDocIds(batchId, batch.client_id)

  updateBatch(batchId, {
    status: 'rework',
    sort_status: 'failed',
    unmatched_doc_ids: unmatchedDocIds,
  })
  notifyTenantDataUpdated(['batches'], batch.client_id)

  if (!isSupabaseConfigured()) return
  const supabase = getSupabase()
  if (!supabase) return

  try {
    await supabase.rpc('mark_batch_processing_job', {
      p_batch_id: batchId,
      p_status: 'failed',
      p_last_error:
        'Manual creation — Credyx stopped automated packet creation; docs are in Packet Rework unassigned.',
      p_locked_by: 'manual-override',
    })
  } catch (err) {
    console.warn('[releaseBatchToManualCreation] job mark failed', err)
  }
}

/** True when a batch is stuck in automated creating / sorting. */
export function batchIsStuckCreating(batch: {
  status?: string | null
  sort_status?: string | null
}): boolean {
  return batch.status === 'creating' || batch.sort_status === 'sorting'
}
