/**
 * When AI packet creation / review fails, move the batch to rework —
 * never a dead "failed" workflow state. Docs stay uploaded for Credyx.
 */

import { isAutoInvoiceCreationEnabled } from '../config/aiPolicy'
import { getBatchById, updateBatch, updateBatchTotals } from '../data/mockBatches'
import { getBatchFiles } from '../data/batchFileStore'
import { deleteInvoice, getInvoicesByBatchId } from '../data/mockInvoices'
import { notifyTenantDataUpdated } from './supabase/tenantDataLiveSync'
import { enqueueBatchProcessing, fetchBatchProcessingJob } from './credyx/batchProcessingJobs'
import { emailCredyxIntakeError } from './credyx/batchLifecycleEmails'
import type { AiSpendDecision, AiSpendDenyReason } from './aiSpendService'
import { getSupabase, isSupabaseConfigured } from '../lib/supabase'
import { listHandoffDocumentMeta } from '../utils/resolveHandoffDocuments'
import { hasPpwBeenSent } from '../utils/ppwSent'
import type { Invoice } from '../types/invoice'

/** Admin-facing AI / pipeline error for a batch (from the latest processing job). */
export async function fetchBatchAiLastError(batchId: string): Promise<string | null> {
  try {
    const job = await fetchBatchProcessingJob(batchId)
    const msg = job?.last_error?.trim()
    return msg || null
  } catch (err) {
    console.warn('[fetchBatchAiLastError]', err)
    return null
  }
}

/** Persist batch as rework with optional admin-only error detail on the job row. */
export async function markBatchNeedsRework(
  batchId: string,
  errorMessage: string,
  opts?: { skipStop?: boolean; emailOps?: boolean }
): Promise<void> {
  if (!opts?.skipStop) {
    try {
      const { stopAllBatchBackgroundWork } = await import('../utils/batchBackgroundControl')
      await stopAllBatchBackgroundWork(batchId, {
        outcome: 'abort_only',
        reason: errorMessage,
      })
    } catch (err) {
      console.warn('[markBatchNeedsRework] stop work failed', err)
    }
  }

  const batch = getBatchById(batchId)
  if (!batch) return

  updateBatch(batchId, {
    status: 'rework',
    // Keep sort_status failed so admin AI tools know DocSort did not finish.
    sort_status: 'failed',
    needs_doc_split: false,
    processing_error: errorMessage,
    in_use: false,
    in_use_by: undefined,
    in_use_by_user_id: null,
    in_use_at: null,
  })
  notifyTenantDataUpdated(['batches'], batch.client_id)

  if (isSupabaseConfigured()) {
    const supabase = getSupabase()
    if (supabase) {
      try {
        await supabase.rpc('mark_batch_processing_job', {
          p_batch_id: batchId,
          p_status: 'failed',
          p_last_error: errorMessage,
          p_locked_by: 'browser-pipeline',
        })
      } catch (err) {
        console.warn('[markBatchNeedsRework] job mark failed', err)
      }
    }
  }

  if (opts?.emailOps !== false) {
    try {
      await emailCredyxIntakeError({
        batchNumber: batch.batch_number,
        clientName: batch.client_name,
        issueMessage: `${errorMessage}\nOpen Batches → Packet Rework for ${batch.batch_number}.`,
      })
    } catch (err) {
      console.warn('[markBatchNeedsRework] ops email failed', err)
    }
  }
}

/** Ops-facing reason when AI cannot create packets for a client. */
export function opsMessageForAiPolicyBlock(
  decision: Pick<AiSpendDecision, 'reason' | 'message'>,
  opts?: { aiConfigured?: boolean; clientName?: string }
): string {
  const clientLabel = opts?.clientName?.trim() || 'this client'
  if (opts?.aiConfigured === false) {
    return `Batch needs rework because AI is unavailable (openai-proxy / API not configured). Docs are unassigned in Packet Rework for ${clientLabel}.`
  }
  const reason = decision.reason as AiSpendDenyReason | undefined
  if (reason === 'client_cap_exceeded') {
    return `Batch needs rework because ${clientLabel} hit their AI monthly spend cap. Docs are unassigned in Packet Rework.`
  }
  if (reason === 'org_cap_exceeded') {
    return `Batch needs rework because the platform AI monthly spend cap was reached. Docs for ${clientLabel} are unassigned in Packet Rework.`
  }
  if (reason === 'client_disabled') {
    return `Batch needs rework because AI is disabled for ${clientLabel}. Docs are unassigned in Packet Rework.`
  }
  if (reason === 'platform_disabled') {
    return `Batch needs rework because platform AI is turned off. Docs for ${clientLabel} are unassigned in Packet Rework.`
  }
  return `Batch needs rework because AI packet creation is not allowed for ${clientLabel}. ${decision.message} Docs are unassigned in Packet Rework.`
}

/**
 * AI off / down / spend cap: Packet Rework with all docs unassigned + ops email.
 * Client portal must keep showing Processing (never Rework).
 */
export async function releaseBatchForAiPolicyBlock(
  batchId: string,
  decision: Pick<AiSpendDecision, 'reason' | 'message'>,
  opts?: { aiConfigured?: boolean }
): Promise<void> {
  const batch = getBatchById(batchId)
  if (!batch) return

  const issueMessage = opsMessageForAiPolicyBlock(decision, {
    aiConfigured: opts?.aiConfigured,
    clientName: batch.client_name,
  })

  try {
    const { stopAllBatchBackgroundWork } = await import('../utils/batchBackgroundControl')
    await stopAllBatchBackgroundWork(batchId, {
      outcome: 'abort_only',
      reason: issueMessage,
    })
  } catch (err) {
    console.warn('[releaseBatchForAiPolicyBlock] stop work failed', err)
  }

  await releaseBatchToManualCreation(batchId)

  if (isSupabaseConfigured()) {
    const supabase = getSupabase()
    try {
      await supabase?.rpc('mark_batch_processing_job', {
        p_batch_id: batchId,
        p_status: 'failed',
        p_last_error: issueMessage,
        p_locked_by: 'ai-policy-block',
      })
    } catch (err) {
      console.warn('[releaseBatchForAiPolicyBlock] job mark failed', err)
    }
  }

  try {
    await emailCredyxIntakeError({
      batchNumber: batch.batch_number,
      clientName: batch.client_name,
      issueMessage: `${issueMessage}\nOpen Batches → Packet Rework for ${batch.batch_number}.`,
    })
  } catch (err) {
    console.warn('[releaseBatchForAiPolicyBlock] ops email failed', err)
  }
}

/** Delete all invoices on a batch so packet creation can run again without duplicates. */
/** Statuses that are still AI-owned drafts. Anything else is a human or money decision. */
const RECREATABLE_INVOICE_STATUSES = new Set(['pending', 'review'])

/** Invoices that must never be deleted by an automatic re-create. */
export function invoicesBlockingRecreate(batchId: string): Invoice[] {
  return getInvoicesByBatchId(batchId).filter(
    (inv) =>
      !RECREATABLE_INVOICE_STATUSES.has(inv.status) ||
      hasPpwBeenSent(inv) ||
      (inv.paid_amount ?? 0) > 0
  )
}

/**
 * Delete a batch's packets so they can be rebuilt. Refuses (returns false, deletes
 * nothing) when any packet was approved, held, sent to a broker, or paid.
 */
export function clearBatchInvoicesForRecreate(batchId: string): boolean {
  if (invoicesBlockingRecreate(batchId).length > 0) return false
  const invoices = getInvoicesByBatchId(batchId)
  for (const inv of invoices) {
    deleteInvoice(inv.id)
  }
  updateBatchTotals(batchId)
  return true
}

/**
 * Admin: re-run DocSort / packet creation from uploaded docs.
 * Clears existing invoices first so retry never appends duplicates.
 */
export async function retryBatchPacketCreation(batchId: string): Promise<void> {
  if (!isAutoInvoiceCreationEnabled()) {
    throw new Error('Automatic AI invoice creation is turned off in Settings → AI.')
  }
  const batch = getBatchById(batchId)
  if (!batch) throw new Error('Batch not found')

  const blocking = invoicesBlockingRecreate(batchId)
  if (blocking.length > 0) {
    throw new Error(
      `Cannot re-create packets: ${blocking.length} invoice(s) are already approved, held, sent or paid (${blocking
        .map((inv) => inv.invoice_number)
        .join(', ')}). Fix them in Packet Rework instead.`
    )
  }
  clearBatchInvoicesForRecreate(batchId)

  updateBatch(batchId, {
    status: 'creating',
    sort_status: 'sorting',
    total_invoices: 0,
    total_amount: 0,
  })
  notifyTenantDataUpdated(['batches', 'invoices'], batch.client_id)

  await enqueueBatchProcessing({
    batchId,
    clientId: batch.client_id,
    kind: 'sort_and_verify',
  })
}

/** Collect uploaded doc ids (memory + handoff storage) for unmatched seeding. */
async function collectUploadedDocIds(batchId: string, clientId: string): Promise<string[]> {
  const ids = new Set<string>()
  for (const docId of getBatchFiles(batchId).keys()) {
    if (!docId.startsWith('invoice-pdf-')) ids.add(docId)
  }
  try {
    const listed = await listHandoffDocumentMeta(batchId, clientId)
    for (const item of listed) {
      if (item.docId && !item.docId.startsWith('invoice-pdf-')) ids.add(item.docId)
    }
  } catch (err) {
    console.warn('[collectUploadedDocIds]', err)
  }
  return [...ids]
}

/**
 * Admin: stop AI “Creating…” and open Packet Rework with all docs unassigned.
 * Credyx assigns each document manually into packets.
 */
export async function releaseBatchToManualCreation(batchId: string): Promise<void> {
  try {
    const { stopAllBatchBackgroundWork } = await import('../utils/batchBackgroundControl')
    await stopAllBatchBackgroundWork(batchId, {
      outcome: 'abort_only',
      reason: 'Manual creation — automated processing stopped.',
    })
  } catch (err) {
    console.warn('[releaseBatchToManualCreation] stop work failed', err)
  }

  const batch = getBatchById(batchId)
  if (!batch) throw new Error('Batch not found')

  // Clear stuck mid-review flags so Packets unlock.
  try {
    const { settleBatchAiGate } = await import('./credyx/batchAiReviewService')
    settleBatchAiGate(batchId)
  } catch {
    /* optional */
  }

  const unmatchedDocIds = await collectUploadedDocIds(batchId, batch.client_id)

  // Combined PDFs still need Doc Splitter — stop AI but keep the Doc Split queue.
  const { batchNeedsDocSplit } = await import('../utils/batchDocSplit')
  const needsSplit =
    batch.status === 'needs_split' ||
    batch.needs_doc_split === true ||
    batchNeedsDocSplit(batch)

  if (needsSplit) {
    updateBatch(batchId, {
      status: 'needs_split',
      sort_status: 'needs_split',
      needs_doc_split: true,
      unmatched_doc_ids: unmatchedDocIds,
    })
    notifyTenantDataUpdated(['batches'], batch.client_id)
    if (isSupabaseConfigured()) {
      const supabase = getSupabase()
      try {
        await supabase?.rpc('mark_batch_processing_job', {
          p_batch_id: batchId,
          p_status: 'succeeded',
          p_last_error:
            'Stopped AI — open Doc Splitter (combined PDFs) before Packet Rework.',
          p_locked_by: 'manual-override',
        })
      } catch (err) {
        console.warn('[releaseBatchToManualCreation] job mark failed', err)
      }
    }
    return
  }

  updateBatch(batchId, {
    status: 'rework',
    sort_status: 'failed',
    unmatched_doc_ids: unmatchedDocIds,
  })
  notifyTenantDataUpdated(['batches'], batch.client_id)

  if (!isSupabaseConfigured()) return
  const supabase = getSupabase()
  if (!supabase) return

  try {
    await supabase.rpc('mark_batch_processing_job', {
      p_batch_id: batchId,
      p_status: 'failed',
      p_last_error:
        'Manual creation — Credyx stopped automated packet creation; docs are in Packet Rework unassigned.',
      p_locked_by: 'manual-override',
    })
  } catch (err) {
    console.warn('[releaseBatchToManualCreation] job mark failed', err)
  }
}

/** True when a batch is stuck in automated creating / sorting. */
export function batchIsStuckCreating(batch: {
  status?: string | null
  sort_status?: string | null
}): boolean {
  return (
    batch.status === 'creating' ||
    batch.status === 'ai_splitting' ||
    batch.status === 'creating_packets' ||
    batch.sort_status === 'sorting' ||
    batch.sort_status === 'ai_splitting' ||
    batch.sort_status === 'creating_packets'
  )
}
