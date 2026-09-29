/**
 * Background Doc Split → classify (skip INV extract) → RC/BOL match → packets.
 * Runs in-browser like packet creation; Doc Splitter UI is optional for review/override.
 */
import { getBatchById, updateBatch } from '../data/mockBatches'
import { getInvoicesByBatchId } from '../data/mockInvoices'
import { setBatchFiles } from '../data/batchFileStore'
import { notifyTenantDataUpdated } from '../services/supabase/tenantDataLiveSync'
import { hydrateIntakeDraftFromBatch } from './buildIntakeDraftFromBatch'
import {
  clearBatchNeedsDocSplit,
  markBatchNeedsDocSplit,
} from './batchDocSplit'
import { logBatchDocAction } from './batchDocActionLog'
import {
  placeUnmatchedFingerprint,
} from './aiDraftDocOps'
import {
  explodeMultiPagePdfs,
  ensureDocsInUnmatchedPool,
  listAllSupportingFingerprints,
  markCategoryForKind,
  shouldExtractForDocSplitPackets,
  isInvoiceExcludedFromDocSplitPackets,
} from './docSplitterExplode'
import {
  classifyDocSplitterPage,
  fingerprintDocSortFile,
} from '../products/docSort/services/docSortVision'
import { fingerprintFromExtraction } from '../products/docSort/utils/docExtractJson'
import { extractRateConBinderFile } from '../services/documentReviewService'
import { parseFingerprintCatalog } from '../products/docSort/utils/docSortSnapshot'
import { persistPageSplitFilesToStorage, persistSourceBinderFilesToStorage } from './resolvePageSplitFile'
import { collapsePageSplitsIntoBinders } from './collapsePagesToBinders'
import {
  isSourceBinderFileName,
  packetsFromSameUploadPages,
  parseUploadPageFileName,
  partitionSourceBinders,
  sameUploadPacketDocIds,
} from '../../supabase/functions/_shared/sourceDocBinders'
import { matchSortedDocuments } from '../products/docSort/services/docSortMatcher'
import { invoiceDraftGroupsFromSort } from '../products/docSort/utils/invoiceDraftGroups'
import { primaryLoadLabel } from '../products/docSort/utils/matchKeys'
import { getSupabase, isSupabaseConfigured } from '../lib/supabase'
import { buildDocSortSnapshot } from '../products/docSort/utils/docSortSnapshot'
import { buildCredyxDraftFromGroup, fingerprintDocIds } from '../integrations/docSortToCredyx'
import { DocScanRateLimiter } from './docScanRateLimiter'
import {
  getDocSortStartIntervalMs,
  getEffectiveDocSortParallel,
} from './aiReviewUserSettings'
import { isAiReviewConfigured } from './aiConfigured'
import { setOpenAiSpendContext } from './openaiAuthContext'
import type { CredyxInvoiceDraft, BatchIntakeDraft } from '../types/credyxBatch'
import type { DocSortFingerprint, DocSortKind, DocSortResult } from '../products/docSort/types'
import {
  emailCredyxDocSplitReady,
} from '../services/credyx/batchLifecycleEmails'
import {
  finishBatchLiveActivity,
  startBatchLiveActivity,
  updateBatchLiveActivity,
} from './batchLiveActivity'
import {
  clearAiDocSplitLock,
  setAiDocSplitLock,
} from '../services/resourceLockService'

/** In-flight abort controllers so Credyx Override can cancel the pipeline. */
const abortByBatch = new Map<string, AbortController>()

/** True while a background Doc Split pipeline is registered for this batch. */
export function isDocSplitPipelineRunning(batchId: string): boolean {
  return abortByBatch.has(batchId)
}

/** Abort a running Doc Split pipeline (Override). Returns true if something was aborted. */
export function abortDocSplitPipeline(batchId: string): boolean {
  const controller = abortByBatch.get(batchId)
  if (!controller) return false
  controller.abort()
  abortByBatch.delete(batchId)
  return true
}

/** @internal — register an abort controller for unit tests. */
export function __testRegisterDocSplitAbort(batchId: string): AbortController {
  const existing = abortByBatch.get(batchId)
  if (existing) existing.abort()
  const controller = new AbortController()
  abortByBatch.set(batchId, controller)
  return controller
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException('Doc Split aborted', 'AbortError')
  }
}

function isAbortError(err: unknown): boolean {
  return (
    (err instanceof DOMException && err.name === 'AbortError') ||
    (err instanceof Error && err.name === 'AbortError')
  )
}

/** Lock batch for AI Doc Split (Credyx can Override). Skips if a live human holds it. */
export function lockBatchForDocSplit(batchId: string): void {
  setAiDocSplitLock(batchId)
}

/** Clear in_use lock after pipeline finishes or Override. */
export function unlockBatchAfterDocSplit(batchId: string): void {
  clearAiDocSplitLock(batchId)
}

async function setDocSplitPhase(
  batchId: string,
  status: 'ai_splitting' | 'creating_packets',
  jobMessage: string
): Promise<void> {
  const batch = getBatchById(batchId)
  if (!batch) return
  updateBatch(batchId, {
    status,
    sort_status: status,
    needs_doc_split: true,
    processing_error: null,
  })
  notifyTenantDataUpdated(['batches'], batch.client_id)

  try {
    const { getSupabase, isSupabaseConfigured } = await import('../lib/supabase')
    if (!isSupabaseConfigured()) return
    const supabase = getSupabase()
    await supabase?.rpc('mark_batch_processing_job', {
      p_batch_id: batchId,
      p_status: 'running',
      p_last_error: jobMessage,
      p_locked_by: 'doc-split-pipeline',
    })
  } catch (err) {
    console.warn('[docSplitterAutoPipeline] job mark failed', err)
  }
}

/**
 * Periodic job heartbeat while long AI loops run, so the edge worker can tell
 * a live browser pipeline (fresh locked_at) from a dead tab (stale lock).
 */
function createJobHeartbeat(batchId: string, intervalMs = 30_000): (message: string) => void {
  let lastBeat = Date.now()
  return (message: string) => {
    if (Date.now() - lastBeat < intervalMs) return
    lastBeat = Date.now()
    void markJobMessage(batchId, 'running', message)
  }
}

async function markJobMessage(batchId: string, status: string, message: string): Promise<void> {
  try {
    const { getSupabase, isSupabaseConfigured } = await import('../lib/supabase')
    if (!isSupabaseConfigured()) return
    const supabase = getSupabase()
    await supabase?.rpc('mark_batch_processing_job', {
      p_batch_id: batchId,
      p_status: status,
      p_last_error: message,
      p_locked_by: 'doc-split-pipeline',
    })
  } catch (err) {
    console.warn('[docSplitterAutoPipeline] job message failed', err)
  }
}

/** Persist Failed/rework status + unlock + ops email. Prefer rework (Packet Rework). */
export async function failDocSplitPipeline(
  batchId: string,
  message: string,
  opts?: { emailOps?: boolean; keepNeedsSplit?: boolean }
): Promise<void> {
  abortDocSplitPipeline(batchId)
  unlockBatchAfterDocSplit(batchId)

  const { stopAllBatchBackgroundWork } = await import('./batchBackgroundControl')
  await stopAllBatchBackgroundWork(batchId, {
    outcome: 'rework',
    reason: message,
    emailOps: opts?.emailOps,
  })

  // Optional: keep Doc Split gate if Credyx still needs the splitter after failure.
  if (opts?.keepNeedsSplit) {
    const batch = getBatchById(batchId)
    if (batch) {
      updateBatch(batchId, {
        needs_doc_split: true,
        status: 'rework',
        sort_status: 'failed',
        processing_error: message,
      })
      notifyTenantDataUpdated(['batches'], batch.client_id)
    }
  }
}

/**
 * Credyx Override: cancel AI Doc Split, unlock, mark rework with reason.
 */
export async function overrideDocSplitPipeline(
  batchId: string,
  overriddenBy: string
): Promise<boolean> {
  const message = `Overridden by ${overriddenBy.trim() || 'Credyx'} — AI Doc Split cancelled.`
  const aborted = abortDocSplitPipeline(batchId)
  await failDocSplitPipeline(batchId, message, { keepNeedsSplit: true })
  logBatchDocAction(batchId, {
    type: 'override',
    title: 'Doc Split overridden',
    detail: message,
  })
  return aborted
}

function listPendingFingerprints(draft: BatchIntakeDraft): DocSortFingerprint[] {
  return listAllSupportingFingerprints(draft).filter(
    (fp) => !markCategoryForKind(fp.kind) && !isSourceBinderFileName(fp.fileName)
  )
}

/**
 * RC / BOL / INV marks currently persisted on the batch snapshot.
 * The Doc Splitter UI writes marks here while the pipeline runs — these are
 * user decisions and must always win over AI classification.
 */
function persistedUserMarks(batchId: string): Map<string, DocSortKind> {
  const marks = new Map<string, DocSortKind>()
  const batch = getBatchById(batchId)
  if (!batch) return marks
  parseFingerprintCatalog(batch.doc_sort_snapshot).forEach((fp) => {
    if (markCategoryForKind(fp.kind)) marks.set(fp.docId, fp.kind)
  })
  return marks
}

/** Re-apply persisted marks onto the in-memory draft (user mark beats AI kind). */
function overlayUserMarksOnDraft(batchId: string, draft: BatchIntakeDraft): BatchIntakeDraft {
  const marks = persistedUserMarks(batchId)
  if (marks.size === 0) return draft
  let next = draft
  for (const fp of listAllSupportingFingerprints(next)) {
    const userKind = marks.get(fp.docId)
    if (userKind && userKind !== fp.kind) {
      next = placeUnmatchedFingerprint(next, { ...fp, kind: userKind })
    }
  }
  return next
}

/** Re-apply persisted marks onto a fingerprint list right before matching. */
function overlayUserMarksOnFingerprints(
  batchId: string,
  fingerprints: DocSortFingerprint[]
): DocSortFingerprint[] {
  const marks = persistedUserMarks(batchId)
  if (marks.size === 0) return fingerprints
  return fingerprints.map((fp) => {
    const userKind = marks.get(fp.docId)
    return userKind && userKind !== fp.kind ? { ...fp, kind: userKind } : fp
  })
}

function persistDraftSnapshot(batchId: string, rawDraft: BatchIntakeDraft): void {
  const batch = getBatchById(batchId)
  if (!batch) return
  // Never write AI kinds over marks the user made in the Doc Splitter meanwhile.
  const draft = overlayUserMarksOnDraft(batchId, rawDraft)
  const allFps = listAllSupportingFingerprints(draft)
  const emptySort: DocSortResult = {
    sortedAt: new Date().toISOString(),
    groups: [],
    unmatchedRateCons: draft.unmatched.rateCons,
    unmatchedBols: draft.unmatched.bols,
    otherDocuments: draft.unmatched.other,
    totalDocuments: allFps.length,
  }
  const unmatchedIds = [
    ...fingerprintDocIds(draft.unmatched.rateCons),
    ...fingerprintDocIds(draft.unmatched.bols),
    ...fingerprintDocIds(draft.unmatched.other),
  ]
  updateBatch(batchId, {
    doc_sort_snapshot: buildDocSortSnapshot(emptySort, draft.invoices),
    unmatched_doc_ids: unmatchedIds,
  })
  setBatchFiles(batchId, draft.fileById)
  notifyTenantDataUpdated(['batches'], batch.client_id)
}

async function classifyPendingPages(
  draft: BatchIntakeDraft,
  batchId: string,
  clientId: string,
  signal?: AbortSignal
): Promise<BatchIntakeDraft> {
  // Absorb marks the user made in the Doc Splitter since hydrate so we neither
  // re-classify nor override them.
  let next = overlayUserMarksOnDraft(batchId, draft)
  const pending = listPendingFingerprints(next)
  if (pending.length === 0) {
    updateBatchLiveActivity(batchId, {
      phase: 'classifying',
      thinking: 'No unmarked pages left — using existing RC / BOL / INV marks.',
      doing: 'Skip classify (nothing pending)',
      progressPercent: 40,
      progressLabel: 'Classify',
    })
    return next
  }

  updateBatchLiveActivity(batchId, {
    phase: 'classifying',
    thinking: `Decide RC / BOL / INV for ${pending.length} page(s). Invoice pages stay unassigned.`,
    doing: `Classifying 0 / ${pending.length}…`,
    progressPercent: 25,
    progressLabel: `0 / ${pending.length}`,
  })

  const parallel = getEffectiveDocSortParallel()
  const limiter = new DocScanRateLimiter(getDocSortStartIntervalMs())
  const heartbeat = createJobHeartbeat(batchId)

  let doneCount = 0
  let cursor = 0
  const workers = Array.from({ length: Math.min(parallel, pending.length) }, async () => {
    while (cursor < pending.length) {
      throwIfAborted(signal)
      const index = cursor
      cursor += 1
      const fp = pending[index]
      heartbeat(`Classifying ${doneCount + 1} / ${pending.length}…`)
      updateBatchLiveActivity(batchId, {
        phase: 'classifying',
        thinking: `Looking at page type for “${fp.fileName}” (RC, BOL, or invoice).`,
        doing: `Classifying ${doneCount + 1} / ${pending.length}: ${fp.fileName}`,
        progressPercent: 25 + Math.round((doneCount / pending.length) * 20),
        progressLabel: `${doneCount} / ${pending.length}`,
      })
      await limiter.acquire()
      throwIfAborted(signal)
      const file = next.fileById.get(fp.docId)
      if (!file) {
        doneCount += 1
        continue
      }
      try {
        const classified = await classifyDocSplitterPage(file, fp.docId)
        const merged: DocSortFingerprint = {
          ...classified,
          fileName: fp.fileName || classified.fileName,
          loadNumbers: classified.loadNumbers?.length
            ? classified.loadNumbers
            : fp.loadNumbers,
          broker: classified.broker || fp.broker,
        }
        // A user mark made while this page was in flight always beats the AI.
        const userKind = persistedUserMarks(batchId).get(fp.docId)
        const resolved = userKind ? { ...merged, kind: userKind } : merged
        if (markCategoryForKind(resolved.kind)) {
          // INV: place as invoice (unassigned other bucket) — never extract for packets.
          next = placeUnmatchedFingerprint(next, resolved)
          // Checkpoint per page: a rerun after abort / refresh / error skips
          // every page that already has a persisted RC / BOL / INV kind.
          persistDraftSnapshot(batchId, next)
        }
      } catch (err) {
        console.warn('[docSplitterAutoPipeline] classify failed', fp.docId, err)
      }
      doneCount += 1
      updateBatchLiveActivity(batchId, {
        phase: 'classifying',
        thinking: `Decide RC / BOL / INV for ${pending.length} page(s). Invoice pages stay unassigned.`,
        doing: `Classified ${doneCount} / ${pending.length}`,
        progressPercent: 25 + Math.round((doneCount / pending.length) * 20),
        progressLabel: `${doneCount} / ${pending.length}`,
      })
    }
  })
  await Promise.all(workers)

  void clientId
  persistDraftSnapshot(batchId, next)
  return next
}

async function extractRcBolFingerprints(
  draft: BatchIntakeDraft,
  batchId: string,
  signal?: AbortSignal
): Promise<{ draft: BatchIntakeDraft; fingerprints: DocSortFingerprint[] }> {
  // Pick up marks made in the Doc Splitter during the classify window.
  let next = overlayUserMarksOnDraft(batchId, draft)
  const all = listAllSupportingFingerprints(next)
  const rcBol = all.filter((fp) => shouldExtractForDocSplitPackets(fp.kind))
  // Checkpoint: extract JSON persisted by a previous run lives in the snapshot
  // catalog — never re-extract those docs.
  const alreadyExtracted = rcBol.filter((fp) => Boolean(fp.extract))
  const toExtract = rcBol.filter((fp) => !fp.extract)
  const invoices = all.filter((fp) => isInvoiceExcludedFromDocSplitPackets(fp.kind))
  const other = all.filter(
    (fp) =>
      !shouldExtractForDocSplitPackets(fp.kind) &&
      !isInvoiceExcludedFromDocSplitPackets(fp.kind)
  )

  const extracted: DocSortFingerprint[] = [...alreadyExtracted]
  const parallel = getEffectiveDocSortParallel()
  const limiter = new DocScanRateLimiter(getDocSortStartIntervalMs())
  let cursor = 0

  const skippedNote =
    alreadyExtracted.length > 0
      ? ` ${alreadyExtracted.length} already extracted — skipped.`
      : ''
  updateBatchLiveActivity(batchId, {
    phase: 'extracting',
    thinking:
      toExtract.length > 0
        ? `Read each rate-con binder from page 1 until load, broker, rate, and lane are filled. ${toExtract.length} doc(s) left.${skippedNote} Skipping ${invoices.length} invoice page(s).`
        : alreadyExtracted.length > 0
          ? `All ${alreadyExtracted.length} RC/BOL page(s) already extracted — resuming from checkpoint.`
          : 'No RC/BOL pages to extract — packets may be empty.',
    doing:
      toExtract.length > 0
        ? `Extracting 0 / ${toExtract.length}…`
        : alreadyExtracted.length > 0
          ? `Skip extract (${alreadyExtracted.length} done earlier)`
          : 'Skip extract (no RC/BOL)',
    progressPercent: 50,
    progressLabel: toExtract.length > 0 ? `0 / ${toExtract.length}` : null,
  })

  let doneExtract = 0
  const heartbeat = createJobHeartbeat(batchId)
  const workers = Array.from(
    { length: Math.min(parallel, Math.max(1, toExtract.length)) },
    async () => {
      while (cursor < toExtract.length) {
        throwIfAborted(signal)
        const index = cursor
        cursor += 1
        const fp = toExtract[index]
        heartbeat(`Extracting ${doneExtract + 1} / ${toExtract.length}…`)
        updateBatchLiveActivity(batchId, {
          phase: 'extracting',
          thinking: `Reading fields from “${fp.fileName}” for RC↔BOL matching.`,
          doing: `Extracting ${doneExtract + 1} / ${toExtract.length}: ${fp.fileName}`,
          progressPercent: 50 + Math.round((doneExtract / Math.max(1, toExtract.length)) * 20),
          progressLabel: `${doneExtract} / ${toExtract.length}`,
        })
        await limiter.acquire()
        throwIfAborted(signal)
        const file = next.fileById.get(fp.docId)
        if (!file) {
          extracted.push(fp)
          doneExtract += 1
          continue
        }
        try {
          const useBinderWalk =
            fp.kind === 'rate_confirmation' &&
            (isSourceBinderFileName(fp.fileName) || isSourceBinderFileName(file.name))
          const skipBolBinder =
            fp.kind === 'bill_of_lading' &&
            (isSourceBinderFileName(fp.fileName) || isSourceBinderFileName(file.name))
          if (skipBolBinder) {
            extracted.push(fp)
          } else {
            const full = useBinderWalk
              ? fingerprintFromExtraction(
                  fp.docId,
                  fp.fileName || file.name,
                  await extractRateConBinderFile(file)
                )
              : await fingerprintDocSortFile(file, fp.docId)
            const row: DocSortFingerprint = {
              ...full,
              fileName: fp.fileName || full.fileName,
              kind: fp.kind,
            }
            extracted.push(row)
            next = placeUnmatchedFingerprint(next, row)
            // Checkpoint per doc: extract JSON lands in the snapshot immediately,
            // so a rerun never pays for this extraction again.
            persistDraftSnapshot(batchId, next)
          }
        } catch (err) {
          console.warn('[docSplitterAutoPipeline] extract failed', fp.docId, err)
          extracted.push(fp)
        }
        doneExtract += 1
        updateBatchLiveActivity(batchId, {
          phase: 'extracting',
          thinking: `Read the rate confirmation from page 1 until load, broker, rate, and lane are filled.`,
          doing: `Extracted ${doneExtract} / ${toExtract.length}`,
          progressPercent: 50 + Math.round((doneExtract / Math.max(1, toExtract.length)) * 20),
          progressLabel: `${doneExtract} / ${toExtract.length}`,
        })
      }
    }
  )
  if (toExtract.length > 0) await Promise.all(workers)

  // INV + other stay unassigned (no extract).
  const fingerprints = [...extracted, ...invoices, ...other]
  persistDraftSnapshot(batchId, next)
  return { draft: next, fingerprints }
}

/** Write the lumper rule onto the saved page kind, not only the packet group. */
function persistLaterPageLumpers(draft: BatchIntakeDraft): BatchIntakeDraft {
  let next = draft
  for (const fp of listAllSupportingFingerprints(draft)) {
    const pageNumber = parseUploadPageFileName(fp.fileName)?.page ?? 1
    if (fp.kind !== 'invoice' || pageNumber <= 1) continue
    next = placeUnmatchedFingerprint(next, { ...fp, kind: 'lumper' })
  }
  return next
}

function savedPacketsMissingUploadDocs(batchId: string, draft: BatchIntakeDraft): boolean {
  const required = sameUploadPacketDocIds(listAllSupportingFingerprints(draft))
  if (required.length === 0) return false
  const assigned = new Set(
    getInvoicesByBatchId(batchId).flatMap((inv) => inv.document_doc_ids ?? [])
  )
  return required.some((docId) => !assigned.has(docId))
}

/**
 * Run full Doc Split auto pipeline for a batch (hydrate → explode → classify → packets).
 * Safe to call from background jobs; respects AbortSignal via Override.
 */
export async function runDocSplitterAutoPipeline(
  batchId: string,
  opts?: { signal?: AbortSignal }
): Promise<{ ok: boolean; aborted?: boolean; packetCount?: number; error?: string }> {
  // Single-flight per batch: a second concurrent run would race the first
  // (duplicate page-splits, snapshot stomping, duplicate packets) and would
  // orphan the first run's abort controller so Override could no longer cancel it.
  if (abortByBatch.has(batchId)) {
    return { ok: false, error: 'Doc Split already running for this batch' }
  }

  const ownedController = new AbortController()
  abortByBatch.set(batchId, ownedController)
  const signal = ownedController.signal
  if (opts?.signal) {
    if (opts.signal.aborted) ownedController.abort()
    else {
      opts.signal.addEventListener('abort', () => ownedController.abort(), { once: true })
    }
  }

  const batch = getBatchById(batchId)
  if (!batch) {
    abortByBatch.delete(batchId)
    return { ok: false, error: 'Batch not found' }
  }

  if (!isAiReviewConfigured()) {
    abortByBatch.delete(batchId)
    const message =
      'AI is not configured — open Doc Splitter to mark pages manually, or deploy openai-proxy.'
    await failDocSplitPipeline(batchId, message)
    return { ok: false, error: message }
  }

  setOpenAiSpendContext({ clientId: batch.client_id, feature: 'docsort' })
  lockBatchForDocSplit(batchId)

  startBatchLiveActivity(batchId, {
    jobLabel: 'AI Doc Split → packets',
    jobKind: 'doc_split_and_packets',
    background: true,
    phase: 'doc_split',
    thinking: 'Split combined PDFs, classify pages, merge each upload into Invoice / RC binder / BOL binder, then create one packet per upload.',
    doing: 'Starting Doc Split pipeline',
  })

  try {
    await setDocSplitPhase(batchId, 'ai_splitting', 'AI splitting docs…')
    logBatchDocAction(batchId, {
      type: 'auto_pipeline',
      title: 'Background Doc Split started',
      detail: 'Hydrate → explode → classify → extract RC/BOL → packets',
    })

    throwIfAborted(signal)
    updateBatchLiveActivity(batchId, {
      phase: 'hydrating',
      thinking: 'Load PDF bytes from storage into memory (same as packet pipeline).',
      doing: 'Hydrating files from storage…',
      progressPercent: 5,
      progressLabel: 'Hydrate',
    })
    const hydrated = await hydrateIntakeDraftFromBatch(batchId)
    if (!hydrated) {
      throw new Error('Could not hydrate batch documents for Doc Split')
    }
    let draft = ensureDocsInUnmatchedPool(hydrated)
    setBatchFiles(batchId, draft.fileById)

    throwIfAborted(signal)
    updateBatchLiveActivity(batchId, {
      phase: 'doc_split',
      thinking: 'Break multi-page combined PDFs into single pages (skip if already -pN).',
      doing: 'Exploding multi-page PDFs…',
      progressPercent: 15,
      progressLabel: 'Page split',
    })
    const exploded = await explodeMultiPagePdfs(draft, batchId, { signal })
    draft = ensureDocsInUnmatchedPool(exploded.draft)
    setBatchFiles(batchId, draft.fileById)
    persistDraftSnapshot(batchId, draft)

    // Durable checkpoint: upload page-split children to storage so a refresh /
    // new tab resumes with the same pages instead of losing the files.
    try {
      draft = await persistPageSplitFilesToStorage(draft, batchId, batch.client_id)
      setBatchFiles(batchId, draft.fileById)
    } catch (err) {
      console.warn('[docSplitterAutoPipeline] page-split upload failed', err)
    }

    if (exploded.splitCount > 0) {
      logBatchDocAction(batchId, {
        type: 'auto_pipeline',
        title: `Exploded ${exploded.splitCount} multi-page PDF(s)`,
      })
      updateBatchLiveActivity(batchId, {
        doing: `Exploded ${exploded.splitCount} PDF(s) into pages`,
      })
    } else {
      updateBatchLiveActivity(batchId, {
        doing: 'No explode needed (already page-split or single-page)',
      })
    }

    throwIfAborted(signal)
    draft = await classifyPendingPages(draft, batchId, batch.client_id, signal)
    draft = persistLaterPageLumpers(draft)
    persistDraftSnapshot(batchId, draft)

    // Packets already saved still reference the page files. Do not collapse
    // those pages out from under them. A packet that left this upload's BOL
    // unassigned is replaced — load-number matching is not used for page splits.
    if (
      getInvoicesByBatchId(batchId).length > 0 &&
      savedPacketsMissingUploadDocs(batchId, draft)
    ) {
      const { clearBatchInvoicesForRecreate } = await import('../services/batchReworkService')
      clearBatchInvoicesForRecreate(batchId)
      logBatchDocAction(batchId, {
        type: 'auto_pipeline',
        title: 'Replaced packets that left same-upload BOLs unassigned',
      })
    }

    if (getInvoicesByBatchId(batchId).length > 0) {
      clearBatchNeedsDocSplit(batchId)
      unlockBatchAfterDocSplit(batchId)
      updateBatch(batchId, {
        status: 'ready_to_post',
        sort_status: 'ready',
        needs_doc_split: false,
        processing_error: null,
      })
      notifyTenantDataUpdated(['batches', 'invoices'], batch.client_id)
      const existingCount = getInvoicesByBatchId(batchId).length
      finishBatchLiveActivity(batchId, {
        phase: 'succeeded',
        thinking: 'Packets already existed — skipped re-create.',
        doing: `Ready · ${existingCount} existing packet(s)`,
      })
      return { ok: true, packetCount: existingCount }
    }

    throwIfAborted(signal)
    updateBatchLiveActivity(batchId, {
      phase: 'doc_split',
      thinking:
        'Merge classified pages of each upload into one invoice, one RC binder, and one BOL binder.',
      doing: 'Building Invoice / RC / BOL binders…',
      progressPercent: 45,
      progressLabel: 'Binders',
    })
    const collapsed = await collapsePageSplitsIntoBinders(draft)
    draft = collapsed.draft
    if (collapsed.collapsedStems.length > 0) {
      logBatchDocAction(batchId, {
        type: 'auto_pipeline',
        title: `Collapsed ${collapsed.collapsedStems.length} upload(s) into binders`,
        detail: collapsed.collapsedStems.slice(0, 8).join(', '),
      })
      try {
        draft = await persistSourceBinderFilesToStorage(draft, batchId, batch.client_id)
        setBatchFiles(batchId, draft.fileById)
      } catch (err) {
        console.warn('[docSplitterAutoPipeline] binder upload failed', err)
      }
      if (isSupabaseConfigured() && collapsed.removedStoragePaths.length > 0) {
        const supabase = getSupabase()
        if (supabase) {
          const { error } = await supabase.storage
            .from('batch-documents')
            .remove(collapsed.removedStoragePaths)
          if (error) {
            console.warn('[docSplitterAutoPipeline] page cleanup failed', error.message)
          }
        }
      }
      persistDraftSnapshot(batchId, draft)
    }

    await setDocSplitPhase(batchId, 'creating_packets', 'Creating packets…')
    throwIfAborted(signal)

    const { draft: extractedDraft, fingerprints: extractedFps } = await extractRcBolFingerprints(
      draft,
      batchId,
      signal
    )
    draft = extractedDraft

    // Final mark sync before matching — user marks always beat AI kinds.
    const fingerprints = overlayUserMarksOnFingerprints(batchId, extractedFps)
    // Uploads already collapsed into binders become one packet each.
    // Loose docs (never page-split) still go through RC↔BOL matching.
    const partitioned = partitionSourceBinders(fingerprints)
    const fromPages = packetsFromSameUploadPages(partitioned.loose)
    const uploadPackets = [...partitioned.packets, ...fromPages.packets]
    const forMatch = fromPages.loose.filter((fp) => shouldExtractForDocSplitPackets(fp.kind))
    const invAndOther = fromPages.loose.filter((fp) => !shouldExtractForDocSplitPackets(fp.kind))
    const binderInvoices = [
      ...uploadPackets.flatMap((packet) => packet.invoices),
      ...partitioned.unassigned,
    ]

    updateBatchLiveActivity(batchId, {
      phase: 'matching',
      thinking: `${uploadPackets.length} upload packet(s). Each upload keeps its own RC and BOL together. Match ${forMatch.filter((f) => f.kind === 'rate_confirmation').length} loose RC(s) to ${forMatch.filter((f) => f.kind === 'bill_of_lading').length} loose BOL(s). Invoices stay unassigned.`,
      doing:
        uploadPackets.length > 0
          ? `Creating packets from ${uploadPackets.length} upload(s)…`
          : 'Matching loose RC ↔ BOL…',
      progressPercent: 75,
      progressLabel: 'Match',
    })

    const matched = matchSortedDocuments(forMatch)
    const sortResult: DocSortResult = {
      ...matched,
      otherDocuments: [...matched.otherDocuments, ...invAndOther],
      totalDocuments: fingerprints.length,
    }

    const grouped = invoiceDraftGroupsFromSort(sortResult)
    const binderGroups = uploadPackets.map((packet) => {
      const anchor = packet.rateCons[0] ?? packet.bols[0]
      return {
        groupId: `source-${packet.stem}`,
        label: anchor ? primaryLoadLabel(anchor) : packet.stem,
        rateCons: packet.rateCons,
        bols: packet.bols,
        others: packet.support,
        matchReason: 'uploaded packet binders',
        matchScore: 100,
      }
    })
    grouped.groups = [...binderGroups, ...grouped.groups]
    grouped.unmatched.other = [...grouped.unmatched.other, ...binderInvoices]
    updateBatchLiveActivity(batchId, {
      phase: 'creating_packets',
      thinking: `Build ${grouped.groups.length} invoice packet(s) from matched loads.`,
      doing:
        grouped.groups.length > 0
          ? `Creating ${grouped.groups.length} packet(s)…`
          : 'No matched RC+BOL pairs — 0 packets',
      progressPercent: 85,
      progressLabel: `${grouped.groups.length} packet(s)`,
    })

    const usedNumbers: string[] = []
    const drafts: CredyxInvoiceDraft[] = []
    for (const group of grouped.groups) {
      throwIfAborted(signal)
      updateBatchLiveActivity(batchId, {
        doing: `Building packet ${drafts.length + 1} / ${grouped.groups.length}: ${group.label}`,
      })
      const credyxDraft = await buildCredyxDraftFromGroup(
        group,
        batch.client_id,
        usedNumbers,
        batch.client_name
      )
      usedNumbers.push(credyxDraft.invoice_number)
      drafts.push({ ...credyxDraft, confirmed: true })
    }

    // Merge unmatched from grouping back into draft for snapshot.
    draft = {
      ...draft,
      unmatched: {
        rateCons: grouped.unmatched.rateCons,
        bols: grouped.unmatched.bols,
        other: grouped.unmatched.other,
      },
      invoices: drafts,
      sortResult: {
        ...sortResult,
        groups: grouped.groups,
        unmatchedRateCons: grouped.unmatched.rateCons,
        unmatchedBols: grouped.unmatched.bols,
        otherDocuments: grouped.unmatched.other,
      },
    }

    if (drafts.length === 0) {
      persistDraftSnapshot(batchId, draft)
      const message =
        'Doc Split finished but produced 0 packets (need matched RC+BOL). Open Doc Splitter or Packet Rework.'
      // Leave as needs_split/rework path — still Failed so ops sees it.
      clearBatchNeedsDocSplit(batchId)
      await failDocSplitPipeline(batchId, message, { keepNeedsSplit: false })
      updateBatch(batchId, { status: 'rework', sort_status: 'failed' })
      notifyTenantDataUpdated(['batches'], batch.client_id)
      return { ok: false, error: message, packetCount: 0 }
    }

    // Avoid duplicate packets if another path already created a complete set.
    // An incomplete set (BOL from this upload left unassigned) is replaced.
    if (
      getInvoicesByBatchId(batchId).length > 0 &&
      savedPacketsMissingUploadDocs(batchId, draft)
    ) {
      const { clearBatchInvoicesForRecreate } = await import('../services/batchReworkService')
      clearBatchInvoicesForRecreate(batchId)
    }

    if (getInvoicesByBatchId(batchId).length > 0) {
      clearBatchNeedsDocSplit(batchId)
      unlockBatchAfterDocSplit(batchId)
      updateBatch(batchId, {
        status: 'ready_to_post',
        sort_status: 'ready',
        needs_doc_split: false,
        processing_error: null,
      })
      notifyTenantDataUpdated(['batches', 'invoices'], batch.client_id)
      const existingCount = getInvoicesByBatchId(batchId).length
      finishBatchLiveActivity(batchId, {
        phase: 'succeeded',
        thinking: 'Packets already existed — skipped re-create.',
        doing: `Ready · ${existingCount} existing packet(s)`,
      })
      return { ok: true, packetCount: existingCount }
    }

    throwIfAborted(signal)
    updateBatchLiveActivity(batchId, {
      phase: 'creating_packets',
      thinking: 'Persist invoice packets to the batch.',
      doing: `Submitting ${drafts.length} packet(s)…`,
      progressPercent: 92,
    })
    const { submitAiBatch } = await import('../services/credyx/batchIntakePipeline')
    await submitAiBatch({
      clientId: batch.client_id,
      clientName: batch.client_name,
      drafts,
      sortResult: draft.sortResult ?? sortResult,
      fileById: draft.fileById,
      confirmedBy: 'AI Doc Split',
      existingBatchId: batchId,
      uploadMode: batch.upload_mode === 'handoff' ? 'handoff' : 'ai',
    })

    clearBatchNeedsDocSplit(batchId)
    unlockBatchAfterDocSplit(batchId)
    updateBatch(batchId, {
      status: 'ready_to_post',
      sort_status: 'ready',
      needs_doc_split: false,
      processing_error: null,
      in_use: false,
      in_use_by: undefined,
      in_use_by_user_id: null,
      in_use_at: null,
    })
    notifyTenantDataUpdated(['batches', 'invoices'], batch.client_id)
    await markJobMessage(
      batchId,
      'succeeded',
      `Doc Split created ${drafts.length} packet(s). Ready for verify.`
    )

    try {
      await emailCredyxDocSplitReady({
        batchNumber: batch.batch_number,
        clientName: batch.client_name,
        packetCount: drafts.length,
      })
    } catch (err) {
      console.warn('[docSplitterAutoPipeline] ready email failed', err)
    }

    logBatchDocAction(batchId, {
      type: 'auto_pipeline',
      title: `Created ${drafts.length} packet(s)`,
      detail: 'Doc Split gate cleared — ready for verify',
    })

    finishBatchLiveActivity(batchId, {
      phase: 'succeeded',
      thinking: 'Doc Split gate cleared — ready for verify / happy path.',
      doing: `Created ${drafts.length} packet(s)`,
    })

    return { ok: true, packetCount: drafts.length }
  } catch (err) {
    if (isAbortError(err)) {
      // Override path already sets failed; if abort without override, mark failed.
      const live = getBatchById(batchId)
      if (live && live.status !== 'failed') {
        await failDocSplitPipeline(batchId, 'Doc Split cancelled.')
      } else {
        unlockBatchAfterDocSplit(batchId)
        finishBatchLiveActivity(batchId, {
          phase: 'aborted',
          thinking: 'Pipeline cancelled (Override or abort).',
          doing: 'Aborted',
          error: 'aborted',
        })
      }
      return { ok: false, aborted: true, error: 'aborted' }
    }
    const message = err instanceof Error ? err.message : 'Doc Split pipeline failed'
    console.warn('[docSplitterAutoPipeline]', batchId, err)
    await failDocSplitPipeline(batchId, message)
    return { ok: false, error: message }
  } finally {
    abortByBatch.delete(batchId)
  }
}

/** Statuses that should resume / start Doc Split in the background pipeline. */
export function batchShouldRunDocSplitPipeline(batch: {
  status?: string | null
  sort_status?: string | null
  needs_doc_split?: boolean | null
}): boolean {
  return (
    batch.status === 'needs_split' ||
    batch.status === 'ai_splitting' ||
    batch.status === 'creating_packets' ||
    batch.sort_status === 'needs_split' ||
    batch.sort_status === 'ai_splitting' ||
    batch.sort_status === 'creating_packets' ||
    batch.needs_doc_split === true
  )
}

/** Ensure sticky Doc Split flags exist before running the auto pipeline. */
export function ensureDocSplitFlags(batchId: string, unmatchedDocIds: string[], snapshot?: string): void {
  const batch = getBatchById(batchId)
  if (!batch) return
  if (
    batch.status === 'ai_splitting' ||
    batch.status === 'creating_packets' ||
    batch.status === 'needs_split'
  ) {
    if (unmatchedDocIds.length > 0 || snapshot) {
      updateBatch(batchId, {
        unmatched_doc_ids: unmatchedDocIds.length
          ? unmatchedDocIds
          : batch.unmatched_doc_ids,
        ...(snapshot ? { doc_sort_snapshot: snapshot } : {}),
        needs_doc_split: true,
      })
    }
    return
  }
  markBatchNeedsDocSplit(batchId, { unmatchedDocIds, snapshot })
}
