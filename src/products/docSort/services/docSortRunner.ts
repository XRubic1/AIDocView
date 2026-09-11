import type { DocSortProgress, DocSortResult, DocSortUpload } from '../types'
import { fingerprintDocSortFile } from './docSortVision'
import { matchSortedDocuments } from './docSortMatcher'
const DEFAULT_PARALLEL = 4

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

function readParallelLimit(): number {
  const raw = import.meta.env.VITE_DOCSORT_PARALLEL?.trim()
  const parsed = raw ? Number.parseInt(raw, 10) : DEFAULT_PARALLEL
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_PARALLEL
}

/**
 * Scan all uploads, then match rate cons ↔ BOLs (no AIDocView review pipeline).
 */
export async function runDocSort(
  uploads: DocSortUpload[],
  onProgress?: (progress: DocSortProgress) => void
): Promise<DocSortResult> {
  const total = uploads.length
  if (total === 0) {
    throw new Error('Add at least one document to sort.')
  }

  onProgress?.({ phase: 'scanning', completed: 0, total, message: 'Scanning documents…' })

  const parallel = readParallelLimit()
  let completed = 0

  const fingerprints = await runWithConcurrency(uploads, parallel, async (upload) => {
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
