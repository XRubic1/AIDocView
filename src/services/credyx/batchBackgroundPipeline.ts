/**
 * In-browser background pipeline: DocSort (when needed) → AI verification → happy path.
 * Uses the same services as the admin Verification workspace so results stay consistent.
 */
import { getBatchFiles, mergeBatchFiles } from '../../data/batchFileStore'
import { getBatchById, updateBatch } from '../../data/mockBatches'
import { getInvoicesByBatchId, updateInvoice } from '../../data/mockInvoices'
import { downloadBatchDocument } from '../supabase/tenantPersist'
import { isSupabaseConfigured, getSupabase } from '../../lib/supabase'
import { isAIReviewEnabled } from '../../config/aiReview'
import { runBatchAiReview } from './batchAiReviewService'
import { runHappyPathAfterAiReview } from './batchHappyPath'
import type { BatchProcessingJobKind } from './batchProcessingJobs'
import { listHandoffDocumentMeta } from '../../utils/resolveHandoffDocuments'
import { notifyTenantDataUpdated } from '../supabase/tenantDataLiveSync'

const inflight = new Set<string>()

/** Ensure invoice document Files are available for review (storage → memory). */
async function hydrateBatchFiles(batchId: string): Promise<void> {
  const existing = getBatchFiles(batchId)
  const invoices = getInvoicesByBatchId(batchId)
  const missing: Array<{ docId: string; path: string; name: string }> = []

  for (const inv of invoices) {
    const paths = inv.document_storage_paths ?? {}
    for (const [docId, path] of Object.entries(paths)) {
      if (existing.has(docId)) continue
      missing.push({
        docId,
        path,
        name: path.split('/').pop() || `${docId}.bin`,
      })
    }
  }

  if (missing.length === 0 || !isSupabaseConfigured()) return

  const fetched = new Map<string, File>()
  await Promise.all(
    missing.map(async ({ docId, path, name }) => {
      try {
        const file = await downloadBatchDocument(path, name, guessMime(name))
        if (file) fetched.set(docId, file)
      } catch (err) {
        console.warn('[hydrateBatchFiles]', docId, err)
      }
    })
  )

  if (fetched.size > 0) mergeBatchFiles(batchId, fetched)
}

/** Load managed handoff PPW from memory or storage for DocSort intake. */
async function hydrateHandoffFiles(batchId: string, clientId: string): Promise<File[]> {
  const existing = getBatchFiles(batchId)
  if (existing.size > 0) return Array.from(existing.values())

  if (!isSupabaseConfigured()) return []

  try {
    const listed = await listHandoffDocumentMeta(batchId, clientId)
    if (listed.length === 0) return []

    const fetched = new Map<string, File>()
    await Promise.all(
      listed.map(async (item) => {
        try {
          const file = await downloadBatchDocument(
            item.storagePath,
            item.fileName,
            guessMime(item.fileName)
          )
          if (file) fetched.set(item.docId, file)
        } catch (err) {
          console.warn('[hydrateHandoffFiles]', item.docId, err)
        }
      })
    )
    if (fetched.size > 0) mergeBatchFiles(batchId, fetched)
    return Array.from(fetched.values())
  } catch (err) {
    console.warn('[hydrateHandoffFiles]', err)
    return []
  }
}

function guessMime(name: string): string {
  const lower = name.toLowerCase()
  if (lower.endsWith('.pdf')) return 'application/pdf'
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.webp')) return 'image/webp'
  return 'application/octet-stream'
}

async function markJob(
  batchId: string,
  status: 'running' | 'succeeded' | 'failed',
  lastError?: string
): Promise<void> {
  if (!isSupabaseConfigured()) return
  const supabase = getSupabase()
  if (!supabase) return

  try {
    const { error } = await supabase.rpc('mark_batch_processing_job', {
      p_batch_id: batchId,
      p_status: status,
      p_last_error: lastError ?? null,
      p_locked_by: 'browser-pipeline',
    })
    if (error) console.warn('[markJob]', error.message)
  } catch (err) {
    console.warn('[markJob]', err)
  }
}

/**
 * When a managed Send-docs batch has files but no invoices yet, DocSort + auto-submit.
 */
async function createInvoicesFromHandoffDocs(batchId: string): Promise<boolean> {
  const batch = getBatchById(batchId)
  if (!batch) return false

  const files = await hydrateHandoffFiles(batchId, batch.client_id)
  if (files.length === 0) return false

  updateBatch(batchId, { status: 'creating', sort_status: 'sorting' })
  notifyTenantDataUpdated(['batches'], batch.client_id)

  const { runBatchIntakePipeline, submitAiBatch } = await import('./batchIntakePipeline')
  const intake = await runBatchIntakePipeline(files, batch.client_id)
  if (intake.invoices.length === 0) {
    updateBatch(batchId, { sort_status: 'failed', status: 'ready_to_post' })
    notifyTenantDataUpdated(['batches'], batch.client_id)
    return false
  }

  await submitAiBatch({
    clientId: batch.client_id,
    clientName: batch.client_name,
    drafts: intake.invoices.map((inv) => ({ ...inv, confirmed: true })),
    sortResult: intake.sortResult,
    fileById: intake.fileById,
    confirmedBy: batch.client_name || 'Carrier',
    existingBatchId: batchId,
    uploadMode: 'handoff',
  })
  notifyTenantDataUpdated(['batches', 'invoices'], batch.client_id)
  return true
}

/**
 * Full automated pipeline for one batch. Idempotent per batchId (skips if already running).
 */
export async function runBatchBackgroundPipeline(opts: {
  batchId: string
  kind?: BatchProcessingJobKind
}): Promise<void> {
  const { batchId } = opts
  if (inflight.has(batchId)) return
  inflight.add(batchId)

  try {
    if (!isAIReviewEnabled()) {
      await markJob(batchId, 'failed', 'AI review is not configured')
      return
    }

    const batch = getBatchById(batchId)
    if (!batch) {
      await markJob(batchId, 'failed', 'Batch not found')
      return
    }

    let invoices = getInvoicesByBatchId(batchId)
    if (invoices.length === 0) {
      await markJob(batchId, 'running')
      const created = await createInvoicesFromHandoffDocs(batchId)
      if (!created) {
        await markJob(
          batchId,
          'failed',
          'Could not create invoices from paperwork — Credyx will follow up'
        )
        return
      }
      invoices = getInvoicesByBatchId(batchId)
    }

    const alreadyDone = invoices.every(
      (inv) =>
        inv.ai_review_status === 'ready' ||
        inv.ai_review_status === 'needs_work'
    )
    if (alreadyDone) {
      updateBatch(batchId, { sort_status: 'ready', status: 'ready_to_post' })
      await markJob(batchId, 'succeeded')
      notifyTenantDataUpdated(['batches', 'invoices'], batch.client_id)
      return
    }

    await markJob(batchId, 'running')
    updateBatch(batchId, {
      sort_status: batch.sort_status === 'ready' ? 'ready' : 'sorting',
    })

    await hydrateBatchFiles(batchId)

    for (const inv of invoices) {
      if (
        inv.ai_review_status === 'ready' ||
        inv.ai_review_status === 'needs_work'
      ) {
        continue
      }
      updateInvoice(inv.id, { ai_review_status: 'not_run' })
    }

    const outcomes = await runBatchAiReview(batchId)
    updateBatch(batchId, { sort_status: 'ready', status: 'ready_to_post' })

    try {
      await runHappyPathAfterAiReview({ batchId, outcomes })
    } catch (err) {
      console.warn('[runBatchBackgroundPipeline] happy path failed', err)
    }

    await markJob(batchId, 'succeeded')
    notifyTenantDataUpdated(['batches', 'invoices'], batch.client_id)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Background processing failed'
    console.error('[runBatchBackgroundPipeline]', batchId, message)
    updateBatch(batchId, { sort_status: 'failed' })
    await markJob(batchId, 'failed', message)
    throw err
  } finally {
    inflight.delete(batchId)
  }
}
