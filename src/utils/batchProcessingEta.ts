/**
 * Client-facing ETA for AI paperwork processing.
 * Uses file count (early) or remaining invoice reviews (later).
 *
 * Each upload is classified page by page, then the rate con is read until the
 * load fields are filled. Those calls share one token limit, so wall time
 * grows with the number of packets. A batch of 16 takes more than 20 minutes.
 */

/** About 2 minutes of vision + rate-limit wait per uploaded packet. */
const SECONDS_PER_PACKET = 2 * 60
const MIN_SECONDS = 3 * 60
const MAX_SECONDS = 4 * 60 * 60

export type BatchEtaInput = {
  fileCount?: number | null
  invoiceTotal?: number | null
  invoiceCompleted?: number | null
  /** ISO timestamp when processing started / batch submitted */
  startedAt?: string | null
  phase?: 'idle' | 'processing' | 'done' | 'failed' | string
}

export type BatchEta = {
  totalSeconds: number
  remainingSeconds: number
  label: string
  /** Short label for pills, e.g. "~4 min left" */
  shortLabel: string
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

/** Human-readable duration, e.g. "about 4 minutes". */
export function formatDurationMinutes(totalSeconds: number): string {
  const mins = Math.max(1, Math.ceil(totalSeconds / 60))
  if (mins === 1) return 'about 1 minute'
  if (mins < 60) return `about ${mins} minutes`
  const hours = Math.floor(mins / 60)
  const rem = mins % 60
  if (rem === 0) return hours === 1 ? 'about 1 hour' : `about ${hours} hours`
  return `about ${hours}h ${rem}m`
}

function formatShortRemaining(remainingSeconds: number): string {
  const mins = Math.max(1, Math.ceil(remainingSeconds / 60))
  if (mins < 60) return `~${mins} min left`
  const hours = Math.floor(mins / 60)
  const rem = mins % 60
  if (rem === 0) return hours === 1 ? '~1 hr left' : `~${hours} hr left`
  return `~${hours} hr ${rem} min left`
}

/**
 * Estimate total / remaining time for DocSort + AI review.
 * Shrinks with invoice progress and elapsed time since start.
 */
export function estimateBatchProcessingEta(input: BatchEtaInput): BatchEta | null {
  if (input.phase === 'done' || input.phase === 'rework' || input.phase === 'failed' || input.phase === 'idle') {
    return null
  }

  const invoiceTotal = input.invoiceTotal ?? 0
  const invoiceCompleted = input.invoiceCompleted ?? 0
  const fileCount = Math.max(0, input.fileCount ?? 0)
  const packets = Math.max(fileCount, invoiceTotal)

  const totalSeconds =
    packets > 0
      ? clamp(packets * SECONDS_PER_PACKET, MIN_SECONDS, MAX_SECONDS)
      : MIN_SECONDS

  const stillWorking = invoiceTotal === 0 || invoiceCompleted < invoiceTotal
  let remainingSeconds = totalSeconds
  if (invoiceTotal > 0) {
    const remainingInvoices = Math.max(0, invoiceTotal - invoiceCompleted)
    const notYetInvoiced = Math.max(0, fileCount - invoiceTotal)
    const left = remainingInvoices + notYetInvoiced
    remainingSeconds =
      left === 0 ? 0 : clamp(left * SECONDS_PER_PACKET, MIN_SECONDS, MAX_SECONDS)
  }

  // Count down from submit, but keep a few minutes on screen while work is still running.
  if (input.startedAt && stillWorking) {
    const started = new Date(input.startedAt).getTime()
    if (Number.isFinite(started)) {
      const elapsedSec = Math.max(0, (Date.now() - started) / 1000)
      remainingSeconds = Math.min(remainingSeconds, Math.max(0, totalSeconds - elapsedSec))
      if (remainingSeconds < 2 * 60) remainingSeconds = 2 * 60
    }
  }

  return {
    totalSeconds,
    remainingSeconds: Math.round(remainingSeconds),
    label: formatDurationMinutes(remainingSeconds),
    shortLabel: formatShortRemaining(remainingSeconds),
  }
}

/**
 * Packet creation has no deadline. A long rate-limit wait is still in progress.
 */
export function getBatchAiCreationTimeoutAt(_input: {
  startedAt?: string | null
  fileCount?: number | null
  invoiceTotal?: number | null
}): number | null {
  return null
}

/** Packet creation is never failed because a clock ran out. */
export function isBatchAiCreationTimedOut(
  _input: {
    startedAt?: string | null
    fileCount?: number | null
    invoiceTotal?: number | null
  },
  _nowMs: number = Date.now()
): boolean {
  return false
}

const ETA_FILE_COUNT_KEY = 'credyx:batch-eta-files'

/** Remember file count at submit so list/detail can estimate before invoices exist. */
export function rememberBatchFileCount(batchId: string, fileCount: number): void {
  if (typeof window === 'undefined' || !batchId || fileCount <= 0) return
  try {
    const raw = sessionStorage.getItem(ETA_FILE_COUNT_KEY)
    const map = raw ? (JSON.parse(raw) as Record<string, number>) : {}
    map[batchId] = fileCount
    sessionStorage.setItem(ETA_FILE_COUNT_KEY, JSON.stringify(map))
  } catch {
    /* ignore quota / private mode */
  }
}

export function getRememberedBatchFileCount(batchId: string): number | null {
  if (typeof window === 'undefined' || !batchId) return null
  try {
    const raw = sessionStorage.getItem(ETA_FILE_COUNT_KEY)
    if (!raw) return null
    const map = JSON.parse(raw) as Record<string, number>
    const n = map[batchId]
    return typeof n === 'number' && n > 0 ? n : null
  } catch {
    return null
  }
}
