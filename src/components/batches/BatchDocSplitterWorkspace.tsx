/**
 * Credyx Doc Splitter — split multi-page PDFs into pages, then mark each as
 * RC / BOL / INV before Packet Rework.
 *
 * Flow: select a category → click a pending page/file → it moves into that
 * bin and leaves the pending list. Click any categorized file to preview.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, FileStack, Loader2, Scissors } from 'lucide-react'
import { getBatchById, updateBatch } from '../../data/mockBatches'
import { setBatchFiles } from '../../data/batchFileStore'
import type { BatchIntakeDraft } from '../../types/credyxBatch'
import type { DocSortFingerprint, DocSortKind } from '../../products/docSort/types'
import { useClientTheme } from '../../theme/ThemeContext'
import { useToast } from '../ui/ToastProvider'
import CompactPacketDocPane, { type CompactDocItem } from '../client/CompactPacketDocPane'
import { hydrateIntakeDraftFromBatch } from '../../utils/buildIntakeDraftFromBatch'
import { clearBatchNeedsDocSplit } from '../../utils/batchDocSplit'
import {
  canUnpackDraftDocument,
  createManualDocFingerprint,
  ensureDocumentUnassigned,
  isGeneratedInvoicePdfDoc,
  locateDraftDocument,
  placeDraftDocument,
  splitDraftPdfIntoPages,
  unpackDraftDocument,
  withPrunedUnmatched,
} from '../../utils/aiDraftDocOps'
import { buildDocSortSnapshot } from '../../products/docSort/utils/docSortSnapshot'
import { notifyTenantDataUpdated } from '../../services/supabase/tenantDataLiveSync'
import {
  ensureStoredBatchFile,
  prefetchStoredBatchFiles,
} from '../../utils/resolveHandoffDocuments'
import { getPdfPageCount, isPdfFile } from '../../utils/pdfPageExtract'

type MarkCategory = 'rc' | 'bol' | 'inv'

const CATEGORIES: Array<{
  id: MarkCategory
  label: string
  short: string
  kind: DocSortKind
}> = [
  { id: 'rc', label: 'Rate confirmation', short: 'RC', kind: 'rate_confirmation' },
  { id: 'bol', label: 'Bill of lading', short: 'BOL', kind: 'bill_of_lading' },
  { id: 'inv', label: 'Invoice', short: 'INV', kind: 'invoice' },
]

interface BatchDocSplitterWorkspaceProps {
  batchId: string
  onClose: () => void
  onContinueToPacketRework: (batchId: string) => void
}

function kindForCategory(category: MarkCategory): DocSortKind {
  return CATEGORIES.find((row) => row.id === category)?.kind ?? 'invoice'
}

function markCategoryForKind(kind: DocSortKind): MarkCategory | null {
  if (kind === 'rate_confirmation') return 'rc'
  if (kind === 'bill_of_lading') return 'bol'
  if (kind === 'invoice') return 'inv'
  // `other` / lumper stay in the pending inbox until staff marks them.
  return null
}

function findFingerprintLabel(draft: BatchIntakeDraft, docId: string): string {
  const located = locateDraftDocument(draft, docId)
  if (located?.fingerprint.fileName) return located.fingerprint.fileName
  return draft.fileById.get(docId)?.name || docId
}

function attachFetchedFile(
  prev: BatchIntakeDraft | null,
  docId: string,
  file: File
): BatchIntakeDraft | null {
  if (!prev || prev.fileById.has(docId)) return prev
  const nextFiles = new Map(prev.fileById)
  nextFiles.set(docId, file)
  return { ...prev, fileById: nextFiles }
}

/** Every supporting doc fingerprint currently in the draft. */
function listAllSupportingFingerprints(draft: BatchIntakeDraft): DocSortFingerprint[] {
  const byId = new Map<string, DocSortFingerprint>()

  const push = (fp: DocSortFingerprint) => {
    if (!fp.docId || fp.docId.startsWith('invoice-pdf-')) return
    byId.set(fp.docId, fp)
  }

  for (const fp of [
    ...draft.unmatched.rateCons,
    ...draft.unmatched.bols,
    ...draft.unmatched.other,
  ]) {
    push(fp)
  }

  for (const inv of draft.invoices) {
    for (const fp of [
      ...inv.fingerprints.rateCons,
      ...inv.fingerprints.bols,
      ...(inv.fingerprints.other ?? []),
    ]) {
      push(fp)
    }
    for (const docId of inv.document_doc_ids) {
      if (byId.has(docId) || isGeneratedInvoicePdfDoc(inv, docId)) continue
      const file = draft.fileById.get(docId)
      if (file) push(createManualDocFingerprint(docId, file))
    }
  }

  for (const [docId, file] of draft.fileById) {
    if (byId.has(docId) || docId.startsWith('invoice-pdf-')) continue
    push(createManualDocFingerprint(docId, file))
  }

  for (const docId of Object.keys(draft.storagePathsByDocId ?? {})) {
    if (byId.has(docId) || docId.startsWith('invoice-pdf-')) continue
    byId.set(docId, {
      docId,
      fileName: docId,
      kind: 'other',
      confidence: 0,
      loadNumbers: [],
    })
  }

  return [...byId.values()]
}

/** Pull packet docs into unmatched so Doc Splitter owns categorization. */
function ensureDocsInUnmatchedPool(draft: BatchIntakeDraft): BatchIntakeDraft {
  let next = draft
  for (const fp of listAllSupportingFingerprints(draft)) {
    const located = locateDraftDocument(next, fp.docId)
    if (located?.fromDraftId) {
      next = placeDraftDocument(next, fp.docId, null, 'preserve')
      continue
    }
    const alreadyInPool =
      next.unmatched.rateCons.some((row) => row.docId === fp.docId) ||
      next.unmatched.bols.some((row) => row.docId === fp.docId) ||
      next.unmatched.other.some((row) => row.docId === fp.docId)
    if (!alreadyInPool) {
      next = ensureDocumentUnassigned(next, fp.docId, fp)
    }
  }
  return withPrunedUnmatched(next)
}

/**
 * Break multi-page PDFs into one pending page each so staff mark pages,
 * not whole combined files.
 */
async function explodeMultiPagePdfs(draft: BatchIntakeDraft): Promise<{
  draft: BatchIntakeDraft
  splitCount: number
}> {
  let next = draft
  let splitCount = 0
  const ids = listAllSupportingFingerprints(next).map((fp) => fp.docId)

  for (const docId of ids) {
    const file = next.fileById.get(docId)
    if (!file || !isPdfFile(file)) continue
    // Already categorized RC/BOL/INV — leave alone.
    const located = locateDraftDocument(next, docId)
    if (located && markCategoryForKind(located.fingerprint.kind)) continue

    const pages = await getPdfPageCount(file)
    if (pages <= 1) continue

    // Prefer AI kind-group unpack when page types were detected.
    if (canUnpackDraftDocument(next, docId)) {
      const result = await unpackDraftDocument(next, docId)
      next = ensureDocsInUnmatchedPool(result.draft)
      if (result.status === 'unpacked') splitCount += 1
      continue
    }

    const result = await splitDraftPdfIntoPages(next, docId)
    next = ensureDocsInUnmatchedPool(result.draft)
    if (result.status === 'unpacked') splitCount += 1
  }

  return { draft: next, splitCount }
}

/** Admin workspace: page-split PDFs, then click-assign RC / BOL / INV. */
export default function BatchDocSplitterWorkspace({
  batchId,
  onClose,
  onContinueToPacketRework,
}: BatchDocSplitterWorkspaceProps) {
  const c = useClientTheme()
  const { showToast } = useToast()
  const batch = getBatchById(batchId)
  const [draft, setDraft] = useState<BatchIntakeDraft | null>(null)
  const [loading, setLoading] = useState(true)
  const [splitting, setSplitting] = useState(false)
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null)
  const [activeCategory, setActiveCategory] = useState<MarkCategory | null>('rc')
  const [error, setError] = useState<string | null>(null)

  const persistDraftFiles = useCallback(
    (next: BatchIntakeDraft) => {
      setBatchFiles(batchId, next.fileById)
      const unmatched = next.unmatched
      const unmatchedIds = [
        ...unmatched.rateCons,
        ...unmatched.bols,
        ...unmatched.other,
      ].map((fp) => fp.docId)
      const pendingLeft = unmatched.other.length > 0
      const nextStatus = pendingLeft
        ? 'needs_split'
        : batch?.status === 'needs_split'
          ? 'rework'
          : batch?.status
      updateBatch(batchId, {
        unmatched_doc_ids: unmatchedIds,
        doc_sort_snapshot: buildDocSortSnapshot(
          {
            ...next.sortResult,
            unmatchedRateCons: unmatched.rateCons,
            unmatchedBols: unmatched.bols,
            otherDocuments: unmatched.other,
          },
          next.invoices
        ),
        // Keep Doc Split gate while pending pages remain.
        needs_doc_split: pendingLeft,
        sort_status: pendingLeft ? 'needs_split' : 'failed',
        ...(nextStatus ? { status: nextStatus } : {}),
      })
      notifyTenantDataUpdated(['batches'], batch?.client_id)
    },
    [batch?.client_id, batch?.status, batchId]
  )

  const loadDraft = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const hydrated = await hydrateIntakeDraftFromBatch(batchId)
      if (!hydrated) {
        setError('Could not load batch documents for Doc Splitter.')
        setDraft(null)
        return
      }
      let next = ensureDocsInUnmatchedPool(hydrated)

      // Fetch files needed to count/split pages.
      const paths = next.storagePathsByDocId ?? {}
      for (const docId of Object.keys(paths)) {
        if (next.fileById.has(docId)) continue
        const file = await ensureStoredBatchFile(
          batchId,
          docId,
          paths[docId],
          findFingerprintLabel(next, docId)
        )
        if (file) {
          const fileById = new Map(next.fileById)
          fileById.set(docId, file)
          next = { ...next, fileById }
        }
      }

      setSplitting(true)
      const exploded = await explodeMultiPagePdfs(next)
      next = exploded.draft
      setDraft(next)
      persistDraftFiles(next)

      const pending = listAllSupportingFingerprints(next).filter(
        (fp) => !markCategoryForKind(fp.kind)
      )
      setSelectedDocId(pending[0]?.docId ?? listAllSupportingFingerprints(next)[0]?.docId ?? null)

      if (exploded.splitCount > 0) {
        showToast(
          `Split ${exploded.splitCount} PDF${exploded.splitCount === 1 ? '' : 's'} into pages — mark each as RC / BOL / INV.`,
          'success'
        )
      }
    } catch (err) {
      console.warn('[BatchDocSplitterWorkspace] hydrate failed', err)
      setError(err instanceof Error ? err.message : 'Failed to load documents')
    } finally {
      setSplitting(false)
      setLoading(false)
    }
  }, [batchId, persistDraftFiles, showToast])

  useEffect(() => {
    void loadDraft()
  }, [loadDraft])

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

  const allDocs = useMemo(
    () => (draft ? listAllSupportingFingerprints(draft) : []),
    [draft]
  )

  const pendingDocs = useMemo(
    () => allDocs.filter((fp) => !markCategoryForKind(fp.kind)),
    [allDocs]
  )

  const docsByCategory = useMemo(() => {
    const buckets: Record<MarkCategory, DocSortFingerprint[]> = {
      rc: [],
      bol: [],
      inv: [],
    }
    for (const fp of allDocs) {
      const cat = markCategoryForKind(fp.kind)
      if (cat) buckets[cat].push(fp)
    }
    return buckets
  }, [allDocs])

  const previewDocs: CompactDocItem[] = useMemo(() => {
    if (!draft || !selectedDocId) return []
    return [
      {
        id: selectedDocId,
        name: findFingerprintLabel(draft, selectedDocId),
        file: draft.fileById.get(selectedDocId),
      },
    ]
  }, [draft, selectedDocId])

  const ensureFileForDoc = async (docId: string, current: BatchIntakeDraft) => {
    if (current.fileById.has(docId)) return current
    const storagePath = current.storagePathsByDocId?.[docId]
    if (!storagePath) return current
    const fileName = findFingerprintLabel(current, docId)
    const file = await ensureStoredBatchFile(batchId, docId, storagePath, fileName)
    if (!file) return current
    const fileById = new Map(current.fileById)
    fileById.set(docId, file)
    const next = { ...current, fileById }
    setDraft(next)
    return next
  }

  /** Move a pending (or already marked) doc into the active category. */
  const assignToCategory = (docId: string, category: MarkCategory) => {
    if (!draft) return
    const kind = kindForCategory(category)
    const alreadyInPool =
      draft.unmatched.rateCons.some((row) => row.docId === docId) ||
      draft.unmatched.bols.some((row) => row.docId === docId) ||
      draft.unmatched.other.some((row) => row.docId === docId)
    let next = alreadyInPool ? draft : ensureDocumentUnassigned(draft, docId)
    next = placeDraftDocument(next, docId, null, kind)
    setDraft(next)
    persistDraftFiles(next)

    // After assigning from pending, preview next pending page (or the one just marked).
    const remainingPending = listAllSupportingFingerprints(next).filter(
      (fp) => !markCategoryForKind(fp.kind)
    )
    setSelectedDocId(remainingPending[0]?.docId ?? docId)
  }

  const handlePendingClick = (fp: DocSortFingerprint) => {
    if (!activeCategory) {
      setSelectedDocId(fp.docId)
      showToast('Select RC, BOL, or INV first, then click a pending file to assign it.', 'info')
      return
    }
    assignToCategory(fp.docId, activeCategory)
  }

  const handleCategorizedClick = (fp: DocSortFingerprint) => {
    setSelectedDocId(fp.docId)
  }

  const handleSplitSelected = async () => {
    if (!draft || !selectedDocId) return
    setSplitting(true)
    try {
      const withFile = await ensureFileForDoc(selectedDocId, draft)
      const result = canUnpackDraftDocument(withFile, selectedDocId)
        ? await unpackDraftDocument(withFile, selectedDocId)
        : await splitDraftPdfIntoPages(withFile, selectedDocId)
      const pooled = ensureDocsInUnmatchedPool(result.draft)
      setDraft(pooled)
      persistDraftFiles(pooled)
      const pending = listAllSupportingFingerprints(pooled).filter(
        (fp) => !markCategoryForKind(fp.kind)
      )
      setSelectedDocId(pending[0]?.docId ?? null)
      showToast(
        result.status === 'unpacked'
          ? 'PDF separated into pages — mark each as RC / BOL / INV.'
          : result.message || 'Could not split further.',
        result.status === 'unpacked' ? 'success' : 'info'
      )
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Split failed', 'error')
    } finally {
      setSplitting(false)
    }
  }

  const handleContinue = () => {
    if (pendingDocs.length > 0) {
      const proceed = window.confirm(
        `${pendingDocs.length} page(s) still unmarked. Continue to Packet Rework anyway?`
      )
      if (!proceed) return
    }
    if (draft) persistDraftFiles(draft)
    clearBatchNeedsDocSplit(batchId)
    onContinueToPacketRework(batchId)
  }

  if (!batch) {
    return (
      <div className="p-6">
        <p style={{ color: c.secondary }}>Batch not found.</p>
        <button type="button" className="dashboard-btn-secondary mt-3" onClick={onClose}>
          Back
        </button>
      </div>
    )
  }

  const selectedFile = draft && selectedDocId ? draft.fileById.get(selectedDocId) : undefined
  const selectedCanSplit =
    Boolean(selectedFile && isPdfFile(selectedFile)) &&
    (selectedDocId
      ? pendingDocs.some((fp) => fp.docId === selectedDocId) ||
        (draft ? canUnpackDraftDocument(draft, selectedDocId) : false)
      : false)

  return (
    <div className="flex flex-col min-h-0 h-full overflow-hidden">
      <header
        className="shrink-0 flex flex-wrap items-center gap-3 px-4 py-3 border-b"
        style={{ borderColor: c.border }}
      >
        <button
          type="button"
          onClick={onClose}
          className="client-header-icon-btn p-1.5 rounded-lg"
          style={{ color: c.muted }}
          aria-label="Back to batches"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-xs uppercase tracking-wide" style={{ color: c.muted }}>
            Doc Splitter
          </p>
          <h1 className="text-base font-semibold truncate" style={{ color: c.primary }}>
            {batch.batch_number}
            <span className="font-normal" style={{ color: c.secondary }}>
              {' '}
              · {batch.client_name}
            </span>
          </h1>
          <p className="text-xs mt-0.5" style={{ color: c.secondary }}>
            Select RC, BOL, or INV, then click a pending page to assign it. Click a marked file to
            preview.
          </p>
        </div>
        <button
          type="button"
          className="dashboard-btn-primary shrink-0"
          onClick={handleContinue}
        >
          Continue to Packet Rework
        </button>
      </header>

      {loading ? (
        <div className="flex-1 flex items-center justify-center gap-2" style={{ color: c.secondary }}>
          <Loader2 className="w-5 h-5 animate-spin" />
          {splitting ? 'Separating PDF pages…' : 'Loading documents…'}
        </div>
      ) : error ? (
        <div className="p-6">
          <p style={{ color: '#b91c1c' }}>{error}</p>
          <button type="button" className="dashboard-btn-secondary mt-3" onClick={() => void loadDraft()}>
            Retry
          </button>
        </div>
      ) : allDocs.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 p-8 text-center">
          <FileStack className="w-10 h-10" style={{ color: c.muted }} aria-hidden />
          <p className="font-medium" style={{ color: c.primary }}>
            No documents in this batch
          </p>
          <button type="button" className="dashboard-btn-secondary mt-2" onClick={onClose}>
            Back to batches
          </button>
        </div>
      ) : (
        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[minmax(0,1.1fr)_minmax(300px,0.9fr)] overflow-hidden">
          {/* Left: RC / BOL / INV bins */}
          <div
            className="min-h-0 flex flex-col overflow-hidden border-b lg:border-b-0 lg:border-r"
            style={{ borderColor: c.border }}
          >
            <div
              className="shrink-0 px-3 py-2 border-b text-xs"
              style={{ borderColor: c.border, color: c.secondary, backgroundColor: c.card }}
            >
              Active mark:{' '}
              <strong style={{ color: c.primary }}>
                {activeCategory
                  ? CATEGORIES.find((row) => row.id === activeCategory)?.short
                  : 'none'}
              </strong>
              {' — '}
              click a category, then click a pending page on the right.
            </div>
            <div className="flex-1 min-h-0 grid grid-cols-1 sm:grid-cols-3 overflow-hidden">
              {CATEGORIES.map((cat) => {
                const rows = docsByCategory[cat.id]
                const isActive = activeCategory === cat.id
                return (
                  <section
                    key={cat.id}
                    className="min-h-0 flex flex-col border-b sm:border-b-0 sm:border-r last:sm:border-r-0 overflow-hidden"
                    style={{ borderColor: c.border }}
                  >
                    <button
                      type="button"
                      onClick={() => setActiveCategory(cat.id)}
                      className="shrink-0 px-3 py-2.5 border-b flex items-center justify-between gap-2 text-left"
                      style={{
                        borderColor: c.border,
                        backgroundColor: isActive ? c.card : undefined,
                        boxShadow: isActive ? `inset 0 -2px 0 ${c.accent}` : undefined,
                      }}
                      title={`Assign pending pages as ${cat.short}`}
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-semibold tracking-wide" style={{ color: c.primary }}>
                          {cat.short}
                          {isActive ? ' · selected' : ''}
                        </p>
                        <p className="text-[11px] truncate" style={{ color: c.muted }}>
                          {cat.label}
                        </p>
                      </div>
                      <span className="text-xs tabular-nums" style={{ color: c.secondary }}>
                        {rows.length}
                      </span>
                    </button>
                    <ul className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-2 space-y-1.5">
                      {rows.length === 0 ? (
                        <li className="px-2 py-6 text-center text-xs" style={{ color: c.muted }}>
                          No {cat.short} pages yet
                        </li>
                      ) : (
                        rows.map((fp) => {
                          const active = fp.docId === selectedDocId
                          return (
                            <li key={fp.docId}>
                              <button
                                type="button"
                                onClick={() => handleCategorizedClick(fp)}
                                className="w-full text-left px-2.5 py-2 rounded-lg border text-sm"
                                style={{
                                  borderColor: active ? c.accent : c.border,
                                  backgroundColor: c.card,
                                  color: c.primary,
                                  boxShadow: active ? `inset 0 0 0 1px ${c.accent}` : undefined,
                                }}
                              >
                                <span className="block truncate font-medium">{fp.fileName}</span>
                                <span className="text-[11px]" style={{ color: c.muted }}>
                                  Click to preview
                                </span>
                              </button>
                            </li>
                          )
                        })
                      )}
                    </ul>
                  </section>
                )
              })}
            </div>
          </div>

          {/* Right: pending inbox + preview */}
          <aside className="min-h-0 flex flex-col overflow-hidden" style={{ backgroundColor: c.card }}>
            <div
              className="shrink-0 max-h-[42%] min-h-[140px] flex flex-col border-b overflow-hidden"
              style={{ borderColor: c.border }}
            >
              <div
                className="shrink-0 px-3 py-2 border-b flex items-center justify-between gap-2"
                style={{ borderColor: c.border }}
              >
                <div>
                  <p className="text-xs font-semibold" style={{ color: c.primary }}>
                    Pending pages
                  </p>
                  <p className="text-[11px]" style={{ color: c.muted }}>
                    Click to assign as {activeCategory?.toUpperCase() ?? '…'}
                  </p>
                </div>
                <span className="text-xs tabular-nums" style={{ color: c.secondary }}>
                  {pendingDocs.length}
                </span>
              </div>
              <ul className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-2 space-y-1.5">
                {pendingDocs.length === 0 ? (
                  <li className="px-2 py-6 text-center text-xs" style={{ color: c.muted }}>
                    All pages marked — continue to Packet Rework
                  </li>
                ) : (
                  pendingDocs.map((fp) => {
                    const active = fp.docId === selectedDocId
                    return (
                      <li key={fp.docId}>
                        <button
                          type="button"
                          onClick={() => handlePendingClick(fp)}
                          className="w-full text-left px-2.5 py-2 rounded-lg border text-sm"
                          style={{
                            borderColor: active ? c.accent : c.border,
                            backgroundColor: c.card,
                            color: c.primary,
                            boxShadow: active ? `inset 0 0 0 1px ${c.accent}` : undefined,
                          }}
                        >
                          <span className="block truncate font-medium">{fp.fileName}</span>
                          <span className="text-[11px]" style={{ color: c.muted }}>
                            {activeCategory
                              ? `Click → move to ${activeCategory.toUpperCase()}`
                              : 'Select a category first'}
                          </span>
                        </button>
                      </li>
                    )
                  })
                )}
              </ul>
            </div>

            <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
              {selectedDocId && draft ? (
                <>
                  <div
                    className="shrink-0 px-3 py-2 border-b flex flex-wrap items-center gap-2"
                    style={{ borderColor: c.border }}
                  >
                    <p className="text-sm font-semibold truncate flex-1 min-w-0" style={{ color: c.primary }}>
                      {findFingerprintLabel(draft, selectedDocId)}
                    </p>
                    {selectedCanSplit ? (
                      <button
                        type="button"
                        className="dashboard-btn-secondary !h-7 !px-2.5 !text-xs inline-flex items-center gap-1"
                        disabled={splitting}
                        onClick={() => void handleSplitSelected()}
                      >
                        {splitting ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Scissors className="w-3.5 h-3.5" />
                        )}
                        Split into pages
                      </button>
                    ) : null}
                  </div>
                  <div className="flex-1 min-h-0 overflow-hidden">
                    <CompactPacketDocPane
                      title="Preview"
                      documents={previewDocs}
                      activeDocId={selectedDocId}
                      emptyHint="Select a page to preview"
                      onEnsureDocument={async (docId) => {
                        if (!draft) return
                        await ensureFileForDoc(docId, draft)
                      }}
                    />
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center p-6 text-center">
                  <p className="text-sm" style={{ color: c.secondary }}>
                    Select a pending page to assign, or a marked file to preview.
                  </p>
                </div>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  )
}
