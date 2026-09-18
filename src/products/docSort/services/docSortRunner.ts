import type { DocSortProgress, DocSortResult, DocSortUpload } from '../types'
import { fingerprintDocSortFile } from './docSortVision'
import { matchSortedDocuments } from './docSortMatcher'
import { autoUnpackCombinedFingerprints } from './docSortUnpack'
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
 * Scan each upload with the full extract (RC / BOL / invoice / lumper JSON), then match.
 * Respects Settings → docs/min and DocSort parallel so OpenAI TPM is not blown.
 * Combined PDFs are detected but not auto-unpacked — Credyx splits them in Doc Splitter.
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
    message: `Extracting documents (max ${docsPerMinute}/min, ${parallel} at a time)…`,
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
        message: `Extracted ${completed} of ${total}…`,
      })
      return fp
    } catch (err) {
      completed += 1
      onProgress?.({ phase: 'scanning', completed, total })
      throw err
    }
  })

  onProgress?.({
    phase: 'matching',
    completed: total,
    total,
    message: 'Checking for combined PDFs…',
  })

  const fileById = new Map<string, File>()
  uploads.forEach((u) => fileById.set(u.id, u.file))

  // Detection only — never auto-split (Doc Splitter is the Credyx gate).
  let expanded = fingerprints
  try {
    expanded = await autoUnpackCombinedFingerprints(fingerprints, fileById)
  } catch (err) {
    console.warn('[runDocSort] combined-PDF check failed; keeping originals', err)
    expanded = fingerprints
  }

  onProgress?.({ phase: 'matching', completed: total, total, message: 'Matching loads…' })

  const result = matchSortedDocuments(expanded)

  onProgress?.({ phase: 'complete', completed: total, total })

  return result
}
