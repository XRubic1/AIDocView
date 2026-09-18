import type { PendingBatch } from '../types/admin'
import type { DocSortFingerprint } from '../products/docSort/types'
import { getBatchById, updateBatch } from '../data/mockBatches'
import {
  canUnpackFingerprint,
  fingerprintNeedsDocSplitter,
} from '../products/docSort/services/docSortUnpack'
import { parseFingerprintCatalog } from '../products/docSort/utils/docSortSnapshot'
import type { BatchIntakeDraft } from '../types/credyxBatch'
import { canUnpackDraftDocument } from './aiDraftDocOps'
import { notifyTenantDataUpdated } from '../services/supabase/tenantDataLiveSync'

/** True when catalog shows a real RC/BOL/invoice mix (sticky flags alone are not enough). */
export function batchNeedsDocSplit(batch: PendingBatch | null | undefined): boolean {
  if (!batch) return false

  const catalog = parseFingerprintCatalog(batch.doc_sort_snapshot)
  if (catalog.size > 0) {
    return [...catalog.values()].some((fp) =>
      fingerprintNeedsDocSplitter(fp as unknown as DocSortFingerprint)
    )
  }

  // No catalog yet — fall back to sticky flags from submit / pipeline.
  return (
    batch.status === 'needs_split' ||
    batch.needs_doc_split === true ||
    batch.sort_status === 'needs_split'
  )
}

/**
 * Clear sticky Doc Split gates when the snapshot no longer has a true combined PDF.
 * Safe to call from list / packet unlock paths.
 */
export function healFalsePositiveDocSplitGate(batchId: string): boolean {
  const batch = getBatchById(batchId)
  if (!batch) return false
  const flagged =
    batch.status === 'needs_split' ||
    batch.needs_doc_split === true ||
    batch.sort_status === 'needs_split'
  if (!flagged) return false
  if (batchNeedsDocSplit(batch)) return false

  updateBatch(batchId, {
    needs_doc_split: false,
    sort_status: batch.sort_status === 'needs_split' ? 'ready' : batch.sort_status,
    status: batch.status === 'needs_split' ? 'rework' : batch.status,
  })
  notifyTenantDataUpdated(['batches'], batch.client_id)
  return true
}

/** Combined docs still unpackable in a live intake draft. */
export function draftHasCombinedDocuments(draft: BatchIntakeDraft | null | undefined): boolean {
  if (!draft) return false
  const ids = new Set<string>()
  for (const inv of draft.invoices) {
    for (const id of inv.document_doc_ids) ids.add(id)
  }
  for (const fp of [
    ...draft.unmatched.rateCons,
    ...draft.unmatched.bols,
    ...draft.unmatched.other,
  ]) {
    ids.add(fp.docId)
  }
  for (const docId of ids) {
    if (canUnpackDraftDocument(draft, docId)) return true
  }
  return false
}

/** List unpackable doc ids in a draft (for Doc Splitter rail). */
export function listCombinedDraftDocIds(draft: BatchIntakeDraft): string[] {
  const ids = new Set<string>()
  for (const inv of draft.invoices) {
    for (const id of inv.document_doc_ids) ids.add(id)
  }
  for (const fp of [
    ...draft.unmatched.rateCons,
    ...draft.unmatched.bols,
    ...draft.unmatched.other,
  ]) {
    ids.add(fp.docId)
  }
  return [...ids].filter((docId) => canUnpackDraftDocument(draft, docId))
}

/** Mark batch as waiting on Credyx Doc Splitter. */
export function markBatchNeedsDocSplit(
  batchId: string,
  opts: { unmatchedDocIds: string[]; snapshot?: string }
): void {
  const batch = getBatchById(batchId)
  if (!batch) return
  updateBatch(batchId, {
    needs_doc_split: true,
    sort_status: 'needs_split',
    status: 'needs_split',
    unmatched_doc_ids: opts.unmatchedDocIds,
    ...(opts.snapshot ? { doc_sort_snapshot: opts.snapshot } : {}),
    total_invoices: batch.total_invoices || 0,
  })
  notifyTenantDataUpdated(['batches'], batch.client_id)
}

/** Clear Doc Splitter gate after Credyx finishes (or dismisses remaining). */
export function clearBatchNeedsDocSplit(batchId: string): void {
  const batch = getBatchById(batchId)
  if (!batch) return
  updateBatch(batchId, {
    needs_doc_split: false,
    sort_status: batch.sort_status === 'needs_split' ? 'failed' : batch.sort_status,
    status: batch.status === 'needs_split' ? 'rework' : batch.status,
  })
  notifyTenantDataUpdated(['batches'], batch.client_id)
}
