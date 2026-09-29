import type { PendingBatch } from '../types/admin'
import type { AuditLog } from '../types/audit'
import type { Invoice } from '../types/invoice'
import { getBatchById } from '../data/mockBatches'
import { getInvoicesByBatchId } from '../data/mockInvoices'
import { getAllAuditLogs } from './auditLogger'
import {
  adminBatchFilterLabel,
  getAdminBatchAiReviewProgress,
  getAdminBatchDisplayBucket,
  resolveAdminBatchWorkflowStage,
} from './adminBatchQueue'
import { batchNeedsDocSplit } from './batchDocSplit'
import { parseFingerprintCatalog } from '../products/docSort/utils/docSortSnapshot'
import { fingerprintNeedsDocSplitter } from '../products/docSort/services/docSortUnpack'
import { getBatchDocActions, type BatchDocAction } from './batchDocActionLog'
import type { BatchProcessingJobDebug } from '../services/credyx/batchDebugService'
import { hasPpwBeenSent } from './ppwSent'
import {
  getBatchLiveActivity,
  isBatchLiveActivityRunning,
  type BatchLiveActivity,
} from './batchLiveActivity'
import { isDocSplitPipelineRunning } from './docSplitterAutoPipeline'
import {
  estimatePacketPipelineCost,
  type PacketPipelineCostEstimate,
} from './estimateReviewTokens'

export type BatchDebugSeverity = 'info' | 'warning' | 'error' | 'success'

export type BatchDebugTimelineEvent = {
  id: string
  at: string
  title: string
  detail?: string
  source: 'batch' | 'job' | 'audit' | 'invoice' | 'doc_sort'
  severity: BatchDebugSeverity
}

export type BatchDebugInvoiceRow = {
  id: string
  invoice_number: string
  load_number?: string
  status: string
  amount: number
  broker_name?: string
  ai_review_status?: string
  hold_reason?: string
  ppw_sent: boolean
  doc_count: number
  note_count: number
}

export type BatchDebugDocRow = {
  docId: string
  fileName: string
  kind: string
  loadNumbers: string[]
  broker?: string
  invoiceNumber?: string
  needsSplitPages: boolean
  /** Set on rate cons after the walk records how each page was read. */
  rateConRead?: {
    textPages: number
    imagePages: number
  }
}

export type BatchDebugSnapshot = {
  batchId: string
  batchNumber: string
  clientName: string
  clientId: string
  overview: {
    status: string
    sort_status?: string
    upload_mode?: string
    needs_doc_split: boolean
    display_bucket: string
    workflow_stage: string
    submitted_at: string
    reviewed_at?: string
    reviewed_by?: string
    in_use?: boolean
    in_use_by?: string
    total_invoices: number
    total_amount: number
    unmatched_doc_count: number
    ai_review_label: string | null
    processing_error?: string | null
  }
  /** Live in-tab pipeline activity (what the job is thinking / doing). */
  liveActivity: BatchLiveActivity | null
  /** True when this browser tab owns an in-flight background run. */
  backgroundRunningInThisTab: boolean
  /** Estimated OpenAI spend for split, classify, rate-con extract, packet create, and verify. */
  costEstimate: PacketPipelineCostEstimate
  timeline: BatchDebugTimelineEvent[]
  jobs: BatchProcessingJobDebug[]
  invoices: BatchDebugInvoiceRow[]
  documents: BatchDebugDocRow[]
  docActions: BatchDocAction[]
  auditLogs: AuditLog[]
  rawBatch: Record<string, unknown>
}

function ms(iso?: string | null): number {
  if (!iso) return 0
  const t = new Date(iso).getTime()
  return Number.isNaN(t) ? 0 : t
}

function countInvoiceDocs(inv: Invoice): number {
  const ids = new Set<string>()
  for (const id of inv.document_doc_ids ?? []) {
    if (id && !id.startsWith('invoice-pdf-')) ids.add(id)
  }
  for (const id of Object.keys(inv.document_storage_paths ?? {})) {
    if (id && !id.startsWith('invoice-pdf-')) ids.add(id)
  }
  return ids.size || inv.documents_count || 0
}

function docNeedsSplitPages(fp: {
  docId: string
  fileName: string
  kind: string
  loadNumbers?: string[]
  extract?: { pageClassifications?: Array<{ skipped?: boolean; pageType?: string }> }
}): boolean {
  return fingerprintNeedsDocSplitter({
    docId: fp.docId,
    fileName: fp.fileName,
    kind: fp.kind as 'rate_confirmation' | 'bill_of_lading' | 'invoice' | 'lumper' | 'other',
    loadNumbers: fp.loadNumbers ?? [],
    extract: fp.extract as never,
    confidence: 0,
  })
}

function buildTimeline(opts: {
  batch: PendingBatch & { reviewed_at?: string; reviewed_by?: string }
  jobs: BatchProcessingJobDebug[]
  invoices: Invoice[]
  auditLogs: AuditLog[]
  documents: BatchDebugDocRow[]
}): BatchDebugTimelineEvent[] {
  const events: BatchDebugTimelineEvent[] = []

  events.push({
    id: 'submitted',
    at: opts.batch.submitted_at,
    title: 'Batch created / submitted',
    detail: [
      opts.batch.upload_mode ? `Mode: ${opts.batch.upload_mode}` : null,
      `Status: ${opts.batch.status}`,
    ]
      .filter(Boolean)
      .join(' · '),
    source: 'batch',
    severity: 'info',
  })

  if (opts.batch.sort_status) {
    events.push({
      id: `sort-${opts.batch.sort_status}`,
      at: opts.batch.submitted_at,
      title: `DocSort status: ${opts.batch.sort_status}`,
      detail:
        opts.batch.unmatched_doc_ids?.length
          ? `${opts.batch.unmatched_doc_ids.length} unmatched doc(s)`
          : undefined,
      source: 'doc_sort',
      severity:
        opts.batch.sort_status === 'failed'
          ? 'error'
          : opts.batch.sort_status === 'ready'
            ? 'success'
            : 'info',
    })
  }

  if (opts.batch.needs_doc_split || opts.batch.status === 'needs_split') {
    events.push({
      id: 'needs-split',
      at: opts.batch.submitted_at,
      title: 'Doc Split required',
      detail: 'Combined PDFs flagged for Credyx Doc Splitter before packets',
      source: 'doc_sort',
      severity: 'warning',
    })
  }

  for (const job of opts.jobs) {
    events.push({
      id: `job-created-${job.id}`,
      at: job.created_at,
      title: `Processing job enqueued (${job.kind})`,
      detail: `Job ${job.id.slice(0, 8)}… · status ${job.status}`,
      source: 'job',
      severity: 'info',
    })
    if (job.started_at) {
      events.push({
        id: `job-started-${job.id}`,
        at: job.started_at,
        title: 'Processing job started',
        detail: [
          job.locked_by ? `Locked by ${job.locked_by}` : null,
          `Attempt ${job.attempts}/${job.max_attempts}`,
        ]
          .filter(Boolean)
          .join(' · '),
        source: 'job',
        severity: 'info',
      })
    }
    if (job.finished_at) {
      events.push({
        id: `job-finished-${job.id}`,
        at: job.finished_at,
        title:
          job.status === 'succeeded'
            ? 'Processing job succeeded'
            : job.status === 'failed'
              ? 'Processing job failed'
              : `Processing job finished (${job.status})`,
        detail: job.last_error || undefined,
        source: 'job',
        severity: job.status === 'failed' ? 'error' : job.status === 'succeeded' ? 'success' : 'info',
      })
    }
  }

  for (const log of opts.auditLogs) {
    events.push({
      id: `audit-${log.id}`,
      at: log.timestamp,
      title: log.description || log.action.replace(/_/g, ' '),
      detail: [
        `${log.user_name} (${log.user_role})`,
        log.changes?.length
          ? log.changes.map((c) => `${c.field}: ${String(c.old_value)} → ${String(c.new_value)}`).join('; ')
          : null,
      ]
        .filter(Boolean)
        .join(' · '),
      source: 'audit',
      severity:
        log.severity === 'error' || log.severity === 'critical'
          ? 'error'
          : log.severity === 'warning'
            ? 'warning'
            : log.success
              ? 'info'
              : 'error',
    })
  }

  for (const inv of opts.invoices) {
    if (inv.ai_review_status && inv.ai_review_status !== 'not_run') {
      events.push({
        id: `inv-ai-${inv.id}`,
        at: inv.updated_at || inv.created_at || opts.batch.submitted_at,
        title: `Invoice ${inv.invoice_number}: AI ${inv.ai_review_status.replace(/_/g, ' ')}`,
        detail: inv.hold_reason || inv.load_number || undefined,
        source: 'invoice',
        severity:
          inv.ai_review_status === 'needs_work'
            ? 'warning'
            : inv.ai_review_status === 'ready'
              ? 'success'
              : 'info',
      })
    }
    for (const note of inv.notes_history ?? []) {
      if (!note.created_at) continue
      events.push({
        id: `note-${inv.id}-${note.created_at}-${note.type ?? 'note'}`,
        at: note.created_at,
        title: `Invoice ${inv.invoice_number}: ${note.type?.replace(/_/g, ' ') || 'note'}`,
        detail: note.note || undefined,
        source: 'invoice',
        severity: note.type === 'hold_reason' ? 'warning' : 'info',
      })
    }
    for (const send of inv.document_send_history ?? []) {
      if (!send.sent_at) continue
      events.push({
        id: `ppw-${inv.id}-${send.sent_at}`,
        at: send.sent_at,
        title: `Invoice ${inv.invoice_number}: PPW ${send.status || 'send'}`,
        detail: send.email_address || undefined,
        source: 'invoice',
        severity: send.status === 'failed' ? 'error' : 'success',
      })
    }
  }

  if (opts.batch.reviewed_at) {
    events.push({
      id: 'reviewed',
      at: opts.batch.reviewed_at,
      title: 'Batch reviewed',
      detail: opts.batch.reviewed_by ? `By ${opts.batch.reviewed_by}` : undefined,
      source: 'batch',
      severity: 'success',
    })
  }

  const splitDocs = opts.documents.filter((d) => d.needsSplitPages)
  if (splitDocs.length > 0) {
    events.push({
      id: 'split-docs',
      at: opts.batch.submitted_at,
      title: `${splitDocs.length} combined PDF(s) detected`,
      detail: splitDocs.map((d) => d.fileName).slice(0, 5).join(', '),
      source: 'doc_sort',
      severity: 'warning',
    })
  }

  return events.sort((a, b) => ms(a.at) - ms(b.at))
}

/** Collect audit rows for this batch and its invoices. */
export function collectBatchAuditLogs(batchId: string, batchNumber: string, invoiceIds: string[]): AuditLog[] {
  const idSet = new Set([batchId, ...invoiceIds])
  return getAllAuditLogs()
    .filter((log) => {
      if (log.entity_id && idSet.has(log.entity_id)) return true
      if (log.entity_type === 'batch' && log.entity_name === batchNumber) return true
      if (log.metadata?.batch_id === batchId) return true
      return false
    })
    .sort((a, b) => ms(a.timestamp) - ms(b.timestamp))
}

/**
 * Build a debug snapshot for one batch (local store + optional job rows from Supabase).
 */
export function buildBatchDebugSnapshot(
  batchId: string,
  jobs: BatchProcessingJobDebug[] = []
): BatchDebugSnapshot | null {
  const batch = getBatchById(batchId)
  if (!batch) return null

  const invoices = getInvoicesByBatchId(batchId)
  const catalog = parseFingerprintCatalog(batch.doc_sort_snapshot)
  const documents: BatchDebugDocRow[] = [...catalog.values()].map((fp) => ({
    docId: fp.docId,
    fileName: fp.fileName,
    kind: fp.kind,
    loadNumbers: fp.loadNumbers ?? [],
    broker: fp.broker,
    invoiceNumber: fp.invoiceNumber,
    needsSplitPages: docNeedsSplitPages(fp),
    rateConRead: fp.extract?.rateConRead,
  }))

  const auditLogs = collectBatchAuditLogs(
    batch.id,
    batch.batch_number,
    invoices.map((i) => i.id)
  )
  const aiProgress = getAdminBatchAiReviewProgress(batch.id)
  const bucket = getAdminBatchDisplayBucket(batch)

  const invoiceRows: BatchDebugInvoiceRow[] = invoices.map((inv) => ({
    id: inv.id,
    invoice_number: inv.invoice_number,
    load_number: inv.load_number,
    status: inv.status,
    amount: inv.amount ?? 0,
    broker_name: inv.broker_name,
    ai_review_status: inv.ai_review_status,
    hold_reason: inv.hold_reason,
    ppw_sent: hasPpwBeenSent(inv),
    doc_count: countInvoiceDocs(inv),
    note_count: inv.notes_history?.length ?? 0,
  }))

  const timeline = buildTimeline({ batch, jobs, invoices, auditLogs, documents })

  const rawBatch: Record<string, unknown> = {
    id: batch.id,
    batch_number: batch.batch_number,
    client_id: batch.client_id,
    client_name: batch.client_name,
    status: batch.status,
    sort_status: batch.sort_status,
    upload_mode: batch.upload_mode,
    needs_doc_split: batch.needs_doc_split,
    submitted_at: batch.submitted_at,
    reviewed_at: batch.reviewed_at,
    reviewed_by: batch.reviewed_by,
    total_invoices: batch.total_invoices,
    total_amount: batch.total_amount,
    unmatched_doc_ids: batch.unmatched_doc_ids,
    fee_terms: batch.fee_terms,
    fee_calculation: batch.fee_calculation,
    in_use: batch.in_use,
    in_use_by: batch.in_use_by,
    doc_sort_snapshot_length: batch.doc_sort_snapshot?.length ?? 0,
  }

  const costEstimate = estimatePacketPipelineCost(
    [...catalog.values()].map((fp) => ({
      fileName: fp.fileName,
      kind: fp.kind,
      extract: fp.extract
        ? {
            totalPagesInFile: fp.extract.totalPagesInFile,
            pagesReviewed: fp.extract.pagesReviewed,
            rateConRead: fp.extract.rateConRead,
          }
        : null,
    }))
  )

  const liveActivity = getBatchLiveActivity(batchId)
  const backgroundRunningInThisTab =
    isDocSplitPipelineRunning(batchId) ||
    (isBatchLiveActivityRunning(liveActivity) && Boolean(liveActivity?.background))

  return {
    batchId: batch.id,
    batchNumber: batch.batch_number,
    clientName: batch.client_name,
    clientId: batch.client_id,
    overview: {
      status: batch.status,
      sort_status: batch.sort_status,
      upload_mode: batch.upload_mode,
      needs_doc_split: batchNeedsDocSplit(batch),
      display_bucket:
        bucket === 'other' ? 'other' : adminBatchFilterLabel(bucket),
      workflow_stage: resolveAdminBatchWorkflowStage(batch),
      submitted_at: batch.submitted_at,
      reviewed_at: batch.reviewed_at,
      reviewed_by: batch.reviewed_by,
      in_use: batch.in_use,
      in_use_by: batch.in_use_by,
      total_invoices: batch.total_invoices,
      total_amount: batch.total_amount,
      unmatched_doc_count: batch.unmatched_doc_ids?.length ?? 0,
      ai_review_label: aiProgress.label,
      processing_error: batch.processing_error ?? null,
    },
    liveActivity,
    backgroundRunningInThisTab,
    costEstimate,
    timeline,
    jobs,
    invoices: invoiceRows,
    documents,
    docActions: getBatchDocActions(batchId),
    auditLogs,
    rawBatch: {
      ...rawBatch,
      processing_error: batch.processing_error ?? null,
      live_activity: liveActivity,
      background_running_in_this_tab: backgroundRunningInThisTab,
      live_activity_running: isBatchLiveActivityRunning(liveActivity),
    },
  }
}

