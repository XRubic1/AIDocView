/**
 * Credyx Doc Splitter — split multi-page PDFs into pages, then mark each as
 * RC / BOL / INV before Packet Rework.
 *
 * Layout: slim RC | BOL | INV bins · pending page list · large preview (side by side).
 * Assign via 1/2/3 keys, drag-drop, right-click, or toolbar buttons. Assign auto-advances.
 * Clicking a page only selects it for preview — never assigns.
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft, FileStack, Loader2, Sparkles } from 'lucide-react'
import { getBatchById, updateBatch } from '../../data/mockBatches'
import { setBatchFiles } from '../../data/batchFileStore'
import type { BatchIntakeDraft } from '../../types/credyxBatch'
import type { DocSortFingerprint, DocSortKind } from '../../products/docSort/types'
import { useClientTheme } from '../../theme/ThemeContext'
import { useToast } from '../ui/ToastProvider'
import CompactPacketDocPane, {
  PACKET_DOC_MIME,
  readPacketDocDrag,
  writePacketDocDrag,
  type CompactDocItem,
} from '../client/CompactPacketDocPane'
import { hydrateIntakeDraftFromBatch } from '../../utils/buildIntakeDraftFromBatch'
import { clearBatchNeedsDocSplit } from '../../utils/batchDocSplit'
import {
  canUnpackDraftDocument,
  createManualDocFingerprint,
  ensureDocumentUnassigned,
  guessDocSortKindFromFileName,
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

const SPLITTER_DRAG_MIME = PACKET_DOC_MIME

interface BatchDocSplitterWorkspaceProps {
  batchId: string
  onClose: () => void
  onContinueToPacketRework: (batchId: string) => void
}

type DocMenuState = {
  x: number
  y: number
  docId: string
  fileName: string
}

function kindForCategory(category: MarkCategory): DocSortKind {
  return CATEGORIES.find((row) => row.id === category)?.kind ?? 'invoice'
}

function markCategoryForKind(kind: DocSortKind): MarkCategory | null {
  if (kind === 'rate_confirmation') return 'rc'
  if (kind === 'bill_of_lading') return 'bol'
  if (kind === 'invoice') return 'inv'
  return null
}

function guessMarkCategory(fp: DocSortFingerprint): MarkCategory | null {
  const extractType = fp.extract?.documentType
  if (extractType === 'rate_confirmation') return 'rc'
  if (extractType === 'bill_of_lading') return 'bol'
  if (extractType === 'invoice') return 'inv'

  const fromKind = markCategoryForKind(fp.kind)
  if (fromKind) return fromKind

  return markCategoryForKind(guessDocSortKindFromFileName(fp.fileName))
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

function listPending(draft: BatchIntakeDraft): DocSortFingerprint[] {
  return listAllSupportingFingerprints(draft).filter((fp) => !markCategoryForKind(fp.kind))
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
    const located = locateDraftDocument(next, docId)
    if (located && markCategoryForKind(located.fingerprint.kind)) continue

    const pages = await getPdfPageCount(file)
    if (pages <= 1) continue

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

/** Next pending id after assigning `assignedId` (prefer following page in list). */
function nextPendingAfterAssign(
  pendingBefore: DocSortFingerprint[],
  assignedId: string,
  draftAfter: BatchIntakeDraft
): string | null {
  const remaining = listPending(draftAfter)
  if (remaining.length === 0) return null
  const oldOrder = pendingBefore.map((fp) => fp.docId)
  const oldIdx = oldOrder.indexOf(assignedId)
  const preferred =
    oldOrder.slice(oldIdx + 1).find((id) => remaining.some((fp) => fp.docId === id)) ??
    remaining[0]?.docId
  return preferred ?? null
}

/** Admin workspace: page-split PDFs, drag/click/right-click assign RC / BOL / INV. */
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
  const [sorting, setSorting] = useState(false)
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<MarkCategory | 'pending' | null>(null)
  const [docMenu, setDocMenu] = useState<DocMenuState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const docMenuRef = useRef<HTMLDivElement | null>(null)

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

      const pending = listPending(next)
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

  const closeDocMenu = useCallback(() => setDocMenu(null), [])

  useLayoutEffect(() => {
    if (!docMenu || !docMenuRef.current) return
    const el = docMenuRef.current
    const pad = 8
    const rect = el.getBoundingClientRect()
    let x = docMenu.x
    let y = docMenu.y
    if (x + rect.width > window.innerWidth - pad) {
      x = Math.max(pad, window.innerWidth - rect.width - pad)
    }
    if (y + rect.height > window.innerHeight - pad) {
      y = Math.max(pad, window.innerHeight - rect.height - pad)
    }
    if (x !== docMenu.x || y !== docMenu.y) {
      setDocMenu((prev) => (prev ? { ...prev, x, y } : prev))
    }
  }, [docMenu])

  useEffect(() => {
    if (!docMenu) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeDocMenu()
    }
    const onPointer = (e: PointerEvent) => {
      if (docMenuRef.current?.contains(e.target as Node)) return
      closeDocMenu()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onPointer, true)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onPointer, true)
    }
  }, [docMenu, closeDocMenu])

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

  /** Assign doc to category and auto-advance preview to the next pending page. */
  const assignToCategory = useCallback(
    (docId: string, category: MarkCategory) => {
      if (!draft) return
      const pendingBefore = listPending(draft)
      const kind = kindForCategory(category)
      const alreadyInPool =
        draft.unmatched.rateCons.some((row) => row.docId === docId) ||
        draft.unmatched.bols.some((row) => row.docId === docId) ||
        draft.unmatched.other.some((row) => row.docId === docId)
      let next = alreadyInPool ? draft : ensureDocumentUnassigned(draft, docId)
      next = placeDraftDocument(next, docId, null, kind)
      setDraft(next)
      persistDraftFiles(next)
      setSelectedDocId(nextPendingAfterAssign(pendingBefore, docId, next))
    },
    [draft, persistDraftFiles]
  )

  /** 1 = RC, 2 = BOL, 3 = INV — assign selected (or first pending) and advance. */
  useEffect(() => {
    if (loading || !draft) return
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return
      const target = e.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return
      }
      const byKey: Record<string, MarkCategory> = {
        '1': 'rc',
        '2': 'bol',
        '3': 'inv',
      }
      const byCode: Record<string, MarkCategory> = {
        Digit1: 'rc',
        Digit2: 'bol',
        Digit3: 'inv',
        Numpad1: 'rc',
        Numpad2: 'bol',
        Numpad3: 'inv',
      }
      const category = byKey[e.key] ?? byCode[e.code]
      if (!category) return

      const pending = listPending(draft)
      const targetId =
        (selectedDocId &&
        listAllSupportingFingerprints(draft).some((fp) => fp.docId === selectedDocId)
          ? selectedDocId
          : null) ?? pending[0]?.docId
      if (!targetId) return

      e.preventDefault()
      assignToCategory(targetId, category)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [loading, draft, selectedDocId, assignToCategory])

  const openDocMenu = (event: ReactMouseEvent, fp: DocSortFingerprint) => {
    event.preventDefault()
    event.stopPropagation()
    setSelectedDocId(fp.docId)
    setDocMenu({
      x: event.clientX,
      y: event.clientY,
      docId: fp.docId,
      fileName: fp.fileName,
    })
  }

  const onDragStartDoc = (event: ReactDragEvent, docId: string) => {
    writePacketDocDrag(event, { docId, fromDraftId: null })
    event.dataTransfer.setData(SPLITTER_DRAG_MIME, docId)
  }

  const allowDrop = (event: ReactDragEvent, target: MarkCategory | 'pending') => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    setDropTarget(target)
  }

  const onDropToCategory = (event: ReactDragEvent, category: MarkCategory) => {
    event.preventDefault()
    setDropTarget(null)
    const payload = readPacketDocDrag(event)
    const docId = payload?.docId || event.dataTransfer.getData(SPLITTER_DRAG_MIME)
    if (!docId) return
    assignToCategory(docId, category)
  }

  const onDropToPending = (event: ReactDragEvent) => {
    event.preventDefault()
    setDropTarget(null)
    if (!draft) return
    const payload = readPacketDocDrag(event)
    const docId = payload?.docId || event.dataTransfer.getData(SPLITTER_DRAG_MIME)
    if (!docId) return
    // Un-mark → back to pending (kind other).
    const alreadyInPool =
      draft.unmatched.rateCons.some((row) => row.docId === docId) ||
      draft.unmatched.bols.some((row) => row.docId === docId) ||
      draft.unmatched.other.some((row) => row.docId === docId)
    let next = alreadyInPool ? draft : ensureDocumentUnassigned(draft, docId)
    next = placeDraftDocument(next, docId, null, 'other')
    setDraft(next)
    persistDraftFiles(next)
    setSelectedDocId(docId)
  }

  /** Click pending: select for full preview (assign with 1/2/3, drag, or buttons). */
  const handlePendingClick = (fp: DocSortFingerprint) => {
    setSelectedDocId(fp.docId)
  }

  const handleCategorizedClick = (fp: DocSortFingerprint) => {
    setSelectedDocId(fp.docId)
  }

  /** SORT DOCS — auto-mark pending pages from extract / file-name hints. */
  const handleSortDocs = () => {
    if (!draft) return
    setSorting(true)
    try {
      const pendingBefore = listPending(draft)
      let next = draft
      let moved = 0
      for (const fp of pendingBefore) {
        const guess = guessMarkCategory(fp)
        if (!guess) continue
        const kind = kindForCategory(guess)
        next = placeDraftDocument(next, fp.docId, null, kind)
        moved += 1
      }
      next = ensureDocsInUnmatchedPool(next)
      setDraft(next)
      persistDraftFiles(next)
      const remaining = listPending(next)
      setSelectedDocId(remaining[0]?.docId ?? null)
      showToast(
        moved > 0
          ? `Sorted ${moved} page${moved === 1 ? '' : 's'} into RC / BOL / INV.`
          : 'No automatic matches — mark remaining pages by hand.',
        moved > 0 ? 'success' : 'info'
      )
    } finally {
      setSorting(false)
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

  const renderDocChip = (
    fp: DocSortFingerprint,
    opts: { pending?: boolean; onClick: () => void }
  ) => {
    const active = fp.docId === selectedDocId
    return (
      <button
        type="button"
        draggable
        onDragStart={(e) => onDragStartDoc(e, fp.docId)}
        onClick={opts.onClick}
        onContextMenu={(e) => openDocMenu(e, fp)}
        className="w-full text-left px-2 py-1.5 rounded border text-xs transition-colors"
        style={{
          borderColor: active ? c.accent : c.border,
          backgroundColor: c.card,
          color: c.primary,
          boxShadow: active ? `inset 0 0 0 1px ${c.accent}` : undefined,
          cursor: 'grab',
        }}
        title="Drag to RC / BOL / INV · right-click or press 1/2/3 to mark"
      >
        <span className="block truncate font-medium">{fp.fileName}</span>
      </button>
    )
  }

  return (
    <div className="flex flex-col min-h-0 h-full overflow-hidden">
      <header
        className="shrink-0 flex flex-wrap items-center gap-2 px-4 py-2.5 border-b"
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
          <h1 className="text-sm font-semibold truncate" style={{ color: c.primary }}>
            {batch.batch_number}
            <span className="font-normal" style={{ color: c.secondary }}>
              {' '}
              · {batch.client_name}
            </span>
          </h1>
          <p className="text-[11px] mt-0.5" style={{ color: c.muted }}>
            Keys: <kbd className="font-semibold">1</kbd> RC ·{' '}
            <kbd className="font-semibold">2</kbd> BOL ·{' '}
            <kbd className="font-semibold">3</kbd> INV
          </p>
        </div>
        <button
          type="button"
          className="dashboard-btn-secondary !h-8 !px-3 !text-xs inline-flex items-center gap-1.5"
          disabled={sorting || loading || pendingDocs.length === 0}
          onClick={handleSortDocs}
          title="Auto-mark pending pages from file names / AI hints"
        >
          {sorting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
          Sort docs
        </button>
        <button type="button" className="dashboard-btn-primary !h-8 !text-xs" onClick={handleContinue}>
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
        <div
          className="flex-1 min-h-0 grid overflow-hidden"
          style={{
            gridTemplateColumns: 'minmax(120px, 150px) minmax(130px, 160px) minmax(0, 1fr)',
          }}
        >
          {/* Slim RC / BOL / INV bins */}
          <div
            className="min-h-0 grid grid-rows-3 overflow-hidden border-r"
            style={{ borderColor: c.border }}
          >
            {CATEGORIES.map((cat) => {
              const rows = docsByCategory[cat.id]
              const isDrop = dropTarget === cat.id
              return (
                <section
                  key={cat.id}
                  className="min-h-0 flex flex-col overflow-hidden border-b last:border-b-0"
                  style={{
                    borderColor: c.border,
                    outline: isDrop ? `2px solid ${c.accent}` : undefined,
                    outlineOffset: -2,
                  }}
                  onDragOver={(e) => allowDrop(e, cat.id)}
                  onDragLeave={() => setDropTarget(null)}
                  onDrop={(e) => onDropToCategory(e, cat.id)}
                >
                  <div
                    className="shrink-0 px-2 py-1.5 border-b flex items-center justify-between gap-1"
                    style={{ borderColor: c.border, backgroundColor: c.card }}
                    title={`Drop pages here · or press ${cat.id === 'rc' ? '1' : cat.id === 'bol' ? '2' : '3'}`}
                  >
                    <span className="text-[11px] font-semibold" style={{ color: c.primary }}>
                      {cat.short}
                    </span>
                    <span className="text-[11px] tabular-nums" style={{ color: c.secondary }}>
                      {rows.length}
                    </span>
                  </div>
                  <ul className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-1.5 space-y-1">
                    {rows.length === 0 ? (
                      <li className="px-1 py-3 text-center text-[10px]" style={{ color: c.muted }}>
                        Drop here
                      </li>
                    ) : (
                      rows.map((fp) => (
                        <li key={fp.docId}>
                          {renderDocChip(fp, { onClick: () => handleCategorizedClick(fp) })}
                        </li>
                      ))
                    )}
                  </ul>
                </section>
              )
            })}
          </div>

          {/* Pending list — beside preview, not above */}
          <aside
            className="min-h-0 flex flex-col overflow-hidden border-r"
            style={{
              borderColor: c.border,
              outline: dropTarget === 'pending' ? `2px solid ${c.accent}` : undefined,
              outlineOffset: -2,
            }}
            onDragOver={(e) => allowDrop(e, 'pending')}
            onDragLeave={() => setDropTarget(null)}
            onDrop={onDropToPending}
          >
            <div
              className="shrink-0 px-2 py-1.5 border-b flex items-center justify-between gap-1"
              style={{ borderColor: c.border, backgroundColor: c.card }}
            >
              <div className="min-w-0">
                <p className="text-[11px] font-semibold" style={{ color: c.primary }}>
                  Pending
                </p>
                <p className="text-[10px] truncate" style={{ color: c.muted }}>
                  Click to preview · 1/2/3 to mark
                </p>
              </div>
              <span className="text-[11px] tabular-nums" style={{ color: c.secondary }}>
                {pendingDocs.length}
              </span>
            </div>
            <ul className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-1.5 space-y-1">
              {pendingDocs.length === 0 ? (
                <li className="px-1 py-6 text-center text-[10px]" style={{ color: c.muted }}>
                  All marked
                </li>
              ) : (
                pendingDocs.map((fp) => (
                  <li key={fp.docId}>
                    {renderDocChip(fp, {
                      pending: true,
                      onClick: () => handlePendingClick(fp),
                    })}
                  </li>
                ))
              )}
            </ul>
          </aside>

          {/* Doc preview — full height, not clipped */}
          <section className="min-h-0 flex flex-col overflow-hidden" style={{ backgroundColor: c.card }}>
            {selectedDocId && draft ? (
              <>
                <div
                  className="shrink-0 px-3 py-2 border-b flex flex-wrap items-center gap-2"
                  style={{ borderColor: c.border }}
                >
                  <p className="text-sm font-semibold truncate flex-1 min-w-0" style={{ color: c.primary }}>
                    {findFingerprintLabel(draft, selectedDocId)}
                  </p>
                  <div className="flex items-center gap-1" title="Or press 1 / 2 / 3">
                    {CATEGORIES.map((cat, i) => (
                      <button
                        key={cat.id}
                        type="button"
                        className="dashboard-btn-secondary !h-7 !px-2 !text-xs"
                        onClick={() => assignToCategory(selectedDocId, cat.id)}
                        title={`${cat.short} (key ${i + 1}) — then next page`}
                      >
                        {i + 1} {cat.short}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
                  <CompactPacketDocPane
                    className="h-full min-h-0 border-0 rounded-none"
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
                  Select a pending page to preview. Press 1 / 2 / 3 to mark and advance.
                </p>
              </div>
            )}
          </section>
        </div>
      )}

      {docMenu &&
        createPortal(
          <div
            ref={docMenuRef}
            className="client-ai-doc-menu admin-batch-context-menu"
            style={{ left: docMenu.x, top: docMenu.y }}
            role="menu"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.preventDefault()}
          >
            <p className="client-ai-doc-menu__label truncate" title={docMenu.fileName}>
              {docMenu.fileName}
            </p>
            {CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                type="button"
                role="menuitem"
                className="client-ai-doc-menu__item"
                onClick={() => {
                  const id = docMenu.docId
                  closeDocMenu()
                  assignToCategory(id, cat.id)
                }}
              >
                Mark as {cat.short}
              </button>
            ))}
            <button
              type="button"
              role="menuitem"
              className="client-ai-doc-menu__item"
              onClick={() => {
                const id = docMenu.docId
                closeDocMenu()
                if (!draft) return
                let next = placeDraftDocument(draft, id, null, 'other')
                setDraft(next)
                persistDraftFiles(next)
                setSelectedDocId(id)
              }}
            >
              Move to Pending
            </button>
          </div>,
          document.body
        )}
    </div>
  )
}
