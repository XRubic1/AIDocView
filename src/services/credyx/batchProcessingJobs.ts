import { getSupabase, isSupabaseConfigured } from '../../lib/supabase'
import { notifyTenantDataUpdated } from '../supabase/tenantDataLiveSync'
import type { BatchProcessingJobSnapshot } from '../../utils/clientBatchAiProgress'
import { withOpenAiJobAuth } from '../../utils/openaiAuthContext'
import { markPacketCreationQueued } from '../../utils/packetCreationQueue'

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
    startBatchProcessing(opts.batchId, kind, null)
    return { jobId: null }
  }

  const supabase = getSupabase()
  if (!supabase) {
    startBatchProcessing(opts.batchId, kind, null)
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

  startBatchProcessing(opts.batchId, kind, jobId)

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

/** One packet-creation run at a time. Later submits stay pending until it finishes. */
let activePacketCreationId: string | null = null

export function isPacketCreationRunning(): boolean {
  return activePacketCreationId != null
}

/** Claim the single creation slot. Same batch may reserve again; a different batch waits. */
export function reservePacketCreation(batchId: string): boolean {
  if (activePacketCreationId && activePacketCreationId !== batchId) return false
  activePacketCreationId = batchId
  return true
}

export function releasePacketCreation(batchId: string): void {
  if (activePacketCreationId === batchId) activePacketCreationId = null
}

/** True when this tab already owns the creation slot for the batch. */
export function holdsPacketCreation(batchId: string): boolean {
  return activePacketCreationId === batchId
}

/**
 * Direct pipeline entry (admin drain) must take the same cross-client slot.
 * A start that already reserved this batch does not claim twice.
 */
export async function acquirePacketCreationIfNeeded(batchId: string): Promise<boolean> {
  if (holdsPacketCreation(batchId)) return true
  if (!reservePacketCreation(batchId)) return false
  const turn = await claimPacketCreationTurn(batchId)
  if (turn === 'started') {
    markPacketCreationQueued(batchId, false)
    waitingCreations.delete(batchId)
    return true
  }
  releasePacketCreation(batchId)
  if (turn === 'queued') {
    showPacketCreationQueued(batchId)
    rememberWaitingCreation(batchId, null)
  }
  return false
}

const waitingCreations = new Map<string, string | null>()
let queueTimer: ReturnType<typeof setInterval> | null = null
let drainingQueue = false

function showPacketCreationQueued(batchId: string): void {
  markPacketCreationQueued(batchId, true)
  void import('../../utils/batchLiveActivity').then(({ startBatchLiveActivity }) => {
    startBatchLiveActivity(batchId, {
      jobLabel: 'Background packet creation',
      jobKind: 'sort_and_verify',
      background: true,
      phase: 'queued',
      thinking: 'Another batch is being created. This one starts when that finishes.',
      doing: 'Queued',
    })
  })
}

function rememberWaitingCreation(batchId: string, jobId: string | null): void {
  waitingCreations.set(batchId, jobId)
  if (queueTimer != null) return
  queueTimer = setInterval(() => {
    void drainNextPacketCreation()
  }, 8_000)
}

function stopQueueTimerIfIdle(): void {
  if (waitingCreations.size > 0 || queueTimer == null) return
  clearInterval(queueTimer)
  queueTimer = null
}

type CreationTurn = 'started' | 'queued' | 'busy'

const CREATION_LOCK_FRESH_MS = 5 * 60 * 1000

/** Another packet creation this client can see (same portal, other tab, or other batch). */
async function anotherPacketCreationIsActive(batchId: string): Promise<boolean> {
  if (activePacketCreationId && activePacketCreationId !== batchId) return true
  if (!isSupabaseConfigured()) return false
  const supabase = getSupabase()
  if (!supabase) return false
  try {
    const { data, error } = await supabase
      .from('batch_processing_jobs')
      .select('batch_id, status, locked_at')
      .eq('kind', 'sort_and_verify')
      .eq('status', 'running')
      .limit(10)
    if (error || !data?.length) return false
    const now = Date.now()
    return data.some((row) => {
      if (String(row.batch_id) === batchId) return false
      const lockedAt = row.locked_at ? new Date(String(row.locked_at)).getTime() : 0
      if (!lockedAt) return true
      return now - lockedAt < CREATION_LOCK_FRESH_MS
    })
  } catch (err) {
    console.warn('[anotherPacketCreationIsActive]', err)
    return false
  }
}

/** This batch already has a fresh running creation (another tab or the edge worker). */
async function sameBatchCreationIsRunning(batchId: string): Promise<boolean> {
  const supabase = getSupabase()
  if (!supabase) return false
  try {
    const { data, error } = await supabase
      .from('batch_processing_jobs')
      .select('locked_at')
      .eq('batch_id', batchId)
      .eq('kind', 'sort_and_verify')
      .eq('status', 'running')
      .limit(1)
    // Unknown state — stay out of the way rather than risk a duplicate run.
    if (error) return true
    const lockedAt = data?.[0]?.locked_at ? new Date(String(data[0].locked_at)).getTime() : 0
    return lockedAt > 0 && Date.now() - lockedAt < CREATION_LOCK_FRESH_MS
  } catch {
    return true
  }
}

/** Fallback when the claim RPC fails: never start over a live run. */
async function fallbackCreationTurn(batchId: string): Promise<CreationTurn> {
  if (await anotherPacketCreationIsActive(batchId)) return 'queued'
  if (await sameBatchCreationIsRunning(batchId)) return 'busy'
  return 'started'
}

/** Cross-client slot. One sort_and_verify runs at a time so OpenAI is not shared. */
async function claimPacketCreationTurn(batchId: string): Promise<CreationTurn> {
  if (await anotherPacketCreationIsActive(batchId)) return 'queued'
  if (!isSupabaseConfigured()) return 'started'
  const supabase = getSupabase()
  if (!supabase) return 'started'
  try {
    const { data, error } = await supabase.rpc('claim_packet_creation_turn', {
      p_batch_id: batchId,
    })
    if (error) {
      console.warn('[claim_packet_creation_turn]', error.message || error)
      return fallbackCreationTurn(batchId)
    }
    if (data === 'queued' || data === 'busy') return data
    if (data === 'started') {
      if (await anotherPacketCreationIsActive(batchId)) return 'queued'
      return 'started'
    }
    return 'started'
  } catch (err) {
    console.warn('[claim_packet_creation_turn]', err)
    return fallbackCreationTurn(batchId)
  }
}

/**
 * Start this batch now, or leave its job pending when a creation is already running.
 * Packet creation is one-at-a-time so two clients do not share the OpenAI token limit.
 */
async function startBatchProcessing(
  batchId: string,
  kind: BatchProcessingJobKind,
  jobId: string | null
): Promise<void> {
  if (kind === 'sort_and_verify') {
    if (activePacketCreationId === batchId) return
    if (!reservePacketCreation(batchId)) {
      showPacketCreationQueued(batchId)
      rememberWaitingCreation(batchId, jobId)
      return
    }
    const turn = await claimPacketCreationTurn(batchId)
    if (turn !== 'started') {
      releasePacketCreation(batchId)
      if (turn === 'queued') {
        showPacketCreationQueued(batchId)
        rememberWaitingCreation(batchId, jobId)
      } else {
        markPacketCreationQueued(batchId, false)
      }
      return
    }
    markPacketCreationQueued(batchId, false)
    waitingCreations.delete(batchId)
  }
  // Packet creation stays in this browser. The deployed edge worker still
  // matches BOLs by load number and leaves same-upload BOLs unassigned.
  if (kind !== 'sort_and_verify' && isSupabaseConfigured() && getSupabase()) {
    void kickBatchProcessingEdge(batchId)
  }
  void kickBatchProcessingLocal(batchId, kind, jobId)
}

/** Start the oldest waiting packet creation after the current one finishes. */
export async function drainNextPacketCreation(): Promise<void> {
  if (drainingQueue || isPacketCreationRunning()) return
  drainingQueue = true
  try {
    const next = waitingCreations.entries().next()
    if (!next.done) {
      const [batchId, jobId] = next.value
      waitingCreations.delete(batchId)
      await startBatchProcessing(batchId, 'sort_and_verify', jobId)
    }
  } catch (err) {
    console.warn('[drainNextPacketCreation]', err)
  } finally {
    drainingQueue = false
    stopQueueTimerIfIdle()
  }
}

/**
 * While a client is watching their batches, try again to start a creation
 * that was left pending behind another client.
 */
const revivedFailedCreations = new Set<string>()

export function nudgePacketCreationQueue(
  jobs: BatchProcessingJobSnapshot[],
  clientId?: string
): void {
  if (isPacketCreationRunning() || drainingQueue) return
  const pending = jobs.find(
    (job) => job.status === 'pending' && job.kind === 'sort_and_verify'
  )
  if (pending) {
    rememberWaitingCreation(pending.batch_id, pending.id)
    void drainNextPacketCreation()
    return
  }
  // A creation that crashed on startup (instead of waiting) is still pending work.
  const failed = jobs.find(
    (job) =>
      job.status === 'failed' &&
      job.kind === 'sort_and_verify' &&
      !revivedFailedCreations.has(job.batch_id)
  )
  if (!failed || !clientId) return
  revivedFailedCreations.add(failed.batch_id)
  void enqueueBatchProcessing({
    batchId: failed.batch_id,
    clientId,
    kind: 'sort_and_verify',
  })
}

/** Avoid re-kicking the same batch on every tenant tick (pipeline notifies when it starts). */
const recentlyKickedAt = new Map<string, number>()
const KICK_COOLDOWN_MS = 45_000

function markBatchKicked(batchId: string): void {
  recentlyKickedAt.set(batchId, Date.now())
}

function batchKickedRecently(batchId: string): boolean {
  const at = recentlyKickedAt.get(batchId)
  return at != null && Date.now() - at < KICK_COOLDOWN_MS
}

/** Drain pending jobs when an admin opens Batches (covers handoff DocSort). */
export async function drainPendingBatchProcessingJobs(limit = 3): Promise<number> {
  if (!isSupabaseConfigured()) {
    // Local / mock: still resume zombie Doc Split locks in memory.
    return resumeStuckDocSplitBatches(limit)
  }
  const supabase = getSupabase()
  if (!supabase) return resumeStuckDocSplitBatches(limit)

  // Creations that crashed instead of waiting stay on the batch as "creating".
  try {
    const { data: failedCreations } = await supabase
      .from('batch_processing_jobs')
      .select('batch_id, client_id, attempts, max_attempts, last_error')
      .eq('status', 'failed')
      .eq('kind', 'sort_and_verify')
      .order('created_at', { ascending: true })
      .limit(5)
    const { getBatchById } = await import('../../data/mockBatches')
    for (const row of failedCreations ?? []) {
      const batchId = String(row.batch_id)
      if (revivedFailedCreations.has(batchId)) continue
      const batch = getBatchById(batchId)
      if (!batch || (batch.status !== 'creating' && batch.sort_status !== 'sorting')) continue
      revivedFailedCreations.add(batchId)
      // Out of attempts: stop retrying (each retry spends AI tokens) and hand it to ops.
      const attempts = Number(row.attempts ?? 0)
      const maxAttempts = Number(row.max_attempts ?? 5)
      if (attempts >= maxAttempts) {
        const { markBatchNeedsRework } = await import('../batchReworkService')
        const lastError = row.last_error ? ` Last error: ${String(row.last_error)}` : ''
        void markBatchNeedsRework(
          batchId,
          `Packet creation failed ${attempts} times; automatic retries stopped.${lastError}`
        )
        continue
      }
      void enqueueBatchProcessing({
        batchId,
        clientId: String(row.client_id),
        kind: 'sort_and_verify',
      })
    }
  } catch (err) {
    console.warn('[drainPendingBatchProcessingJobs] revive failed creation', err)
  }

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
    // The edge worker skips fresh running locks, so a dead tab's lock must be reclaimed here.
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

    if (batchKickedRecently(batchId)) continue

    const { isBatchBackgroundPipelineRunning } = await import('./batchBackgroundPipeline')
    const { isDocSplitPipelineRunning } = await import('../../utils/docSplitterAutoPipeline')
    if (isBatchBackgroundPipelineRunning(batchId) || isDocSplitPipelineRunning(batchId)) {
      continue
    }

    try {
      markBatchKicked(batchId)
      await kickBatchProcessingLocal(batchId, kind, jobId)
      if (kind !== 'sort_and_verify') void kickBatchProcessingEdge(batchId)
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

      if (batchKickedRecently(batch.id)) continue

      try {
        markBatchKicked(batch.id)
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
