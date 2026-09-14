import { isAIReviewEnabled } from '../../config/aiReview'
import { addBatch, addInvoicesForBatch, generateBatchNumber, updateBatch } from '../../data/mockBatches'
import { updateInvoice } from '../../data/mockInvoices'
import { setBatchFiles } from '../../data/batchFileStore'
import { clearClientTenantCache } from '../../data/clientDemoData'
import { isSupabaseConfigured } from '../../lib/supabase'
import {
  persistInvoice,
  uploadBatchInvoiceDocuments,
} from '../supabase/tenantPersist'
import {
  buildCredyxDraftFromGroup,
  draftToInvoiceFields,
  fingerprintDocIds,
} from '../../integrations/docSortToCredyx'
import { runDocSort } from '../../products/docSort/services/docSortRunner'
import { invoiceDraftGroupsFromSort } from '../../products/docSort/utils/invoiceDraftGroups'
import { buildDocSortSnapshot } from '../../products/docSort/utils/docSortSnapshot'
import type { DocSortProgress, DocSortUpload } from '../../products/docSort/types'
import type {
  BatchIntakeDraft,
  SubmitAiBatchInput,
  SubmitAiBatchResult,
} from '../../types/credyxBatch'
import { validateBatchInvoiceNumbers } from '../../utils/invoiceDuplicateChecks'
import { calculateBatchFeeCalculation } from '../../utils/invoiceFees'
import { snapshotFeeTermsFromClient } from '../../utils/feeTermsLock'
import { getClientById } from '../clientRegistry'
import { assertClientSetupComplete } from '../../utils/clientSetupDocuments'
import { notifyAdminBrokerRequested } from '../adminNotificationService'

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
    throw new Error(
      'AI review requires Supabase configuration. Deploy the openai-proxy Edge Function with OPENAI_API_KEY.'
    )
  }
  if (files.length === 0) {
    throw new Error('Upload at least one document.')
  }

  const uploads = filesToUploads(files)
  const sortResult = await runDocSort(uploads, onProgress)

  const fileById = new Map<string, File>()
  uploads.forEach((u) => fileById.set(u.id, u.file))

  const drafted = invoiceDraftGroupsFromSort(sortResult)
  const invoices: BatchIntakeDraft['invoices'] = []
  const usedInvoiceNumbers: string[] = []
  for (const group of drafted.groups) {
    const draft = await buildCredyxDraftFromGroup(group, clientId, usedInvoiceNumbers)
    usedInvoiceNumbers.push(draft.invoice_number)
    invoices.push(draft)
  }

  const nextSort = {
    ...sortResult,
    unmatchedRateCons: drafted.unmatched.rateCons,
    unmatchedBols: drafted.unmatched.bols,
    otherDocuments: drafted.unmatched.other,
  }

  return {
    batchNumber: generateBatchNumber(clientId),
    sortResult: nextSort,
    invoices,
    unmatched: drafted.unmatched,
    fileById,
  }
}

/** Persist confirmed AI batch into mockBatches + mockInvoices. */
export async function submitAiBatch(input: SubmitAiBatchInput): Promise<SubmitAiBatchResult> {
  const {
    clientId,
    clientName,
    drafts,
    sortResult,
    fileById,
    confirmedBy,
    existingBatchId,
    skipSetupGate,
  } = input

  const allConfirmed = drafts.every((d) => d.confirmed)
  if (!allConfirmed) {
    throw new Error('Confirm every invoice before uploading the batch.')
  }
  if (drafts.length === 0) {
    throw new Error('No invoices to submit. Match at least one load from your paperwork.')
  }

  const client = getClientById(clientId)
  if (!skipSetupGate) {
    assertClientSetupComplete(clientId, client)
  }

  // Hard-block duplicate invoice numbers (no silent renumbering).
  const numberIssues = validateBatchInvoiceNumbers(
    clientId,
    drafts.map((d) => d.invoice_number?.trim() || '')
  )
  if (numberIssues.length > 0) {
    throw new Error(numberIssues[0].message)
  }

  const totalAmount = drafts.reduce((s, d) => s + d.amount, 0)
  const unmatchedIds = [
    ...fingerprintDocIds(sortResult.unmatchedRateCons),
    ...fingerprintDocIds(sortResult.unmatchedBols),
    ...fingerprintDocIds(sortResult.otherDocuments),
  ]

  const existing = existingBatchId ? updateBatch(existingBatchId, {}) : undefined
  // Fee calc pulls live from the carrier account (trial/active included).
  const feeTerms = snapshotFeeTermsFromClient(client) ?? client?.fee_terms
  const feeCalculation = calculateBatchFeeCalculation(
    drafts.map((d) => ({ amount: d.amount, status: 'pending' as const })),
    feeTerms
  )
  const batchNumber = existing?.batch_number ?? generateBatchNumber(clientId)

  const batch = existing
    ? updateBatch(existingBatchId!, {
        total_invoices: drafts.length,
        total_amount: totalAmount,
        status: 'ready_to_post',
        submitted_at: new Date().toISOString(),
        upload_mode: 'ai',
        sort_status: 'ready',
        doc_sort_snapshot: buildDocSortSnapshot(sortResult, drafts),
        unmatched_doc_ids: unmatchedIds,
        fee_calculation: feeCalculation,
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
        doc_sort_snapshot: buildDocSortSnapshot(sortResult, drafts),
        unmatched_doc_ids: unmatchedIds,
        fee_calculation: feeCalculation,
      })

  const invoiceFields = drafts.map((draft) => {
    const fields = draftToInvoiceFields(draft, clientId, clientName)
    fields.ai_confirmed_by = confirmedBy
    return fields
  })

  const invoices = addInvoicesForBatch(batch.id, batchNumber, invoiceFields)

  const pendingBrokerNames = [
    ...new Set(
      drafts
        .filter((d) => d.broker_name.trim() && !d.broker_id)
        .map((d) => d.broker_name.trim())
    ),
  ]
  if (pendingBrokerNames.length > 0 && !skipSetupGate) {
    notifyAdminBrokerRequested({
      clientId,
      clientName,
      batchId: batch.id,
      batchNumber: batch.batch_number,
      brokerNames: pendingBrokerNames,
    })
  }

  const storeMap = new Map(fileById)
  drafts.forEach((draft) => {
    if (draft.invoice_pdf) {
      storeMap.set(`invoice-pdf-${draft.groupId}`, draft.invoice_pdf)
    }
  })
  setBatchFiles(batch.id, storeMap)

  if (isSupabaseConfigured()) {
    for (let i = 0; i < invoices.length; i++) {
      const invoice = invoices[i]
      const draft = drafts[i]
      const docFiles = new Map<string, File>()

      for (const docId of draft.document_doc_ids) {
        const file = storeMap.get(docId)
        if (file) docFiles.set(docId, file)
      }

      const invoicePdfKey = `invoice-pdf-${draft.groupId}`
      const invoicePdf = storeMap.get(invoicePdfKey)
      if (invoicePdf) docFiles.set(invoicePdfKey, invoicePdf)

      let storagePaths: Record<string, string> | undefined

      if (docFiles.size > 0) {
        storagePaths = await uploadBatchInvoiceDocuments(
          clientId,
          batch.id,
          invoice.id,
          docFiles
        )
        updateInvoice(invoice.id, { document_storage_paths: storagePaths })
        Object.assign(invoice, { document_storage_paths: storagePaths })
      }

      try {
        await persistInvoice(invoice)
      } catch (err) {
        console.error('[submitAiBatch] invoice persist failed:', err)
        throw err instanceof Error ? err : new Error('Could not save invoice to database')
      }
    }
  }

  clearClientTenantCache(clientId)

  // Optional happy path: clean intake → PPW → verification (Credyx can override anytime).
  let happyPath:
    | {
        ppwSent: number
        ppwFailed: number
        movedToVerification: boolean
        intakeErrorEmailed: boolean
      }
    | undefined
  try {
    const { runHappyPathAfterIntake } = await import('./batchHappyPath')
    happyPath = await runHappyPathAfterIntake({
      batchId: batch.id,
      batchNumber,
      clientName,
      unmatchedCount: unmatchedIds.length,
    })
  } catch (err) {
    console.error('[submitAiBatch] happy path failed:', err)
  }

  return {
    batchId: batch.id,
    batchNumber,
    invoices,
    happyPath,
  }
}
