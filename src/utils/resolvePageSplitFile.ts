/**
 * Page-split children (`10023-p2.pdf`) are created in the browser. Persist them
 * to handoff storage and rebuild from the parent PDF when memory is lost.
 */
import { HANDOFF_PLACEHOLDER_INVOICE_ID, addBatchFile, getBatchFile } from '../data/batchFileStore'
import type { BatchIntakeDraft } from '../types/credyxBatch'
import { isSupabaseConfigured } from '../lib/supabase'
import { uploadBatchInvoiceDocuments } from '../services/supabase/tenantPersist'
import { extractPdfPages, isPdfFile } from './pdfPageExtract'
import { ensureStoredBatchFile } from './resolveHandoffDocuments'

/** `foo-p3.pdf` → { stem: 'foo', page: 3 }. */
export function parsePageSplitFileName(
  fileName: string
): { stem: string; page: number } | null {
  const match = fileName.trim().match(/^(.*)-p(\d+)\.pdf$/i)
  if (!match) return null
  const page = Number(match[2])
  if (!Number.isFinite(page) || page < 1) return null
  return { stem: match[1], page }
}

export function isPageSplitFileName(fileName: string): boolean {
  return Boolean(parsePageSplitFileName(fileName))
}

function pdfStem(fileName: string): string {
  return fileName.replace(/\.pdf$/i, '').replace(/-(p\d+)$/i, '')
}

/** Upload page-split Files that are not yet in storagePathsByDocId. */
export async function persistPageSplitFilesToStorage(
  draft: BatchIntakeDraft,
  batchId: string,
  clientId: string
): Promise<BatchIntakeDraft> {
  if (!isSupabaseConfigured() || !clientId.trim()) return draft

  const toUpload = new Map<string, File>()
  for (const [docId, file] of draft.fileById) {
    if (!isPdfFile(file)) continue
    const looksSplit =
      docId.startsWith('page-split-') || isPageSplitFileName(file.name)
    if (!looksSplit) continue
    if (draft.storagePathsByDocId?.[docId]) continue
    toUpload.set(docId, file)
  }
  if (toUpload.size === 0) return draft

  try {
    const paths = await uploadBatchInvoiceDocuments(
      clientId,
      batchId,
      HANDOFF_PLACEHOLDER_INVOICE_ID,
      toUpload
    )
    for (const [docId, file] of toUpload) {
      addBatchFile(batchId, docId, file)
    }
    return {
      ...draft,
      storagePathsByDocId: {
        ...(draft.storagePathsByDocId ?? {}),
        ...paths,
      },
    }
  } catch (err) {
    console.warn('[persistPageSplitFilesToStorage] upload failed', err)
    return draft
  }
}

/** Find a non-page-split parent PDF whose stem matches the child. */
async function findParentPdfFile(
  draft: BatchIntakeDraft,
  batchId: string,
  stem: string
): Promise<File | null> {
  const want = stem.toLowerCase()

  for (const [docId, file] of draft.fileById) {
    if (!isPdfFile(file)) continue
    if (isPageSplitFileName(file.name) || docId.startsWith('page-split-')) continue
    if (pdfStem(file.name).toLowerCase() === want) return file
  }

  const paths = draft.storagePathsByDocId ?? {}
  for (const [docId, storagePath] of Object.entries(paths)) {
    if (docId.startsWith('page-split-')) continue
    const label =
      draft.fileById.get(docId)?.name ||
      storagePath.split('/').pop() ||
      docId
    // Handoff storage often keeps original names under the doc folder.
    const file = await ensureStoredBatchFile(batchId, docId, storagePath, label)
    if (!file || !isPdfFile(file)) continue
    if (isPageSplitFileName(file.name)) continue
    if (pdfStem(file.name).toLowerCase() === want) return file
  }

  return null
}

/**
 * Resolve a page-split (or any) doc File: memory → storage → rebuild from parent.
 * Returns an updated draft when a File was attached.
 */
export async function ensurePageSplitDraftFile(
  draft: BatchIntakeDraft,
  batchId: string,
  docId: string,
  clientId?: string
): Promise<{ draft: BatchIntakeDraft; file: File | null }> {
  const cached = draft.fileById.get(docId) ?? getBatchFile(batchId, docId)
  if (cached) {
    if (!draft.fileById.has(docId)) {
      const fileById = new Map(draft.fileById)
      fileById.set(docId, cached)
      return { draft: { ...draft, fileById }, file: cached }
    }
    return { draft, file: cached }
  }

  const storagePath = draft.storagePathsByDocId?.[docId]
  const fileNameHint =
    [...draft.unmatched.rateCons, ...draft.unmatched.bols, ...draft.unmatched.other].find(
      (fp) => fp.docId === docId
    )?.fileName || docId

  if (storagePath) {
    const file = await ensureStoredBatchFile(batchId, docId, storagePath, fileNameHint)
    if (file) {
      const fileById = new Map(draft.fileById)
      fileById.set(docId, file)
      return { draft: { ...draft, fileById }, file }
    }
  }

  const parsed = parsePageSplitFileName(fileNameHint)
  if (!parsed && !docId.startsWith('page-split-')) {
    return { draft, file: null }
  }

  // Rebuild from parent combined PDF when child bytes were never uploaded.
  const stem = parsed?.stem
  const page = parsed?.page
  if (!stem || !page) return { draft, file: null }

  const parent = await findParentPdfFile(draft, batchId, stem)
  if (!parent) return { draft, file: null }

  try {
    const rebuilt = await extractPdfPages(parent, [page], fileNameHint)
    addBatchFile(batchId, docId, rebuilt)
    let next: BatchIntakeDraft = {
      ...draft,
      fileById: new Map(draft.fileById).set(docId, rebuilt),
    }

    if (clientId && isSupabaseConfigured()) {
      next = await persistPageSplitFilesToStorage(next, batchId, clientId)
    }

    return { draft: next, file: rebuilt }
  } catch (err) {
    console.warn('[ensurePageSplitDraftFile] rebuild failed', docId, err)
    return { draft, file: null }
  }
}
