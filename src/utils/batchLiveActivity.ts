/**
 * Live “what is this batch doing right now?” activity for admin Batch Debug.
 * Pipelines write here; the debug panel polls / subscribes for a clear current job.
 */

export type BatchLiveActivityPhase =
  | 'idle'
  | 'queued'
  | 'hydrating'
  | 'doc_sort'
  | 'doc_split'
  | 'classifying'
  | 'extracting'
  | 'matching'
  | 'creating_packets'
  | 'verifying'
  | 'happy_path'
  | 'succeeded'
  | 'failed'
  | 'aborted'

export type BatchLiveActivity = {
  batchId: string
  /** High-level job name shown in debug (e.g. AI Doc Split, Verify). */
  jobLabel: string
  /** Pipeline kind when known (sort_and_verify, verify_only, doc_split…). */
  jobKind: string | null
  phase: BatchLiveActivityPhase
  /** Human: what the AI / pipeline is trying to figure out. */
  thinking: string
  /** Human: concrete step currently executing. */
  doing: string
  /** True when this tab’s background pipeline owns the work (no UI required). */
  background: boolean
  /** 0–100 when known; null if indeterminate. */
  progressPercent: number | null
  progressLabel: string | null
  startedAt: string
  updatedAt: string
  /** Last error when phase is failed/aborted. */
  error: string | null
  /** Recent step breadcrumbs (newest last), capped. */
  recentSteps: string[]
}

const MAX_STEPS = 12

const byBatch = new Map<string, BatchLiveActivity>()
const listeners = new Set<() => void>()

function notify(): void {
  for (const fn of listeners) {
    try {
      fn()
    } catch (err) {
      console.warn('[batchLiveActivity] listener failed', err)
    }
  }
}

/** Subscribe to any activity change (debug panel live refresh). */
export function subscribeBatchLiveActivity(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Snapshot of current activity, or null if never started / cleared. */
export function getBatchLiveActivity(batchId: string): BatchLiveActivity | null {
  return byBatch.get(batchId) ?? null
}

/** True when phase is an in-flight working state (not idle/done). */
export function isBatchLiveActivityRunning(activity: BatchLiveActivity | null): boolean {
  if (!activity) return false
  return (
    activity.phase !== 'idle' &&
    activity.phase !== 'succeeded' &&
    activity.phase !== 'failed' &&
    activity.phase !== 'aborted'
  )
}

function pushStep(activity: BatchLiveActivity, step: string): void {
  const trimmed = step.trim()
  if (!trimmed) return
  const last = activity.recentSteps[activity.recentSteps.length - 1]
  if (last === trimmed) return
  activity.recentSteps = [...activity.recentSteps, trimmed].slice(-MAX_STEPS)
}

/**
 * Start or replace live activity for a batch (call when a pipeline begins).
 */
export function startBatchLiveActivity(
  batchId: string,
  opts: {
    jobLabel: string
    jobKind?: string | null
    thinking?: string
    doing?: string
    background?: boolean
    phase?: BatchLiveActivityPhase
  }
): BatchLiveActivity {
  const now = new Date().toISOString()
  const row: BatchLiveActivity = {
    batchId,
    jobLabel: opts.jobLabel,
    jobKind: opts.jobKind ?? null,
    phase: opts.phase ?? 'queued',
    thinking: opts.thinking ?? 'Starting…',
    doing: opts.doing ?? 'Queued',
    background: opts.background ?? true,
    progressPercent: null,
    progressLabel: null,
    startedAt: now,
    updatedAt: now,
    error: null,
    recentSteps: [],
  }
  pushStep(row, opts.doing ?? 'Queued')
  byBatch.set(batchId, row)
  notify()
  return row
}

/**
 * Update thinking / doing / phase for an in-flight job.
 */
export function updateBatchLiveActivity(
  batchId: string,
  patch: {
    jobLabel?: string
    jobKind?: string | null
    phase?: BatchLiveActivityPhase
    thinking?: string
    doing?: string
    background?: boolean
    progressPercent?: number | null
    progressLabel?: string | null
    error?: string | null
  }
): BatchLiveActivity | null {
  const prev = byBatch.get(batchId)
  if (!prev) {
    // Soft-start if pipeline forgot to call start.
    return startBatchLiveActivity(batchId, {
      jobLabel: patch.jobLabel ?? 'Background job',
      jobKind: patch.jobKind,
      thinking: patch.thinking,
      doing: patch.doing,
      background: patch.background,
      phase: patch.phase,
    })
  }

  const next: BatchLiveActivity = {
    ...prev,
    ...patch,
    updatedAt: new Date().toISOString(),
    recentSteps: [...prev.recentSteps],
  }
  if (patch.doing) pushStep(next, patch.doing)
  byBatch.set(batchId, next)
  notify()
  return next
}

/** Mark succeeded / failed / aborted and keep the final message for debug. */
export function finishBatchLiveActivity(
  batchId: string,
  opts: {
    phase: 'succeeded' | 'failed' | 'aborted'
    thinking?: string
    doing?: string
    error?: string | null
  }
): void {
  const prev = byBatch.get(batchId)
  const now = new Date().toISOString()
  if (!prev) {
    byBatch.set(batchId, {
      batchId,
      jobLabel: 'Background job',
      jobKind: null,
      phase: opts.phase,
      thinking: opts.thinking ?? (opts.phase === 'succeeded' ? 'Done' : 'Stopped'),
      doing: opts.doing ?? opts.phase,
      background: true,
      progressPercent: opts.phase === 'succeeded' ? 100 : null,
      progressLabel: null,
      startedAt: now,
      updatedAt: now,
      error: opts.error ?? null,
      recentSteps: opts.doing ? [opts.doing] : [],
    })
    notify()
    return
  }

  const next: BatchLiveActivity = {
    ...prev,
    phase: opts.phase,
    thinking: opts.thinking ?? prev.thinking,
    doing: opts.doing ?? prev.doing,
    error: opts.error ?? (opts.phase === 'failed' || opts.phase === 'aborted' ? prev.error : null),
    progressPercent: opts.phase === 'succeeded' ? 100 : prev.progressPercent,
    updatedAt: now,
    recentSteps: [...prev.recentSteps],
  }
  if (opts.doing) pushStep(next, opts.doing)
  byBatch.set(batchId, next)
  notify()
}

/** Clear activity (optional — usually keep last finished state for debug). */
export function clearBatchLiveActivity(batchId: string): void {
  if (!byBatch.delete(batchId)) return
  notify()
}

/** Friendly phase label for the debug UI. */
export function batchLiveActivityPhaseLabel(phase: BatchLiveActivityPhase): string {
  switch (phase) {
    case 'idle':
      return 'Idle'
    case 'queued':
      return 'Queued'
    case 'hydrating':
      return 'Loading files'
    case 'doc_sort':
      return 'DocSort'
    case 'doc_split':
      return 'Doc Split'
    case 'classifying':
      return 'Classifying pages'
    case 'extracting':
      return 'Extracting RC/BOL'
    case 'matching':
      return 'Matching loads'
    case 'creating_packets':
      return 'Creating packets'
    case 'verifying':
      return 'AI verifying'
    case 'happy_path':
      return 'Happy path'
    case 'succeeded':
      return 'Succeeded'
    case 'failed':
      return 'Failed'
    case 'aborted':
      return 'Aborted'
    default:
      return phase
  }
}
