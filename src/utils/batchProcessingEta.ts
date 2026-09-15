/**
 * Client-facing ETA for AI paperwork processing.
 * Uses file count (early) or remaining invoice reviews (later).
 */

const SECONDS_PER_FILE = 90
const SECONDS_PER_INVOICE_REVIEW = 50
const MIN_SECONDS = 120
const MAX_SECONDS = 45 * 60

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
  if (remainingSeconds <= 45) return '~1 min left'
  const mins = Math.ceil(remainingSeconds / 60)
  return `~${mins} min left`
}

/**
 * Estimate total / remaining time for DocSort + AI review.
 * Shrinks with invoice progress and elapsed time since start.
 */
export function estimateBatchProcessingEta(input: BatchEtaInput): BatchEta | null {
  if (input.phase === 'done' || input.phase === 'failed' || input.phase === 'idle') {
    return null
  }

  const invoiceTotal = input.invoiceTotal ?? 0
  const invoiceCompleted = input.invoiceCompleted ?? 0
  const fileCount = Math.max(0, input.fileCount ?? 0)

  let totalSeconds: number
  if (invoiceTotal > 0) {
    totalSeconds = clamp(
      invoiceTotal * SECONDS_PER_INVOICE_REVIEW + 60,
      MIN_SECONDS,
      MAX_SECONDS
    )
  } else if (fileCount > 0) {
    totalSeconds = clamp(fileCount * SECONDS_PER_FILE, MIN_SECONDS, MAX_SECONDS)
  } else {
    totalSeconds = MIN_SECONDS * 2
  }

  let remainingSeconds: number
  if (invoiceTotal > 0) {
    const remainingInvoices = Math.max(0, invoiceTotal - invoiceCompleted)
    remainingSeconds = clamp(
      remainingInvoices * SECONDS_PER_INVOICE_REVIEW + (remainingInvoices > 0 ? 30 : 0),
      remainingInvoices === 0 ? 0 : 30,
      MAX_SECONDS
    )
  } else {
    remainingSeconds = totalSeconds
  }

  // Account for time already spent so the ETA moves even before invoice counts exist.
  if (input.startedAt) {
    const started = new Date(input.startedAt).getTime()
    if (Number.isFinite(started)) {
      const elapsedSec = Math.max(0, (Date.now() - started) / 1000)
      const byElapsed = Math.max(0, totalSeconds - elapsedSec)
      remainingSeconds = Math.min(remainingSeconds, byElapsed)
      // Keep a small floor while still processing so we don't flip to "done" early.
      if (remainingSeconds < 30 && (invoiceTotal === 0 || invoiceCompleted < invoiceTotal)) {
        remainingSeconds = 30
      }
    }
  }

  return {
    totalSeconds,
    remainingSeconds: Math.round(remainingSeconds),
    label: formatDurationMinutes(remainingSeconds),
    shortLabel: formatShortRemaining(remainingSeconds),
  }
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
