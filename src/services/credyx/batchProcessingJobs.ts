import { getSupabase, isSupabaseConfigured } from '../../lib/supabase'
import { notifyTenantDataUpdated } from '../supabase/tenantDataLiveSync'
import type { BatchProcessingJobSnapshot } from '../../utils/clientBatchAiProgress'
import { withOpenAiJobAuth } from '../../utils/openaiAuthContext'

export type BatchProcessingJobKind = 'verify_only' | 'sort_and_verify'

function mapJobRow(row: Record<string, unknown>): BatchProcessingJobSnapshot {
  const statusRaw = String(row.status ?? 'pending')
  const status =
    statusRaw === 'running' ||
    statusRaw === 'succeeded' ||
    statusRaw === 'failed' ||
    statusRaw === 'pending'
      ? statusRaw
      : 'pending'

  return {
    id: String(row.id),
    batch_id: String(row.batch_id),
    status,
    kind: row.kind != null ? String(row.kind) : undefined,
    last_error: row.last_error != null ? String(row.last_error) : null,
  }
}

/** Latest processing job for a batch (client RLS: own client_id). */
export async function fetchBatchProcessingJob(
  batchId: string
): Promise<BatchProcessingJobSnapshot | null> {
  if (!isSupabaseConfigured()) return null
  const supabase = getSupabase()
  if (!supabase) return null

  try {
    const { data, error } = await supabase
      .from('batch_processing_jobs')
      .select('id, batch_id, status, kind, last_error, created_at')
      .eq('batch_id', batchId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error || !data) return null
    return mapJobRow(data as Record<string, unknown>)
  } catch (err) {
    console.warn('[fetchBatchProcessingJob]', err)
    return null
  }
}

/**
 * Recent jobs for a client — used to drive list/detail PPW progress.
 * Returns the latest job per batch_id.
 */
export async function fetchClientBatchProcessingJobs(
  clientId: string
): Promise<Record<string, BatchProcessingJobSnapshot>> {
  if (!isSupabaseConfigured()) return {}
  const supabase = getSupabase()
  if (!supabase) return {}

  try {
    const { data, error } = await supabase
      .from('batch_processing_jobs')
      .select('id, batch_id, status, kind, last_error, created_at')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(50)

    if (error || !data?.length) return {}

    const byBatch: Record<string, BatchProcessingJobSnapshot> = {}
    for (const row of data) {
      const mapped = mapJobRow(row as Record<string, unknown>)
      if (!byBatch[mapped.batch_id]) {
        byBatch[mapped.batch_id] = mapped
      }
    }
    return byBatch
  } catch (err) {
    console.warn('[fetchClientBatchProcessingJobs]', err)
    return {}
  }
}

/**
 * Enqueue automated DocSort / AI verification for a batch, then kick the worker.
 * Safe to call after every submit (AI, manual, handoff invoices).
 */
export async function enqueueBatchProcessing(opts: {
  batchId: string
  clientId: string
  kind?: BatchProcessingJobKind
}): Promise<{ jobId: string | null }> {
  const kind = opts.kind ?? 'verify_only'

  if (!isSupabaseConfigured()) {
    // Local / mock mode — still run the in-browser pipeline.
    void kickBatchProcessingLocal(opts.batchId, kind, null)
    if (kind === 'sort_and_verify') scheduleAiCreationTimeoutWatch(opts.batchId)
    return { jobId: null }
  }

  const supabase = getSupabase()
  if (!supabase) {
    void kickBatchProcessingLocal(opts.batchId, kind, null)
    if (kind === 'sort_and_verify') scheduleAiCreationTimeoutWatch(opts.batchId)
    return { jobId: null }
  }

  let jobId: string | null = null
  try {
    const { data, error } = await supabase.rpc('enqueue_batch_processing_job', {
      p_batch_id: opts.batchId,
      p_client_id: opts.clientId,
      p_kind: kind,
    })
    if (error) throw error
    jobId = typeof data === 'string' ? data : data != null ? String(data) : null
  } catch (err) {
    console.warn('[enqueueBatchProcessing] rpc failed', err)
  }

  // Fire-and-forget: edge worker (survives tab close) + local pipeline (full DocSort).
  void kickBatchProcessingEdge(opts.batchId)
  void kickBatchProcessingLocal(opts.batchId, kind, jobId)

  // Packet creation only — schedule ETA + 10m timeout → manual rework + ops email.
  if (kind === 'sort_and_verify') {
    scheduleAiCreationTimeoutWatch(opts.batchId)
  }

  return { jobId }
}

/** Fire timeout watch at ETA + grace (also swept when Batches / Client Batches are open). */
function scheduleAiCreationTimeoutWatch(batchId: string): void {
  if (typeof window === 'undefined') return
  void (async () => {
    try {
      const { getBatchById } = await import('../../data/mockBatches')
      const { getInvoicesByBatchId } = await import('../../data/mockInvoices')
      const { getRememberedBatchFileCount, getBatchAiCreationTimeoutAt } = await import(
        '../../utils/batchProcessingEta'
      )
      const batch = getBatchById(batchId)
      if (!batch) return
      const deadline = getBatchAiCreationTimeoutAt({
        startedAt: batch.submitted_at,
        fileCount:
          getRememberedBatchFileCount(batchId) ??
          batch.unmatched_doc_ids?.length ??
          null,
        invoiceTotal: getInvoicesByBatchId(batchId).length || batch.total_invoices || 0,
      })
      if (deadline == null) return
      const delay = Math.max(15_000, deadline - Date.now())
      window.setTimeout(() => {
        void import('./sweepStuckAiBatches').then(({ maybeTimeoutStuckAiBatch }) =>
          maybeTimeoutStuckAiBatch(batchId)
        )
      }, delay)
    } catch (err) {
      console.warn('[scheduleAiCreationTimeoutWatch]', err)
    }
  })()
}

/** Invoke the Edge worker; ignores errors so submit UX never blocks. */
async function kickBatchProcessingEdge(batchId: string): Promise<void> {
  try {
    const supabase = getSupabase()
    if (!supabase) return
    const { error } = await supabase.functions.invoke('batch-ai-process', {
      body: { batchId, source: 'submit' },
    })
    if (error) {
      console.warn('[kickBatchProcessingEdge]', error.message || error)
    }
  } catch (err) {
    console.warn('[kickBatchProcessingEdge]', err)
  }
}

/**
 * Run the full in-app pipeline (pdf.js + existing DocSort / AI review).
 * Best-effort; the edge worker covers verify-from-snapshot when the tab closes.
 */
async function kickBatchProcessingLocal(
  batchId: string,
  kind: BatchProcessingJobKind,
  jobId: string | null
): Promise<void> {
  try {
    const { runBatchBackgroundPipeline } = await import('./batchBackgroundPipeline')
    await withOpenAiJobAuth(
      jobId ? { batchId, jobId } : null,
      () => runBatchBackgroundPipeline({ batchId, kind })
    )
    notifyTenantDataUpdated(['batches', 'invoices'])
  } catch (err) {
    console.warn('[kickBatchProcessingLocal]', err)
  }
}

/** Drain pending jobs when an admin opens Batches (covers handoff DocSort). */
export async function drainPendingBatchProcessingJobs(limit = 3): Promise<number> {
  if (!isSupabaseConfigured()) {
    // Local / mock: still resume zombie Doc Split locks in memory.
    return resumeStuckDocSplitBatches(limit)
  }
  const supabase = getSupabase()
  if (!supabase) return resumeStuckDocSplitBatches(limit)

  const { data, error } = await supabase
    .from('batch_processing_jobs')
    .select('id, batch_id, kind, status, locked_at, locked_by')
    .in('status', ['pending', 'running'])
    .order('created_at', { ascending: true })
    .limit(Math.max(limit * 3, 9))

  if (error || !data?.length) {
    return resumeStuckDocSplitBatches(limit)
  }

  let done = 0
  for (const row of data) {
    if (done >= limit) break
    const batchId = String(row.batch_id)
    const jobId = String(row.id)
    const kind = (row.kind === 'sort_and_verify' ? 'sort_and_verify' : 'verify_only') as BatchProcessingJobKind
    const status = String(row.status)

    // Stuck "running" jobs are zombies once the browser tab that owned them is gone.
    // Doc Split only runs in-browser — edge skips status=running — so we must reclaim.
    if (status === 'running') {
      const lockedBy = row.locked_by != null ? String(row.locked_by) : ''
      const lockedAt = row.locked_at ? new Date(String(row.locked_at)).getTime() : 0
      const staleMs = Date.now() - lockedAt
      // Edge worker owns this job (server-side pipeline) — never steal a fresh
      // edge lock; it heartbeats locked_at while working and re-queues on exit.
      const isEdgeLock =
        lockedBy === 'cron' || lockedBy === 'edge-invoke' || lockedBy.startsWith('edge')
      if (isEdgeLock && staleMs < 3 * 60_000) continue
      const isBrowserLock =
        lockedBy === 'doc-split-pipeline' ||
        lockedBy === 'browser-pipeline' ||
        lockedBy === ''
      // Reclaim after 45s with no live worker in this tab (or immediately for Doc Split gate).
      const { getBatchById } = await import('../../data/mockBatches')
      const { isBatchBackgroundPipelineRunning } = await import('./batchBackgroundPipeline')
      const { isDocSplitPipelineRunning, batchShouldRunDocSplitPipeline } = await import(
        '../../utils/docSplitterAutoPipeline'
      )
      if (isBatchBackgroundPipelineRunning(batchId) || isDocSplitPipelineRunning(batchId)) {
        continue
      }
      const batch = getBatchById(batchId)
      const needsDocSplitResume = batch ? batchShouldRunDocSplitPipeline(batch) : false
      if (!isBrowserLock && !needsDocSplitResume) continue
      if (!needsDocSplitResume && staleMs < 45_000) continue
    } else if (status !== 'pending') {
      continue
    }

    try {
      await kickBatchProcessingLocal(batchId, kind, jobId)
      void kickBatchProcessingEdge(batchId)
      done += 1
    } catch (err) {
      console.warn('[drainPendingBatchProcessingJobs]', batchId, err)
    }
  }

  const resumed = await resumeStuckDocSplitBatches(Math.max(0, limit - done))
  return done + resumed
}

/**
 * Resume Doc Split batches that are locked / needs_split but have no in-tab worker.
 * Covers refresh / closed tab zombies (job may be missing or still "running").
 */
export async function resumeStuckDocSplitBatches(limit = 3): Promise<number> {
  try {
    const { getAllBatches } = await import('../../data/mockBatches')
    const { isBatchBackgroundPipelineRunning } = await import('./batchBackgroundPipeline')
    const {
      batchShouldRunDocSplitPipeline,
      isDocSplitPipelineRunning,
    } = await import('../../utils/docSplitterAutoPipeline')

    let done = 0
    for (const batch of getAllBatches()) {
      if (done >= limit) break
      // Never auto-resume Packet Rework / intentional stops.
      if (batch.status === 'rework' || batch.status === 'failed') continue
      if (!batchShouldRunDocSplitPipeline(batch) && batch.in_use_by !== 'AI Doc Split') {
        continue
      }
      if (isBatchBackgroundPipelineRunning(batch.id) || isDocSplitPipelineRunning(batch.id)) {
        continue
      }
      // Locked by AI Doc Split with no worker = zombie; always reclaim.
      const zombieLock = batch.in_use === true && batch.in_use_by === 'AI Doc Split'
      if (!zombieLock && !batchShouldRunDocSplitPipeline(batch)) continue

      try {
        await kickBatchProcessingLocal(batch.id, 'sort_and_verify', null)
        done += 1
      } catch (err) {
        console.warn('[resumeStuckDocSplitBatches]', batch.id, err)
      }
    }
    return done
  } catch (err) {
    console.warn('[resumeStuckDocSplitBatches]', err)
    return 0
  }
}
