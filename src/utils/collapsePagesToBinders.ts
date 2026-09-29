/**
 * After pages of a combined upload are classified, merge them into
 * `{stem}.Invoice` / `{stem}.RC.Binder` / `{stem}.BOL.Binder` and drop the pages.
 */
import type { BatchIntakeDraft } from '../types/credyxBatch'
import type { DocSortFingerprint } from '../products/docSort/types'
import { planSourceBinders } from '../../supabase/functions/_shared/sourceDocBinders'
import { placeUnmatchedFingerprint } from './aiDraftDocOps'
import { listAllSupportingFingerprints } from './docSplitterExplode'
import { mergePdfFiles } from './pdfPageExtract'

function stripDocIds(
  draft: BatchIntakeDraft,
  removeIds: Set<string>
): { draft: BatchIntakeDraft; removedStoragePaths: string[] } {
  const storagePathsByDocId = { ...(draft.storagePathsByDocId ?? {}) }
  const removedStoragePaths: string[] = []
  for (const docId of removeIds) {
    const path = storagePathsByDocId[docId]
    if (path) removedStoragePaths.push(path)
    delete storagePathsByDocId[docId]
  }
  const fileById = new Map(draft.fileById)
  for (const docId of removeIds) fileById.delete(docId)
  const unmatched = {
    rateCons: draft.unmatched.rateCons.filter((row) => !removeIds.has(row.docId)),
    bols: draft.unmatched.bols.filter((row) => !removeIds.has(row.docId)),
    other: draft.unmatched.other.filter((row) => !removeIds.has(row.docId)),
  }
  const invoices = draft.invoices.map((inv) => ({
    ...inv,
    document_doc_ids: inv.document_doc_ids.filter((id) => !removeIds.has(id)),
    fingerprints: {
      rateCons: inv.fingerprints.rateCons.filter((fp) => !removeIds.has(fp.docId)),
      bols: inv.fingerprints.bols.filter((fp) => !removeIds.has(fp.docId)),
      other: (inv.fingerprints.other ?? []).filter((fp) => !removeIds.has(fp.docId)),
    },
  }))
  return {
    draft: { ...draft, unmatched, fileById, invoices, storagePathsByDocId },
    removedStoragePaths,
  }
}

export async function collapsePageSplitsIntoBinders(draft: BatchIntakeDraft): Promise<{
  draft: BatchIntakeDraft
  collapsedStems: string[]
  removedStoragePaths: string[]
}> {
  const fingerprints = listAllSupportingFingerprints(draft)
  const existingNames = new Set(fingerprints.map((fp) => fp.fileName.toLowerCase()))
  const plans = planSourceBinders(fingerprints)
  if (plans.length === 0) {
    return { draft, collapsedStems: [], removedStoragePaths: [] }
  }

  let next = draft
  const collapsedStems: string[] = []
  const removedStoragePaths: string[] = []

  for (const plan of plans) {
    const pageIds = plan.buckets.flatMap((bucket) => bucket.pages.map((page) => page.docId))
    const missingFile = pageIds.some((docId) => !next.fileById.get(docId))
    if (missingFile) {
      const stemHasBinder = plan.buckets.some((bucket) =>
        existingNames.has(bucket.fileName.toLowerCase())
      )
      if (!stemHasBinder) continue
      const removeIds = new Set(pageIds)
      const stripped = stripDocIds(next, removeIds)
      next = stripped.draft
      removedStoragePaths.push(...stripped.removedStoragePaths)
      collapsedStems.push(plan.stem)
      continue
    }

    const created: DocSortFingerprint[] = []
    const createdFiles = new Map<string, File>()
    let failed = false

    for (const bucket of plan.buckets) {
      if (existingNames.has(bucket.fileName.toLowerCase())) continue
      try {
        const sources = bucket.pages.map((page) => next.fileById.get(page.docId)!)
        const file = await mergePdfFiles(sources, bucket.fileName)
        const docId = `binder-${Date.now()}-${bucket.kind}-${Math.random().toString(36).slice(2, 7)}`
        created.push({
          docId,
          fileName: bucket.fileName,
          kind: bucket.kind,
          confidence: 1,
          loadNumbers: [],
        })
        createdFiles.set(docId, file)
        existingNames.add(bucket.fileName.toLowerCase())
      } catch (err) {
        console.warn('[collapsePageSplitsIntoBinders] merge failed', plan.stem, bucket.kind, err)
        failed = true
        break
      }
    }

    if (failed) continue

    const removeIds = new Set(pageIds)
    const stripped = stripDocIds(next, removeIds)
    const fileById = new Map(stripped.draft.fileById)
    for (const [docId, file] of createdFiles) fileById.set(docId, file)
    next = { ...stripped.draft, fileById }
    removedStoragePaths.push(...stripped.removedStoragePaths)
    for (const fp of created) {
      next = placeUnmatchedFingerprint(next, fp)
    }
    collapsedStems.push(plan.stem)
  }

  return { draft: next, collapsedStems, removedStoragePaths }
}
