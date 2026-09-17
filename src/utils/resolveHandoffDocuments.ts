import { addBatchFile, getBatchFile, getBatchFiles } from '../data/batchFileStore'
import { isSupabaseConfigured } from '../lib/supabase'
import {
  downloadBatchDocument,
  listHandoffBatchDocuments,
  type HandoffStorageDocument,
} from '../services/supabase/tenantPersist'
import { fileWithSniffedMime, mimeFromFileName } from './fileMimeSniff'

export interface HandoffDocument {
  id: string
  name: string
  type: string
  size: number
  file?: File
  storagePath?: string
}

const storageFileCache = new Map<string, File>()

function mimeForName(fileName: string): string {
  return mimeFromFileName(fileName)
}

/** List handoff storage entries without downloading file bodies. */
export async function listHandoffDocumentMeta(
  batchId: string,
  clientId: string
): Promise<HandoffStorageDocument[]> {
  if (!isSupabaseConfigured()) return []
  try {
    return await listHandoffBatchDocuments(clientId, batchId)
  } catch (err) {
    console.warn('[listHandoffDocumentMeta] failed', err)
    return []
  }
}

/** True when cached File may be PDF/image with a useless MIME (blank Packet Rework thumbs). */
function needsMimeResniff(file: File): boolean {
  const type = (file.type || '').toLowerCase()
  return !type || type === 'application/octet-stream' || type === 'binary/octet-stream'
}

/** Download one batch document by storage path (cached; MIME sniffed from bytes). */
export async function ensureStoredBatchFile(
  batchId: string,
  docId: string,
  storagePath: string,
  fileName?: string
): Promise<File | null> {
  const existing = getBatchFile(batchId, docId) ?? storageFileCache.get(storagePath)
  if (existing) {
    // Older cache entries often have octet-stream — re-sniff so PDF/JPEG render correctly.
    if (needsMimeResniff(existing)) {
      const fixed = await fileWithSniffedMime(
        existing,
        fileName || existing.name,
        existing.type
      )
      storageFileCache.set(storagePath, fixed)
      addBatchFile(batchId, docId, fixed)
      return fixed
    }
    addBatchFile(batchId, docId, existing)
    return existing
  }
  if (!isSupabaseConfigured()) return null

  const name = fileName || storagePath.split('/').pop() || `${docId}.pdf`
  const file = await downloadBatchDocument(storagePath, name, mimeForName(name))
  if (!file) return null
  storageFileCache.set(storagePath, file)
  addBatchFile(batchId, docId, file)
  return file
}

/**
 * Load handoff documents for a managed batch from memory and/or Supabase storage.
 * Default skips PDF bodies so Packets can open in seconds; pass downloadFiles for full resolve.
 */
export async function resolveHandoffDocuments(
  batchId: string,
  clientId: string,
  options?: { downloadFiles?: boolean }
): Promise<HandoffDocument[]> {
  const downloadFiles = options?.downloadFiles === true
  const byId = new Map<string, HandoffDocument>()

  for (const [id, file] of getBatchFiles(batchId).entries()) {
    byId.set(id, {
      id,
      name: file.name,
      type: file.type || mimeForName(file.name),
      size: file.size,
      file,
    })
  }

  if (!isSupabaseConfigured()) {
    return Array.from(byId.values())
  }

  const stored = await listHandoffDocumentMeta(batchId, clientId)

  for (const item of stored) {
    const existing = byId.get(item.docId)
    if (existing?.file) {
      byId.set(item.docId, {
        ...existing,
        name: existing.name || item.fileName,
        storagePath: item.storagePath,
      })
      continue
    }

    if (!downloadFiles) {
      const cached = storageFileCache.get(item.storagePath)
      if (cached) {
        addBatchFile(batchId, item.docId, cached)
        byId.set(item.docId, {
          id: item.docId,
          name: cached.name,
          type: cached.type || mimeForName(cached.name),
          size: cached.size,
          file: cached,
          storagePath: item.storagePath,
        })
        continue
      }
      byId.set(item.docId, {
        id: item.docId,
        name: item.fileName,
        type: mimeForName(item.fileName),
        size: 0,
        storagePath: item.storagePath,
      })
      continue
    }

    const file = await ensureStoredBatchFile(
      batchId,
      item.docId,
      item.storagePath,
      item.fileName
    )
    byId.set(item.docId, {
      id: item.docId,
      name: file?.name || item.fileName,
      type: file?.type || mimeForName(item.fileName),
      size: file?.size || 0,
      file: file ?? undefined,
      storagePath: item.storagePath,
    })
  }

  return Array.from(byId.values())
}

/** Prefetch many docs with limited concurrency (does not block Packets open). */
export async function prefetchStoredBatchFiles(
  batchId: string,
  pathsByDocId: Record<string, string>,
  options?: {
    concurrency?: number
    onFile?: (docId: string, file: File) => void
    shouldContinue?: () => boolean
  }
): Promise<void> {
  const entries = Object.entries(pathsByDocId).filter(([docId]) => !getBatchFile(batchId, docId))
  if (entries.length === 0) return

  const concurrency = Math.max(1, options?.concurrency ?? 4)
  let index = 0

  const workers = Array.from({ length: Math.min(concurrency, entries.length) }, async () => {
    while (index < entries.length) {
      if (options?.shouldContinue && !options.shouldContinue()) return
      const current = index
      index += 1
      const [docId, storagePath] = entries[current]
      try {
        const file = await ensureStoredBatchFile(batchId, docId, storagePath)
        if (file) options?.onFile?.(docId, file)
      } catch (err) {
        console.warn('[prefetchStoredBatchFiles] failed', docId, err)
      }
    }
  })

  await Promise.all(workers)
}
