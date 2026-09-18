import { useEffect, useLayoutEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, Bug, ChevronDown, ChevronRight, FolderOpen, Loader2, Plus, RefreshCw, Search, Trash2 } from 'lucide-react'
import ClientInvoiceDocumentUploadModal, {
  type UploadModalDocument,
} from './ClientInvoiceDocumentUploadModal'
import BrokerPicker from '../brokers/BrokerPicker'
import CompactPacketDocPane, {
  type CompactDocItem,
  type PacketDocDragPayload,
  readPacketDocDrag,
  writePacketDocDrag,
} from './CompactPacketDocPane'
import {
  AiReviewChecksProgressList,
  AiReviewExtractProgressList,
} from '../batches/AiReviewLiveProgress'
import type {
  AiReviewLiveCheck,
  AiReviewLiveExtract,
  BatchAiReviewProgress,
} from '../../services/credyx/batchAiReviewService'
import BatchAiAssignmentDebug from './BatchAiAssignmentDebug'
import { DOCSORT_AI_DISCLAIMER_SHORT } from '../../products/docSort/constants/aiDisclaimer'
import { isManualCredyxDraft } from '../../integrations/docSortToCredyx'
import type { BatchIntakeDraft, CredyxInvoiceDraft } from '../../types/credyxBatch'
import { formatCurrency } from '../../utils/format'
import { useClientTheme } from '../../theme/ThemeContext'
import {
  formatLoadNumberWarning,
  getLoadNumberWarnings,
  invoiceNumbersConflict,
  isInvoiceNumberTakenExcluding,
} from '../../utils/invoiceDuplicateChecks'
import { invoiceDraftBlocker, isInvoiceDraftReady } from '../../utils/invoiceDraftReady'
import {
  classifyPacketDoc,
  groupPacketDocuments,
  type PacketDocRow,
} from '../../utils/batchPacketDocs'
import { useDocumentDownloadProgress } from '../ui/DocumentDownloadOverlay'
import type { DocSortFingerprint } from '../../products/docSort/types'
import { canUnpackDraftDocument, pruneUnmatchedAgainstAssigned } from '../../utils/aiDraftDocOps'
import type { UnpackDraftResult } from '../../utils/aiDraftDocOps'
import { useToast } from '../ui/ToastProvider'

interface BatchAiConfirmPanelProps {
  draft: BatchIntakeDraft
  clientId: string
  /** Carrier display name for the batch (read-only on the invoice editor). */
  carrierName?: string
  crossCarrierLoadWarnings?: boolean
  brokerPickerMode?: 'carrier' | 'admin'
  /** Intake = create flow; rework = edit an existing batch in Packets. */
  mode?: 'intake' | 'rework'
  submitLabel?: string
  submittingLabel?: string
  onUpdateDraft: (draftId: string, patch: Partial<CredyxInvoiceDraft>) => void
  onAddInvoice: () => void | Promise<void>
  onRemoveDraft: (draftId: string) => void
  onMoveDocument: (fromDraftId: string, docId: string, toDraftId: string | null) => void
  /** Place/reclassify a supporting doc (drag RC→BOL, move between invoices). */
  onPlaceDocument?: (
    docId: string,
    toDraftId: string | null,
    kind: 'rate_confirmation' | 'bill_of_lading' | 'other' | 'preserve'
  ) => void
  onAssignUnmatchedDoc: (docId: string, toDraftId: string) => void
  onAssignUnmatchedDocs: (docIds: string[], toDraftId: string) => void
  onAttachDocuments: (draftId: string, files: File[]) => void
  onDeleteDocument: (docId: string) => void
  /** Split a combined RC+BOL(+invoice) PDF into separate files. */
  onUnpackDocument?: (docId: string) => void | Promise<void | UnpackDraftResult>
  /** Lazily fetch a PDF body when the admin focuses a doc that is not in memory yet. */
  onEnsureDocument?: (docId: string) => void | Promise<void>
  addingInvoice: boolean
  onSubmitBatch: () => void
  submitting: boolean
  onCancel?: () => void
  /**
   * Packet rework: right-click an invoice to re-run AI verification for that
   * invoice only. `draftId` matches the persisted invoice id in rework mode.
   */
  onRerunAiCheck?: (draftId: string, invoiceNumber: string) => void | Promise<void>
  /** Disable re-run while a check is already in flight. */
  rerunningAiCheck?: boolean
  /** Live extract/check progress while Rerun AI check is running. */
  aiLiveProgress?: {
    draftId: string
    extract: AiReviewLiveExtract | null
    checks: AiReviewLiveCheck[] | null
    phase: BatchAiReviewProgress['phase']
  } | null
}

type RailTab = 'invoices' | 'docs' | 'debug'
type Focus =
  | { type: 'invoice'; draftId: string; docId?: string }
  | { type: 'unassigned'; docId?: string }

function shortFileName(name: string, max = 28) {
  return name.length > max ? `${name.slice(0, max - 1)}…` : name
}

/** Missing supporting paperwork flags for packet list highlighting. */
function packetDocGaps(groups: ReturnType<typeof groupPacketDocuments>) {
  const hasRc = groups.some((g) => g.category === 'rate_confirmation' && g.docs.length > 0)
  const hasBol = groups.some(
    (g) => (g.category === 'bol' || g.category === 'pod') && g.docs.length > 0
  )
  return {
    missingRc: !hasRc,
    missingBol: !hasBol,
    needsDocs: !hasRc || !hasBol,
  }
}

function toCompactItems(rows: PacketDocRow[]): CompactDocItem[] {
  return rows.map((row) => ({
    id: row.docId,
    name: row.fileName,
    file: row.file,
  }))
}

/** Packet workspace: edit invoices, assign docs, send to verification. */
export default function BatchAiConfirmPanel({
  draft,
  clientId,
  carrierName,
  crossCarrierLoadWarnings = false,
  brokerPickerMode = 'carrier',
  mode = 'intake',
  submitLabel,
  submittingLabel,
  onUpdateDraft,
  onAddInvoice,
  onRemoveDraft,
  onMoveDocument,
  onPlaceDocument,
  onAssignUnmatchedDoc: _onAssignUnmatchedDoc,
  onAssignUnmatchedDocs,
  onAttachDocuments,
  onDeleteDocument,
  onUnpackDocument,
  onEnsureDocument,
  addingInvoice,
  onSubmitBatch,
  submitting,
  onCancel,
  onRerunAiCheck,
  rerunningAiCheck = false,
  aiLiveProgress = null,
}: BatchAiConfirmPanelProps) {
  const c = useClientTheme()
  const { showToast } = useToast()
  const unmatchedBootstrap =
    draft.invoices.length === 0 &&
    draft.unmatched.rateCons.length + draft.unmatched.bols.length + draft.unmatched.other.length > 0
  const [railTab, setRailTab] = useState<RailTab>(() =>
    mode === 'rework' && unmatchedBootstrap ? 'docs' : 'invoices'
  )
  const [focus, setFocus] = useState<Focus | null>(null)
  const [loadingDocId, setLoadingDocId] = useState<string | null>(null)
  const downloadProgress = useDocumentDownloadProgress(Boolean(loadingDocId))
  const [uploadDraftId, setUploadDraftId] = useState<string | null>(null)
  const [pendingDocs, setPendingDocs] = useState<UploadModalDocument[]>([])
  const [pendingFiles, setPendingFiles] = useState<Map<string, File>>(new Map())
  const [selectedUnmatched, setSelectedUnmatched] = useState<Set<string>>(new Set())
  const [viewingRcDocId, setViewingRcDocId] = useState<string | null>(null)
  const [viewingBolDocId, setViewingBolDocId] = useState<string | null>(null)
  /** Bumped on each intentional list click so panes re-scroll to the file. */
  const [rcScrollRequestId, setRcScrollRequestId] = useState(0)
  const [bolScrollRequestId, setBolScrollRequestId] = useState(0)
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const [unpackingDocId, setUnpackingDocId] = useState<string | null>(null)
  /** Right-click menu for classify / unassign / move. */
  const [docMenu, setDocMenu] = useState<{
    x: number
    y: number
    docId: string
    fromDraftId: string | null
  } | null>(null)
  const docMenuRef = useRef<HTMLDivElement>(null)
  /** Right-click menu on an invoice packet (rework → rerun AI check). */
  const [invoiceMenu, setInvoiceMenu] = useState<{
    x: number
    y: number
    draftId: string
    invoiceNumber: string
  } | null>(null)
  const invoiceMenuRef = useRef<HTMLDivElement>(null)
  const packetSearchRef = useRef<HTMLInputElement>(null)
  const [packetSearch, setPacketSearch] = useState('')
  const [packetSearchOpen, setPacketSearchOpen] = useState(false)
  /** Which packet accordions are open in the left rail. */
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set())

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const openPacket = (draftId: string, docId?: string) => {
    setExpandedIds((prev) => {
      if (prev.has(draftId)) return prev
      const next = new Set(prev)
      next.add(draftId)
      return next
    })
    setFocus({ type: 'invoice', draftId, docId })
  }

  /**
   * Focus an unassigned file and scroll the dual panes to it.
   * RC → left pane; BOL → right; other → both (shown in each).
   */
  const jumpToUnassignedDoc = (
    docId: string,
    bucket: 'rate_confirmation' | 'bol' | 'other' = 'other'
  ) => {
    setFocus({ type: 'unassigned', docId })
    ensureDoc(docId)
    if (bucket === 'bol') {
      setViewingBolDocId(docId)
      setBolScrollRequestId((n) => n + 1)
      return
    }
    if (bucket === 'rate_confirmation') {
      setViewingRcDocId(docId)
      setRcScrollRequestId((n) => n + 1)
      return
    }
    // Other / unknown lives in both panes — jump whichever stack contains it.
    setViewingRcDocId(docId)
    setViewingBolDocId(docId)
    setRcScrollRequestId((n) => n + 1)
    setBolScrollRequestId((n) => n + 1)
  }

  /** Jump the dual panes to an invoice-attached file. */
  const jumpToPacketDoc = (
    draftId: string,
    docId: string,
    category: string
  ) => {
    openPacket(draftId, docId)
    ensureDoc(docId)
    if (category === 'bol' || category === 'pod') {
      setViewingBolDocId(docId)
      setBolScrollRequestId((n) => n + 1)
      return
    }
    setViewingRcDocId(docId)
    setRcScrollRequestId((n) => n + 1)
  }

  // Auto-expand the focused packet (and unassigned pile when selected).
  useEffect(() => {
    if (focus?.type === 'invoice') {
      setExpandedIds((prev) => {
        if (prev.has(focus.draftId)) return prev
        const next = new Set(prev)
        next.add(focus.draftId)
        return next
      })
      return
    }
    if (focus?.type === 'unassigned') {
      setExpandedIds((prev) => {
        if (prev.has('unassigned')) return prev
        const next = new Set(prev)
        next.add('unassigned')
        return next
      })
    }
  }, [focus])

  const invoiceOptions = useMemo(
    () =>
      draft.invoices.map((inv) => ({
        draftId: inv.draftId,
        label: `Inv #${inv.invoice_number}${inv.load_number ? ` · ${inv.load_number}` : ''}`,
        invoiceNumber: inv.invoice_number || '',
        loadNumber: inv.load_number || '',
        brokerName: inv.broker_name || '',
      })),
    [draft.invoices]
  )

  const movePacketOptions = useMemo(() => {
    if (!docMenu) return []
    return invoiceOptions.filter((opt) => opt.draftId !== docMenu.fromDraftId)
  }, [docMenu, invoiceOptions])

  const filteredMovePackets = useMemo(() => {
    const q = packetSearch.trim().toLowerCase()
    if (!q) return movePacketOptions
    return movePacketOptions.filter(
      (opt) =>
        opt.label.toLowerCase().includes(q) ||
        opt.invoiceNumber.toLowerCase().includes(q) ||
        opt.loadNumber.toLowerCase().includes(q) ||
        opt.brokerName.toLowerCase().includes(q)
    )
  }, [movePacketOptions, packetSearch])

  const useCompactPacketPicker = movePacketOptions.length > 50

  const uploadDraft = useMemo(
    () => draft.invoices.find((inv) => inv.draftId === uploadDraftId) ?? null,
    [draft.invoices, uploadDraftId]
  )

  const prunedUnmatched = useMemo(
    () => pruneUnmatchedAgainstAssigned(draft.unmatched, draft.invoices),
    [draft.unmatched, draft.invoices]
  )

  const unmatchedDocs = useMemo(
    () => [
      ...prunedUnmatched.rateCons,
      ...prunedUnmatched.bols,
      ...prunedUnmatched.other,
    ],
    [prunedUnmatched]
  )

  /** Bucket unassigned files into RC / BOL / other for dual panes + Docs rail. */
  const unmatchedBuckets = useMemo(() => {
    const rateCons: DocSortFingerprint[] = [...prunedUnmatched.rateCons]
    const bols: DocSortFingerprint[] = [...prunedUnmatched.bols]
    const other: DocSortFingerprint[] = []

    for (const fp of prunedUnmatched.other) {
      const category = classifyPacketDoc({ kind: fp.kind, fileName: fp.fileName })
      if (category === 'rate_confirmation') rateCons.push(fp)
      else if (category === 'bol' || category === 'pod') bols.push(fp)
      else other.push(fp)
    }

    return { rateCons, bols, other }
  }, [prunedUnmatched])

  const unmatchedCount = unmatchedDocs.length

  const fpToCompact = (fps: DocSortFingerprint[]): CompactDocItem[] =>
    fps.map((fp) => ({
      id: fp.docId,
      name: fp.fileName,
      file: draft.fileById.get(fp.docId),
    }))

  useEffect(() => {
    setFocus((prev) => {
      if (prev?.type === 'invoice' && draft.invoices.some((i) => i.draftId === prev.draftId)) {
        return prev
      }
      if (prev?.type === 'unassigned' && unmatchedCount > 0) {
        return prev.docId ? prev : { type: 'unassigned', docId: unmatchedDocs[0]?.docId }
      }
      if (draft.invoices[0]) return { type: 'invoice', draftId: draft.invoices[0].draftId }
      if (unmatchedCount > 0) return { type: 'unassigned', docId: unmatchedDocs[0]?.docId }
      return null
    })
  }, [draft.invoices, unmatchedCount, unmatchedDocs])

  const selectedInvoice = useMemo(() => {
    if (focus?.type !== 'invoice') return null
    return draft.invoices.find((inv) => inv.draftId === focus.draftId) ?? null
  }, [draft.invoices, focus])

  const packetGroups = useMemo(
    () => (selectedInvoice ? groupPacketDocuments(selectedInvoice, draft.fileById) : []),
    [selectedInvoice, draft.fileById]
  )

  const invoiceAndRcDocs = useMemo(() => {
    const rows = packetGroups.flatMap((g) =>
      g.category === 'invoice' || g.category === 'rate_confirmation' ? g.docs : []
    )
    return rows
  }, [packetGroups])

  const bolDocs = useMemo(() => {
    return packetGroups.flatMap((g) => (g.category === 'bol' || g.category === 'pod' ? g.docs : []))
  }, [packetGroups])

  // Dual panes: packet docs when invoice focused; otherwise categorized unassigned.
  // Invoice PDF is always first under Rate con for the selected packet.
  const rateConPaneDocs = useMemo((): CompactDocItem[] => {
    if (focus?.type === 'unassigned' || !selectedInvoice) {
      return fpToCompact([...unmatchedBuckets.rateCons, ...unmatchedBuckets.other])
    }
    const invoiceRows = packetGroups.flatMap((g) => (g.category === 'invoice' ? g.docs : []))
    const rcRows = packetGroups.flatMap((g) =>
      g.category === 'rate_confirmation' ||
      g.category === 'other' ||
      g.category === 'lumper' ||
      g.category === 'scale'
        ? g.docs
        : []
    )
    return [
      ...invoiceRows.map((row) => ({
        id: row.docId,
        name: row.fileName,
        file: row.file,
        generated: Boolean(row.generated),
      })),
      ...toCompactItems(rcRows),
    ]
  }, [focus?.type, selectedInvoice, unmatchedBuckets, packetGroups, draft.fileById])

  const bolPaneDocs = useMemo(() => {
    if (focus?.type === 'unassigned' || !selectedInvoice) {
      return fpToCompact([...unmatchedBuckets.bols, ...unmatchedBuckets.other])
    }
    const rows = packetGroups.flatMap((g) => (g.category === 'bol' ? g.docs : []))
    return toCompactItems(rows)
  }, [focus?.type, selectedInvoice, unmatchedBuckets, packetGroups, draft.fileById])

  const placeDoc = (
    payload: PacketDocDragPayload,
    toDraftId: string | null,
    kind: 'rate_confirmation' | 'bill_of_lading' | 'other' | 'preserve'
  ) => {
    if (payload.generated) return
    if (onPlaceDocument) {
      onPlaceDocument(payload.docId, toDraftId, kind)
      return
    }
    if (payload.fromDraftId && toDraftId !== payload.fromDraftId) {
      onMoveDocument(payload.fromDraftId, payload.docId, toDraftId)
    }
  }

  const onDragStartDoc = (
    event: DragEvent,
    docId: string,
    fromDraftId: string | null,
    generated?: boolean
  ) => {
    if (generated) {
      event.preventDefault()
      return
    }
    writePacketDocDrag(event, { docId, fromDraftId, generated: false })
  }

  const openDocMenu = (
    event: MouseEvent,
    docId: string,
    fromDraftId: string | null,
    generated?: boolean
  ) => {
    if (generated) return
    event.preventDefault()
    event.stopPropagation()
    setPacketSearch('')
    setPacketSearchOpen(false)
    setInvoiceMenu(null)
    // Anchor at exact cursor; layout effect clamps after measure.
    setDocMenu({
      x: event.clientX,
      y: event.clientY,
      docId,
      fromDraftId,
    })
  }

  const openInvoiceMenu = (event: MouseEvent, inv: CredyxInvoiceDraft) => {
    if (!onRerunAiCheck) return
    event.preventDefault()
    event.stopPropagation()
    setDocMenu(null)
    openPacket(inv.draftId)
    setInvoiceMenu({
      x: event.clientX,
      y: event.clientY,
      draftId: inv.draftId,
      invoiceNumber: inv.invoice_number?.trim() || '—',
    })
  }

  // Keep the context menu on-screen without shifting away from the click point when possible.
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
    if (x < pad) x = pad
    if (y < pad) y = pad
    el.style.left = `${x}px`
    el.style.top = `${y}px`
  }, [docMenu, packetSearch, packetSearchOpen, filteredMovePackets.length, useCompactPacketPicker])

  useEffect(() => {
    if (!docMenu) return
    const close = () => setDocMenu(null)
    const onPointerDown = (e: PointerEvent) => {
      if (docMenuRef.current?.contains(e.target as Node)) return
      close()
    }
    const onScroll = (e: Event) => {
      if (docMenuRef.current?.contains(e.target as Node)) return
      close()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('keydown', onKey)
    }
  }, [docMenu])

  useLayoutEffect(() => {
    if (!invoiceMenu || !invoiceMenuRef.current) return
    const el = invoiceMenuRef.current
    const pad = 8
    const rect = el.getBoundingClientRect()
    let x = invoiceMenu.x
    let y = invoiceMenu.y
    if (x + rect.width > window.innerWidth - pad) {
      x = Math.max(pad, window.innerWidth - rect.width - pad)
    }
    if (y + rect.height > window.innerHeight - pad) {
      y = Math.max(pad, window.innerHeight - rect.height - pad)
    }
    el.style.left = `${x}px`
    el.style.top = `${y}px`
  }, [invoiceMenu])

  useEffect(() => {
    if (!invoiceMenu) return
    const close = () => setInvoiceMenu(null)
    const onPointerDown = (e: PointerEvent) => {
      if (invoiceMenuRef.current?.contains(e.target as Node)) return
      close()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('keydown', onKey)
    }
  }, [invoiceMenu])

  const runDocMenuAction = (
    action: 'rate_confirmation' | 'bill_of_lading' | 'unassigned' | `packet:${string}`
  ) => {
    if (!docMenu) return
    const payload = {
      docId: docMenu.docId,
      fromDraftId: docMenu.fromDraftId,
      generated: false,
    }
    if (action === 'unassigned') {
      placeDoc(payload, null, 'preserve')
      setFocus({ type: 'unassigned', docId: docMenu.docId })
      setExpandedIds((prev) => new Set(prev).add('unassigned'))
    } else if (action === 'rate_confirmation' || action === 'bill_of_lading') {
      const stayOn =
        docMenu.fromDraftId ?? selectedInvoice?.draftId ?? draft.invoices[0]?.draftId ?? null
      placeDoc(payload, stayOn, action)
      if (stayOn) {
        openPacket(stayOn, docMenu.docId)
        if (action === 'bill_of_lading') setViewingBolDocId(docMenu.docId)
        else setViewingRcDocId(docMenu.docId)
      }
    } else if (action.startsWith('packet:')) {
      const toId = action.slice('packet:'.length)
      placeDoc(payload, toId, 'preserve')
      openPacket(toId, docMenu.docId)
    }
    setDocMenu(null)
  }

  const handleUnpackDocument = async () => {
    if (!docMenu || !onUnpackDocument) return
    const { docId } = docMenu
    setDocMenu(null)
    if (!canUnpackDraftDocument(draft, docId)) {
      showToast(
        'This PDF does not have multiple page types (RC / BOL / invoice) to unpack.',
        'info'
      )
      return
    }
    setUnpackingDocId(docId)
    try {
      await onEnsureDocument?.(docId)
      const result = await onUnpackDocument(docId)
      if (result && typeof result === 'object' && 'status' in result) {
        if (result.status === 'rescued_unassigned') {
          showToast(
            result.message ?? 'Split failed — file moved to Unassigned.',
            'info'
          )
        } else {
          showToast('Unpacked into separate files', 'success')
        }
      } else {
        showToast('Unpacked into separate files', 'success')
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not unpack PDF', 'error')
    } finally {
      setUnpackingDocId(null)
    }
  }

  const allowDrop = (event: DragEvent, targetKey: string) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    setDropTarget(targetKey)
  }

  const displayCarrier =
    carrierName?.trim() ||
    selectedInvoice?.carrier_name?.trim() ||
    '—'

  // Prefetch rate con + BOL bodies for the visible panes.
  useEffect(() => {
    if (!onEnsureDocument) return
    const ids = [...rateConPaneDocs, ...bolPaneDocs]
      .filter((d) => !d.file && draft.storagePathsByDocId?.[d.id])
      .map((d) => d.id)
    const unique = [...new Set(ids)]
    if (unique.length === 0) return

    let cancelled = false
    setLoadingDocId(unique[0])
    void Promise.all(
      unique.map(async (docId) => {
        try {
          await onEnsureDocument(docId)
        } catch (err) {
          console.warn('[BatchAiConfirmPanel] ensureDocument failed', docId, err)
        }
      })
    ).finally(() => {
      if (!cancelled) setLoadingDocId(null)
    })
    return () => {
      cancelled = true
    }
  }, [
    selectedInvoice?.draftId,
    focus?.type,
    rateConPaneDocs,
    bolPaneDocs,
    draft.storagePathsByDocId,
    onEnsureDocument,
  ])

  useEffect(() => {
    setSelectedUnmatched((prev) => {
      const next = new Set([...prev].filter((id) => unmatchedDocs.some((fp) => fp.docId === id)))
      return next.size === prev.size ? prev : next
    })
  }, [unmatchedDocs])

  const batchTotal = useMemo(
    () => draft.invoices.reduce((s, i) => s + (i.amount || 0), 0),
    [draft.invoices]
  )

  const warnMode = crossCarrierLoadWarnings ? 'admin' : 'client'

  const fieldFeedback = useMemo(() => {
    const map = new Map<string, { invoiceError?: string; loadWarning?: string }>()
    draft.invoices.forEach((inv, index) => {
      const otherNumbers = draft.invoices.filter((_, i) => i !== index).map((o) => o.invoice_number)
      const num = inv.invoice_number?.trim() ?? ''
      let invoiceError: string | undefined
      if (num) {
        const inBatchDup = otherNumbers.some((n) => invoiceNumbersConflict(n, num))
        if (inBatchDup) {
          invoiceError = `Invoice number ${num} is duplicated in this batch`
        } else if (isInvoiceNumberTakenExcluding(clientId, num, [], [inv.draftId])) {
          invoiceError = crossCarrierLoadWarnings
            ? `Invoice number ${num} is already used for this carrier`
            : `Invoice number ${num} is already used for your account`
        }
      }
      const loadWarnings = getLoadNumberWarnings(inv.load_number, {
        forClientId: clientId,
        crossCarrier: crossCarrierLoadWarnings,
        excludeInvoiceIds: [inv.draftId],
      })
      const loadWarning =
        loadWarnings.length > 0 ? formatLoadNumberWarning(loadWarnings[0], warnMode) : undefined
      if (invoiceError || loadWarning) map.set(inv.draftId, { invoiceError, loadWarning })
    })
    return map
  }, [draft.invoices, clientId, crossCarrierLoadWarnings, warnMode])

  const readyCount = draft.invoices.filter((inv) =>
    isInvoiceDraftReady(inv, fieldFeedback.get(inv.draftId))
  ).length
  const issueCount = draft.invoices.filter((inv) => {
    const groups = groupPacketDocuments(inv, draft.fileById)
    return packetDocGaps(groups).needsDocs
  }).length
  const selectedFeedback = selectedInvoice ? fieldFeedback.get(selectedInvoice.draftId) : undefined
  const selectedBlocker = selectedInvoice
    ? invoiceDraftBlocker(selectedInvoice, selectedFeedback)
    : null
  const fieldsExtracting = Boolean(
    rerunningAiCheck &&
      aiLiveProgress &&
      selectedInvoice &&
      aiLiveProgress.draftId === selectedInvoice.draftId
  )
  const continueLabel =
    submitLabel ?? (mode === 'rework' ? 'Save packet changes' : 'Continue')
  const continueBusyLabel =
    submittingLabel ?? (mode === 'rework' ? 'Saving…' : 'Continuing…')

  const openDocUpload = (draftId: string) => {
    setUploadDraftId(draftId)
    setPendingDocs([])
    setPendingFiles(new Map())
  }

  const closeDocUpload = () => {
    setUploadDraftId(null)
    setPendingDocs([])
    setPendingFiles(new Map())
  }

  const addPendingFiles = (files: FileList | File[]) => {
    const list = Array.from(files)
    if (list.length === 0) return
    const entries = list.map((file) => ({
      id: `pending-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      name: file.name,
      size: file.size,
      file,
    }))
    setPendingDocs((prev) => [
      ...prev,
      ...entries.map(({ id, name, size }) => ({ id, name, size })),
    ])
    setPendingFiles((prev) => {
      const next = new Map(prev)
      entries.forEach(({ id, file }) => next.set(id, file))
      return next
    })
  }

  const ensureDoc = (docId: string) => {
    if (!onEnsureDocument) return
    if (draft.fileById.has(docId)) return
    setLoadingDocId(docId)
    void Promise.resolve(onEnsureDocument(docId)).finally(() => {
      setLoadingDocId((prev) => (prev === docId ? null : prev))
    })
  }

  return (
    <div className="client-ai-review client-ai-review--packets">
      <div className="client-ai-review__toolbar">
        <div className="client-ai-review__toolbar-summary">
          <strong>
            {readyCount}/{draft.invoices.length} ready
          </strong>
          <span>· {formatCurrency(batchTotal)}</span>
          {issueCount > 0 ? <span>· {issueCount} need docs</span> : null}
          {unmatchedCount > 0 ? <span>· {unmatchedCount} unassigned</span> : null}
        </div>
        <div className="client-ai-review__toolbar-actions">
          {onCancel && (
            <button
              type="button"
              className="dashboard-btn-secondary client-ai-review__toolbar-btn"
              onClick={onCancel}
            >
              Back
            </button>
          )}
          <button
            type="button"
            className="dashboard-btn-primary client-ai-review__toolbar-btn"
            disabled={submitting || draft.invoices.length === 0}
            title={
              issueCount > 0
                ? 'Some packets are missing RC/BOL — you can still continue'
                : unmatchedCount > 0
                  ? 'Unassigned docs remain — you can still continue'
                  : undefined
            }
            onClick={onSubmitBatch}
          >
            {submitting ? continueBusyLabel : continueLabel}
          </button>
        </div>
      </div>

      <div className="client-ai-review__rail">
        <div className="client-ai-packet__tabs">
          <button
            type="button"
            className={`client-ai-packet__tab${railTab === 'invoices' ? ' is-active' : ''}`}
            onClick={() => setRailTab('invoices')}
          >
            Invoices
            <span>{draft.invoices.length}</span>
          </button>
          <button
            type="button"
            className={`client-ai-packet__tab${railTab === 'docs' ? ' is-active' : ''}`}
            onClick={() => setRailTab('docs')}
          >
            Docs
            {unmatchedCount > 0 && (
              <span className="client-ai-packet__tab-warn">{unmatchedCount}</span>
            )}
          </button>
          <button
            type="button"
            className={`client-ai-packet__tab${railTab === 'debug' ? ' is-active' : ''}`}
            onClick={() => setRailTab('debug')}
          >
            <Bug className="w-3.5 h-3.5" aria-hidden />
            Debug
          </button>
        </div>

        {railTab === 'invoices' ? (
          <>
            <div className="client-ai-review__rail-head client-ai-review__rail-head--compact">
              <p className="client-ai-review__rail-count">
                {readyCount}/{draft.invoices.length} ready
              </p>
              <button
                type="button"
                className="client-ai-confirm__add-btn client-ai-confirm__add-btn--compact"
                onClick={() => void onAddInvoice()}
                disabled={addingInvoice}
              >
                {addingInvoice ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Plus className="w-3 h-3" />
                )}
                Add
              </button>
            </div>
            <div className="client-ai-review__rail-list client-ai-review__rail-list--compact">
              {draft.invoices.length === 0 && (
                <p className="client-ai-review__empty">
                  {mode === 'rework' && unmatchedCount > 0
                    ? `No packets yet. ${unmatchedCount} doc${
                        unmatchedCount === 1 ? '' : 's'
                      } under Docs — use + Add.`
                    : 'No invoices yet. Drop paperwork or add one.'}
                </p>
              )}
              {draft.invoices.map((inv) => {
                const groups = groupPacketDocuments(inv, draft.fileById)
                const gaps = packetDocGaps(groups)
                const active = focus?.type === 'invoice' && focus.draftId === inv.draftId
                const flatDocs = groups.flatMap((g) => g.docs)
                const expanded = expandedIds.has(inv.draftId)
                const missingLabel = [
                  gaps.missingRc ? 'RC' : null,
                  gaps.missingBol ? 'BOL' : null,
                ]
                  .filter(Boolean)
                  .join(' · ')
                return (
                  <div
                    key={inv.draftId}
                    className={`client-ai-packet__acc${active ? ' is-active' : ''}${
                      gaps.needsDocs ? ' needs-docs' : ''
                    }${dropTarget === `inv-${inv.draftId}` ? ' is-drop-target' : ''}`}
                    onDragOver={(e) => allowDrop(e, `inv-${inv.draftId}`)}
                    onDragLeave={() => setDropTarget(null)}
                    onContextMenu={(e) => openInvoiceMenu(e, inv)}
                    onDrop={(e) => {
                      e.preventDefault()
                      setDropTarget(null)
                      const payload = readPacketDocDrag(e)
                      if (!payload) return
                      placeDoc(payload, inv.draftId, 'preserve')
                      openPacket(inv.draftId, payload.docId)
                    }}
                  >
                    <div className="client-ai-packet__acc-head">
                      <button
                        type="button"
                        className="client-ai-packet__acc-toggle"
                        aria-label={expanded ? 'Collapse packet' : 'Expand packet'}
                        onClick={(e) => {
                          e.stopPropagation()
                          toggleExpanded(inv.draftId)
                        }}
                      >
                        {expanded ? (
                          <ChevronDown className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5" />
                        )}
                      </button>
                      <button
                        type="button"
                        className="client-ai-packet__acc-main"
                        onClick={() => {
                          openPacket(inv.draftId, flatDocs[0]?.docId)
                          setRailTab('invoices')
                        }}
                      >
                        <span className="client-ai-packet__acc-line">
                          <span className="client-ai-packet__acc-inv">
                            #{inv.invoice_number?.trim() || '—'}
                          </span>
                          <span className="client-ai-packet__acc-amt">
                            {inv.amount > 0 ? formatCurrency(inv.amount) : '—'}
                          </span>
                        </span>
                        <span
                          className={`client-ai-packet__acc-sub${
                            inv.load_number?.trim() ? '' : ' client-ai-packet__acc-sub--muted'
                          }`}
                        >
                          Load {inv.load_number?.trim() || '—'}
                        </span>
                        <span
                          className={`client-ai-packet__acc-sub${
                            inv.broker_name?.trim() ? '' : ' client-ai-packet__acc-sub--muted'
                          }`}
                        >
                          {inv.broker_name?.trim() || 'No broker'}
                        </span>
                        {gaps.needsDocs ? (
                          <span className="client-ai-packet__acc-warn">
                            Missing {missingLabel}
                          </span>
                        ) : null}
                      </button>
                    </div>
                    {expanded ? (
                      <ul className="client-ai-packet__acc-docs">
                        {flatDocs.length === 0 && (
                          <li className="client-ai-packet__attached-empty">No docs — drop here</li>
                        )}
                        {flatDocs.map((doc) => (
                          <li key={doc.docId}>
                            <button
                              type="button"
                              className={`client-ai-packet__acc-doc${
                                (viewingRcDocId === doc.docId ||
                                  viewingBolDocId === doc.docId ||
                                  focus?.docId === doc.docId) &&
                                active
                                  ? ' is-viewing'
                                  : ''
                              }${docMenu?.docId === doc.docId ? ' is-menu-target' : ''}`}
                              draggable={!doc.generated}
                              onDragStart={(e) =>
                                onDragStartDoc(e, doc.docId, inv.draftId, doc.generated)
                              }
                              onContextMenu={(e) =>
                                openDocMenu(e, doc.docId, inv.draftId, doc.generated)
                              }
                              onClick={() => jumpToPacketDoc(inv.draftId, doc.docId, doc.category)}
                              title={doc.fileName}
                            >
                              <span className="client-ai-packet__acc-doc-kind">
                                {doc.generated
                                  ? 'INV'
                                  : doc.category === 'rate_confirmation'
                                    ? 'RC'
                                    : doc.category === 'bol'
                                      ? 'BOL'
                                      : doc.category.slice(0, 3).toUpperCase()}
                              </span>
                              {shortFileName(doc.fileName, 26)}
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                )
              })}
            </div>
          </>
        ) : railTab === 'docs' ? (
          <div className="client-ai-packet__tree client-ai-packet__tree--compact">
            {draft.invoices.map((inv) => {
              const groups = groupPacketDocuments(inv, draft.fileById)
              const gaps = packetDocGaps(groups)
              const flatDocs = groups.flatMap((g) => g.docs)
              const activePacket = focus?.type === 'invoice' && focus.draftId === inv.draftId
              const expanded = expandedIds.has(inv.draftId)
              return (
                <section
                  key={inv.draftId}
                  className={`client-ai-packet__acc${activePacket ? ' is-active' : ''}${
                    gaps.needsDocs ? ' needs-docs' : ''
                  }${dropTarget === `docs-${inv.draftId}` ? ' is-drop-target' : ''}`}
                  onDragOver={(e) => allowDrop(e, `docs-${inv.draftId}`)}
                  onDragLeave={() => setDropTarget(null)}
                  onContextMenu={(e) => openInvoiceMenu(e, inv)}
                  onDrop={(e) => {
                    e.preventDefault()
                    setDropTarget(null)
                    const payload = readPacketDocDrag(e)
                    if (!payload) return
                    placeDoc(payload, inv.draftId, 'preserve')
                    openPacket(inv.draftId, payload.docId)
                  }}
                >
                  <div className="client-ai-packet__acc-head">
                    <button
                      type="button"
                      className="client-ai-packet__acc-toggle"
                      aria-label={expanded ? 'Collapse packet' : 'Expand packet'}
                      onClick={() => toggleExpanded(inv.draftId)}
                    >
                      {expanded ? (
                        <ChevronDown className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5" />
                      )}
                    </button>
                    <button
                      type="button"
                      className="client-ai-packet__acc-main"
                      onClick={() => openPacket(inv.draftId, flatDocs[0]?.docId)}
                    >
                      <span className="client-ai-packet__acc-line">
                        <span className="client-ai-packet__acc-inv">
                          #{inv.invoice_number?.trim() || '—'}
                        </span>
                        <span className="client-ai-packet__acc-amt">{flatDocs.length}d</span>
                      </span>
                      <span
                        className={`client-ai-packet__acc-sub${
                          inv.load_number?.trim() ? '' : ' client-ai-packet__acc-sub--muted'
                        }`}
                      >
                        Load {inv.load_number?.trim() || '—'}
                      </span>
                      <span
                        className={`client-ai-packet__acc-sub${
                          inv.broker_name?.trim() ? '' : ' client-ai-packet__acc-sub--muted'
                        }`}
                      >
                        {inv.broker_name?.trim() || 'No broker'}
                      </span>
                    </button>
                  </div>
                  {expanded ? (
                    <ul className="client-ai-packet__acc-docs">
                      {flatDocs.length === 0 && (
                        <li className="client-ai-packet__attached-empty">Drop docs here</li>
                      )}
                      {flatDocs.map((doc) => (
                        <li key={doc.docId}>
                          <button
                            type="button"
                            className={`client-ai-packet__acc-doc${
                              focus?.type === 'invoice' && focus.docId === doc.docId
                                ? ' is-viewing'
                                : ''
                            }${docMenu?.docId === doc.docId ? ' is-menu-target' : ''}`}
                            draggable={!doc.generated}
                            onDragStart={(e) =>
                              onDragStartDoc(e, doc.docId, inv.draftId, doc.generated)
                            }
                            onContextMenu={(e) =>
                              openDocMenu(e, doc.docId, inv.draftId, doc.generated)
                            }
                            onClick={() => jumpToPacketDoc(inv.draftId, doc.docId, doc.category)}
                            title={doc.fileName}
                          >
                            <span className="client-ai-packet__acc-doc-kind">
                              {doc.generated
                                ? 'INV'
                                : doc.category === 'rate_confirmation'
                                  ? 'RC'
                                  : doc.category === 'bol'
                                    ? 'BOL'
                                    : doc.category.slice(0, 3).toUpperCase()}
                            </span>
                            {shortFileName(doc.fileName, 26)}
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </section>
              )
            })}

            <section
              className={`client-ai-packet__acc client-ai-packet__acc--unassigned${
                focus?.type === 'unassigned' ? ' is-active' : ''
              }${dropTarget === 'docs-unassigned' ? ' is-drop-target' : ''}`}
              onDragOver={(e) => allowDrop(e, 'docs-unassigned')}
              onDragLeave={() => setDropTarget(null)}
              onDrop={(e) => {
                e.preventDefault()
                setDropTarget(null)
                const payload = readPacketDocDrag(e)
                if (!payload) return
                placeDoc(payload, null, 'preserve')
                setExpandedIds((prev) => new Set(prev).add('unassigned'))
                setFocus({ type: 'unassigned', docId: payload.docId })
              }}
            >
              <div className="client-ai-packet__acc-head">
                <button
                  type="button"
                  className="client-ai-packet__acc-toggle"
                  onClick={() => toggleExpanded('unassigned')}
                >
                  {expandedIds.has('unassigned') ? (
                    <ChevronDown className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5" />
                  )}
                </button>
                <button
                  type="button"
                  className="client-ai-packet__acc-main"
                  onClick={() => {
                    setExpandedIds((prev) => new Set(prev).add('unassigned'))
                    setFocus({ type: 'unassigned' })
                  }}
                >
                  <span className="client-ai-packet__acc-title">Unassigned</span>
                  <span className="client-ai-packet__acc-meta">{unmatchedCount}</span>
                </button>
              </div>
              {expandedIds.has('unassigned') ? (
                unmatchedCount === 0 ? (
                  <p className="client-ai-packet__tree-empty">All documents are in a packet.</p>
                ) : (
                  <ul className="client-ai-packet__acc-docs">
                    {(
                      [
                        { key: 'rc', label: 'RC', fps: unmatchedBuckets.rateCons },
                        { key: 'bol', label: 'BOL', fps: unmatchedBuckets.bols },
                        { key: 'other', label: 'OTH', fps: unmatchedBuckets.other },
                      ] as const
                    ).flatMap((group) =>
                      group.fps.map((fp) => (
                        <li key={fp.docId}>
                          <div className="client-ai-packet__unassigned-row">
                            <button
                              type="button"
                              className={`client-ai-packet__acc-doc${
                                focus?.type === 'unassigned' && focus.docId === fp.docId
                                  ? ' is-viewing'
                                  : ''
                              }${docMenu?.docId === fp.docId ? ' is-menu-target' : ''}`}
                              draggable
                              onDragStart={(e) => onDragStartDoc(e, fp.docId, null)}
                              onContextMenu={(e) => openDocMenu(e, fp.docId, null)}
                              onClick={() =>
                                jumpToUnassignedDoc(
                                  fp.docId,
                                  group.key === 'rc'
                                    ? 'rate_confirmation'
                                    : group.key === 'bol'
                                      ? 'bol'
                                      : 'other'
                                )
                              }
                            >
                              <input
                                type="checkbox"
                                checked={selectedUnmatched.has(fp.docId)}
                                onClick={(e) => e.stopPropagation()}
                                onChange={() => {
                                  setSelectedUnmatched((prev) => {
                                    const next = new Set(prev)
                                    if (next.has(fp.docId)) next.delete(fp.docId)
                                    else next.add(fp.docId)
                                    return next
                                  })
                                }}
                              />
                              <span className="client-ai-packet__acc-doc-kind">{group.label}</span>
                              <span title={fp.fileName}>{shortFileName(fp.fileName, 22)}</span>
                            </button>
                            <button
                              type="button"
                              className="client-ai-confirm__remove-btn"
                              title="Delete document"
                              onClick={() => {
                                if (window.confirm(`Delete ${fp.fileName}?`)) {
                                  onDeleteDocument(fp.docId)
                                }
                              }}
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </li>
                      ))
                    )}
                  </ul>
                )
              ) : null}
              {selectedUnmatched.size > 0 && (
                <div className="client-ai-packet__assign-bar">
                  <select
                    className="client-ai-confirm__unmatched-bulk-select"
                    defaultValue=""
                    onChange={(e) => {
                      if (!e.target.value) return
                      onAssignUnmatchedDocs([...selectedUnmatched], e.target.value)
                      setSelectedUnmatched(new Set())
                      openPacket(e.target.value)
                      e.target.value = ''
                    }}
                  >
                    <option value="">Move selected to…</option>
                    {invoiceOptions.map((opt) => (
                      <option key={opt.draftId} value={opt.draftId}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </section>
          </div>
        ) : (
          <div className="client-ai-review__rail-list" style={{ padding: 12 }}>
            <p className="client-ai-review__rail-kicker">Debug</p>
            <p className="client-ai-review__empty" style={{ padding: '8px 0 0' }}>
              Assignment reasons show in the main panel.
            </p>
          </div>
        )}
      </div>

      {railTab === 'debug' ? (
        <div className="client-ai-review__main client-ai-review__main--debug client-ai-review__main--span">
          <div className="client-ai-review__debug-pane">
            <BatchAiAssignmentDebug draft={draft} />
          </div>
        </div>
      ) : (
        <>
          <div className="client-ai-review__editor client-ai-review__editor--compact">
            <p className="client-ai-review__disclaimer client-ai-review__disclaimer--compact">
              <AlertTriangle className="w-3 h-3 shrink-0" style={{ color: c.warning }} />
              <span>{DOCSORT_AI_DISCLAIMER_SHORT}</span>
            </p>

            {focus?.type === 'unassigned' ? (
              <div className="client-ai-review__unmatched client-ai-review__unmatched--compact">
                <h3 className="client-ai-review__panel-title">Unassigned</h3>
                <p className="client-ai-review__panel-desc">
                  Rate cons left · BOLs right. Assign or delete before verification.
                </p>
                <div className="client-ai-packet__attached" style={{ marginTop: 8 }}>
                  <div className="client-ai-packet__attached-col">
                    <p className="client-ai-packet__attached-label">
                      Rate cons ({unmatchedBuckets.rateCons.length})
                    </p>
                    <ul className="client-ai-packet__attached-list">
                      {unmatchedBuckets.rateCons.length === 0 && (
                        <li className="client-ai-packet__attached-empty">None</li>
                      )}
                      {unmatchedBuckets.rateCons.map((fp) => (
                        <li key={fp.docId} title={fp.fileName}>
                          <button
                            type="button"
                            className="client-ai-packet__attached-row"
                            onClick={() => jumpToUnassignedDoc(fp.docId, 'rate_confirmation')}
                            onContextMenu={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              openDocMenu(e.clientX, e.clientY, fp.docId, null)
                            }}
                          >
                            {shortFileName(fp.fileName, 22)}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="client-ai-packet__attached-col">
                    <p className="client-ai-packet__attached-label">
                      BOLs ({unmatchedBuckets.bols.length})
                    </p>
                    <ul className="client-ai-packet__attached-list">
                      {unmatchedBuckets.bols.length === 0 && (
                        <li className="client-ai-packet__attached-empty">None</li>
                      )}
                      {unmatchedBuckets.bols.map((fp) => (
                        <li key={fp.docId} title={fp.fileName}>
                          <button
                            type="button"
                            className="client-ai-packet__attached-row"
                            onClick={() => jumpToUnassignedDoc(fp.docId, 'bol')}
                            onContextMenu={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              openDocMenu(e.clientX, e.clientY, fp.docId, null)
                            }}
                          >
                            {shortFileName(fp.fileName, 22)}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
                {unmatchedBuckets.other.length > 0 && (
                  <div className="client-ai-packet__attached" style={{ marginTop: 4 }}>
                    <div className="client-ai-packet__attached-col" style={{ gridColumn: '1 / -1' }}>
                      <p className="client-ai-packet__attached-label">
                        Other / unknown ({unmatchedBuckets.other.length})
                      </p>
                      <ul className="client-ai-packet__attached-list">
                        {unmatchedBuckets.other.map((fp) => (
                          <li key={fp.docId} title={fp.fileName}>
                            <button
                              type="button"
                              className="client-ai-packet__attached-row"
                              onClick={() => jumpToUnassignedDoc(fp.docId, 'other')}
                              onContextMenu={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                                openDocMenu(e.clientX, e.clientY, fp.docId, null)
                              }}
                            >
                              {shortFileName(fp.fileName, 36)}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
              </div>
            ) : selectedInvoice ? (
              <>
                <div className="client-ai-review__editor-head client-ai-review__editor-head--compact">
                  <h3 className="client-ai-review__panel-title">
                    #{selectedInvoice.invoice_number || '—'}
                  </h3>
                  <div className="flex items-center gap-1">
                    {isManualCredyxDraft(selectedInvoice) && (
                      <button
                        type="button"
                        className="client-ai-review__attach client-ai-review__attach--compact"
                        onClick={() => openDocUpload(selectedInvoice.draftId)}
                        title="Attach documents"
                      >
                        <FolderOpen className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      className="client-ai-confirm__remove-btn"
                      onClick={() => onRemoveDraft(selectedInvoice.draftId)}
                      title="Remove invoice"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {selectedBlocker && (
                  <p className="client-ai-review__blocker client-ai-review__blocker--compact">
                    {selectedBlocker}
                  </p>
                )}

                <div className="client-ai-review__fields client-ai-review__fields--compact">
                  <label className={`client-ai-review__field${fieldsExtracting ? ' is-extracting' : ''}`}>
                    <span>
                      Invoice #
                      {fieldsExtracting ? (
                        <span className="client-ai-review__field-live">
                          <Loader2 className="w-3 h-3 animate-spin" />
                        </span>
                      ) : null}
                    </span>
                    <input
                      type="text"
                      value={selectedInvoice.invoice_number}
                      disabled={fieldsExtracting}
                      onChange={(e) =>
                        onUpdateDraft(selectedInvoice.draftId, {
                          invoice_number: e.target.value,
                        })
                      }
                      className={`client-ai-confirm__input${
                        selectedFeedback?.invoiceError ? ' client-ai-confirm__input--error' : ''
                      }`}
                    />
                  </label>
                  <label className={`client-ai-review__field${fieldsExtracting ? ' is-extracting' : ''}`}>
                    <span>
                      Load #
                      {fieldsExtracting && !aiLiveProgress?.extract?.loadNumber ? (
                        <span className="client-ai-review__field-live">
                          <Loader2 className="w-3 h-3 animate-spin" />
                        </span>
                      ) : null}
                    </span>
                    <input
                      type="text"
                      value={selectedInvoice.load_number}
                      disabled={fieldsExtracting}
                      onChange={(e) =>
                        onUpdateDraft(selectedInvoice.draftId, { load_number: e.target.value })
                      }
                      className={`client-ai-confirm__input${
                        selectedFeedback?.loadWarning ? ' client-ai-confirm__input--warn' : ''
                      }`}
                    />
                  </label>
                  <label className={`client-ai-review__field${fieldsExtracting ? ' is-extracting' : ''}`}>
                    <span>Invoice date</span>
                    <input
                      type="date"
                      value={selectedInvoice.invoice_date?.slice(0, 10) || ''}
                      disabled={fieldsExtracting}
                      onChange={(e) =>
                        onUpdateDraft(selectedInvoice.draftId, {
                          invoice_date: e.target.value,
                        })
                      }
                      className="client-ai-confirm__input"
                    />
                  </label>
                  <label className="client-ai-review__field">
                    <span>Carrier</span>
                    <input
                      type="text"
                      value={displayCarrier}
                      readOnly
                      className="client-ai-confirm__input client-ai-confirm__input--readonly"
                      title="From the batch carrier"
                    />
                  </label>
                  <div className={`client-ai-review__field client-ai-review__field--full${fieldsExtracting ? ' is-extracting' : ''}`}>
                    <span>
                      Broker
                      {fieldsExtracting && !aiLiveProgress?.extract?.brokerName ? (
                        <span className="client-ai-review__field-live">
                          <Loader2 className="w-3 h-3 animate-spin" />
                        </span>
                      ) : null}
                    </span>
                    <BrokerPicker
                      mode={brokerPickerMode}
                      compact
                      disabled={fieldsExtracting}
                      inputClassName="client-ai-confirm__input client-ai-confirm__input--wide"
                      value={{
                        broker_id: selectedInvoice.broker_id,
                        broker_name: selectedInvoice.broker_name,
                        pending_new: Boolean(
                          selectedInvoice.broker_name && !selectedInvoice.broker_id
                        ),
                      }}
                      onChange={(next) =>
                        onUpdateDraft(selectedInvoice.draftId, {
                          broker_id: next.broker_id,
                          broker_name: next.broker_name,
                        })
                      }
                    />
                  </div>
                  <label className={`client-ai-review__field${fieldsExtracting ? ' is-extracting' : ''}`}>
                    <span>
                      Rate
                      {fieldsExtracting && aiLiveProgress?.extract?.amount == null ? (
                        <span className="client-ai-review__field-live">
                          <Loader2 className="w-3 h-3 animate-spin" />
                        </span>
                      ) : null}
                    </span>
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={selectedInvoice.amount || ''}
                      disabled={fieldsExtracting}
                      onChange={(e) =>
                        onUpdateDraft(selectedInvoice.draftId, {
                          amount: Number.parseFloat(e.target.value) || 0,
                          rate_missing: false,
                        })
                      }
                      className="client-ai-confirm__input client-ai-confirm__input--amount"
                    />
                  </label>
                </div>

                {fieldsExtracting ? (
                  <div className="client-ai-confirm__live-review" style={{ marginTop: 8 }}>
                    <AiReviewExtractProgressList
                      extracting
                      extract={aiLiveProgress?.extract}
                    />
                    <AiReviewChecksProgressList
                      extracting
                      checks={aiLiveProgress?.checks}
                    />
                  </div>
                ) : null}

                <div className="client-ai-packet__attached">
                  <div
                    className={`client-ai-packet__attached-col${
                      dropTarget === 'list-rc' ? ' is-drop-target' : ''
                    }`}
                    onDragOver={(e) => allowDrop(e, 'list-rc')}
                    onDragLeave={() => setDropTarget(null)}
                    onDrop={(e) => {
                      e.preventDefault()
                      setDropTarget(null)
                      const payload = readPacketDocDrag(e)
                      if (!payload || !selectedInvoice) return
                      placeDoc(payload, selectedInvoice.draftId, 'rate_confirmation')
                      setViewingRcDocId(payload.docId)
                    }}
                  >
                    <p className="client-ai-packet__attached-label">Invoice + rate cons</p>
                    <ul className="client-ai-packet__attached-list">
                      {invoiceAndRcDocs.length === 0 && (
                        <li className="client-ai-packet__attached-empty">
                          Drop RC here
                        </li>
                      )}
                      {invoiceAndRcDocs.map((doc) => (
                        <li key={doc.docId} title={doc.fileName}>
                          <button
                            type="button"
                            className={`client-ai-packet__attached-row${
                              viewingRcDocId === doc.docId ? ' is-viewing' : ''
                            }${docMenu?.docId === doc.docId ? ' is-menu-target' : ''}`}
                            draggable={!doc.generated}
                            onDragStart={(e) =>
                              onDragStartDoc(
                                e,
                                doc.docId,
                                selectedInvoice.draftId,
                                doc.generated
                              )
                            }
                            onContextMenu={(e) =>
                              openDocMenu(
                                e,
                                doc.docId,
                                selectedInvoice.draftId,
                                doc.generated
                              )
                            }
                            onClick={() => {
                              setViewingRcDocId(doc.docId)
                              setRcScrollRequestId((n) => n + 1)
                              ensureDoc(doc.docId)
                            }}
                          >
                            {shortFileName(doc.fileName, 22)}
                            {doc.generated ? ' · inv' : ''}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div
                    className={`client-ai-packet__attached-col${
                      dropTarget === 'list-bol' ? ' is-drop-target' : ''
                    }`}
                    onDragOver={(e) => allowDrop(e, 'list-bol')}
                    onDragLeave={() => setDropTarget(null)}
                    onDrop={(e) => {
                      e.preventDefault()
                      setDropTarget(null)
                      const payload = readPacketDocDrag(e)
                      if (!payload || !selectedInvoice) return
                      placeDoc(payload, selectedInvoice.draftId, 'bill_of_lading')
                      setViewingBolDocId(payload.docId)
                    }}
                  >
                    <p className="client-ai-packet__attached-label">BOLs</p>
                    <ul className="client-ai-packet__attached-list">
                      {bolDocs.length === 0 && (
                        <li className="client-ai-packet__attached-empty">Drop BOL here</li>
                      )}
                      {bolDocs.map((doc) => (
                        <li key={doc.docId} title={doc.fileName}>
                          <button
                            type="button"
                            className={`client-ai-packet__attached-row${
                              viewingBolDocId === doc.docId ? ' is-viewing' : ''
                            }${docMenu?.docId === doc.docId ? ' is-menu-target' : ''}`}
                            draggable
                            onDragStart={(e) =>
                              onDragStartDoc(e, doc.docId, selectedInvoice.draftId)
                            }
                            onContextMenu={(e) =>
                              openDocMenu(e, doc.docId, selectedInvoice.draftId)
                            }
                            onClick={() => {
                              setViewingBolDocId(doc.docId)
                              setBolScrollRequestId((n) => n + 1)
                              ensureDoc(doc.docId)
                            }}
                          >
                            {shortFileName(doc.fileName, 22)}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </>
            ) : (
              <div className="client-ai-review__empty-main">Drop paperwork to create packets.</div>
            )}
          </div>

          <div className="client-ai-review__dual-docs">
            <CompactPacketDocPane
              title={
                focus?.type === 'unassigned' && unmatchedBuckets.other.length > 0
                  ? 'Rate con / other'
                  : 'Rate con'
              }
              documents={rateConPaneDocs}
              emptyHint="No rate confirmation"
              downloading={Boolean(loadingDocId)}
              downloadProgress={downloadProgress}
              onEnsureDocument={onEnsureDocument}
              activeDocId={viewingRcDocId}
              scrollRequestId={rcScrollRequestId}
              onActiveDocChange={setViewingRcDocId}
              dropKind="rate_confirmation"
              dragFromDraftId={selectedInvoice?.draftId ?? null}
              onDropDocument={(payload) => {
                const toId =
                  selectedInvoice?.draftId ??
                  (focus?.type === 'invoice' ? focus.draftId : null)
                if (!toId && draft.invoices[0]) {
                  placeDoc(payload, draft.invoices[0].draftId, 'rate_confirmation')
                  setFocus({
                    type: 'invoice',
                    draftId: draft.invoices[0].draftId,
                    docId: payload.docId,
                  })
                  return
                }
                placeDoc(payload, toId, 'rate_confirmation')
                setViewingRcDocId(payload.docId)
              }}
            />
            <CompactPacketDocPane
              title={
                focus?.type === 'unassigned' && unmatchedBuckets.other.length > 0
                  ? 'BOL / other'
                  : 'BOL'
              }
              documents={bolPaneDocs}
              emptyHint="No BOL"
              downloading={Boolean(loadingDocId)}
              downloadProgress={downloadProgress}
              onEnsureDocument={onEnsureDocument}
              activeDocId={viewingBolDocId}
              scrollRequestId={bolScrollRequestId}
              onActiveDocChange={setViewingBolDocId}
              dropKind="bill_of_lading"
              dragFromDraftId={selectedInvoice?.draftId ?? null}
              onDropDocument={(payload) => {
                const toId =
                  selectedInvoice?.draftId ??
                  (focus?.type === 'invoice' ? focus.draftId : null)
                if (!toId && draft.invoices[0]) {
                  placeDoc(payload, draft.invoices[0].draftId, 'bill_of_lading')
                  setFocus({
                    type: 'invoice',
                    draftId: draft.invoices[0].draftId,
                    docId: payload.docId,
                  })
                  return
                }
                placeDoc(payload, toId, 'bill_of_lading')
                setViewingBolDocId(payload.docId)
              }}
            />
          </div>
        </>
      )}

      {docMenu &&
        createPortal(
          <div
            ref={docMenuRef}
            className="client-ai-doc-menu"
            style={{ left: docMenu.x, top: docMenu.y }}
            role="menu"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.preventDefault()}
          >
            <button
              type="button"
              role="menuitem"
              className="client-ai-doc-menu__item"
              onClick={() => runDocMenuAction('rate_confirmation')}
            >
              Classify as rate con
            </button>
            <button
              type="button"
              role="menuitem"
              className="client-ai-doc-menu__item"
              onClick={() => runDocMenuAction('bill_of_lading')}
            >
              Classify as BOL
            </button>
            <button
              type="button"
              role="menuitem"
              className="client-ai-doc-menu__item"
              onClick={() => runDocMenuAction('unassigned')}
            >
              Move to unassigned
            </button>
            {onUnpackDocument &&
              docMenu &&
              canUnpackDraftDocument(draft, docMenu.docId) && (
                <button
                  type="button"
                  role="menuitem"
                  className="client-ai-doc-menu__item"
                  disabled={unpackingDocId === docMenu.docId}
                  onClick={() => void handleUnpackDocument()}
                >
                  {unpackingDocId === docMenu.docId ? 'Unpacking…' : 'Unpack pages'}
                </button>
              )}
            {movePacketOptions.length > 0 && (
              <>
                <div className="client-ai-doc-menu__sep" />
                <div className="client-ai-doc-menu__packet-head">
                  <p className="client-ai-doc-menu__label">Move to packet</p>
                  {useCompactPacketPicker && (
                    <button
                      type="button"
                      className="client-ai-doc-menu__search-btn"
                      aria-label="Search packets"
                      title="Search packets"
                      onClick={() => {
                        setPacketSearchOpen((open) => {
                          const next = !open
                          if (next) {
                            queueMicrotask(() => packetSearchRef.current?.focus())
                          } else {
                            setPacketSearch('')
                          }
                          return next
                        })
                      }}
                    >
                      <Search className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                {useCompactPacketPicker && packetSearchOpen && (
                  <div className="client-ai-doc-menu__search">
                    <Search className="client-ai-doc-menu__search-icon" aria-hidden />
                    <input
                      ref={packetSearchRef}
                      type="search"
                      className="client-ai-doc-menu__search-input"
                      placeholder="Invoice, load, broker…"
                      value={packetSearch}
                      onChange={(e) => setPacketSearch(e.target.value)}
                      onKeyDown={(e) => e.stopPropagation()}
                    />
                  </div>
                )}
                <div
                  className={`client-ai-doc-menu__packet-list${
                    useCompactPacketPicker ? ' client-ai-doc-menu__packet-list--compact' : ''
                  }`}
                >
                  {filteredMovePackets.length === 0 ? (
                    <p className="client-ai-doc-menu__empty">No matching packets</p>
                  ) : (
                    filteredMovePackets.map((opt) => (
                      <button
                        key={opt.draftId}
                        type="button"
                        role="menuitem"
                        className="client-ai-doc-menu__item"
                        onClick={() => runDocMenuAction(`packet:${opt.draftId}`)}
                      >
                        {opt.label}
                      </button>
                    ))
                  )}
                </div>
              </>
            )}
          </div>,
          document.body
        )}

      {invoiceMenu &&
        createPortal(
          <div
            ref={invoiceMenuRef}
            className="client-ai-doc-menu"
            style={{ left: invoiceMenu.x, top: invoiceMenu.y }}
            role="menu"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.preventDefault()}
          >
            <p className="client-ai-doc-menu__label">#{invoiceMenu.invoiceNumber}</p>
            <button
              type="button"
              role="menuitem"
              className="client-ai-doc-menu__item"
              disabled={rerunningAiCheck}
              onClick={() => {
                const { draftId, invoiceNumber } = invoiceMenu
                setInvoiceMenu(null)
                void onRerunAiCheck?.(draftId, invoiceNumber)
              }}
            >
              <RefreshCw className="w-3.5 h-3.5 shrink-0" aria-hidden />
              Rerun AI check
            </button>
          </div>,
          document.body
        )}

      {uploadDraft && (
        <ClientInvoiceDocumentUploadModal
          invoiceNumber={uploadDraft.invoice_number}
          brokerName={uploadDraft.broker_name || '—'}
          amount={String(uploadDraft.amount || 0)}
          loadNumber={uploadDraft.load_number || undefined}
          documents={pendingDocs}
          isEditingExistingInvoice={false}
          onClose={closeDocUpload}
          onComplete={() => {
            onAttachDocuments(uploadDraft.draftId, Array.from(pendingFiles.values()))
            closeDocUpload()
          }}
          onFileSelect={(e) => {
            if (e.target.files?.length) addPendingFiles(e.target.files)
            e.target.value = ''
          }}
          onFileDrop={(files) => addPendingFiles(files)}
          onRemoveDocument={(docId) => {
            setPendingDocs((prev) => prev.filter((d) => d.id !== docId))
            setPendingFiles((prev) => {
              const next = new Map(prev)
              next.delete(docId)
              return next
            })
          }}
        />
      )}
    </div>
  )
}
