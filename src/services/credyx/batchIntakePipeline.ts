import { isAIReviewEnabled } from '../../config/aiReview'
import { addBatch, addInvoicesForBatch, generateBatchNumber, updateBatch } from '../../data/mockBatches'
import { setBatchFiles } from '../../data/batchFileStore'
import {
  buildCredyxDraftFromGroup,
  draftToInvoiceFields,
  fingerprintDocIds,
} from '../../integrations/docSortToCredyx'
import { runDocSort } from '../../products/docSort/services/docSortRunner'
import type { DocSortProgress, DocSortUpload } from '../../products/docSort/types'
import type {
  BatchIntakeDraft,
  SubmitAiBatchInput,
  SubmitAiBatchResult,
} from '../../types/credyxBatch'

function filesToUploads(files: File[]): DocSortUpload[] {
  return files.map((file) => ({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    file,
    fileName: file.name,
    status: 'pending' as const,
  }))
}

/**
 * Run DocSort + generate invoice PDF drafts for client confirmation.
 */
export async function runBatchIntakePipeline(
  files: File[],
  clientId: string,
  onProgress?: (p: DocSortProgress) => void
): Promise<BatchIntakeDraft> {
  if (!isAIReviewEnabled()) {
    throw new Error('Add VITE_OPENAI_API_KEY to your .env file to run AI upload.')
  }
  if (files.length === 0) {
    throw new Error('Upload at least one PDF.')
  }

  const uploads = filesToUploads(files)
  const sortResult = await runDocSort(uploads, onProgress)

  const fileById = new Map<string, File>()
  uploads.forEach((u) => fileById.set(u.id, u.file))

  const invoices: BatchIntakeDraft['invoices'] = []
  for (const group of sortResult.groups) {
    const draft = await buildCredyxDraftFromGroup(group)
    invoices.push(draft)
  }

  return {
    batchNumber: generateBatchNumber(clientId),
    sortResult,
    invoices,
    unmatched: {
      rateCons: sortResult.unmatchedRateCons,
      bols: sortResult.unmatchedBols,
      other: sortResult.otherDocuments,
    },
    fileById,
  }
}

/** Persist confirmed AI batch into mockBatches + mockInvoices. */
export function submitAiBatch(input: SubmitAiBatchInput): SubmitAiBatchResult {
  const { clientId, clientName, drafts, sortResult, fileById, confirmedBy, existingBatchId } = input

  const allConfirmed = drafts.every((d) => d.confirmed)
  if (!allConfirmed) {
    throw new Error('Confirm every invoice before uploading the batch.')
  }
  if (drafts.length === 0) {
    throw new Error('No invoices to submit. Match at least one load from your paperwork.')
  }

  const totalAmount = drafts.reduce((s, d) => s + d.amount, 0)
  const unmatchedIds = [
    ...fingerprintDocIds(sortResult.unmatchedRateCons),
    ...fingerprintDocIds(sortResult.unmatchedBols),
    ...fingerprintDocIds(sortResult.otherDocuments),
  ]

  const existing = existingBatchId ? updateBatch(existingBatchId, {}) : undefined
  const batchNumber = existing?.batch_number ?? generateBatchNumber(clientId)

  const batch = existing
    ? updateBatch(existingBatchId!, {
        total_invoices: drafts.length,
        total_amount: totalAmount,
        status: 'ready_to_post',
        submitted_at: new Date().toISOString(),
        upload_mode: 'ai',
        sort_status: 'ready',
        doc_sort_snapshot: JSON.stringify({
          sortedAt: sortResult.sortedAt,
          totalDocuments: sortResult.totalDocuments,
          groupCount: sortResult.groups.length,
        }),
        unmatched_doc_ids: unmatchedIds,
      })!
    : addBatch({
        batch_number: batchNumber,
        client_name: clientName,
        client_id: clientId,
        total_invoices: drafts.length,
        total_amount: totalAmount,
        status: 'ready_to_post',
        submitted_at: new Date().toISOString(),
        upload_mode: 'ai',
        sort_status: 'ready',
        doc_sort_snapshot: JSON.stringify({
          sortedAt: sortResult.sortedAt,
          totalDocuments: sortResult.totalDocuments,
          groupCount: sortResult.groups.length,
        }),
        unmatched_doc_ids: unmatchedIds,
      })

  const invoiceFields = drafts.map((draft) => {
    const fields = draftToInvoiceFields(draft, clientId, confirmedBy)
    fields.ai_confirmed_by = confirmedBy
    return fields
  })

  const invoices = addInvoicesForBatch(batch.id, batchNumber, invoiceFields)

  const storeMap = new Map(fileById)
  drafts.forEach((draft) => {
    if (draft.invoice_pdf) {
      storeMap.set(`invoice-pdf-${draft.groupId}`, draft.invoice_pdf)
    }
  })
  setBatchFiles(batch.id, storeMap)

  return {
    batchId: batch.id,
    batchNumber,
    invoices,
  }
}
