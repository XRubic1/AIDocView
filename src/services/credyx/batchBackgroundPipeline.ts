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
import { runBatchAiReview, settleBatchAiGate } from './batchAiReviewService'
import { runHappyPathAfterAiReview } from './batchHappyPath'
import type { BatchProcessingJobKind } from './batchProcessingJobs'
import { listHandoffDocumentMeta } from '../../utils/resolveHandoffDocuments'
import { notifyTenantDataUpdated } from '../supabase/tenantDataLiveSync'
import { evaluateAiSpendAllow } from '../aiSpendService'
import { setOpenAiSpendContext } from '../../utils/openaiAuthContext'
import { markBatchNeedsRework, releaseBatchForAiPolicyBlock } from '../batchReworkService'

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

  // Doc Splitter queue — Credyx must split combined PDFs first.
  const { batchNeedsDocSplit } = await import('../../utils/batchDocSplit')
  if (batch.status === 'needs_split' || batchNeedsDocSplit(batch)) {
    await markJob(
      batchId,
      'succeeded',
      'Waiting on Doc Splitter — combined PDFs must be split before packets.'
    )
    return false
  }

  // Already have packets in memory — never create a second set.
  const localExisting = getInvoicesByBatchId(batchId)
  if (localExisting.length > 0) {
    return true
  }

  // Memory empty after refresh, but DB may already have invoices for this batch.
  if (isSupabaseConfigured()) {
    try {
      const supabase = getSupabase()
      if (supabase) {
        const { data, error } = await supabase
          .from('invoices')
          .select('*')
          .eq('batch_id', batchId)
        if (!error && data && data.length > 0) {
          const { invoiceRowToInvoice } = await import('../supabase/tenantMappers')
          const { mergeInvoice } = await import('../../data/mockInvoices')
          for (const row of data) {
            mergeInvoice(invoiceRowToInvoice(row as Parameters<typeof invoiceRowToInvoice>[0]))
          }
          notifyTenantDataUpdated(['batches', 'invoices'], batch.client_id)
          return true
        }
      }
    } catch (err) {
      console.warn('[createInvoicesFromHandoffDocs] db invoice check failed', err)
    }
  }

  const files = await hydrateHandoffFiles(batchId, batch.client_id)
  if (files.length === 0) {
    await markBatchNeedsRework(
      batchId,
      'No paperwork files found in storage or memory for DocSort. Credyx can upload/assign docs in rework, then retry packet creation.'
    )
    return false
  }

  updateBatch(batchId, { status: 'creating', sort_status: 'sorting' })
  notifyTenantDataUpdated(['batches'], batch.client_id)

  try {
    const { runBatchIntakePipeline, submitAiBatch } = await import('./batchIntakePipeline')
    const { listCombinedFingerprintIds } = await import(
      '../../products/docSort/services/docSortUnpack'
    )
    const { buildDocSortSnapshot } = await import('../../products/docSort/utils/docSortSnapshot')
    const { markBatchNeedsDocSplit } = await import('../../utils/batchDocSplit')
    const { fingerprintDocIds } = await import('../../integrations/docSortToCredyx')

    const intake = await runBatchIntakePipeline(files, batch.client_id)

    const allFps = [
      ...intake.sortResult.groups.flatMap((g) => [
        ...g.rateCons,
        ...g.bols,
        ...(g.others ?? []),
      ]),
      ...intake.sortResult.unmatchedRateCons,
      ...intake.sortResult.unmatchedBols,
      ...intake.sortResult.otherDocuments,
    ]
    const combinedIds = listCombinedFingerprintIds(allFps, intake.fileById)

    // Combined PDFs → Doc Splitter first (no packets from invoice page #s).
    if (combinedIds.length > 0) {
      const unmatchedIds = [
        ...fingerprintDocIds(intake.sortResult.unmatchedRateCons),
        ...fingerprintDocIds(intake.sortResult.unmatchedBols),
        ...fingerprintDocIds(intake.sortResult.otherDocuments),
        ...intake.sortResult.groups.flatMap((g) => [
          ...fingerprintDocIds(g.rateCons),
          ...fingerprintDocIds(g.bols),
          ...fingerprintDocIds(g.others ?? []),
        ]),
        ...combinedIds,
      ]
      const uniqueUnmatched = [...new Set(unmatchedIds)]

      const { setBatchFiles } = await import('../../data/batchFileStore')
      setBatchFiles(batchId, intake.fileById)

      markBatchNeedsDocSplit(batchId, {
        unmatchedDocIds: uniqueUnmatched,
        snapshot: buildDocSortSnapshot(intake.sortResult, []),
      })
      // succeeded (not failed): failed jobs are revived by enqueue and re-run DocSort.
      await markJob(
        batchId,
        'succeeded',
        `Combined PDFs detected (${combinedIds.length}). Open Doc Splitter before Packet Rework.`
      )
      notifyTenantDataUpdated(['batches'], batch.client_id)
      return false
    }

    if (intake.invoices.length === 0) {
      await markBatchNeedsRework(
        batchId,
        'DocSort finished but produced 0 invoice packets. Documents are still on the batch — create packets manually or retry AI.'
      )
      return false
    }

    // Another tab may have finished while we were sorting — never append duplicates.
    if (getInvoicesByBatchId(batchId).length > 0) {
      notifyTenantDataUpdated(['batches', 'invoices'], batch.client_id)
      return true
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
  } catch (err) {
    const message = err instanceof Error ? err.message : 'DocSort / packet creation failed'
    await markBatchNeedsRework(batchId, message)
    return false
  }
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
      await releaseBatchForAiPolicyBlock(
        batchId,
        { message: 'AI review is not configured (openai-proxy / OPENAI_API_KEY).' },
        { aiConfigured: false }
      )
      return
    }

    const batch = getBatchById(batchId)
    if (!batch) {
      await markJob(batchId, 'failed', 'Batch not found')
      return
    }

    // Waiting on Credyx Doc Splitter — do not retry DocSort / packet creation.
    const { batchNeedsDocSplit } = await import('../../utils/batchDocSplit')
    if (batch.status === 'needs_split' || batchNeedsDocSplit(batch)) {
      await markJob(
        batchId,
        'succeeded',
        'Waiting on Doc Splitter — combined PDFs must be split before packets.'
      )
      return
    }

    // Master / per-client AI off or spend cap → Packet Rework + ops email.
    const spend = await evaluateAiSpendAllow(batch.client_id)
    if (!spend.allowed) {
      await releaseBatchForAiPolicyBlock(batchId, spend, { aiConfigured: true })
      return
    }

    setOpenAiSpendContext({ clientId: batch.client_id, feature: 'review' })

    // Prefer live memory, but re-check DB before creating to avoid duplicate packets.
    let invoices = getInvoicesByBatchId(batchId)
    if (invoices.length === 0) {
      await markJob(batchId, 'running')
      const created = await createInvoicesFromHandoffDocs(batchId)
      if (!created) {
        // createInvoicesFromHandoffDocs already moved the batch to rework.
        return
      }
      invoices = getInvoicesByBatchId(batchId)
    } else {
      // Invoices already exist — never append another DocSort pass.
      notifyTenantDataUpdated(['batches', 'invoices'], batch.client_id)
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

    // Finalize checks from DocSort extract JSON (destinations / matches already done
    // during packet creation). No second vision pass — use "Run AI review" only if extracts missing.
    const outcomes = await runBatchAiReview(batchId, undefined, { allowVision: false })
    settleBatchAiGate(batchId)
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
    settleBatchAiGate(batchId)
    await markBatchNeedsRework(batchId, message)
  } finally {
    setOpenAiSpendContext(null)
    inflight.delete(batchId)
  }
}
