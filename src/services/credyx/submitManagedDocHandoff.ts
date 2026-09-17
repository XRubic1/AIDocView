/**
 * Managed-tier “Send docs”: upload PPW quickly, then AI creates invoices in the background.
 */
import { isAIReviewEnabled } from '../../config/aiReview'
import { HANDOFF_PLACEHOLDER_INVOICE_ID, setBatchFiles } from '../../data/batchFileStore'
import { addBatch, generateBatchNumber, updateBatch } from '../../data/mockBatches'
import { isSupabaseConfigured } from '../../lib/supabase'
import { notifyAdminDocHandoff } from '../adminNotificationService'
import { evaluateAiSpendAllow } from '../aiSpendService'
import { getClientById } from '../clientRegistry'
import { persistBatch, uploadBatchInvoiceDocuments } from '../supabase/tenantPersist'
import { assertClientSetupComplete } from '../../utils/clientSetupDocuments'
import { estimateBatchProcessingEta } from '../../utils/batchProcessingEta'
import { enqueueBatchProcessing } from './batchProcessingJobs'

export type ManagedHandoffProgress = {
  phase: 'uploading'
  message: string
}

export interface SubmitManagedDocHandoffInput {
  clientId: string
  clientName: string
  files: File[]
  notes?: string
  onProgress?: (p: ManagedHandoffProgress) => void
}

export interface SubmitManagedDocHandoffResult {
  batchId: string
  batchNumber: string
  fileCount: number
  /** Estimated minutes until invoices are ready to review. */
  etaMinutes: number
  etaLabel: string
  /** True when AI is not configured — Credyx will process manually. */
  docsOnly: boolean
}

/** Create a managed handoff batch, upload files, and kick background AI intake. */
export async function submitManagedDocHandoff(
  input: SubmitManagedDocHandoffInput
): Promise<SubmitManagedDocHandoffResult> {
  const { clientId, clientName, files, notes, onProgress } = input
  if (files.length === 0) {
    throw new Error('Add at least one document before sending.')
  }

  const client = getClientById(clientId)
  assertClientSetupComplete(clientId, client)

  onProgress?.({ phase: 'uploading', message: 'Saving your documents…' })

  const batchNumber = generateBatchNumber(clientId)
  const submittedAt = new Date().toISOString()
  // Uploads always proceed; spend/policy only gates AI packet creation.
  const spend = await evaluateAiSpendAllow(clientId)
  const aiOn = isAIReviewEnabled() && spend.allowed
  const batch = addBatch({
    batch_number: batchNumber,
    client_name: clientName,
    client_id: clientId,
    total_invoices: 0,
    total_amount: 0,
    status: aiOn ? 'creating' : 'ready_to_post',
    submitted_at: submittedAt,
    upload_mode: 'handoff',
    sort_status: aiOn ? 'sorting' : 'pending',
  })

  if (isSupabaseConfigured()) {
    try {
      await persistBatch(batch)
    } catch (err) {
      console.warn('[submitManagedDocHandoff] persistBatch failed', err)
    }
  }

  const fileMap = new Map<string, File>()
  files.forEach((file, index) => {
    const docId = `handoff-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`
    fileMap.set(docId, file)
  })
  setBatchFiles(batch.id, fileMap)

  if (isSupabaseConfigured()) {
    try {
      await uploadBatchInvoiceDocuments(
        clientId,
        batch.id,
        HANDOFF_PLACEHOLDER_INVOICE_ID,
        fileMap
      )
    } catch (err) {
      console.warn('[submitManagedDocHandoff] storage upload failed', err)
      throw err instanceof Error ? err : new Error('Could not upload documents')
    }
  }

  notifyAdminDocHandoff({
    clientId,
    clientName,
    batchId: batch.id,
    batchNumber: batch.batch_number,
    fileCount: files.length,
    fileNames: files.map((f) => f.name),
    notes: notes?.trim() || undefined,
  })

  const eta = estimateBatchProcessingEta({
    fileCount: files.length,
    startedAt: submittedAt,
    phase: 'processing',
  })
  const etaMinutes = Math.max(1, Math.ceil((eta?.remainingSeconds ?? 180) / 60))
  const etaLabel = eta?.label ?? `about ${etaMinutes} minutes`

  if (!aiOn) {
    updateBatch(batch.id, { sort_status: 'pending' })
    return {
      batchId: batch.id,
      batchNumber: batch.batch_number,
      fileCount: files.length,
      etaMinutes,
      etaLabel,
      docsOnly: true,
    }
  }

  // Fire-and-forget: browser DocSort + verify, edge covers verify when snapshot exists.
  void enqueueBatchProcessing({
    batchId: batch.id,
    clientId,
    kind: 'sort_and_verify',
  })

  return {
    batchId: batch.id,
    batchNumber: batch.batch_number,
    fileCount: files.length,
    etaMinutes,
    etaLabel,
    docsOnly: false,
  }
}
