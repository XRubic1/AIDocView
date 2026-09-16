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
    return { jobId: null }
  }

  const supabase = getSupabase()
  if (!supabase) {
    void kickBatchProcessingLocal(opts.batchId, kind, null)
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

  return { jobId }
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
  if (!isSupabaseConfigured()) return 0
  const supabase = getSupabase()
  if (!supabase) return 0

  const { data, error } = await supabase
    .from('batch_processing_jobs')
    .select('id, batch_id, kind')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(limit)

  if (error || !data?.length) return 0

  let done = 0
  for (const row of data) {
    const batchId = String(row.batch_id)
    const jobId = String(row.id)
    const kind = (row.kind === 'sort_and_verify' ? 'sort_and_verify' : 'verify_only') as BatchProcessingJobKind
    try {
      await kickBatchProcessingLocal(batchId, kind, jobId)
      void kickBatchProcessingEdge(batchId)
      done += 1
    } catch (err) {
      console.warn('[drainPendingBatchProcessingJobs]', batchId, err)
    }
  }
  return done
}
