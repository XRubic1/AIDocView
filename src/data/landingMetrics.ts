import { AI_REVIEW_CONFIG } from '../config/aiReview'

/**
 * Honest marketing baselines — aligned with estimateReviewTime.ts and typical OpenAI latency.
 * Typical single-PDF load is ~45–90s depending on pages; ~60s is a fair default.
 */
export const TYPICAL_SECONDS_PER_LOAD = 60

/** Default parallel PDF reviews from env (same as review engine). */
export const DEFAULT_PARALLEL_LOADS = AI_REVIEW_CONFIG.PARALLEL_DOCUMENTS

/** Example batch: 20 loads with default parallelism. */
export const EXAMPLE_BATCH_LOAD_COUNT = 20

export function estimateBatchMinutes(
  loadCount: number,
  secondsPerLoad = TYPICAL_SECONDS_PER_LOAD,
  parallel = DEFAULT_PARALLEL_LOADS
): number {
  if (loadCount <= 0) return 0
  const waves = Math.ceil(loadCount / Math.max(1, parallel))
  return Math.max(1, Math.ceil((waves * secondsPerLoad) / 60))
}

export const HERO_STATS_BASELINE = [
  {
    target: TYPICAL_SECONDS_PER_LOAD,
    prefix: '~',
    suffix: 's',
    label: 'Typical per load',
    footnote: 'Single PDF, full classify + extract + cross-check',
  },
  {
    target: DEFAULT_PARALLEL_LOADS,
    prefix: '',
    suffix: '',
    label: 'Loads reviewed in parallel',
    footnote: 'Multiple PDFs per upload batch',
  },
  {
    target: estimateBatchMinutes(EXAMPLE_BATCH_LOAD_COUNT),
    prefix: '~',
    suffix: ' min',
    label: `${EXAMPLE_BATCH_LOAD_COUNT} loads in one batch`,
    footnote: `At ~${TYPICAL_SECONDS_PER_LOAD}s/load with ${DEFAULT_PARALLEL_LOADS} parallel`,
  },
] as const

export const HERO_HEADLINE_TIMING = {
  line1: 'Every Load.',
  line2: 'Every Doc.',
  line3: '~1 Min',
  line3Suffix: 'Typical',
} as const

export const HERO_SUB_COPY =
  'Audit rate cons, BOLs, invoices, and PODs against your load sheet — one clear verdict per load. ~1 min per PDF; run 5 loads in parallel.'
