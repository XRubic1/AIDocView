import { useEffect, useState } from 'react'
import { AI_REVIEW_CONFIG, getEffectiveTpmBudget } from '../config/aiReview'
import { estimateCostUsd } from './reviewCost'
import { getReviewPageCount } from './fileToReviewImage'
import {
  estimateReviewSecondsForFiles,
  estimateReviewSecondsForPageCount,
  formatEstimatedDuration,
} from './estimateReviewTime'

const PROMPT_TOKENS_CLASSIFY = 700
const PROMPT_TOKENS_EXTRACT = 2200
const COMPLETION_TOKENS_AVG = 450

export type TpmRiskLevel = 'ok' | 'warning' | 'exceeded'

export interface PageTokenEstimate {
  pageCount: number
  totalTokens: number
  peakTokensPerMinute: number
  apiCalls: number
}

export interface PerFileTokenEstimate {
  fileName: string
  pageCount: number
  totalTokens: number
  peakTokensPerMinute: number
  apiCalls: number
  estimatedCostUsd: number
}

/** One parallel batch of PDFs — peak TPM is summed while they run together. */
export interface ReviewWavePlan {
  waveIndex: number
  fileNames: string[]
  fileCount: number
  estimatedPeakTpm: number
  withinLimit: boolean
}

export interface ReviewBatchTokenEstimate {
  totalTokens: number
  /** Approximate USD based on configured models and published token rates. */
  estimatedCostUsd: number
  peakTokensPerMinute: number
  tpmLimit: number
  /** Budget used for batch planning (TPM_LIMIT × throttle ratio). */
  planBudget: number
  apiCalls: number
  riskLevel: TpmRiskLevel
  exceedsLimit: boolean
  configuredParallel: number
  /** Max PDFs that can run at once and stay under TPM (may be 0 if even one file is too heavy). */
  maxConcurrentBeforeLimit: number
  /** Parallel count the review pipeline will use (after auto-throttle). */
  suggestedParallel: number
  /** Ordered waves — every uploaded file appears in exactly one wave. */
  waves: ReviewWavePlan[]
  /** Plain-language plan shown before Run Review. */
  runSummary: string
  message: string
  perFile: PerFileTokenEstimate[]
}

/** US letter aspect — used when actual rendered height is unknown. */
function approxPageHeight(width: number): number {
  return Math.round(width * 1.294)
}

/**
 * OpenAI vision token estimate per image (see platform vision pricing docs).
 * Low detail = 85 tokens; high detail = 512px tiles × 170 + 85.
 */
export function estimateVisionTokensPerImage(
  detail: 'low' | 'high',
  maxWidth = AI_REVIEW_CONFIG.MAX_IMAGE_WIDTH
): number {
  if (detail === 'low') return 85

  let w = maxWidth
  let h = approxPageHeight(maxWidth)
  if (w > 2048 || h > 2048) {
    const scale = 2048 / Math.max(w, h)
    w = Math.floor(w * scale)
    h = Math.floor(h * scale)
  }
  const short = Math.min(w, h)
  if (short > 768) {
    const scale = 768 / short
    w = Math.floor(w * scale)
    h = Math.floor(h * scale)
  }
  const tiles = Math.ceil(w / 512) * Math.ceil(h / 512)
  return tiles * 170 + 85
}

function tokensPerVisionCall(
  imageCount: number,
  detail: 'low' | 'high',
  promptBase: number
): number {
  const images = Math.max(1, imageCount)
  const vision = images * estimateVisionTokensPerImage(detail)
  return Math.round(promptBase + vision + COMPLETION_TOKENS_AVG)
}

/**
 * Estimate tokens for one PDF/image review (classify all pages + typical extract calls).
 * Assumes a broker packet: rate con, invoice, and BOL extraction after classify.
 */
export function estimateTokensForPageCount(pageCount: number): PageTokenEstimate {
  const pages = Math.max(1, pageCount)
  const batchSize = Math.max(1, AI_REVIEW_CONFIG.CLASSIFY_BATCH_SIZE)
  const classifyDetail = AI_REVIEW_CONFIG.PAGE_CLASSIFY_DETAIL
  const extractDetail = AI_REVIEW_CONFIG.DEEP_REVIEW_DETAIL

  let totalTokens = 0
  let apiCalls = 0

  for (let index = 0; index < pages; index += batchSize) {
    const batchImages = Math.min(batchSize, pages - index)
    totalTokens += tokensPerVisionCall(batchImages, classifyDetail, PROMPT_TOKENS_CLASSIFY)
    apiCalls += 1
  }

  const rateImages = Math.min(3, pages)
  totalTokens += tokensPerVisionCall(rateImages, extractDetail, PROMPT_TOKENS_EXTRACT)
  apiCalls += 1

  if (pages >= 2) {
    totalTokens += tokensPerVisionCall(Math.min(2, pages), extractDetail, PROMPT_TOKENS_EXTRACT * 0.85)
    apiCalls += 1
  }

  const bolPages = Math.min(4, Math.max(1, Math.ceil(pages * 0.35)))
  const bolCalls = pages > 6 ? bolPages : 1
  for (let b = 0; b < bolCalls; b += 1) {
    totalTokens += tokensPerVisionCall(bolCalls === 1 ? bolPages : 1, extractDetail, PROMPT_TOKENS_EXTRACT)
    apiCalls += 1
  }

  if (pages > 12) {
    totalTokens += tokensPerVisionCall(1, extractDetail, 1200)
    apiCalls += 1
  }

  const firstClassifyBatch = Math.min(batchSize, pages)
  const classifyBatchesInBurst = pages <= batchSize ? 1 : Math.min(2, Math.ceil(pages / batchSize))

  let peakTokensPerMinute = 0
  for (let batch = 0; batch < classifyBatchesInBurst; batch += 1) {
    const batchImages = Math.min(batchSize, pages - batch * batchSize)
    if (batchImages <= 0) break
    peakTokensPerMinute += tokensPerVisionCall(batchImages, classifyDetail, PROMPT_TOKENS_CLASSIFY)
  }

  peakTokensPerMinute += tokensPerVisionCall(rateImages, extractDetail, PROMPT_TOKENS_EXTRACT)

  if (pages >= 2) {
    peakTokensPerMinute += tokensPerVisionCall(
      Math.min(2, pages),
      extractDetail,
      PROMPT_TOKENS_EXTRACT * 0.85
    )
  }

  peakTokensPerMinute += tokensPerVisionCall(bolPages, extractDetail, PROMPT_TOKENS_EXTRACT)

  peakTokensPerMinute = Math.round(
    peakTokensPerMinute * AI_REVIEW_CONFIG.TPM_ESTIMATE_BUFFER
  )

  return {
    pageCount: pages,
    totalTokens,
    peakTokensPerMinute,
    apiCalls,
  }
}

/** USD cost for one PDF review — mirrors `estimateTokensForPageCount` call mix. */
export function estimateCostUsdForPageCount(pageCount: number): number {
  const pages = Math.max(1, pageCount)
  const batchSize = Math.max(1, AI_REVIEW_CONFIG.CLASSIFY_BATCH_SIZE)
  const classifyDetail = AI_REVIEW_CONFIG.PAGE_CLASSIFY_DETAIL
  const extractDetail = AI_REVIEW_CONFIG.DEEP_REVIEW_DETAIL
  const classifyModel = AI_REVIEW_CONFIG.CLASSIFY_MODEL
  const extractModel = AI_REVIEW_CONFIG.PRIMARY_MODEL

  let totalUsd = 0

  for (let index = 0; index < pages; index += batchSize) {
    const batchImages = Math.min(batchSize, pages - index)
    totalUsd += visionCallCost(batchImages, classifyDetail, PROMPT_TOKENS_CLASSIFY, classifyModel)
  }

  const rateImages = Math.min(3, pages)
  totalUsd += visionCallCost(rateImages, extractDetail, PROMPT_TOKENS_EXTRACT, extractModel)

  if (pages >= 2) {
    totalUsd += visionCallCost(
      Math.min(2, pages),
      extractDetail,
      PROMPT_TOKENS_EXTRACT * 0.85,
      extractModel
    )
  }

  const bolPages = Math.min(4, Math.max(1, Math.ceil(pages * 0.35)))
  const bolCalls = pages > 6 ? bolPages : 1
  for (let b = 0; b < bolCalls; b += 1) {
    totalUsd += visionCallCost(
      bolCalls === 1 ? bolPages : 1,
      extractDetail,
      PROMPT_TOKENS_EXTRACT,
      extractModel
    )
  }

  if (pages > 12) {
    totalUsd += visionCallCost(1, extractDetail, 1200, extractModel)
  }

  return totalUsd
}

function visionCallCost(
  imageCount: number,
  detail: 'low' | 'high',
  promptBase: number,
  model: string
): number {
  const images = Math.max(1, imageCount)
  const vision = images * estimateVisionTokensPerImage(detail)
  const promptTokens = Math.round(promptBase + vision)
  const completionTokens = COMPLETION_TOKENS_AVG
  return estimateCostUsd(model, promptTokens, completionTokens)
}

function assessTpmRisk(
  peakTokensPerMinute: number,
  tpmLimit: number
): Pick<ReviewBatchTokenEstimate, 'riskLevel' | 'exceedsLimit' | 'message'> {
  const limit = Math.max(1000, tpmLimit)
  const peak = Math.round(peakTokensPerMinute)
  const usedPct = Math.round((peak / limit) * 100)

  if (peak > limit) {
    return {
      riskLevel: 'exceeded',
      exceedsLimit: true,
      message: `Estimated peak ~${peak.toLocaleString()} tokens/min exceeds your ${limit.toLocaleString()} TPM limit (${usedPct}%). Reduce parallel uploads or page count before running review.`,
    }
  }

  if (peak > limit * AI_REVIEW_CONFIG.TPM_WARN_RATIO) {
    return {
      riskLevel: 'warning',
      exceedsLimit: false,
      message: `Estimated peak ~${peak.toLocaleString()} tokens/min is ~${usedPct}% of your ${limit.toLocaleString()} TPM limit — a 429 rate limit is possible.`,
    }
  }

  return {
    riskLevel: 'ok',
    exceedsLimit: false,
    message: `Estimated peak ~${peak.toLocaleString()} tokens/min (~${usedPct}% of ${limit.toLocaleString()} TPM).`,
  }
}

/** Peak TPM for one parallel wave (documents reviewed at the same time). */
export function estimatePeakTpmForPageCounts(pageCounts: number[]): number {
  const parallel = Math.max(1, AI_REVIEW_CONFIG.PARALLEL_DOCUMENTS)
  const perFile = pageCounts.map((count) => estimateTokensForPageCount(count))

  let peakTokensPerMinute = 0
  for (let index = 0; index < perFile.length; index += parallel) {
    const wave = perFile.slice(index, index + parallel)
    const wavePeak = wave.reduce((sum, row) => sum + row.peakTokensPerMinute, 0)
    peakTokensPerMinute = Math.max(peakTokensPerMinute, wavePeak)
  }

  return peakTokensPerMinute
}

/** Max PDFs that can run in parallel without exceeding TPM. */
export function maxConcurrentFilesBeforeLimit(
  pageCounts: number[],
  tpmLimit = getEffectiveTpmBudget()
): number {
  if (pageCounts.length === 0) return 0

  let max = 0
  for (let parallel = 1; parallel <= pageCounts.length; parallel += 1) {
    if (estimatePeakTpmWithParallel(pageCounts, parallel) <= tpmLimit) {
      max = parallel
    } else {
      break
    }
  }

  return max
}

export function buildReviewWavePlan(
  files: Array<{ fileName: string; pageCount: number }>,
  parallel: number,
  tpmLimit = getEffectiveTpmBudget()
): ReviewWavePlan[] {
  const width = Math.max(1, parallel)
  const waves: ReviewWavePlan[] = []

  for (let index = 0; index < files.length; index += width) {
    const slice = files.slice(index, index + width)
    const peak = slice.reduce(
      (sum, file) => sum + estimateTokensForPageCount(file.pageCount).peakTokensPerMinute,
      0
    )
    waves.push({
      waveIndex: waves.length + 1,
      fileNames: slice.map((file) => file.fileName),
      fileCount: slice.length,
      estimatedPeakTpm: Math.round(peak),
      withinLimit: peak <= tpmLimit,
    })
  }

  return waves
}

function buildRunSummary(input: {
  fileCount: number
  waves: ReviewWavePlan[]
  maxConcurrent: number
  suggestedParallel: number
  configuredParallel: number
  tpmLimit: number
  heaviest?: PerFileTokenEstimate
  exceedsLimit: boolean
}): string {
  const { fileCount, waves, maxConcurrent, suggestedParallel, heaviest, exceedsLimit, tpmLimit } =
    input

  if (fileCount === 0) return 'No files to review.'

  if (maxConcurrent === 0 && heaviest) {
    return `"${heaviest.fileName}" alone may exceed ${tpmLimit.toLocaleString()} TPM (~${heaviest.peakTokensPerMinute.toLocaleString()} est./min, ${heaviest.pageCount} pg). Review fewer pages or split the PDF before running.`
  }

  const allNames = waves.flatMap((wave) => wave.fileNames)
  const parts: string[] = []

  if (fileCount === 1) {
    parts.push(`Will review 1 file (${allNames[0]}).`)
  } else if (suggestedParallel >= fileCount) {
    parts.push(`Will review all ${fileCount} files together (within ${tpmLimit.toLocaleString()} TPM).`)
  } else {
    parts.push(
      `Will review all ${fileCount} files in ${waves.length} batch${waves.length === 1 ? '' : 'es'} — up to ${suggestedParallel} at a time (max ${maxConcurrent} together under ${tpmLimit.toLocaleString()} TPM).`
    )
  }

  if (heaviest && fileCount > 1) {
    parts.push(
      `Heaviest: ${heaviest.fileName} (${heaviest.pageCount} pg, ~${heaviest.peakTokensPerMinute.toLocaleString()} TPM).`
    )
  }

  if (exceedsLimit && maxConcurrent > 0) {
    parts.push('Some batches may still be tight — expect slower sequential waves.')
  }

  return parts.join(' ')
}

function buildPerFileEstimates(
  files: Array<{ fileName: string; pageCount: number }>
): PerFileTokenEstimate[] {
  return files.map((file) => {
    const row = estimateTokensForPageCount(file.pageCount)
    return {
      fileName: file.fileName,
      pageCount: row.pageCount,
      totalTokens: row.totalTokens,
      peakTokensPerMinute: row.peakTokensPerMinute,
      apiCalls: row.apiCalls,
      estimatedCostUsd: estimateCostUsdForPageCount(file.pageCount),
    }
  })
}

export function estimateReviewTokensForFilesNamed(
  files: Array<{ fileName: string; pageCount: number }>
): ReviewBatchTokenEstimate {
  return estimateReviewTokensForPageCounts(
    files.map((file) => file.pageCount),
    files.map((file) => file.fileName)
  )
}

export function estimateReviewTokensForPageCounts(
  pageCounts: number[],
  fileNames?: string[]
): ReviewBatchTokenEstimate {
  const files = pageCounts.map((pageCount, index) => ({
    fileName: fileNames?.[index] ?? `File ${index + 1}`,
    pageCount,
  }))
  const perFile = buildPerFileEstimates(files)
  const configuredParallel = parallelDocs()
  const tpmLimit = AI_REVIEW_CONFIG.TPM_LIMIT
  const planBudget = getEffectiveTpmBudget()

  const totalTokens = perFile.reduce((sum, row) => sum + row.totalTokens, 0)
  const estimatedCostUsd = perFile.reduce((sum, row) => sum + row.estimatedCostUsd, 0)
  const apiCalls = perFile.reduce((sum, row) => sum + row.apiCalls, 0)
  const peakTokensPerMinute = estimatePeakTpmForPageCounts(pageCounts)
  const maxConcurrentBeforeLimit = maxConcurrentFilesBeforeLimit(pageCounts, planBudget)
  const suggestedParallel =
    maxConcurrentBeforeLimit === 0
      ? 1
      : resolveParallelDocumentsForBatch(pageCounts, configuredParallel, planBudget)

  const waves = buildReviewWavePlan(files, suggestedParallel, planBudget)
  const throttledPeak = estimatePeakTpmWithParallel(pageCounts, suggestedParallel)
  const risk =
    suggestedParallel < configuredParallel
      ? assessTpmRisk(throttledPeak, tpmLimit)
      : assessTpmRisk(peakTokensPerMinute, tpmLimit)

  const heaviest = [...perFile].sort((a, b) => b.peakTokensPerMinute - a.peakTokensPerMinute)[0]
  const exceedsLimit = maxConcurrentBeforeLimit === 0

  const runSummary = buildRunSummary({
    fileCount: files.length,
    waves,
    maxConcurrent: maxConcurrentBeforeLimit,
    suggestedParallel,
    configuredParallel,
    tpmLimit: planBudget,
    heaviest,
    exceedsLimit,
  })

  return {
    totalTokens,
    estimatedCostUsd,
    peakTokensPerMinute: throttledPeak,
    tpmLimit,
    planBudget,
    apiCalls,
    configuredParallel,
    maxConcurrentBeforeLimit,
    suggestedParallel,
    waves,
    runSummary,
    perFile,
    exceedsLimit,
    ...risk,
  }
}

function parallelDocs(): number {
  return Math.max(1, AI_REVIEW_CONFIG.PARALLEL_DOCUMENTS)
}

export async function estimateReviewTokensForFiles(files: File[]): Promise<ReviewBatchTokenEstimate> {
  const pageCounts = await Promise.all(files.map((file) => getReviewPageCount(file)))
  return estimateReviewTokensForPageCounts(pageCounts)
}

/** Resolve page counts from upload metadata or PDF scan. */
export async function estimateReviewTokensForUploads(
  uploads: Array<{ file?: File; pageCount?: number; fileName?: string }>
): Promise<ReviewBatchTokenEstimate> {
  const resolved = await Promise.all(
    uploads.map(async (upload, index) => {
      const pageCount =
        upload.pageCount != null && upload.pageCount > 0
          ? upload.pageCount
          : upload.file
            ? await getReviewPageCount(upload.file)
            : 1
      const fileName =
        upload.fileName ?? upload.file?.name ?? `File ${index + 1}`
      return { fileName, pageCount }
    })
  )
  return estimateReviewTokensForFilesNamed(resolved)
}

/** Peak TPM when exactly `parallel` PDFs run at once. */
export function estimatePeakTpmWithParallel(pageCounts: number[], parallel: number): number {
  const perFile = pageCounts.map((count) => estimateTokensForPageCount(count))
  const width = Math.max(1, parallel)
  let peakTokensPerMinute = 0

  for (let index = 0; index < perFile.length; index += width) {
    const wave = perFile.slice(index, index + width)
    const wavePeak = wave.reduce((sum, row) => sum + row.peakTokensPerMinute, 0)
    peakTokensPerMinute = Math.max(peakTokensPerMinute, wavePeak)
  }

  return peakTokensPerMinute
}

/** Lower parallel PDF count until estimated peak fits TPM (minimum 1). */
export function resolveParallelDocumentsForBatch(
  pageCounts: number[],
  configuredParallel: number,
  tpmLimit = getEffectiveTpmBudget()
): number {
  let parallel = Math.max(1, Math.min(configuredParallel, pageCounts.length || 1))

  while (parallel > 1 && estimatePeakTpmWithParallel(pageCounts, parallel) > tpmLimit) {
    parallel -= 1
  }

  return parallel
}

/** Shown near Run Review — time + TPM estimate. */
export function useReviewBatchEstimate(
  uploads: Array<{ file?: File; pageCount?: number; fileName?: string }>
): {
  timeLabel: string | null
  tokenEstimate: ReviewBatchTokenEstimate | null
  loading: boolean
} {
  const [timeLabel, setTimeLabel] = useState<string | null>(null)
  const [tokenEstimate, setTokenEstimate] = useState<ReviewBatchTokenEstimate | null>(null)
  const [loading, setLoading] = useState(false)

  const key = uploads
    .map((u) => `${u.fileName ?? u.file?.name ?? ''}:${u.pageCount ?? ''}`)
    .join('|')

  useEffect(() => {
    let cancelled = false

    if (uploads.length === 0) {
      setTimeLabel(null)
      setTokenEstimate(null)
      setLoading(false)
      return
    }

    setLoading(true)

    Promise.all([
      uploads.every((u) => u.file)
        ? estimateReviewSecondsForFiles(uploads.map((u) => u.file!))
        : Promise.resolve(
            uploads.reduce(
              (total, upload) =>
                total + estimateReviewSecondsForPageCount(upload.pageCount ?? 1),
              0
            )
          ),
      estimateReviewTokensForUploads(uploads),
    ])
      .then(([seconds, tokens]) => {
        if (cancelled) return
        setTimeLabel(formatEstimatedDuration(seconds))
        setTokenEstimate(tokens)
      })
      .catch(() => {
        if (!cancelled) {
          setTimeLabel('~1 min')
          setTokenEstimate(null)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [key])

  return { timeLabel, tokenEstimate, loading }
}
