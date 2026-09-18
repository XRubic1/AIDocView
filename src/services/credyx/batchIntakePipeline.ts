import { isAIReviewEnabled } from '../../config/aiReview'
import {
  addBatch,
  addInvoicesForBatch,
  generateBatchNumber,
  updateBatch,
  updateBatchTotals,
} from '../../data/mockBatches'
import { getInvoicesByBatchId, updateInvoice } from '../../data/mockInvoices'
import { setBatchFiles } from '../../data/batchFileStore'
import { clearClientTenantCache } from '../../data/clientDemoData'
import { isSupabaseConfigured } from '../../lib/supabase'
import { evaluateAiSpendAllow } from '../aiSpendService'
import { setOpenAiSpendContext } from '../../utils/openaiAuthContext'
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
import {
  ensureUniqueClientInvoiceNumber,
  getNextClientInvoiceNumber,
  loadClientInvoiceNumbers,
} from '../../utils/clientInvoiceNumbers'

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
  const spend = await evaluateAiSpendAllow(clientId)
  if (!spend.allowed) {
    throw new Error(spend.message)
  }
  if (files.length === 0) {
    throw new Error('Upload at least one document.')
  }

  setOpenAiSpendContext({ clientId, feature: 'docsort' })
  try {
    const uploads = filesToUploads(files)
    const sortResult = await runDocSort(uploads, onProgress)

    const fileById = new Map<string, File>()
    uploads.forEach((u) => fileById.set(u.id, u.file))

    const drafted = invoiceDraftGroupsFromSort(sortResult)
    // Check DB + memory so we never reuse an existing carrier invoice #.
    const existingNumbers = await loadClientInvoiceNumbers(clientId)
    const usedInvoiceNumbers: string[] = [...existingNumbers]
    const clientName = getClientById(clientId)?.name ?? ''
    const invoices: BatchIntakeDraft['invoices'] = []
    for (const group of drafted.groups) {
      const draft = await buildCredyxDraftFromGroup(
        group,
        clientId,
        usedInvoiceNumbers,
        clientName
      )
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
  } finally {
    setOpenAiSpendContext({ feature: null })
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
    uploadMode = 'ai',
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

  // Re-check live invoice numbers (DB + memory) before insert — avoids
  // invoices_client_number_uidx when memory was stale after account switch.
  const existingNumbers = await loadClientInvoiceNumbers(clientId)
  const reservedNumbers: string[] = [...existingNumbers]
  const resolvedDrafts = drafts.map((draft) => {
    const preferred = draft.invoice_number?.trim() || ''
    const invoice_number = preferred
      ? ensureUniqueClientInvoiceNumber(clientId, preferred, reservedNumbers)
      : getNextClientInvoiceNumber(clientId, reservedNumbers)
    reservedNumbers.push(invoice_number)
    return { ...draft, invoice_number }
  })

  const numberIssues = validateBatchInvoiceNumbers(
    clientId,
    resolvedDrafts.map((d) => d.invoice_number),
    { knownNumbers: existingNumbers }
  )
  if (numberIssues.length > 0) {
    throw new Error(numberIssues[0].message)
  }

  const assignedDocIds = new Set(resolvedDrafts.flatMap((d) => d.document_doc_ids))
  // Prefer live unmatched lists; drop anything already attached to a packet.
  const unmatchedIds = [
    ...fingerprintDocIds(sortResult.unmatchedRateCons),
    ...fingerprintDocIds(sortResult.unmatchedBols),
    ...fingerprintDocIds(sortResult.otherDocuments),
  ].filter((id) => !assignedDocIds.has(id))

  const existing = existingBatchId ? updateBatch(existingBatchId, {}) : undefined

  // Never append a second DocSort result onto a batch that already has packets.
  if (existingBatchId) {
    const already = getInvoicesByBatchId(existingBatchId)
    if (already.length > 0) {
      updateBatchTotals(existingBatchId)
      return {
        batchId: existingBatchId,
        batchNumber: existing?.batch_number ?? generateBatchNumber(clientId),
        invoices: already,
      }
    }
  }

  // Fee calc pulls live from the carrier account (trial/active included).
  const feeTerms = snapshotFeeTermsFromClient(client) ?? client?.fee_terms
  const feeCalculation = calculateBatchFeeCalculation(
    resolvedDrafts.map((d) => ({ amount: d.amount, status: 'pending' as const })),
    feeTerms
  )
  const batchNumber = existing?.batch_number ?? generateBatchNumber(clientId)

  // Keep total_invoices at 0 until all invoices are in memory / DB (avoids list vs rework mismatch).
  const batch = existing
    ? updateBatch(existingBatchId!, {
        total_invoices: 0,
        total_amount: 0,
        status: 'creating',
        submitted_at: new Date().toISOString(),
        upload_mode: uploadMode,
        sort_status: 'sorting',
        doc_sort_snapshot: buildDocSortSnapshot(sortResult, resolvedDrafts),
        unmatched_doc_ids: unmatchedIds,
        fee_calculation: feeCalculation,
      })!
    : addBatch({
        batch_number: batchNumber,
        client_name: clientName,
        client_id: clientId,
        total_invoices: 0,
        total_amount: 0,
        status: 'creating',
        submitted_at: new Date().toISOString(),
        upload_mode: uploadMode,
        sort_status: 'sorting',
        doc_sort_snapshot: buildDocSortSnapshot(sortResult, resolvedDrafts),
        unmatched_doc_ids: unmatchedIds,
        fee_calculation: feeCalculation,
      })

  const invoiceFields = resolvedDrafts.map((draft) => {
    const fields = draftToInvoiceFields(draft, clientId, clientName)
    fields.ai_confirmed_by = confirmedBy
    return fields
  })

  const invoices = addInvoicesForBatch(batch.id, batchNumber, invoiceFields)
  // Sync denormalized totals from the real invoice rows immediately after create.
  updateBatchTotals(batch.id)

  const pendingBrokerNames = [
    ...new Set(
      resolvedDrafts
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
  resolvedDrafts.forEach((draft) => {
    if (draft.invoice_pdf) {
      storeMap.set(`invoice-pdf-${draft.groupId}`, draft.invoice_pdf)
    }
  })
  setBatchFiles(batch.id, storeMap)

  // Combined PDFs left unmatched → Credyx Doc Splitter before Packet Rework.
  const { listCombinedFingerprintIds } = await import(
    '../../products/docSort/services/docSortUnpack'
  )
  const remainingCombined = listCombinedFingerprintIds(
    [
      ...sortResult.unmatchedRateCons,
      ...sortResult.unmatchedBols,
      ...sortResult.otherDocuments,
      ...resolvedDrafts.flatMap((d) => [
        ...d.fingerprints.rateCons,
        ...d.fingerprints.bols,
        ...(d.fingerprints.other ?? []),
      ]),
    ],
    storeMap
  )
  const needsSplit = remainingCombined.length > 0

  updateBatch(batch.id, {
    status: needsSplit ? 'needs_split' : 'ready_to_post',
    sort_status: needsSplit ? 'needs_split' : 'ready',
    needs_doc_split: needsSplit,
  })

  if (isSupabaseConfigured()) {
    for (let i = 0; i < invoices.length; i++) {
      const invoice = invoices[i]
      const draft = resolvedDrafts[i]
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
        updateInvoice(invoice.id, { document_storage_paths: storagePaths }, { deferPersist: true })
        Object.assign(invoice, { document_storage_paths: storagePaths })
      }

      try {
        await persistInvoice(invoice)
      } catch (err) {
        console.error('[submitAiBatch] invoice persist failed:', err)
        // Keep totals honest even on partial failure.
        updateBatchTotals(batch.id)
        throw err instanceof Error ? err : new Error('Could not save invoice to database')
      }
    }
    updateBatchTotals(batch.id)
  }

  clearClientTenantCache(clientId)

  // Wait for Doc Splitter before verify / happy path when combined PDFs remain.
  if (!needsSplit) {
    try {
      const { enqueueBatchProcessing } = await import('./batchProcessingJobs')
      void enqueueBatchProcessing({
        batchId: batch.id,
        clientId,
        kind: 'verify_only',
      })
    } catch (err) {
      console.warn('[submitAiBatch] enqueue background processing failed', err)
    }
  }

  // Optional happy path: clean intake → verification (PPW waits until batch process).
  let happyPath:
    | {
        ppwSent: number
        ppwFailed: number
        movedToVerification: boolean
        intakeErrorEmailed: boolean
      }
    | undefined
  if (!needsSplit) {
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
  }

  return {
    batchId: batch.id,
    batchNumber,
    invoices,
    happyPath,
  }
}
