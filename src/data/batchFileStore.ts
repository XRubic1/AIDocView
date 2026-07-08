/** In-memory PDF storage keyed by batch and document id (lost on page refresh). */

/** Synthetic invoice id for managed handoff uploads before invoices exist. */
export const HANDOFF_PLACEHOLDER_INVOICE_ID = 'handoff-documents'

const filesByBatch = new Map<string, Map<string, File>>()

export function setBatchFiles(batchId: string, fileById: Map<string, File>): void {
  filesByBatch.set(batchId, new Map(fileById))
}

/** Merge files into an existing batch map without removing other documents. */
export function mergeBatchFiles(batchId: string, fileById: Map<string, File>): void {
  let map = filesByBatch.get(batchId)
  if (!map) {
    filesByBatch.set(batchId, new Map(fileById))
    return
  }
  for (const [docId, file] of fileById.entries()) {
    map.set(docId, file)
  }
}

export function addBatchFile(batchId: string, docId: string, file: File): void {
  let map = filesByBatch.get(batchId)
  if (!map) {
    map = new Map()
    filesByBatch.set(batchId, map)
  }
  map.set(docId, file)
}

export function getBatchFile(batchId: string, docId: string): File | undefined {
  return filesByBatch.get(batchId)?.get(docId)
}

export function getBatchFiles(batchId: string): Map<string, File> {
  return filesByBatch.get(batchId) ?? new Map()
}

export function getFilesForDocIds(batchId: string, docIds: string[]): File[] {
  const map = filesByBatch.get(batchId)
  if (!map) return []
  return docIds.map((id) => map.get(id)).filter((f): f is File => Boolean(f))
}

export function removeBatchFiles(batchId: string): void {
  filesByBatch.delete(batchId)
}
