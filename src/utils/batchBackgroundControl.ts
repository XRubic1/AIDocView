/**
 * Central stop/abort for in-browser batch AI work (Doc Split + background pipeline).
 * Call on process failure (→ rework) and on batch delete.
 */
import { getBatchById, updateBatch } from '../data/mockBatches'
import { notifyTenantDataUpdated } from '../services/supabase/tenantDataLiveSync'
import {
  finishBatchLiveActivity,
  clearBatchLiveActivity,
} from './batchLiveActivity'

const backgroundAbortByBatch = new Map<string, AbortController>()
let clearInflightHook: ((batchId: string) => void) | null = null

/** Register inflight.clear from batchBackgroundPipeline (avoids circular imports in stopAll). */
export function registerBackgroundInflightClear(fn: (batchId: string) => void): void {
  clearInflightHook = fn
}

/** Register a new AbortController for the background pipeline; aborts any prior one. */
export function beginBackgroundPipelineAbort(batchId: string): AbortSignal {
  backgroundAbortByBatch.get(batchId)?.abort()
  const controller = new AbortController()
  backgroundAbortByBatch.set(batchId, controller)
  return controller.signal
}

/** Abort the background pipeline AbortSignal (if any). */
export function abortBackgroundPipeline(batchId: string): boolean {
  const controller = backgroundAbortByBatch.get(batchId)
  if (!controller) return false
  controller.abort()
  backgroundAbortByBatch.delete(batchId)
  return true
}

export function isBackgroundPipelineAbortRegistered(batchId: string): boolean {
  return backgroundAbortByBatch.has(batchId)
}

export function clearBackgroundPipelineAbort(batchId: string): void {
  backgroundAbortByBatch.delete(batchId)
}

export function throwIfBatchWorkAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException('Batch background work aborted', 'AbortError')
  }
}

export function isBatchWorkAbortError(err: unknown): boolean {
  return (
    (err instanceof DOMException && err.name === 'AbortError') ||
    (err instanceof Error && err.name === 'AbortError')
  )
}

export type StopBatchWorkOutcome = 'abort_only' | 'rework' | 'deleted'

/**
 * Stop Doc Split + background pipeline for a batch.
 * - abort_only: cancel in-flight work, unlock, do not change status
 * - rework: cancel + mark rework + fail job (process failure)
 * - deleted: cancel + unlock + clear activity (caller deletes the row)
 */
export async function stopAllBatchBackgroundWork(
  batchId: string,
  opts?: {
    reason?: string
    outcome?: StopBatchWorkOutcome
    emailOps?: boolean
  }
): Promise<{ abortedDocSplit: boolean; abortedBackground: boolean }> {
  const reason = opts?.reason?.trim() || 'Background work stopped'
  const outcome = opts?.outcome ?? 'abort_only'

  const { abortDocSplitPipeline, unlockBatchAfterDocSplit } = await import(
    './docSplitterAutoPipeline'
  )
  const abortedDocSplit = abortDocSplitPipeline(batchId)
  const abortedBackground = abortBackgroundPipeline(batchId)
  clearInflightHook?.(batchId)

  try {
    unlockBatchAfterDocSplit(batchId)
  } catch (err) {
    console.warn('[stopAllBatchBackgroundWork] unlock failed', err)
  }

  const batch = getBatchById(batchId)
  if (batch?.in_use) {
    try {
      updateBatch(batchId, { in_use: false, in_use_by: undefined })
      notifyTenantDataUpdated(['batches'], batch.client_id)
    } catch (err) {
      console.warn('[stopAllBatchBackgroundWork] clear in_use failed', err)
    }
  }

  if (outcome === 'deleted') {
    clearBatchLiveActivity(batchId)
    try {
      const { getSupabase, isSupabaseConfigured } = await import('../lib/supabase')
      if (isSupabaseConfigured()) {
        const supabase = getSupabase()
        await supabase?.rpc('mark_batch_processing_job', {
          p_batch_id: batchId,
          p_status: 'failed',
          p_last_error: reason,
          p_locked_by: 'batch-deleted',
        })
      }
    } catch (err) {
      console.warn('[stopAllBatchBackgroundWork] job mark failed', err)
    }
    return { abortedDocSplit, abortedBackground }
  }

  finishBatchLiveActivity(batchId, {
    phase: outcome === 'rework' ? 'failed' : 'aborted',
    thinking: outcome === 'rework' ? 'Processing failed — moved to Packet Rework.' : 'Stopped.',
    doing: reason,
    error: reason,
  })

  if (outcome === 'rework') {
    const { markBatchNeedsRework } = await import('../services/batchReworkService')
    // markBatchNeedsRework is status+job only (no nested stop) — see that module.
    await markBatchNeedsRework(batchId, reason, { skipStop: true, emailOps: opts?.emailOps })
  }

  return { abortedDocSplit, abortedBackground }
}
