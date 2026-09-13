import type { DocSortProgress, DocSortResult, DocSortUpload } from '../types'
import { fingerprintDocSortFile } from './docSortVision'
import { matchSortedDocuments } from './docSortMatcher'
import {
  getDocSortStartIntervalMs,
  getEffectiveDocSortParallel,
  getEffectiveDocsPerMinute,
} from '../../../utils/aiReviewUserSettings'
import { DocScanRateLimiter } from '../../../utils/docScanRateLimiter'

async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let nextIndex = 0

  async function runWorker(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex
      nextIndex += 1
      results[index] = await worker(items[index], index)
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => runWorker())
  await Promise.all(workers)
  return results
}

/**
 * Scan all uploads, then match rate cons ↔ BOLs (no AIDocView review pipeline).
 * Respects Settings → docs/min and DocSort parallel so OpenAI TPM is not blown.
 */
export async function runDocSort(
  uploads: DocSortUpload[],
  onProgress?: (progress: DocSortProgress) => void
): Promise<DocSortResult> {
  const total = uploads.length
  if (total === 0) {
    throw new Error('Add at least one document to sort.')
  }

  const parallel = getEffectiveDocSortParallel()
  const docsPerMinute = getEffectiveDocsPerMinute()
  const intervalMs = getDocSortStartIntervalMs()
  const limiter = new DocScanRateLimiter(intervalMs)

  onProgress?.({
    phase: 'scanning',
    completed: 0,
    total,
    message: `Scanning documents (max ${docsPerMinute}/min, ${parallel} at a time)…`,
  })

  let completed = 0

  const fingerprints = await runWithConcurrency(uploads, parallel, async (upload) => {
    await limiter.acquire()
    try {
      const fp = await fingerprintDocSortFile(upload.file, upload.id)
      completed += 1
      onProgress?.({
        phase: 'scanning',
        completed,
        total,
        message: `Scanned ${completed} of ${total}…`,
      })
      return fp
    } catch (err) {
      completed += 1
      onProgress?.({ phase: 'scanning', completed, total })
      throw err
    }
  })

  onProgress?.({ phase: 'matching', completed: total, total, message: 'Matching loads…' })

  const result = matchSortedDocuments(fingerprints)

  onProgress?.({ phase: 'complete', completed: total, total })

  return result
}
