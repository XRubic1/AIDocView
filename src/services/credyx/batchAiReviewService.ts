import { getBatchFiles } from '../../data/batchFileStore'
import {
  clearInvoiceAiReviewCache,
  setInvoiceAiReviewCache,
} from '../../data/invoiceAiReviewCache'
import { getBatchById, updateBatch } from '../../data/mockBatches'
import { getInvoiceById, getInvoicesByBatchId, updateInvoice } from '../../data/mockInvoices'
import { isSupabaseConfigured, getSupabase } from '../../lib/supabase'
import { notifyTenantDataUpdated } from '../supabase/tenantDataLiveSync'
import {
  assembleBatchReviewFromDocuments,
  reviewUploadedDocuments,
} from '../documentReviewService'
import { parseFingerprintCatalog } from '../../products/docSort/utils/docSortSnapshot'
import { packetReviewsFromCatalog } from '../../utils/packetCatalogReview'
import { buildInvoiceAiReviewSnapshot } from '../../utils/buildInvoiceAiReviewSnapshot'
import { buildStructuredLoadReview, getApprovalGateMessage } from '../../utils/loadReviewSummary'
import { applyFailClosedApprovalGate } from '../../utils/failClosedApprovalGate'
import {
  carrierMismatchHoldReason,
  isCarrierMismatchIssue,
} from '../../utils/packetOnFileReview'
import { invoiceAiReviewSnapshotFor } from '../../utils/invoiceAiReviewSnapshot'
import { isAIReviewEnabled } from '../../config/aiReview'
import { flagInvoiceForReview } from '../adminInvoiceActions'
import { evaluateAiSpendAllow } from '../aiSpendService'
import { setOpenAiSpendContext } from '../../utils/openaiAuthContext'
import type { BatchDocumentReviewResult, DocumentReviewResult } from '../../types/documentReview'
import type { InvoiceAiReviewSnapshot } from '../../types/invoiceAiReview'
import type { Invoice } from '../../types/invoice'
import type { Batch } from '../../data/mockBatches'
import { CHECK_LABELS } from '../../utils/reviewMessages'

export interface InvoiceAiReviewOutcome {
  invoiceId: string
  invoiceNumber: string
  status: 'ready' | 'needs_work'
  headline: string
  detail: string
  result?: BatchDocumentReviewResult
}

/** Live paperwork fields while a packet is being re-checked. */
export type AiReviewLiveExtract = {
  loadNumber?: string
  amount?: number
  brokerName?: string
  brokerDomain?: string
  carrierName?: string
  pickup?: string
  destinations?: string
}

/** Live check row while AI review is in flight. */
export type AiReviewLiveCheck = {
  id: string
  label: string
  status: 'pending' | 'ok' | 'issue' | 'warning' | 'missing'
}

export interface BatchAiReviewProgress {
  completed: number
  total: number
  currentInvoiceId?: string
  currentInvoiceNumber?: string
  /** 0–100 how far this invoice's review has gone. Overlay fill is 100 − this. */
  invoiceProgress?: number
  phase?: 'starting' | 'extracting' | 'checking' | 'done'
  liveExtract?: AiReviewLiveExtract | null
  liveChecks?: AiReviewLiveCheck[] | null
}

export type BatchAiReviewOptions = {
  /**
   * When false (default for automated pipelines), never re-scan paperwork —
   * reuse DocSort extract JSON only. Manual "Run AI review" can pass true.
   */
  allowVision?: boolean
  /** Only review these invoice ids (others are ignored). */
  invoiceIds?: string[]
  /** Re-run even when status is already ready / needs_work. */
  force?: boolean
  /**
   * Skip DocSort extract JSON and re-read paperwork with vision.
   * Used by "Rerun AI check" so the admin always gets a fresh scan.
   */
  forceVision?: boolean
}

function minimalReviewSnapshot(
  headline: string,
  detail: string,
  issues: string[]
): InvoiceAiReviewSnapshot {
  return {
    headline,
    detail,
    ready: false,
    passCount: 0,
    requiredTotal: 0,
    requiredAll: [],
    requiredFailed: [],
    requiredPassed: [],
    additional: [],
    issues,
    warnings: [],
  }
}

/** Paperwork doc ids on an invoice (excludes generated invoice PDF). */
function paperworkDocIds(inv: Invoice): string[] {
  const fromIds = (inv.document_doc_ids ?? []).filter((id) => !id.startsWith('invoice-pdf-'))
  const fromPaths = Object.keys(inv.document_storage_paths ?? {}).filter(
    (id) => !id.startsWith('invoice-pdf-')
  )
  return [...new Set([...fromIds, ...fromPaths])]
}

/** Prefer packet fingerprint kinds when vision under-classifies sibling BOL images. */
function applyPacketKindHints(
  result: BatchDocumentReviewResult,
  catalog: ReturnType<typeof parseFingerprintCatalog>
): BatchDocumentReviewResult {
  for (const doc of result.documents) {
    const saved = catalog.get(doc.documentId)
    if (!saved?.kind) continue
    if (saved.kind === 'bill_of_lading' && doc.extraction.documentType !== 'bill_of_lading') {
      doc.extraction.documentType = 'bill_of_lading'
    }
    if (
      saved.kind === 'rate_confirmation' &&
      doc.extraction.documentType !== 'rate_confirmation'
    ) {
      doc.extraction.documentType = 'rate_confirmation'
    }
  }
  return result
}

/** Rebuild review results from DocSort snapshot extracts (no vision). */
function reviewsFromCatalog(
  inv: Invoice,
  catalog: ReturnType<typeof parseFingerprintCatalog>
): DocumentReviewResult[] | null {
  return packetReviewsFromCatalog(paperworkDocIds(inv), catalog)
}

/**
 * The rate con every check is scored from. Chosen by document type, not filename —
 * a loose /rc/ filename match picked BOLs named "ARCBEST…" or "March…".
 */
function pickPrimaryDoc(result: BatchDocumentReviewResult): DocumentReviewResult | undefined {
  return (
    result.documents.find((d) => d.extraction.documentType === 'rate_confirmation') ??
    result.documents.find((d) => /rate[\s_-]*con|confirmation|\.RC\./i.test(d.fileName)) ??
    result.documents[0]
  )
}

/**
 * 6/6 required checks plus the fail-closed invariants (unaudited delivery pages,
 * unclear receiver signature, low-confidence pages, cost-cap truncation).
 * The invariants used to be computed and then ignored for packet status.
 */
function packetApprovalGate(
  result: BatchDocumentReviewResult,
  structured: ReturnType<typeof buildStructuredLoadReview>
): { ready: boolean; detail: string } {
  const gate = getApprovalGateMessage(structured.requiredPassed.length, structured.requiredTotal)
  if (!gate.ready) return gate
  const failClosed = applyFailClosedApprovalGate({
    reviewDocuments: result.documents,
    proposedOverall: 'APPROVED',
  })
  if (failClosed.overall === 'APPROVED') return gate
  return {
    ready: false,
    detail: failClosed.invariantFailures.join('; ') || 'Fail-closed review gate blocked approval.',
  }
}

/** Score a packet from the saved rate-con extract. No model call. */
export function scoreInvoiceFromSavedExtracts(inv: Invoice): InvoiceAiReviewSnapshot | null {
  const batch = inv.batch_id ? getBatchById(inv.batch_id) : undefined
  if (!batch) return null
  const catalog = parseFingerprintCatalog(batch.doc_sort_snapshot)
  const fromExtracts = reviewsFromCatalog(inv, catalog)
  if (!fromExtracts) return null
  const result = applyPacketKindHints(
    assembleBatchReviewFromDocuments(fromExtracts, { singlePacket: true }),
    catalog
  )
  const primaryDoc = pickPrimaryDoc(result)
  if (!primaryDoc) return null
  const structured = buildStructuredLoadReview(primaryDoc, result, {
    packet: {
      loadNumber: inv.load_number,
      amount: inv.amount,
      brokerName: inv.broker_name,
      carrierName: inv.client_name,
    },
  })
  const gate = packetApprovalGate(result, structured)
  return buildInvoiceAiReviewSnapshot(
    primaryDoc,
    result,
    structured,
    gate.ready ? 'Good to go' : 'Needs additional work',
    gate.detail,
    gate.ready
  )
}

const PENDING_CHECK_DEFS: AiReviewLiveCheck[] = [
  { id: 'req_load', label: CHECK_LABELS.loadNumber, status: 'pending' },
  { id: 'req_broker', label: CHECK_LABELS.broker, status: 'pending' },
  { id: 'req_amount', label: CHECK_LABELS.amount, status: 'pending' },
  { id: 'req_bol', label: CHECK_LABELS.bol, status: 'pending' },
  { id: 'req_multi_stop', label: CHECK_LABELS.multiStop, status: 'pending' },
  { id: 'req_carrier', label: CHECK_LABELS.carrier, status: 'pending' },
]

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

type ProgressEmitter = (patch: Partial<BatchAiReviewProgress> & { invoiceProgress?: number }) => void

/** Stream extract fields then checks so the UI can fill row-by-row. */
async function emitLiveReviewPreview(
  emit: ProgressEmitter,
  paperwork: AiReviewLiveExtract | undefined,
  checks: AiReviewLiveCheck[]
): Promise<void> {
  emit({
    phase: 'extracting',
    invoiceProgress: 55,
    liveExtract: {},
    liveChecks: PENDING_CHECK_DEFS.map((c) => ({ ...c })),
  })
  await sleep(60)

  const extract: AiReviewLiveExtract = {}
  const fieldOrder: Array<keyof AiReviewLiveExtract> = [
    'loadNumber',
    'amount',
    'brokerName',
    'brokerDomain',
    'carrierName',
    'pickup',
    'destinations',
  ]
  let step = 0
  for (const key of fieldOrder) {
    const value = paperwork?.[key]
    if (value == null || value === '') continue
    ;(extract as Record<string, unknown>)[key] = value
    step += 1
    emit({
      phase: 'extracting',
      invoiceProgress: Math.min(75, 55 + step * 4),
      liveExtract: { ...extract },
      liveChecks: PENDING_CHECK_DEFS.map((c) => ({ ...c })),
    })
    await sleep(70)
  }

  emit({
    phase: 'checking',
    invoiceProgress: 80,
    liveExtract: { ...extract },
    liveChecks: PENDING_CHECK_DEFS.map((c) => ({ ...c })),
  })
  await sleep(50)

  const liveChecks = PENDING_CHECK_DEFS.map((c) => ({ ...c }))
  for (let i = 0; i < checks.length; i++) {
    liveChecks[i] = { ...checks[i] }
    emit({
      phase: 'checking',
      invoiceProgress: Math.min(95, 80 + Math.round(((i + 1) / Math.max(1, checks.length)) * 15)),
      liveExtract: { ...extract },
      liveChecks: liveChecks.map((c) => ({ ...c })),
    })
    await sleep(55)
  }
}

async function finalizeInvoiceReview(
  inv: Invoice,
  result: BatchDocumentReviewResult,
  emit: ProgressEmitter,
  outcomes: InvoiceAiReviewOutcome[]
): Promise<void> {
  const primaryDoc = pickPrimaryDoc(result)
  if (!primaryDoc) {
    const headline = 'Needs additional work'
    const detail = 'No review results returned'
    const snapshot = minimalReviewSnapshot(headline, detail, [detail])
    setInvoiceAiReviewCache(inv.id, { snapshot, batchResult: result })
    updateInvoice(inv.id, {
      ai_review_status: 'needs_work',
      ai_review_summary: headline,
      ai_review_snapshot: JSON.stringify(snapshot),
    })
    outcomes.push({
      invoiceId: inv.id,
      invoiceNumber: inv.invoice_number,
      status: 'needs_work',
      headline,
      detail,
      result,
    })
    emit({ invoiceProgress: 100, phase: 'done' })
    return
  }

  const structured = buildStructuredLoadReview(primaryDoc, result, {
    packet: {
      loadNumber: inv.load_number,
      amount: inv.amount,
      brokerName: inv.broker_name,
      carrierName: inv.client_name,
    },
  })
  const gate = packetApprovalGate(result, structured)
  const status = gate.ready ? 'ready' : 'needs_work'
  const headline = gate.ready ? 'Good to go' : 'Needs additional work'
  const snapshot = buildInvoiceAiReviewSnapshot(
    primaryDoc,
    result,
    structured,
    headline,
    gate.detail,
    gate.ready
  )

  const liveChecks: AiReviewLiveCheck[] = (snapshot.requiredAll ?? []).map((row) => ({
    id: row.id,
    label: row.label,
    status:
      row.status === 'ok'
        ? 'ok'
        : row.status === 'warning'
          ? 'warning'
          : row.status === 'missing'
            ? 'missing'
            : 'issue',
  }))

  await emitLiveReviewPreview(emit, snapshot.paperwork, liveChecks)

  setInvoiceAiReviewCache(inv.id, {
    snapshot,
    primaryDoc,
    batchResult: result,
  })
  updateInvoice(inv.id, {
    ai_review_status: status,
    ai_review_summary: headline,
    ai_review_snapshot: JSON.stringify(snapshot),
  })

  // AI issues → Review (not Hold) so carriers aren't told the load is on hold.
  if (!gate.ready || isCarrierMismatchIssue(snapshot)) {
    const reason = isCarrierMismatchIssue(snapshot)
      ? carrierMismatchHoldReason(inv.client_name, snapshot.paperwork?.carrierName)
      : headline || 'Needs additional work'
    flagInvoiceForReview(inv.id, reason, 'AI review')
  } else {
    // AI cleared — drop Review back to pending (human still taps OK to approve).
    const latest = getInvoiceById(inv.id) ?? inv
    if (latest.status === 'review') {
      updateInvoice(latest.id, { status: 'pending' })
    }
  }

  outcomes.push({
    invoiceId: inv.id,
    invoiceNumber: inv.invoice_number,
    status,
    headline,
    detail: gate.detail,
    result,
  })
  emit({
    invoiceProgress: 100,
    phase: 'done',
    liveExtract: snapshot.paperwork ?? null,
    liveChecks,
  })
}

/**
 * Clear invoices left mid-review (`running`) so Packet rework / progress can settle.
 * Restores status from an existing snapshot when available.
 */
export function settleStuckInvoiceReviews(batchId: string): number {
  let settled = 0
  for (const inv of getInvoicesByBatchId(batchId)) {
    if (inv.ai_review_status !== 'running') continue
    const snap = invoiceAiReviewSnapshotFor(inv)
    if (snap) {
      updateInvoice(inv.id, {
        ai_review_status: snap.ready ? 'ready' : 'needs_work',
        ai_review_summary: snap.headline || inv.ai_review_summary || 'Needs additional work',
        ai_review_snapshot: inv.ai_review_snapshot || JSON.stringify(snap),
      })
    } else {
      const headline = 'Needs additional work'
      const detail = 'Review interrupted — open Run AI review to finish this packet.'
      const snapshot = minimalReviewSnapshot(headline, detail, [detail])
      updateInvoice(inv.id, {
        ai_review_status: 'needs_work',
        ai_review_summary: headline,
        ai_review_snapshot: JSON.stringify(snapshot),
      })
    }
    settled += 1
  }
  return settled
}

/** Flag carrier-mismatch / AI-issue invoices as Review (never Hold). */
export function applyCarrierMismatchReviewForBatch(batchId: string): number {
  let flagged = 0
  for (const inv of getInvoicesByBatchId(batchId)) {
    const snap = invoiceAiReviewSnapshotFor(inv)
    if (!isCarrierMismatchIssue(snap) && inv.ai_review_status !== 'needs_work') continue
    const latest = getInvoiceById(inv.id) ?? inv
    if (latest.status === 'approved' || latest.status === 'hold' || latest.status === 'review') {
      continue
    }
    const reason = isCarrierMismatchIssue(snap)
      ? carrierMismatchHoldReason(latest.client_name, snap?.paperwork?.carrierName)
      : latest.ai_review_summary || 'Needs additional work'
    if (flagInvoiceForReview(latest.id, reason, 'AI review')) flagged += 1
  }
  return flagged
}

/** @deprecated Use applyCarrierMismatchReviewForBatch — AI no longer places holds. */
export function applyCarrierMismatchHoldsForBatch(batchId: string): number {
  return applyCarrierMismatchReviewForBatch(batchId)
}

/** Best-effort: mark the processing job succeeded when local review is finished. */
async function markJobSucceededIfNeeded(batchId: string): Promise<void> {
  if (!isSupabaseConfigured()) return
  const supabase = getSupabase()
  if (!supabase) return
  try {
    const { error } = await supabase.rpc('mark_batch_processing_job', {
      p_batch_id: batchId,
      p_status: 'succeeded',
      p_last_error: null,
      p_locked_by: 'settle-batch-ai-gate',
    })
    if (error) console.warn('[markJobSucceededIfNeeded]', error.message)
  } catch (err) {
    console.warn('[markJobSucceededIfNeeded]', err)
  }
}

/**
 * Unstick a batch after interrupted AI: clear `running`, flag Review for AI issues,
 * and heal stuck `sorting` / `creating` once invoices exist.
 * Call from Packets gate, admin/client poll, and review finally blocks.
 */
export function settleBatchAiGate(batchId: string): {
  settled: number
  held: number
  healedSort: boolean
} {
  const settled = settleStuckInvoiceReviews(batchId)
  const held = applyCarrierMismatchReviewForBatch(batchId)

  const invoices = getInvoicesByBatchId(batchId)
  const anyRunning = invoices.some((inv) => inv.ai_review_status === 'running')
  let healedSort = false

  if (invoices.length > 0 && !anyRunning) {
    const batch = getBatchById(batchId)
    if (batch) {
      const patch: Partial<Pick<Batch, 'sort_status' | 'status'>> = {}
      if (batch.sort_status === 'sorting') patch.sort_status = 'ready'
      if (batch.status === 'creating') patch.status = 'ready_to_post'
      if (Object.keys(patch).length > 0) {
        updateBatch(batchId, patch)
        healedSort = true
        notifyTenantDataUpdated(['batches', 'invoices'], batch.client_id)
      }
    }
    // Clear stale pending/running jobs only when we actually healed local state.
    if (healedSort || settled > 0 || held > 0) {
      void markJobSucceededIfNeeded(batchId)
    }
  }

  return { settled, held, healedSort }
}

/**
 * Per-invoice AI review for a batch.
 * Prefers DocSort extract JSON so packet creation is the only vision pass.
 */
export async function runBatchAiReview(
  batchId: string,
  onProgress?: (p: BatchAiReviewProgress) => void,
  options: BatchAiReviewOptions = {}
): Promise<InvoiceAiReviewOutcome[]> {
  const allowVision = options.allowVision === true
  const force = options.force === true
  const forceVision = options.forceVision === true

  if (!isAIReviewEnabled()) {
    throw new Error(
      'AI review requires Supabase configuration. Deploy the openai-proxy Edge Function with OPENAI_API_KEY.'
    )
  }

  const batch = getBatchById(batchId)
  if (batch?.client_id) {
    const spend = await evaluateAiSpendAllow(batch.client_id)
    if (!spend.allowed) {
      throw new Error(spend.message)
    }
    setOpenAiSpendContext({ clientId: batch.client_id, feature: 'review' })
  }

  const allInvoices = getInvoicesByBatchId(batchId)
  const targetIds =
    options.invoiceIds && options.invoiceIds.length > 0
      ? new Set(options.invoiceIds)
      : null
  const invoices = targetIds
    ? allInvoices.filter((inv) => targetIds.has(inv.id))
    : allInvoices

  if (invoices.length === 0) {
    onProgress?.({ completed: 0, total: 0 })
    return []
  }

  const fileMap = getBatchFiles(batchId)
  const catalog = parseFingerprintCatalog(getBatchById(batchId)?.doc_sort_snapshot)
  const outcomes: InvoiceAiReviewOutcome[] = []

  try {
    for (let i = 0; i < invoices.length; i++) {
      // Always read the live store row — concurrent reviews may have finished this packet.
      const inv = getInvoiceById(invoices[i].id) ?? invoices[i]
      const docProgress = new Map<string, number>()
      const emit: ProgressEmitter = (patch) => {
        onProgress?.({
          completed: i,
          total: invoices.length,
          currentInvoiceId: inv.id,
          currentInvoiceNumber: inv.invoice_number,
          invoiceProgress: Math.max(
            0,
            Math.min(100, Math.round(patch.invoiceProgress ?? 0))
          ),
          phase: patch.phase,
          liveExtract: patch.liveExtract,
          liveChecks: patch.liveChecks,
        })
      }

      emit({
        invoiceProgress: 0,
        phase: 'starting',
        liveExtract: {},
        liveChecks: PENDING_CHECK_DEFS.map((c) => ({ ...c })),
      })

      const liveStatus = getInvoiceById(inv.id)?.ai_review_status ?? inv.ai_review_status
      const finished = liveStatus === 'ready' || liveStatus === 'needs_work'

      // Skip finished packets unless this is an explicit re-run.
      if (finished && !force) {
        outcomes.push({
          invoiceId: inv.id,
          invoiceNumber: inv.invoice_number,
          status: liveStatus,
          headline:
            inv.ai_review_summary ||
            (liveStatus === 'ready' ? 'Good to go' : 'Needs additional work'),
          detail: inv.ai_review_summary || '',
        })
        emit({ invoiceProgress: 100, phase: 'done' })
        continue
      }

      if (force) {
        clearInvoiceAiReviewCache(inv.id)
      }

      updateInvoice(inv.id, { ai_review_status: 'running' })

      try {
        // Rerun AI check always re-reads docs; otherwise prefer DocSort JSON.
        const fromExtracts = forceVision ? null : reviewsFromCatalog(inv, catalog)
        if (fromExtracts) {
          emit({ invoiceProgress: 40, phase: 'extracting' })
          const result = applyPacketKindHints(
            assembleBatchReviewFromDocuments(fromExtracts, { singlePacket: true }),
            catalog
          )
          await finalizeInvoiceReview(inv, result, emit, outcomes)
          continue
        }

        if (!allowVision && !forceVision) {
          const headline = 'Needs additional work'
          const detail =
            'DocSort extracts incomplete for this packet — open Run AI review to scan paperwork.'
          const snapshot = minimalReviewSnapshot(headline, detail, [detail])
          updateInvoice(inv.id, {
            ai_review_status: 'needs_work',
            ai_review_summary: headline,
            ai_review_snapshot: JSON.stringify(snapshot),
          })
          outcomes.push({
            invoiceId: inv.id,
            invoiceNumber: inv.invoice_number,
            status: 'needs_work',
            headline,
            detail,
          })
          emit({ invoiceProgress: 100, phase: 'done' })
          continue
        }

        const docIds = paperworkDocIds(inv)
        const docs = docIds
          .map((docId) => {
            const file = fileMap.get(docId)
            if (!file) return null
            return { id: docId, name: file.name, file }
          })
          .filter((d): d is { id: string; name: string; file: File } => d !== null)

        const invoicePdfId = `invoice-pdf-${inv.doc_sort_group_id}`
        const invPdf = inv.doc_sort_group_id ? fileMap.get(invoicePdfId) : undefined
        if (invPdf) {
          docs.push({
            id: invoicePdfId,
            name: invPdf.name,
            file: invPdf,
          })
        }

        if (docs.length === 0) {
          const headline = 'Needs additional work'
          const detail = 'No documents on file for AI review'
          const snapshot = minimalReviewSnapshot(headline, detail, [detail])
          updateInvoice(inv.id, {
            ai_review_status: 'needs_work',
            ai_review_summary: headline,
            ai_review_snapshot: JSON.stringify(snapshot),
          })
          outcomes.push({
            invoiceId: inv.id,
            invoiceNumber: inv.invoice_number,
            status: 'needs_work',
            headline,
            detail,
          })
          emit({ invoiceProgress: 100, phase: 'done' })
          continue
        }

        emit({ invoiceProgress: 15, phase: 'extracting' })
        const reviewed = await reviewUploadedDocuments(docs, {
          singlePacket: true,
          onDocumentProgress: (event) => {
            docProgress.set(event.docId, event.progress)
            const totalDocs = Math.max(1, docs.length)
            let sum = 0
            for (const doc of docs) {
              sum += docProgress.get(doc.id) ?? 0
            }
            emit({
              invoiceProgress: Math.min(50, (sum / totalDocs) * 0.5),
              phase: 'extracting',
            })
          },
        })
        const result = applyPacketKindHints(reviewed, catalog)
        await finalizeInvoiceReview(inv, result, emit, outcomes)
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Review failed'
        const snapshot = minimalReviewSnapshot('Review failed', msg, [msg])
        updateInvoice(inv.id, {
          ai_review_status: 'needs_work',
          ai_review_summary: msg,
          ai_review_snapshot: JSON.stringify(snapshot),
        })
        outcomes.push({
          invoiceId: inv.id,
          invoiceNumber: inv.invoice_number,
          status: 'needs_work',
          headline: 'Review failed',
          detail: msg,
        })
        emit({ invoiceProgress: 100, phase: 'done' })
      }
    }

    onProgress?.({ completed: invoices.length, total: invoices.length, phase: 'done' })
    return outcomes
  } finally {
    // Never leave packets stuck in `running` — that blocks Packet rework + ETA.
    settleBatchAiGate(batchId)
    setOpenAiSpendContext({ feature: null })
  }
}

/** Force re-check a single invoice by re-reading paperwork (not DocSort JSON). */
export async function rerunInvoiceAiReview(
  batchId: string,
  invoiceId: string,
  onProgress?: (p: BatchAiReviewProgress) => void,
  options: Omit<BatchAiReviewOptions, 'invoiceIds' | 'force' | 'forceVision'> = {}
): Promise<InvoiceAiReviewOutcome[]> {
  return runBatchAiReview(batchId, onProgress, {
    ...options,
    allowVision: true,
    forceVision: true,
    invoiceIds: [invoiceId],
    force: true,
  })
}
