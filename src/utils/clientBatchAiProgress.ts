import {
  estimateBatchProcessingEta,
  getRememberedBatchFileCount,
} from './batchProcessingEta'

export type ClientBatchAiPhase = 'idle' | 'processing' | 'done' | 'rework'

export type BatchProcessingJobSnapshot = {
  id: string
  batch_id: string
  status: 'pending' | 'running' | 'succeeded' | 'failed'
  kind?: string
  last_error?: string | null
}

export type ClientBatchAiProgress = {
  phase: ClientBatchAiPhase
  label: string
  detail: string | null
  completed: number
  total: number
  percent: number
  /** Whether list/detail should surface AI progress UI */
  show: boolean
  /** e.g. "about 4 minutes" */
  etaLabel: string | null
  /** e.g. "~4 min left" */
  etaShortLabel: string | null
}

type InvoiceReviewLike = {
  ai_review_status?: 'not_run' | 'running' | 'ready' | 'needs_work' | string
}

const IDLE: ClientBatchAiProgress = {
  phase: 'idle',
  label: '',
  detail: null,
  completed: 0,
  total: 0,
  percent: 0,
  show: false,
  etaLabel: null,
  etaShortLabel: null,
}

function isReviewFinished(status?: string): boolean {
  return status === 'ready' || status === 'needs_work'
}

/**
 * Compute client-friendly PPW processing progress for an AI batch.
 * Pass `optimisticProcessing` right after submit before the job row is visible.
 */
export function getClientBatchAiProgress(input: {
  batchId?: string | null
  uploadMode?: string | null
  sortStatus?: string | null
  batchStatus?: string | null
  submittedAt?: string | null
  invoices: InvoiceReviewLike[]
  job?: BatchProcessingJobSnapshot | null
  optimisticProcessing?: boolean
  fileCount?: number | null
}): ClientBatchAiProgress {
  const {
    batchId,
    uploadMode,
    sortStatus,
    batchStatus,
    submittedAt,
    invoices,
    job,
    optimisticProcessing,
    fileCount,
  } = input
  const isAiRelevant =
    uploadMode === 'ai' ||
    uploadMode === 'handoff' ||
    batchStatus === 'creating' ||
    batchStatus === 'rework' ||
    sortStatus === 'sorting' ||
    sortStatus === 'failed'

  if (!isAiRelevant) return IDLE

  const total = invoices.length
  const completed = invoices.filter((inv) => isReviewFinished(inv.ai_review_status)).length
  const reviewsDone = total > 0 && completed === total
  const jobSucceeded = job?.status === 'succeeded'
  const jobFailed = job?.status === 'failed'
  const sortSettled = sortStatus === 'ready' || sortStatus === 'failed'
  // Stale `running` after packets exist should not keep ETA forever once job/sort finished
  // or every invoice already has a finished status.
  const anyRunning =
    !reviewsDone &&
    !jobSucceeded &&
    !sortSettled &&
    invoices.some((inv) => inv.ai_review_status === 'running')
  const percent = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0
  const detail =
    total > 0 ? `Checked ${completed} of ${total} load${total === 1 ? '' : 's'}` : null

  const rememberedFiles =
    fileCount ?? (batchId ? getRememberedBatchFileCount(batchId) : null) ?? null

  const withEta = (
    base: Omit<ClientBatchAiProgress, 'etaLabel' | 'etaShortLabel'>
  ): ClientBatchAiProgress => {
    if (base.phase !== 'processing') {
      return { ...base, etaLabel: null, etaShortLabel: null }
    }
    const eta = estimateBatchProcessingEta({
      fileCount: rememberedFiles,
      invoiceTotal: total,
      invoiceCompleted: completed,
      startedAt: submittedAt,
      phase: 'processing',
    })
    return {
      ...base,
      etaLabel: eta?.label ?? null,
      etaShortLabel: eta?.shortLabel ?? null,
    }
  }

  // Carrier-facing: never show Rework — Credyx handles it; client only sees Processing.
  if (batchStatus === 'rework' || sortStatus === 'failed' || jobFailed) {
    return withEta({
      phase: 'processing',
      label: 'Processing…',
      detail: 'Credyx is finishing your paperwork. We’ll update this batch when invoices are ready.',
      completed,
      total,
      percent,
      show: true,
    })
  }

  // All invoices finished → done even if job/sort flags were left stale.
  if (reviewsDone) {
    return withEta({
      phase: 'done',
      label: 'Invoices ready to review',
      detail,
      completed: total,
      total,
      percent: 100,
      show: true,
    })
  }

  const jobActive = job?.status === 'pending' || job?.status === 'running'
  // Ignore stale sort/creating flags once the job finished or every invoice is done.
  const sorting =
    !jobSucceeded &&
    !reviewsDone &&
    (sortStatus === 'sorting' || batchStatus === 'creating')

  if (jobActive || sorting || anyRunning || optimisticProcessing) {
    return withEta({
      phase: 'processing',
      label: total > 0 ? 'Creating and checking invoices…' : 'Creating invoices from your paperwork…',
      detail:
        detail ||
        (rememberedFiles
          ? `Working through ${rememberedFiles} file${rememberedFiles === 1 ? '' : 's'}`
          : 'This can take a few minutes'),
      completed,
      total,
      percent: jobActive && total === 0 ? 0 : percent,
      show: true,
    })
  }

  const hadReviewActivity =
    jobSucceeded ||
    invoices.some((inv) => inv.ai_review_status && inv.ai_review_status !== 'not_run')

  if (hadReviewActivity && (jobSucceeded || sortSettled) && !jobActive && !anyRunning) {
    return withEta({
      phase: 'done',
      label: 'Invoices ready to review',
      detail,
      completed: Math.max(completed, total > 0 && completed === total ? total : completed),
      total,
      percent: 100,
      show: true,
    })
  }

  return IDLE
}
