import { useEffect, useState } from 'react'
import { AI_REVIEW_CONFIG } from '../config/aiReview'
import { getReviewPageCount } from './fileToReviewImage'

/** Average seconds per vision API call — page classification. */
const SECONDS_PER_PAGE_CLASSIFY = 5
/** Average seconds per deep review (rate con or BOL extraction). */
const SECONDS_DEEP_REVIEW = 12
/** PDF render + request overhead per file. */
const SECONDS_FILE_OVERHEAD = 3

/** Estimate review duration from a known page count. */
export function estimateReviewSecondsForPageCount(pageCount: number): number {
  const pages = Math.max(1, pageCount)
  const classifyTime = pages * SECONDS_PER_PAGE_CLASSIFY
  const deepReviewCount = pages > 1 ? 2 : 1
  const deepTime = deepReviewCount * SECONDS_DEEP_REVIEW
  return Math.ceil((classifyTime + deepTime + SECONDS_FILE_OVERHEAD) * 1.15)
}

/** Estimate review duration for one uploaded file. */
export async function estimateReviewSecondsForFile(file: File): Promise<number> {
  const pageCount = await getReviewPageCount(file)
  return estimateReviewSecondsForPageCount(pageCount)
}

/** Estimate total review duration for a batch of files. */
export async function estimateReviewSecondsForFiles(files: File[]): Promise<number> {
  if (files.length === 0) return 0

  const pageCounts = await Promise.all(files.map(getReviewPageCount))
  const sequentialTotal = pageCounts.reduce(
    (total, count) => total + estimateReviewSecondsForPageCount(count),
    0
  )
  const parallel = Math.max(1, AI_REVIEW_CONFIG.PARALLEL_DOCUMENTS)
  if (parallel <= 1 || files.length <= 1) return sequentialTotal

  const perFile = pageCounts.map((count) => estimateReviewSecondsForPageCount(count))
  const waves: number[] = []
  for (let index = 0; index < perFile.length; index += parallel) {
    const wave = perFile.slice(index, index + parallel)
    waves.push(Math.max(...wave))
  }
  return Math.ceil(waves.reduce((sum, wave) => sum + wave, 0) * 1.1)
}

/** Human-readable duration label, e.g. "~45 sec" or "~2 min". */
export function formatEstimatedDuration(totalSeconds: number): string {
  if (totalSeconds <= 0) return '~ a few seconds'

  if (totalSeconds < 45) {
    const rounded = Math.max(10, Math.round(totalSeconds / 5) * 5)
    return `~${rounded} sec`
  }

  if (totalSeconds < 90) return '~1 min'

  const minutes = Math.max(2, Math.round(totalSeconds / 60))
  return `~${minutes} min`
}

/** Load and format an estimated review duration for the given files. */
export function useReviewTimeEstimate(files: File[]): string | null {
  const [estimate, setEstimate] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    if (files.length === 0) {
      setEstimate(null)
      return
    }

    estimateReviewSecondsForFiles(files)
      .then((seconds) => {
        if (!cancelled) setEstimate(formatEstimatedDuration(seconds))
      })
      .catch(() => {
        if (!cancelled) setEstimate('~1 min')
      })

    return () => {
      cancelled = true
    }
  }, [files])

  return estimate
}
