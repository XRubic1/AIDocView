import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { AlertCircle, ArrowLeft, Check, Loader2, Sparkles } from 'lucide-react'
import CompactPacketDocPane, { type CompactDocItem } from '../client/CompactPacketDocPane'
import InvoiceAiReviewOutcomePanel from './InvoiceAiReviewOutcomePanel'
import { getAdminBatchStatusBadge } from './adminBatchStatus'
import { getBatchById, updateBatchStatus } from '../../data/mockBatches'
import { getInvoicesByBatchId, updateInvoice } from '../../data/mockInvoices'
import { mergeBatchFiles } from '../../data/batchFileStore'
import type { BatchIntakeDraft } from '../../types/credyxBatch'
import type { Invoice } from '../../types/invoice'
import { useClientTheme } from '../../theme/ThemeContext'
import { useToast } from '../ui/ToastProvider'
import { useAuth } from '../../context/AuthContext'
import { getAdminUserDisplayName } from '../../config/adminNav'
import { hydrateIntakeDraftFromBatch } from '../../utils/buildIntakeDraftFromBatch'
import { groupPacketDocuments } from '../../utils/batchPacketDocs'
import { formatCurrency } from '../../utils/format'
import { invoiceAiReviewSnapshotFor } from '../../utils/invoiceAiReviewSnapshot'
import {
  invoicePatchFromPaperwork,
  snapshotAfterPacketResolve,
  snapshotHasResolvablePacketIssues,
} from '../../utils/packetOnFileReview'
import { getInvoiceAiReviewCache, setInvoiceAiReviewCache } from '../../data/invoiceAiReviewCache'
import {
  invoiceAiVerifyBadgeClass,
  invoiceAiVerifyUi,
} from '../../utils/invoiceAiVerificationStatus'
import { isAIReviewEnabled } from '../../config/aiReview'
import { runBatchAiReview } from '../../services/credyx/batchAiReviewService'
import { approveAdminInvoice, holdAdminInvoice } from '../../services/adminInvoiceActions'
import { processVerifiedBatch } from '../../services/credyx/processBatch'
import {
  ensureStoredBatchFile,
  prefetchStoredBatchFiles,
} from '../../utils/resolveHandoffDocuments'
import { useTenantDataRevision } from '../../hooks/useTenantDataRevision'
import {
  canOpenPacketRework,
  getAdminBatchAiReviewProgress,
} from '../../utils/adminBatchQueue'

interface BatchAiVerificationWorkspaceProps {
  batchId: string
  onClose: () => void
  onOpenPackets?: (batchId: string) => void
  onProcessed?: () => void
}

function attachFetchedFile(
  prev: BatchIntakeDraft | null,
  docId: string,
  file: File
): BatchIntakeDraft | null {
  if (!prev || prev.fileById.has(docId)) return prev
  const nextFiles = new Map(prev.fileById)
  nextFiles.set(docId, file)
  const invoices = docId.startsWith('invoice-pdf-')
    ? prev.invoices.map((inv) => {
        const matches =
          docId === `invoice-pdf-${inv.groupId}` || docId === `invoice-pdf-${inv.draftId}`
        return matches && !inv.invoice_pdf ? { ...inv, invoice_pdf: file } : inv
      })
    : prev.invoices
  return { ...prev, fileById: nextFiles, invoices }
}

function toCompact(rows: { docId: string; fileName: string; file?: File; generated?: boolean }[]): CompactDocItem[] {
  return rows.map((row) => ({
    id: row.docId,
    name: row.fileName,
    file: row.file,
    generated: Boolean(row.generated),
  }))
}

/**
 * Packet-style AI verification: compact invoice rail, dual doc panes,
 * AI outcome under packet info, and OK / needs review / hold actions.
 */
export default function BatchAiVerificationWorkspace({
  batchId,
  onClose,
  onOpenPackets,
  onProcessed,
}: BatchAiVerificationWorkspaceProps) {
  const c = useClientTheme()
  const { showToast } = useToast()
  const { resolved, session } = useAuth()
  const authUser = resolved.user ?? session?.user ?? null
  const adminUserName = getAdminUserDisplayName(authUser?.email ?? null)
  const adminUserId = authUser?.id ?? 'unknown'
  const tenantRevision = useTenantDataRevision()

  const batch = getBatchById(batchId)
  const [draft, setDraft] = useState<BatchIntakeDraft | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [reviewing, setReviewing] = useState(false)
  const [reviewProgress, setReviewProgress] = useState('')
  const [reviewFill, setReviewFill] = useState<{ invoiceId: string; remaining: number } | null>(
    null
  )
  const [processing, setProcessing] = useState(false)
  const [holdReason, setHoldReason] = useState('')
  const [invoices, setInvoices] = useState<Invoice[]>(() => getInvoicesByBatchId(batchId))
  const autoReviewStarted = useRef(false)
  const draftRef = useRef(draft)
  draftRef.current = draft

  const refreshInvoices = useCallback(() => {
    setInvoices(getInvoicesByBatchId(batchId).map((inv) => ({ ...inv })))
  }, [batchId])

  const patchInvoice = (updated?: Invoice) => {
    if (!updated) return
    setInvoices((prev) => prev.map((inv) => (inv.id === updated.id ? { ...updated } : inv)))
  }

  // Live sync: invoices appear as AI intake finishes.
  useEffect(() => {
    refreshInvoices()
  }, [tenantRevision, refreshInvoices])

  useEffect(() => {
    let cancelled = false
    const isFirstLoad = !draftRef.current
    if (isFirstLoad) {
      setLoading(true)
      setError(null)
    }
    void hydrateIntakeDraftFromBatch(batchId)
      .then((next) => {
        if (cancelled) return
        if (!next) {
          if (isFirstLoad) {
            setError('Could not load this batch for AI verification.')
            setDraft(null)
          }
          return
        }
        setDraft(next)
        mergeBatchFiles(batchId, next.fileById)
        refreshInvoices()
      })
      .catch((err) => {
        if (!cancelled && isFirstLoad) {
          setError(err instanceof Error ? err.message : 'Failed to load packet documents')
        }
      })
      .finally(() => {
        if (!cancelled && isFirstLoad) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [batchId, tenantRevision, refreshInvoices])

  const storagePathsKey = draft?.storagePathsByDocId
    ? Object.keys(draft.storagePathsByDocId).sort().join('\0')
    : ''

  useEffect(() => {
    const paths = draft?.storagePathsByDocId
    if (!paths || Object.keys(paths).length === 0) return
    let cancelled = false
    void prefetchStoredBatchFiles(batchId, paths, {
      concurrency: 4,
      shouldContinue: () => !cancelled,
      onFile: (docId, file) => {
        if (cancelled) return
        setDraft((prev) => attachFetchedFile(prev, docId, file))
      },
    })
    return () => {
      cancelled = true
    }
  }, [batchId, storagePathsKey])

  const runAiReview = useCallback(async () => {
    if (!isAIReviewEnabled()) {
      showToast('Configure the openai-proxy Edge Function to enable AI review.', 'error')
      return
    }
    setReviewing(true)
    setReviewProgress('Starting AI review…')
    try {
      const current = draftRef.current
      if (current && current.fileById.size > 0) mergeBatchFiles(batchId, current.fileById)
      await runBatchAiReview(batchId, (p) => {
        setReviewProgress(
          p.currentInvoiceNumber
            ? `Reviewing ${p.currentInvoiceNumber} (${p.completed + 1}/${p.total})`
            : `Progress ${p.completed}/${p.total}`
        )
        if (p.currentInvoiceId) {
          setReviewFill({
            invoiceId: p.currentInvoiceId,
            remaining: Math.max(0, 100 - (p.invoiceProgress ?? 0)),
          })
          setInvoices((prev) =>
            prev.map((inv) =>
              inv.id === p.currentInvoiceId && inv.ai_review_status !== 'running'
                ? { ...inv, ai_review_status: 'running' }
                : inv
            )
          )
        }
      })
      refreshInvoices()
      showToast('AI review finished', 'success')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'AI review failed', 'error')
    } finally {
      setReviewing(false)
      setReviewProgress('')
      setReviewFill(null)
    }
  }, [batchId, showToast, refreshInvoices])

  useEffect(() => {
    if (loading || !draft || autoReviewStarted.current) return
    if (batch?.status === 'creating' || batch?.sort_status === 'sorting') return
    if (invoices.length === 0) return
    const needsRun = invoices.some(
      (inv) => !inv.ai_review_status || inv.ai_review_status === 'not_run'
    )
    if (!needsRun) return
    autoReviewStarted.current = true
    if (batch && batch.status === 'ready_to_post') {
      updateBatchStatus(batchId, 'verification')
    }
    void runAiReview()
  }, [loading, draft, invoices, batch, batchId, runAiReview])

  useEffect(() => {
    if (selectedId && invoices.some((inv) => inv.id === selectedId)) return
    setSelectedId(invoices[0]?.id ?? null)
  }, [invoices, selectedId])

  useEffect(() => {
    const inv = invoices.find((item) => item.id === selectedId)
    setHoldReason(inv?.hold_reason ?? '')
    // Only reset when the selected packet changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId])

  const selected = invoices.find((inv) => inv.id === selectedId) ?? null
  const selectedDraft = selected
    ? draft?.invoices.find((d) => d.draftId === selected.id) ?? null
    : null

  const packetGroups = useMemo(
    () => (selectedDraft && draft ? groupPacketDocuments(selectedDraft, draft.fileById) : []),
    [selectedDraft, draft]
  )

  const rateConPaneDocs = useMemo((): CompactDocItem[] => {
    const invoiceRows = packetGroups.flatMap((g) => (g.category === 'invoice' ? g.docs : []))
    const rcRows = packetGroups.flatMap((g) =>
      g.category === 'rate_confirmation' ||
      g.category === 'other' ||
      g.category === 'lumper' ||
      g.category === 'scale'
        ? g.docs
        : []
    )
    return [...toCompact(invoiceRows), ...toCompact(rcRows)]
  }, [packetGroups])

  const bolPaneDocs = useMemo(
    () => toCompact(packetGroups.flatMap((g) => (g.category === 'bol' || g.category === 'pod' ? g.docs : []))),
    [packetGroups]
  )

  const ensureDocumentFile = useCallback(
    async (docId: string) => {
      if (!draft) return
      if (draft.fileById.has(docId)) return
      const storagePath = draft.storagePathsByDocId?.[docId]
      if (!storagePath) return
      try {
        const fileName =
          draft.invoices
            .flatMap((inv) => [
              ...inv.fingerprints.rateCons,
              ...inv.fingerprints.bols,
              ...(inv.fingerprints.other ?? []),
            ])
            .find((fp) => fp.docId === docId)?.fileName
        const file = await ensureStoredBatchFile(batchId, docId, storagePath, fileName)
        if (!file) return
        setDraft((prev) => attachFetchedFile(prev, docId, file))
      } catch (err) {
        console.warn('[BatchAiVerificationWorkspace] ensureDocumentFile failed', docId, err)
      }
    },
    [batchId, draft]
  )

  const markOk = (invoice: Invoice) => {
    patchInvoice(approveAdminInvoice(invoice.id, adminUserName))
  }

  const markHold = (invoice: Invoice) => {
    const reason = holdReason.trim()
    if (!reason) {
      showToast('Enter a hold reason the carrier will see.', 'error')
      return
    }
    patchInvoice(holdAdminInvoice(invoice.id, reason, adminUserName))
  }

  const setVerifyChannel = (invoice: Invoice, channel: Invoice['verification_status']) => {
    patchInvoice(updateInvoice(invoice.id, { verification_status: channel }))
  }

  const resolvePacketIssues = (invoice: Invoice) => {
    const snapshot = invoiceAiReviewSnapshotFor(invoice)
    const paperwork = snapshot?.paperwork
    if (!snapshot || !paperwork) {
      showToast('Run AI review first so paperwork values are available.', 'error')
      return
    }
    const fieldPatch = invoicePatchFromPaperwork(paperwork)
    if (Object.keys(fieldPatch).length === 0) {
      showToast('No paperwork load, amount, or broker to copy.', 'info')
      return
    }
    const merged = updateInvoice(invoice.id, fieldPatch)
    if (!merged) return
    const nextSnap = snapshotAfterPacketResolve(snapshot, {
      loadNumber: merged.load_number,
      amount: merged.amount,
      brokerName: merged.broker_name,
      carrierName: merged.client_name,
    })
    const saved = updateInvoice(merged.id, {
      ai_review_snapshot: JSON.stringify(nextSnap),
      ai_review_summary: nextSnap.headline,
      ai_review_status: nextSnap.ready ? 'ready' : 'needs_work',
    })
    const cached = getInvoiceAiReviewCache(merged.id)
    if (cached) setInvoiceAiReviewCache(merged.id, { ...cached, snapshot: nextSnap })
    else setInvoiceAiReviewCache(merged.id, { snapshot: nextSnap })
    patchInvoice(saved)
    showToast('Packet updated from paperwork. Carrier was left as the submitting account.', 'success')
  }

  const verifiedCount = invoices.filter((inv) => inv.status === 'approved' || inv.status === 'hold').length
  const allVerified = invoices.length > 0 && verifiedCount === invoices.length
  const holdCount = invoices.filter((inv) => inv.status === 'hold').length
  const okCount = invoices.filter((inv) => invoiceAiVerifyUi(inv).status === 'ok').length
  const needsCount = invoices.filter((inv) => {
    const ui = invoiceAiVerifyUi(inv)
    return ui.status === 'needs_review' && !ui.onHold
  }).length
  const aiProgress = getAdminBatchAiReviewProgress(batchId)
  const packetsReady = batch ? canOpenPacketRework(batch) : false
  const stillCreating =
    batch?.status === 'creating' ||
    batch?.sort_status === 'sorting' ||
    (invoices.length === 0 &&
      (batch?.upload_mode === 'ai' || batch?.upload_mode === 'handoff'))

  const handleProcess = async () => {
    if (!batch || processing) return
    if (!allVerified) {
      showToast(
        `Set every invoice to OK or Hold before processing (${verifiedCount}/${invoices.length}).`,
        'error'
      )
      return
    }
    setProcessing(true)
    try {
      const result = await processVerifiedBatch({
        batchId,
        batchNumber: batch.batch_number,
        clientId: batch.client_id,
        totalAmount: batch.total_amount,
        adminUserId,
        adminUserName,
      })
      if (!result.ok) {
        showToast(result.error ?? 'Batch processing failed', 'error')
        return
      }
      showToast(
        holdCount > 0
          ? `Batch processed with ${holdCount} on hold.`
          : 'Batch processed — invoices marked OK.',
        holdCount > 0 ? 'info' : 'success'
      )
      onProcessed?.()
      onClose()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Batch processing failed', 'error')
    } finally {
      setProcessing(false)
    }
  }

  if (loading) {
    return (
      <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-3 p-8">
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: c.secondary }} />
        <p className="text-sm" style={{ color: c.secondary }}>
          Loading AI verification…
        </p>
      </div>
    )
  }

  if (error || !draft || !batch) {
    return (
      <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-3 p-8">
        <p className="text-sm font-medium" style={{ color: c.primary }}>
          {error || 'Batch not found'}
        </p>
        <button type="button" className="dashboard-btn-secondary" onClick={onClose}>
          <ArrowLeft className="w-4 h-4" />
          Back to batches
        </button>
      </div>
    )
  }

  const snapshot = selected ? invoiceAiReviewSnapshotFor(selected) : null
  const selectedUi = selected ? invoiceAiVerifyUi(selected) : null
  const extracted = snapshot?.paperwork

  return (
    <div className="batch-packet-workspace flex-1 min-h-0 overflow-hidden flex flex-col">
      <div
        className="shrink-0 flex items-center justify-between gap-3 px-4 py-2 border-b"
        style={{ borderColor: c.border, backgroundColor: c.card }}
      >
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide" style={{ color: c.secondary }}>
            AI verification
          </p>
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <p className="text-sm font-semibold truncate" style={{ color: c.primary }}>
              {draft.batchNumber} · {batch.client_name}
            </p>
            {getAdminBatchStatusBadge(batch.status)}
            {aiProgress.label ? (
              <span className="text-xs tabular-nums" style={{ color: c.secondary }}>
                {aiProgress.label}
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {onOpenPackets && (
            <button
              type="button"
              className={`dashboard-btn-secondary !h-8${packetsReady ? '' : ' opacity-50'}`}
              title={
                packetsReady
                  ? 'Open Packets rework workspace'
                  : 'Packet rework unlocks when invoices are ready'
              }
              onClick={() => {
                if (!packetsReady) {
                  showToast(
                    'Packet rework unlocks when invoices are created and AI is not still running.',
                    'info'
                  )
                  return
                }
                onOpenPackets(batchId)
              }}
            >
              Packets
            </button>
          )}
          <button
            type="button"
            className="dashboard-btn-secondary !h-8"
            disabled={reviewing || invoices.length === 0 || stillCreating}
            onClick={() => void runAiReview()}
          >
            <Sparkles className="w-3.5 h-3.5" />
            {reviewing ? 'Reviewing…' : 'Run AI review'}
          </button>
          <button
            type="button"
            className="dashboard-btn-primary !h-8"
            disabled={!allVerified || processing}
            onClick={() => void handleProcess()}
          >
            {processing ? 'Processing…' : 'Process batch'}
          </button>
          <button type="button" className="dashboard-btn-secondary !h-8" onClick={onClose}>
            <ArrowLeft className="w-3.5 h-3.5" />
            Close
          </button>
        </div>
      </div>

      {stillCreating && invoices.length === 0 ? (
        <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-3 p-8">
          <Loader2 className="w-8 h-8 animate-spin" style={{ color: c.secondary }} />
          <p className="text-sm font-medium" style={{ color: c.primary }}>
            {batch.status === 'creating' ? 'Creating invoices from documents…' : 'Sorting documents…'}
          </p>
          <p className="text-xs text-center max-w-md" style={{ color: c.secondary }}>
            This page updates live. When invoices appear you can review extracted fields and AI
            checks. Packet rework unlocks when the batch is ready.
          </p>
        </div>
      ) : (
      <div className="flex-1 min-h-0 overflow-hidden client-ai-upload">
        <div className="client-ai-review client-ai-review--packets">
          <div className="client-ai-review__toolbar">
            <div className="client-ai-review__toolbar-summary">
              <strong>
                {okCount} OK
              </strong>
              <span>· {needsCount} needs review</span>
              <span>· {holdCount} hold</span>
              <span>· {verifiedCount}/{invoices.length} ready to process</span>
              {aiProgress.label && <span>· {aiProgress.label}</span>}
              {reviewProgress && <span>· {reviewProgress}</span>}
            </div>
          </div>

          <aside className="client-ai-review__rail">
            <div className="client-ai-review__rail-head client-ai-review__rail-head--compact">
              <div>
                <p className="client-ai-review__rail-kicker">Invoices</p>
                <p className="client-ai-review__rail-count">{invoices.length}</p>
              </div>
            </div>
            <div className="client-ai-review__rail-list client-ai-review__rail-list--compact">
              {invoices.map((inv) => {
                const ui = invoiceAiVerifyUi(inv)
                const active = inv.id === selectedId
                const isReviewing = reviewFill?.invoiceId === inv.id
                const fillRemaining = isReviewing ? reviewFill.remaining : 0
                return (
                  <button
                    key={inv.id}
                    type="button"
                    className={`client-ai-verify__row${active ? ' is-active' : ''}${
                      isReviewing ? ' is-reviewing' : ''
                    }`}
                    style={
                      isReviewing
                        ? ({ '--ai-fill': `${fillRemaining}%` } as CSSProperties)
                        : undefined
                    }
                    onClick={() => setSelectedId(inv.id)}
                  >
                    {isReviewing && (
                      <span className="client-ai-verify__row-fill" aria-hidden />
                    )}
                    <span className="client-ai-verify__row-num">#{inv.invoice_number}</span>
                    <span className="client-ai-verify__row-amt">{formatCurrency(inv.amount)}</span>
                    <span className="client-ai-verify__row-meta">
                      {inv.load_number || '—'} · {inv.client_name}
                    </span>
                    <span className={`client-ai-verify__badge ${invoiceAiVerifyBadgeClass(ui.status, ui.label)}`}>
                      {ui.label}
                    </span>
                  </button>
                )
              })}
            </div>
          </aside>

          <div className="client-ai-review__editor client-ai-review__editor--compact">
            {selected ? (
              <>
                <div className="client-ai-review__editor-head client-ai-review__editor-head--compact">
                  <h3 className="client-ai-review__panel-title">#{selected.invoice_number}</h3>
                  {selectedUi && (
                    <span className={`client-ai-verify__badge ${invoiceAiVerifyBadgeClass(selectedUi.status, selectedUi.label)}`}>
                      {selectedUi.label}
                    </span>
                  )}
                </div>

                <dl className="client-ai-verify__facts">
                  <div>
                    <dt>Inv #</dt>
                    <dd>{selected.invoice_number}</dd>
                  </div>
                  <div>
                    <dt>Load #</dt>
                    <dd>{selected.load_number || extracted?.loadNumber || '—'}</dd>
                  </div>
                  <div>
                    <dt>Carrier</dt>
                    <dd>{selected.client_name || extracted?.carrierName || '—'}</dd>
                  </div>
                  <div>
                    <dt>Amount</dt>
                    <dd>
                      {formatCurrency(
                        extracted?.amount != null && Number.isFinite(extracted.amount)
                          ? extracted.amount
                          : selected.amount
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Broker</dt>
                    <dd>{selected.broker_name || extracted?.brokerName || '—'}</dd>
                  </div>
                  <div>
                    <dt>Date</dt>
                    <dd>{selected.invoice_date?.slice(0, 10) || '—'}</dd>
                  </div>
                </dl>

                {extracted &&
                  (extracted.loadNumber ||
                    extracted.amount != null ||
                    extracted.brokerName ||
                    extracted.carrierName) && (
                    <section className="client-ai-verify__outcome" style={{ marginBottom: 8 }}>
                      <div className="client-ai-verify__outcome-head">
                        <h4 className="client-ai-verify__outcome-title">Extracted from paperwork</h4>
                      </div>
                      <ul className="client-ai-verify__checks">
                        {extracted.loadNumber ? (
                          <li className="client-ai-verify__check is-ok">
                            <Check className="w-3 h-3 shrink-0" />
                            <span className="client-ai-verify__check-label">
                              Load {extracted.loadNumber}
                            </span>
                          </li>
                        ) : null}
                        {extracted.amount != null && Number.isFinite(extracted.amount) ? (
                          <li className="client-ai-verify__check is-ok">
                            <Check className="w-3 h-3 shrink-0" />
                            <span className="client-ai-verify__check-label">
                              Amount {formatCurrency(extracted.amount)}
                            </span>
                          </li>
                        ) : null}
                        {extracted.brokerName ? (
                          <li className="client-ai-verify__check is-ok">
                            <Check className="w-3 h-3 shrink-0" />
                            <span className="client-ai-verify__check-label">
                              Broker {extracted.brokerName}
                            </span>
                          </li>
                        ) : null}
                        {extracted.carrierName ? (
                          <li className="client-ai-verify__check is-ok">
                            <Check className="w-3 h-3 shrink-0" />
                            <span className="client-ai-verify__check-label">
                              Carrier {extracted.carrierName}
                            </span>
                          </li>
                        ) : null}
                      </ul>
                    </section>
                  )}

                <InvoiceAiReviewOutcomePanel
                  invoice={selected}
                  snapshot={snapshot}
                  summary={selected.ai_review_summary}
                  canResolve={snapshotHasResolvablePacketIssues(snapshot)}
                  onResolve={() => resolvePacketIssues(selected)}
                />

                <section className="client-ai-verify__actions">
                  <div className="client-ai-verify__channel" role="group" aria-label="Verification method">
                    {(['Email', 'Phone', 'Web'] as const).map((channel) => (
                      <button
                        key={channel}
                        type="button"
                        className={`client-ai-verify__chip${
                          selected.verification_status === channel ? ' is-on' : ''
                        }`}
                        onClick={() => setVerifyChannel(selected, channel)}
                      >
                        {channel}
                      </button>
                    ))}
                  </div>
                  <div className="client-ai-verify__btns">
                    <button
                      type="button"
                      className="client-ai-verify__mini-btn client-ai-verify__mini-btn--ok"
                      onClick={() => markOk(selected)}
                    >
                      <Check className="w-3 h-3" />
                      OK
                    </button>
                    <button
                      type="button"
                      className="client-ai-verify__mini-btn client-ai-verify__mini-btn--hold"
                      onClick={() => markHold(selected)}
                    >
                      <AlertCircle className="w-3 h-3" />
                      Hold
                    </button>
                  </div>
                  <label className="client-ai-verify__hold">
                    Hold reason
                    <textarea
                      value={holdReason}
                      onChange={(e) => setHoldReason(e.target.value)}
                      rows={2}
                      placeholder="Carrier-visible — e.g. missing POD"
                    />
                  </label>
                </section>
              </>
            ) : (
              <p className="client-ai-review__empty-main">Select an invoice.</p>
            )}
          </div>

          <div className="client-ai-review__dual-docs">
            <CompactPacketDocPane
              title="Rate con"
              documents={rateConPaneDocs}
              emptyHint="No rate confirmation"
              onEnsureDocument={ensureDocumentFile}
            />
            <CompactPacketDocPane
              title="BOL"
              documents={bolPaneDocs}
              emptyHint="No BOL"
              onEnsureDocument={ensureDocumentFile}
            />
          </div>
        </div>
      </div>
      )}
    </div>
  )
}
