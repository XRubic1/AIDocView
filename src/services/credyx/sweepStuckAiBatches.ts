/**
 * When AI packet creation stalls past ETA + 10 minutes, move the batch to
 * Packet Rework (manual) and email Credyx ops.
 */

import { getAllBatches, getBatchById, updateBatch } from '../../data/mockBatches'
import { getInvoicesByBatchId } from '../../data/mockInvoices'
import { getBatchFiles } from '../../data/batchFileStore'
import {
  getRememberedBatchFileCount,
  isBatchAiCreationTimedOut,
} from '../../utils/batchProcessingEta'
import { releaseBatchToManualCreation, batchIsStuckCreating } from '../batchReworkService'
import { emailCredyxIntakeError } from './batchLifecycleEmails'
import { getSupabase, isSupabaseConfigured } from '../../lib/supabase'
import { notifyTenantDataUpdated } from '../supabase/tenantDataLiveSync'

const sweeping = new Set<string>()

const TIMEOUT_MESSAGE =
  'AI packet creation timed out (estimated time + 10 minutes). Moved to Packet Rework for manual assignment.'

function resolveFileCount(batchId: string, unmatchedLen: number): number {
  const remembered = getRememberedBatchFileCount(batchId)
  if (remembered && remembered > 0) return remembered
  const inMemory = getBatchFiles(batchId).size
  if (inMemory > 0) return inMemory
  return unmatchedLen
}

function isEligibleForTimeout(batch: {
  status?: string | null
  sort_status?: string | null
  upload_mode?: string | null
}): boolean {
  if (!batchIsStuckCreating(batch)) return false
  return (
    batch.upload_mode === 'ai' ||
    batch.upload_mode === 'handoff' ||
    batch.status === 'creating' ||
    batch.status === 'ai_splitting' ||
    batch.status === 'creating_packets' ||
    batch.sort_status === 'sorting' ||
    batch.sort_status === 'ai_splitting' ||
    batch.sort_status === 'creating_packets'
  )
}

/**
 * If this batch is stuck past ETA + grace, release to manual rework and email ops.
 * Returns true when the batch was moved.
 */
export async function maybeTimeoutStuckAiBatch(batchId: string): Promise<boolean> {
  if (sweeping.has(batchId)) return false
  const batch = getBatchById(batchId)
  if (!batch || !isEligibleForTimeout(batch)) return false

  const invoices = getInvoicesByBatchId(batchId)
  const unmatchedLen = batch.unmatched_doc_ids?.length ?? 0
  const timedOut = isBatchAiCreationTimedOut({
    startedAt: batch.submitted_at,
    fileCount: resolveFileCount(batchId, unmatchedLen),
    invoiceTotal: invoices.length || batch.total_invoices || 0,
  })
  if (!timedOut) return false

  sweeping.add(batchId)
  try {
    const isDocSplit =
      batch.status === 'ai_splitting' ||
      batch.status === 'creating_packets' ||
      batch.sort_status === 'ai_splitting' ||
      batch.sort_status === 'creating_packets'

    if (isDocSplit) {
      const { abortDocSplitPipeline, failDocSplitPipeline } = await import(
        '../../utils/docSplitterAutoPipeline'
      )
      abortDocSplitPipeline(batchId)
      const docSplitMessage =
        'AI Doc Split timed out (estimated time + 10 minutes). Open Doc Splitter or Packet Rework.'
      await failDocSplitPipeline(batchId, docSplitMessage)
      return true
    }

    await releaseBatchToManualCreation(batchId)

    // Reinforce admin-visible timeout reason on the processing job.
    if (isSupabaseConfigured()) {
      const supabase = getSupabase()
      try {
        await supabase?.rpc('mark_batch_processing_job', {
          p_batch_id: batchId,
          p_status: 'failed',
          p_last_error: TIMEOUT_MESSAGE,
          p_locked_by: 'ai-timeout-watchdog',
        })
      } catch (err) {
        console.warn('[maybeTimeoutStuckAiBatch] job mark failed', err)
      }
    }

    // Keep local status rework even if release was a no-op race.
    updateBatch(batchId, { status: 'rework', sort_status: 'failed' })
    notifyTenantDataUpdated(['batches'], batch.client_id)

    await emailCredyxIntakeError({
      batchNumber: batch.batch_number,
      clientName: batch.client_name,
      issueMessage: `${TIMEOUT_MESSAGE}\nOpen Batches → Packet Rework for ${batch.batch_number}.`,
    })
    return true
  } catch (err) {
    console.warn('[maybeTimeoutStuckAiBatch]', batchId, err)
    return false
  } finally {
    sweeping.delete(batchId)
  }
}

/** Scan all in-memory batches; move timed-out AI creates to manual rework. */
export async function sweepStuckAiBatchCreations(): Promise<string[]> {
  const moved: string[] = []
  for (const batch of getAllBatches()) {
    if (!isEligibleForTimeout(batch)) continue
    const ok = await maybeTimeoutStuckAiBatch(batch.id)
    if (ok) moved.push(batch.id)
  }
  return moved
}
