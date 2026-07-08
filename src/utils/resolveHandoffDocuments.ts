import { addBatchFile, getBatchFiles } from '../data/batchFileStore'
import { isSupabaseConfigured } from '../lib/supabase'
import {
  downloadBatchDocument,
  listHandoffBatchDocuments,
} from '../services/supabase/tenantPersist'

export interface HandoffDocument {
  id: string
  name: string
  type: string
  size: number
  file: File
  storagePath?: string
}

const storageFileCache = new Map<string, File>()

/**
 * Load handoff documents for a managed batch from memory or Supabase storage.
 */
export async function resolveHandoffDocuments(
  batchId: string,
  clientId: string
): Promise<HandoffDocument[]> {
  const fileMap = getBatchFiles(batchId)
  if (fileMap.size > 0) {
    return Array.from(fileMap.entries()).map(([id, file]) => ({
      id,
      name: file.name,
      type: file.type || 'application/pdf',
      size: file.size,
      file,
    }))
  }

  if (!isSupabaseConfigured()) return []

  const stored = await listHandoffBatchDocuments(clientId, batchId)
  const docs: HandoffDocument[] = []

  for (const item of stored) {
    let file = storageFileCache.get(item.storagePath)
    if (!file) {
      const mimeType = item.fileName.toLowerCase().endsWith('.pdf')
        ? 'application/pdf'
        : 'application/octet-stream'
      file = (await downloadBatchDocument(item.storagePath, item.fileName, mimeType)) ?? undefined
      if (file) storageFileCache.set(item.storagePath, file)
    }
    if (!file) continue

    addBatchFile(batchId, item.docId, file)
    docs.push({
      id: item.docId,
      name: file.name,
      type: file.type || 'application/pdf',
      size: file.size,
      file,
      storagePath: item.storagePath,
    })
  }

  return docs
}
