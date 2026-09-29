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
import {
  finishBatchLiveActivity,
  startBatchLiveActivity,
  updateBatchLiveActivity,
} from '../../utils/batchLiveActivity'
import {
  beginBackgroundPipelineAbort,
  clearBackgroundPipelineAbort,
  isBatchWorkAbortError,
  registerBackgroundInflightClear,
  throwIfBatchWorkAborted,
} from '../../utils/batchBackgroundControl'

const inflight = new Set<string>()

/** True while this browser tab is running the background pipeline for the batch. */
export function isBatchBackgroundPipelineRunning(batchId: string): boolean {
  return inflight.has(batchId)
}

/** Allow stopAllBatchBackgroundWork to clear the inflight guard. */
export function clearBackgroundPipelineInflight(batchId: string): void {
  inflight.delete(batchId)
}

registerBackgroundInflightClear(clearBackgroundPipelineInflight)

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

  const { getPdfPageCount, isPdfFile } = await import('../../utils/pdfPageExtract')
  const { isPageSplitFileName } = await import('../../utils/docSplitterExplode')
  const hasPageSplits = files.some((file) => isPageSplitFileName(file.name))
  let multiPageCount = 0
  if (!hasPageSplits) {
    for (const file of files) {
      if (!isPdfFile(file)) continue
      if ((await getPdfPageCount(file)) > 1) multiPageCount += 1
    }
  }
  // Combined uploads (or pages already split from them) skip the full DocSort
  // review. Classify → binders → read each rate con from page 1 until filled.
  if (hasPageSplits || multiPageCount > 0) {
    updateBatchLiveActivity(batchId, {
      phase: 'doc_split',
      thinking:
        'Split each combined upload into an invoice, an RC binder, and a BOL binder, then read the rate con from page 1 until the load fields are filled.',
      doing: hasPageSplits
        ? 'Building binders from split pages…'
        : `Preparing ${multiPageCount} combined upload(s)…`,
      progressPercent: 20,
      progressLabel: 'Binders',
    })
    const { runDocSplitterAutoPipeline } = await import('../../utils/docSplitterAutoPipeline')
    await markJob(batchId, 'running', 'AI splitting docs…')
    const splitResult = await runDocSplitterAutoPipeline(batchId)
    if (splitResult.aborted) return false
    if (!splitResult.ok) {
      await markJob(batchId, 'failed', splitResult.error ?? 'Doc Split pipeline failed')
      return false
    }
    notifyTenantDataUpdated(['batches', 'invoices'], batch.client_id)
    return true
  }

  updateBatchLiveActivity(batchId, {
    phase: 'doc_sort',
    thinking: 'Group uploaded PDFs into loads (RC + BOL) and build invoice packets.',
    doing: `Running DocSort on ${files.length} file(s)…`,
    progressPercent: 20,
    progressLabel: 'DocSort',
  })

  try {
    const { runBatchIntakePipeline, submitAiBatch } = await import('./batchIntakePipeline')
    const { listCombinedFingerprintIds } = await import(
      '../../products/docSort/services/docSortUnpack'
    )
    const { buildDocSortSnapshot } = await import('../../products/docSort/utils/docSortSnapshot')
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

    // Combined PDFs → background Doc Split (no UI open required).
    if (combinedIds.length > 0) {
      updateBatchLiveActivity(batchId, {
        phase: 'doc_split',
        thinking: `Found ${combinedIds.length} combined PDF(s) — need page split before packets.`,
        doing: 'Handing off to AI Doc Split…',
        progressPercent: 30,
      })
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

      const { ensureDocSplitFlags, runDocSplitterAutoPipeline } = await import(
        '../../utils/docSplitterAutoPipeline'
      )
      ensureDocSplitFlags(batchId, uniqueUnmatched, buildDocSortSnapshot(intake.sortResult, []))

      await markJob(batchId, 'running', 'AI splitting docs…')
      notifyTenantDataUpdated(['batches'], batch.client_id)

      const splitResult = await runDocSplitterAutoPipeline(batchId)
      if (splitResult.aborted) return false
      if (!splitResult.ok) {
        await markJob(
          batchId,
          'failed',
          splitResult.error ?? 'Doc Split pipeline failed'
        )
        return false
      }

      // Packets created — continue into verify path below via caller.
      notifyTenantDataUpdated(['batches', 'invoices'], batch.client_id)
      return true
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
  const signal = beginBackgroundPipelineAbort(batchId)

  const jobKind = opts.kind ?? 'sort_and_verify'
  startBatchLiveActivity(batchId, {
    jobLabel: 'Background batch pipeline',
    jobKind,
    background: true,
    phase: 'queued',
    thinking: 'Automated paperwork → packets → verify (no Doc Splitter window required).',
    doing: 'Starting background job…',
  })

  try {
    throwIfBatchWorkAborted(signal)
    if (!isAIReviewEnabled()) {
      await releaseBatchForAiPolicyBlock(
        batchId,
        { message: 'AI review is not configured (openai-proxy / OPENAI_API_KEY).' },
        { aiConfigured: false }
      )
      finishBatchLiveActivity(batchId, {
        phase: 'failed',
        thinking: 'AI is not configured.',
        doing: 'Stopped — AI unavailable',
        error: 'AI review is not configured',
      })
      return
    }

    const batch = getBatchById(batchId)
    if (!batch) {
      await markJob(batchId, 'failed', 'Batch not found')
      finishBatchLiveActivity(batchId, {
        phase: 'failed',
        thinking: 'Batch missing from store.',
        doing: 'Batch not found',
        error: 'Batch not found',
      })
      return
    }

    if (batch.status === 'rework') {
      finishBatchLiveActivity(batchId, {
        phase: 'aborted',
        thinking: 'Batch is in Packet Rework — automated processing stays off.',
        doing: 'Skipped (rework)',
      })
      return
    }

    // Doc Split in progress / needed — resume auto pipeline (no UI required).
    const { batchNeedsDocSplit } = await import('../../utils/batchDocSplit')
    const {
      batchShouldRunDocSplitPipeline,
      runDocSplitterAutoPipeline,
      isDocSplitPipelineRunning,
    } = await import('../../utils/docSplitterAutoPipeline')

    throwIfBatchWorkAborted(signal)
    if (
      batchShouldRunDocSplitPipeline(batch) ||
      batch.status === 'needs_split' ||
      batchNeedsDocSplit(batch)
    ) {
      if (isDocSplitPipelineRunning(batchId)) {
        await markJob(batchId, 'running', 'AI Doc Split already in progress…')
        updateBatchLiveActivity(batchId, {
          phase: 'doc_split',
          thinking: 'Another Doc Split run already owns this batch.',
          doing: 'Waiting — Doc Split already in progress',
        })
        return
      }
      updateBatchLiveActivity(batchId, {
        phase: 'hydrating',
        thinking: 'Reload paperwork from storage before Doc Split.',
        doing: 'Hydrating handoff files…',
        progressPercent: 10,
      })
      await hydrateHandoffFiles(batchId, batch.client_id)
      throwIfBatchWorkAborted(signal)
      if (!getBatchById(batchId)) return
      await markJob(batchId, 'running', 'AI splitting docs…')
      const splitResult = await runDocSplitterAutoPipeline(batchId, { signal })
      if (splitResult.aborted || !splitResult.ok) {
        return
      }
      notifyTenantDataUpdated(['batches', 'invoices'], batch.client_id)
    }

    // Master / per-client AI off or spend cap → Packet Rework + ops email.
    throwIfBatchWorkAborted(signal)
    if (!getBatchById(batchId)) return
    const spend = await evaluateAiSpendAllow(batch.client_id)
    if (!spend.allowed) {
      await releaseBatchForAiPolicyBlock(batchId, spend, { aiConfigured: true })
      finishBatchLiveActivity(batchId, {
        phase: 'failed',
        thinking: 'AI spend / policy blocked packet creation.',
        doing: spend.message,
        error: spend.message,
      })
      return
    }

    setOpenAiSpendContext({ clientId: batch.client_id, feature: 'review' })

    // Prefer live memory, but re-check DB before creating to avoid duplicate packets.
    throwIfBatchWorkAborted(signal)
    let invoices = getInvoicesByBatchId(batchId)
    if (invoices.length === 0) {
      await markJob(batchId, 'running')
      updateBatchLiveActivity(batchId, {
        phase: 'doc_sort',
        jobLabel: 'Background packet creation',
        thinking: 'No invoices yet — run DocSort / Doc Split to create packets.',
        doing: 'Creating invoices from uploaded docs…',
        progressPercent: 15,
      })
      throwIfBatchWorkAborted(signal)
      const created = await createInvoicesFromHandoffDocs(batchId)
      if (!created) {
        return
      }
      invoices = getInvoicesByBatchId(batchId)
    } else {
      // Invoices already exist — never append another DocSort pass.
      notifyTenantDataUpdated(['batches', 'invoices'], batch.client_id)
    }

    throwIfBatchWorkAborted(signal)
    if (!getBatchById(batchId)) return

    const alreadyDone = invoices.every(
      (inv) =>
        inv.ai_review_status === 'ready' ||
        inv.ai_review_status === 'needs_work'
    )
    if (alreadyDone) {
      updateBatch(batchId, { sort_status: 'ready', status: 'ready_to_post' })
      await markJob(batchId, 'succeeded')
      notifyTenantDataUpdated(['batches', 'invoices'], batch.client_id)
      finishBatchLiveActivity(batchId, {
        phase: 'succeeded',
        thinking: 'All invoices already reviewed.',
        doing: `Ready · ${invoices.length} packet(s)`,
      })
      return
    }

    await markJob(batchId, 'running')
    updateBatch(batchId, {
      sort_status: batch.sort_status === 'ready' ? 'ready' : 'sorting',
    })

    updateBatchLiveActivity(batchId, {
      phase: 'hydrating',
      jobLabel: 'Background AI verify',
      thinking: 'Ensure invoice PDF files are in memory for verification.',
      doing: 'Hydrating invoice documents…',
      progressPercent: 60,
    })
    await hydrateBatchFiles(batchId)
    throwIfBatchWorkAborted(signal)
    if (!getBatchById(batchId)) return

    for (const inv of invoices) {
      if (
        inv.ai_review_status === 'ready' ||
        inv.ai_review_status === 'needs_work'
      ) {
        continue
      }
      updateInvoice(inv.id, { ai_review_status: 'not_run' })
    }

    updateBatchLiveActivity(batchId, {
      phase: 'verifying',
      thinking: `Check ${invoices.length} packet(s) against DocSort extract JSON (destinations / matches).`,
      doing: 'Running AI verification…',
      progressPercent: 75,
      progressLabel: `0 / ${invoices.length}`,
    })

    // Finalize checks from DocSort extract JSON (destinations / matches already done
    // during packet creation). No second vision pass — use "Run AI review" only if extracts missing.
    const outcomes = await runBatchAiReview(batchId, undefined, { allowVision: false })
    throwIfBatchWorkAborted(signal)
    if (!getBatchById(batchId)) return
    settleBatchAiGate(batchId)
    updateBatch(batchId, { sort_status: 'ready', status: 'ready_to_post' })

    updateBatchLiveActivity(batchId, {
      phase: 'happy_path',
      thinking: 'Apply auto-approve / hold rules after verification.',
      doing: 'Running happy path…',
      progressPercent: 90,
    })
    try {
      await runHappyPathAfterAiReview({ batchId, outcomes })
    } catch (err) {
      console.warn('[runBatchBackgroundPipeline] happy path failed', err)
    }

    await markJob(batchId, 'succeeded')
    notifyTenantDataUpdated(['batches', 'invoices'], batch.client_id)
    finishBatchLiveActivity(batchId, {
      phase: 'succeeded',
      thinking: 'Background pipeline finished.',
      doing: `Verified ${invoices.length} packet(s)`,
    })
  } catch (err) {
    if (isBatchWorkAbortError(err)) {
      finishBatchLiveActivity(batchId, {
        phase: 'aborted',
        thinking: 'Background pipeline cancelled.',
        doing: 'Aborted',
        error: 'aborted',
      })
      return
    }
    const message = err instanceof Error ? err.message : 'Background processing failed'
    console.error('[runBatchBackgroundPipeline]', batchId, message)
    settleBatchAiGate(batchId)
    await markBatchNeedsRework(batchId, message)
  } finally {
    setOpenAiSpendContext(null)
    clearBackgroundPipelineAbort(batchId)
    inflight.delete(batchId)
  }
}
