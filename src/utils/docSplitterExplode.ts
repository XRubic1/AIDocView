/**
 * Shared multi-page PDF explode for Doc Splitter UI + background auto pipeline.
 * Idempotent: skips parents that already have `*-pN.pdf` children.
 */
import type { BatchIntakeDraft } from '../types/credyxBatch'
import type { DocSortFingerprint, DocSortKind } from '../products/docSort/types'
import { logBatchDocAction } from './batchDocActionLog'
import {
  canUnpackDraftDocument,
  createManualDocFingerprint,
  isGeneratedInvoicePdfDoc,
  locateDraftDocument,
  splitDraftPdfIntoPages,
  unpackDraftDocument,
  withPrunedUnmatched,
} from './aiDraftDocOps'
import { getPdfPageCount, isPdfFile } from './pdfPageExtract'
import {
  draftHasPageSplitChildren,
  isPageSplitFileName,
} from './pageSplitDraftHelpers'

/** RC / BOL / INV mark categories used by Doc Splitter. */
export type DocSplitMarkCategory = 'rc' | 'bol' | 'inv'

/** Map DocSort kind → mark bin (null = still pending). */
export function markCategoryForKind(kind: DocSortKind): DocSplitMarkCategory | null {
  if (kind === 'rate_confirmation') return 'rc'
  if (kind === 'bill_of_lading') return 'bol'
  if (kind === 'invoice') return 'inv'
  return null
}

/** INV pages are classified but never extracted / matched into packets. */
export function isInvoiceExcludedFromDocSplitPackets(kind: DocSortKind): boolean {
  return kind === 'invoice'
}

/** Only RC + BOL get full extract JSON for matching. */
export function shouldExtractForDocSplitPackets(kind: DocSortKind): boolean {
  return kind === 'rate_confirmation' || kind === 'bill_of_lading'
}

/** Skip explode when parent already has page-split children (or is itself a page). */
export function shouldSkipExplodeParent(
  draft: BatchIntakeDraft,
  fileName: string
): boolean {
  if (!fileName) return false
  if (isPageSplitFileName(fileName)) return true
  return draftHasPageSplitChildren(draft, fileName)
}

function listAllSupportingFingerprints(draft: BatchIntakeDraft): DocSortFingerprint[] {
  const byId = new Map<string, DocSortFingerprint>()
  for (const fp of [
    ...draft.unmatched.rateCons,
    ...draft.unmatched.bols,
    ...draft.unmatched.other,
  ]) {
    byId.set(fp.docId, fp)
  }
  for (const inv of draft.invoices) {
    for (const fp of [
      ...inv.fingerprints.rateCons,
      ...inv.fingerprints.bols,
      ...(inv.fingerprints.other ?? []),
    ]) {
      if (!byId.has(fp.docId)) byId.set(fp.docId, fp)
    }
    for (const docId of inv.document_doc_ids) {
      if (byId.has(docId) || isGeneratedInvoicePdfDoc(inv, docId)) continue
      const file = draft.fileById.get(docId)
      if (file) byId.set(docId, createManualDocFingerprint(docId, file))
    }
  }
  for (const [docId, file] of draft.fileById) {
    if (byId.has(docId)) continue
    if (draft.invoices.some((inv) => isGeneratedInvoicePdfDoc(inv, docId))) continue
    byId.set(docId, createManualDocFingerprint(docId, file))
  }
  return [...byId.values()]
}

/** Ensure every live File has an unmatched fingerprint so explode can find it. */
export function ensureDocsInUnmatchedPool(draft: BatchIntakeDraft): BatchIntakeDraft {
  let next = draft
  for (const [docId, file] of draft.fileById) {
    if (draft.invoices.some((inv) => isGeneratedInvoicePdfDoc(inv, docId))) continue
    if (locateDraftDocument(next, docId)) continue
    const unmatched = {
      rateCons: [...next.unmatched.rateCons],
      bols: [...next.unmatched.bols],
      other: [...next.unmatched.other, createManualDocFingerprint(docId, file)],
    }
    next = { ...next, unmatched }
  }
  return next
}

function dedupePageSplitChildren(
  draft: BatchIntakeDraft,
  batchId?: string
): BatchIntakeDraft {
  const seenNames = new Set<string>()
  const removeIds = new Set<string>()
  const removedNames: string[] = []
  for (const fp of listAllSupportingFingerprints(draft)) {
    if (!isPageSplitFileName(fp.fileName) && !fp.docId.startsWith('page-split-')) continue
    const key = fp.fileName.toLowerCase()
    if (seenNames.has(key)) {
      removeIds.add(fp.docId)
      removedNames.push(fp.fileName)
    } else seenNames.add(key)
  }
  if (removeIds.size === 0) return draft
  if (batchId) {
    logBatchDocAction(batchId, {
      type: 'dedupe',
      title: `Removed ${removeIds.size} duplicate page-split file(s)`,
      detail: removedNames.slice(0, 8).join(', '),
    })
  }

  const unmatched = {
    rateCons: draft.unmatched.rateCons.filter((row) => !removeIds.has(row.docId)),
    bols: draft.unmatched.bols.filter((row) => !removeIds.has(row.docId)),
    other: draft.unmatched.other.filter((row) => !removeIds.has(row.docId)),
  }
  const fileById = new Map(draft.fileById)
  for (const id of removeIds) fileById.delete(id)
  const invoices = draft.invoices.map((inv) => ({
    ...inv,
    document_doc_ids: inv.document_doc_ids.filter((id) => !removeIds.has(id)),
    fingerprints: {
      rateCons: inv.fingerprints.rateCons.filter((fp) => !removeIds.has(fp.docId)),
      bols: inv.fingerprints.bols.filter((fp) => !removeIds.has(fp.docId)),
      other: (inv.fingerprints.other ?? []).filter((fp) => !removeIds.has(fp.docId)),
    },
  }))
  return withPrunedUnmatched({ ...draft, unmatched, fileById, invoices })
}

function stripExplodedParentPdfs(
  draft: BatchIntakeDraft,
  batchId?: string
): BatchIntakeDraft {
  const parents = listAllSupportingFingerprints(draft).filter((fp) => {
    if (isPageSplitFileName(fp.fileName) || fp.docId.startsWith('page-split-')) {
      return false
    }
    const liveName = draft.fileById.get(fp.docId)?.name || fp.fileName
    return (
      draftHasPageSplitChildren(draft, liveName) ||
      draftHasPageSplitChildren(draft, fp.fileName)
    )
  })
  const removeIds = new Set(parents.map((fp) => fp.docId))
  if (removeIds.size === 0) return draft
  if (batchId) {
    logBatchDocAction(batchId, {
      type: 'strip_parent',
      title: `Stripped ${parents.length} parent PDF(s) already page-split`,
      detail: parents
        .map((fp) => draft.fileById.get(fp.docId)?.name || fp.fileName)
        .slice(0, 8)
        .join(', '),
    })
  }

  const unmatched = {
    rateCons: draft.unmatched.rateCons.filter((row) => !removeIds.has(row.docId)),
    bols: draft.unmatched.bols.filter((row) => !removeIds.has(row.docId)),
    other: draft.unmatched.other.filter((row) => !removeIds.has(row.docId)),
  }
  const fileById = new Map(draft.fileById)
  for (const id of removeIds) fileById.delete(id)

  const storagePathsByDocId = { ...(draft.storagePathsByDocId ?? {}) }
  for (const id of removeIds) delete storagePathsByDocId[id]

  const invoices = draft.invoices.map((inv) => ({
    ...inv,
    document_doc_ids: inv.document_doc_ids.filter((id) => !removeIds.has(id)),
    fingerprints: {
      rateCons: inv.fingerprints.rateCons.filter((fp) => !removeIds.has(fp.docId)),
      bols: inv.fingerprints.bols.filter((fp) => !removeIds.has(fp.docId)),
      other: (inv.fingerprints.other ?? []).filter((fp) => !removeIds.has(fp.docId)),
    },
  }))

  return withPrunedUnmatched({
    ...draft,
    unmatched,
    fileById,
    invoices,
    storagePathsByDocId,
  })
}

/**
 * Break multi-page PDFs into one pending page each.
 * Idempotent — will not re-split when `*-pN` children exist.
 */
export async function explodeMultiPagePdfs(
  draft: BatchIntakeDraft,
  batchId: string,
  opts?: { signal?: AbortSignal }
): Promise<{
  draft: BatchIntakeDraft
  splitCount: number
}> {
  const signal = opts?.signal
  let next = dedupePageSplitChildren(stripExplodedParentPdfs(draft, batchId), batchId)
  let splitCount = 0
  const ids = listAllSupportingFingerprints(next).map((fp) => fp.docId)

  for (const docId of ids) {
    if (signal?.aborted) {
      throw new DOMException('Doc Split aborted', 'AbortError')
    }
    if (docId.startsWith('page-split-')) continue
    const file = next.fileById.get(docId)
    if (!file || !isPdfFile(file)) continue
    if (shouldSkipExplodeParent(next, file.name)) {
      logBatchDocAction(batchId, {
        type: 'skip_split',
        title: 'Skipped parent — page children already exist',
        docId,
        fileName: file.name,
      })
      continue
    }

    const located = locateDraftDocument(next, docId)
    if (located && markCategoryForKind(located.fingerprint.kind)) continue

    const pages = await getPdfPageCount(file)
    if (pages <= 1) continue

    if (canUnpackDraftDocument(next, docId)) {
      const result = await unpackDraftDocument(next, docId)
      next = ensureDocsInUnmatchedPool(result.draft)
      if (result.status === 'unpacked') {
        splitCount += 1
        logBatchDocAction(batchId, {
          type: 'unpack',
          title: `Unpacked combined PDF into typed parts (${pages} pages)`,
          docId,
          fileName: file.name,
        })
      }
      continue
    }

    const result = await splitDraftPdfIntoPages(next, docId)
    next = ensureDocsInUnmatchedPool(result.draft)
    if (result.status === 'unpacked') {
      splitCount += 1
      logBatchDocAction(batchId, {
        type: 'page_split',
        title: `Split PDF into ${pages} pending page(s)`,
        docId,
        fileName: file.name,
        detail: 'Mark each page as RC / BOL / INV',
      })
    }
  }

  next = dedupePageSplitChildren(stripExplodedParentPdfs(next, batchId), batchId)
  return { draft: next, splitCount }
}

export {
  listAllSupportingFingerprints,
  dedupePageSplitChildren,
  stripExplodedParentPdfs,
}
