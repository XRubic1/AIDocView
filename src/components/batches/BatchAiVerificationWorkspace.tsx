import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { AlertCircle, ArrowLeft, Check, ChevronDown, ChevronUp, Loader2, RefreshCw, Save, Sparkles } from 'lucide-react'
import CompactPacketDocPane, { type CompactDocItem } from '../client/CompactPacketDocPane'
import InvoiceAiReviewOutcomePanel from './InvoiceAiReviewOutcomePanel'
import {
  AiReviewChecksProgressList,
  AiReviewExtractProgressList,
} from './AiReviewLiveProgress'
import { getAdminBatchStatusBadge } from './adminBatchStatus'
import { getBatchById, updateBatchStatus } from '../../data/mockBatches'
import { getInvoicesByBatchId, updateInvoice } from '../../data/mockInvoices'
import { mockBrokers } from '../../data/mockBrokers'
import { mergeBatchFiles, addBatchFile } from '../../data/batchFileStore'
import type { BatchIntakeDraft } from '../../types/credyxBatch'
import type { Invoice } from '../../types/invoice'
import type { Broker } from '../../types/broker'
import type { Client } from '../../types/client'
import { getClientById, getAllClients } from '../../services/clientRegistry'
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
  isInvoiceReadyToProcess,
} from '../../utils/invoiceAiVerificationStatus'
import { isAIReviewEnabled } from '../../config/aiReview'
import {
  rerunInvoiceAiReview,
  runBatchAiReview,
  settleBatchAiGate,
  type AiReviewLiveCheck,
  type AiReviewLiveExtract,
  type BatchAiReviewProgress,
} from '../../services/credyx/batchAiReviewService'
import { regenerateInvoicePdfForInvoice } from '../../integrations/docSortToCredyx'
import { approveAdminInvoice, holdAdminInvoice, isAiAutoReviewNote } from '../../services/adminInvoiceActions'
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
import { batchNeedsDocSplit } from '../../utils/batchDocSplit'
import {
  findBrokerByName,
  hasBrokerWithEmailDomain,
  matchBrokerByName,
  primaryBrokerEmailDomain,
} from '../../utils/brokerResolve'
import { normalizeEmailDomain } from '../../utils/emailDomain'

interface BatchAiVerificationWorkspaceProps {
  batchId: string
  onClose: () => void
  onOpenPackets?: (batchId: string) => void
  /** Open Doc Splitter when combined PDFs must be split before Packets. */
  onOpenDocSplitter?: (batchId: string) => void
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
  onOpenDocSplitter,
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
  const [liveReview, setLiveReview] = useState<{
    invoiceId: string
    extract: AiReviewLiveExtract | null
    checks: AiReviewLiveCheck[] | null
    phase: BatchAiReviewProgress['phase']
  } | null>(null)
  const [factEdits, setFactEdits] = useState({
    /** Guards live PDF sync so a packet switch cannot apply the prior form. */
    invoiceId: null as string | null,
    invoice_number: '',
    load_number: '',
    amount: '',
    broker_name: '',
    invoice_date: '',
  })
  const [railSort, setRailSort] = useState<'inv' | 'load' | 'amount' | 'broker'>('inv')
  const [processing, setProcessing] = useState(false)
  const [verifyNote, setVerifyNote] = useState('')
  const [spokeWithName, setSpokeWithName] = useState('')
  const [spokeWithEmail, setSpokeWithEmail] = useState('')
  const [savingEdits, setSavingEdits] = useState(false)
  /** Party info card above verification actions. */
  const [partyTab, setPartyTab] = useState<'broker' | 'client'>('broker')
  const [partyExpanded, setPartyExpanded] = useState(false)
  const [invoices, setInvoices] = useState<Invoice[]>(() => getInvoicesByBatchId(batchId))
  const autoReviewStarted = useRef(false)
  const draftRef = useRef(draft)
  draftRef.current = draft
  const [invoiceMenu, setInvoiceMenu] = useState<{
    x: number
    y: number
    invoiceId: string
    invoiceNumber: string
  } | null>(null)
  const invoiceMenuRef = useRef<HTMLDivElement | null>(null)

  const closeInvoiceMenu = useCallback(() => setInvoiceMenu(null), [])

  const openInvoiceMenu = useCallback((event: MouseEvent, inv: Invoice) => {
    event.preventDefault()
    event.stopPropagation()
    setSelectedId(inv.id)
    setInvoiceMenu({
      x: event.clientX,
      y: event.clientY,
      invoiceId: inv.id,
      invoiceNumber: inv.invoice_number,
    })
  }, [])

  useEffect(() => {
    if (!invoiceMenu) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeInvoiceMenu()
    }
    const onPointer = (e: PointerEvent) => {
      const el = invoiceMenuRef.current
      if (el && e.target instanceof Node && el.contains(e.target)) return
      closeInvoiceMenu()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onPointer, true)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onPointer, true)
    }
  }, [invoiceMenu, closeInvoiceMenu])

  // Keep the menu on-screen after open (mutate styles — avoid setState loops).
  useEffect(() => {
    if (!invoiceMenu || !invoiceMenuRef.current) return
    const el = invoiceMenuRef.current
    const rect = el.getBoundingClientRect()
    const pad = 8
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

  const refreshInvoices = useCallback(() => {
    setInvoices(getInvoicesByBatchId(batchId).map((inv) => ({ ...inv })))
  }, [batchId])

  const patchInvoice = (updated?: Invoice) => {
    if (!updated) return
    setInvoices((prev) => prev.map((inv) => (inv.id === updated.id ? { ...updated } : inv)))
  }

  // Live sync: invoices appear as AI intake finishes.
  useEffect(() => {
    if (!reviewing) {
      settleBatchAiGate(batchId)
    }
    refreshInvoices()
  }, [tenantRevision, refreshInvoices, batchId, reviewing])

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

  const applyReviewProgress = useCallback((p: BatchAiReviewProgress) => {
    if (p.currentInvoiceNumber) {
      setReviewProgress(
        p.phase === 'checking'
          ? `Checking #${p.currentInvoiceNumber}…`
          : p.phase === 'extracting'
            ? `Extracting #${p.currentInvoiceNumber}…`
            : `Reviewing #${p.currentInvoiceNumber}`
      )
    }
    if (p.currentInvoiceId) {
      setReviewFill({
        invoiceId: p.currentInvoiceId,
        remaining: Math.max(0, 100 - (p.invoiceProgress ?? 0)),
      })
      if (p.phase && p.phase !== 'done') {
        setLiveReview({
          invoiceId: p.currentInvoiceId,
          extract: p.liveExtract ?? {},
          checks: p.liveChecks ?? null,
          phase: p.phase,
        })
      } else if (p.phase === 'done') {
        setLiveReview(null)
      }
      setInvoices((prev) =>
        prev.map((inv) =>
          inv.id === p.currentInvoiceId && inv.ai_review_status !== 'running'
            ? { ...inv, ai_review_status: 'running' }
            : inv
        )
      )
    }
  }, [])

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
      // Manual button: allow vision only when DocSort extracts are missing.
      await runBatchAiReview(
        batchId,
        (p) => {
          applyReviewProgress(p)
        },
        { allowVision: true }
      )
      refreshInvoices()
      showToast('AI review finished', 'success')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'AI review failed', 'error')
    } finally {
      settleBatchAiGate(batchId)
      refreshInvoices()
      setReviewing(false)
      setReviewProgress('')
      setReviewFill(null)
      setLiveReview(null)
    }
  }, [batchId, showToast, refreshInvoices, applyReviewProgress])

  /** Right-click: re-check one invoice only (force + vision if extracts missing). */
  const rerunSingleInvoice = useCallback(
    async (invoiceId: string, invoiceNumber: string) => {
      if (!isAIReviewEnabled()) {
        showToast('Configure the openai-proxy Edge Function to enable AI review.', 'error')
        return
      }
      if (reviewing) {
        showToast('Wait for the current review to finish.', 'info')
        return
      }
      setReviewing(true)
      setReviewProgress(`Re-checking #${invoiceNumber}…`)
      setSelectedId(invoiceId)
      setInvoices((prev) =>
        prev.map((inv) =>
          inv.id === invoiceId ? { ...inv, ai_review_status: 'running' } : inv
        )
      )
      try {
        const current = draftRef.current
        if (current && current.fileById.size > 0) mergeBatchFiles(batchId, current.fileById)
        await rerunInvoiceAiReview(
          batchId,
          invoiceId,
          (p) => {
            applyReviewProgress(p)
          },
          { allowVision: true }
        )
        refreshInvoices()
        showToast(`AI check re-run for #${invoiceNumber}`, 'success')
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'AI re-check failed', 'error')
        refreshInvoices()
      } finally {
        settleBatchAiGate(batchId)
        refreshInvoices()
        setReviewing(false)
        setReviewProgress('')
        setReviewFill(null)
        setLiveReview(null)
      }
    },
    [batchId, showToast, refreshInvoices, reviewing, applyReviewProgress]
  )

  // Pull AI checks from DocSort extract JSON only — never re-scan paperwork on open.
  // Vision already ran during packet creation; Verification is human OK/Hold on those results.
  useEffect(() => {
    if (loading || !draft || autoReviewStarted.current) return
    if (batch?.status === 'creating' || batch?.sort_status === 'sorting') return
    if (invoices.length === 0) return
    const needsRun = invoices.some(
      (inv) => !inv.ai_review_status || inv.ai_review_status === 'not_run'
    )
    if (!needsRun) return
    if (!isAIReviewEnabled()) return

    autoReviewStarted.current = true
    if (batch && batch.status === 'ready_to_post') {
      updateBatchStatus(batchId, 'verification')
    }
    void (async () => {
      try {
        // allowVision: false → assembleBatchReviewFromDocuments(reviewsFromCatalog)
        await runBatchAiReview(batchId, undefined, { allowVision: false })
        refreshInvoices()
      } catch (err) {
        console.warn('[BatchAiVerificationWorkspace] extract finalize failed', err)
      } finally {
        settleBatchAiGate(batchId)
        refreshInvoices()
      }
    })()
  }, [loading, draft, invoices, batch, batchId, refreshInvoices])

  useEffect(() => {
    if (selectedId && invoices.some((inv) => inv.id === selectedId)) return
    setSelectedId(invoices[0]?.id ?? null)
  }, [invoices, selectedId])

  useEffect(() => {
    const inv = invoices.find((item) => item.id === selectedId)
    const rawNote = inv?.notes ?? inv?.hold_reason ?? ''
    setVerifyNote(isAiAutoReviewNote(rawNote) ? '' : rawNote)
    setSpokeWithName(inv?.selected_contact_person ?? '')
    const emailHint = (inv?.contact_persons ?? []).find((p) => p.includes('@')) ?? ''
    setSpokeWithEmail(emailHint)
    setFactEdits({
      invoiceId: inv?.id ?? null,
      invoice_number: inv?.invoice_number ?? '',
      load_number: inv?.load_number ?? '',
      amount: inv != null ? String(inv.amount ?? '') : '',
      broker_name: inv?.broker_name ?? '',
      invoice_date: inv?.invoice_date?.slice(0, 10) ?? '',
    })
    setPartyExpanded(false)
    setPartyTab('broker')
    // Only reset when the selected packet changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId])

  /** Persist invoice field edits and regenerate the Credyx invoice PDF pages. */
  const syncInvoiceDetailsToPages = useCallback(
    async (invoice: Invoice, patch: Partial<Invoice>) => {
      const merged = updateInvoice(invoice.id, patch)
      if (!merged) return
      patchInvoice(merged)
      const carrier = batch?.client_name || merged.client_name
      try {
        const { file, docId } = await regenerateInvoicePdfForInvoice(merged, carrier)
        addBatchFile(batchId, docId, file)
        mergeBatchFiles(batchId, new Map([[docId, file]]))
        setDraft((prev) => {
          if (!prev) return prev
          const nextFiles = new Map(prev.fileById)
          nextFiles.set(docId, file)
          return {
            ...prev,
            fileById: nextFiles,
            invoices: prev.invoices.map((inv) =>
              inv.draftId === merged.id ||
              inv.groupId === merged.doc_sort_group_id ||
              `invoice-pdf-${inv.groupId}` === docId
                ? { ...inv, invoice_pdf: file, ...patch, carrier_name: carrier }
                : inv
            ),
          }
        })
      } catch (err) {
        console.warn('[BatchAiVerificationWorkspace] invoice PDF sync failed', err)
      }
    },
    [batch?.client_name, batchId]
  )

  const saveFactEdits = useCallback(
    async (invoice: Invoice, opts?: { silent?: boolean }) => {
      const amount = Number.parseFloat(factEdits.amount)
      const paperDomain =
        invoiceAiReviewSnapshotFor(invoice)?.paperwork?.brokerDomain ?? undefined
      const brokerMatch = matchBrokerByName(factEdits.broker_name.trim(), paperDomain)
      const patch: Partial<Invoice> = {
        invoice_number: factEdits.invoice_number.trim() || invoice.invoice_number,
        load_number: factEdits.load_number.trim(),
        broker_name: brokerMatch.broker_name || factEdits.broker_name.trim(),
        broker_id: brokerMatch.broker_id || undefined,
        invoice_date: factEdits.invoice_date || invoice.invoice_date,
        amount: Number.isFinite(amount) ? amount : invoice.amount,
      }
      const unchanged =
        patch.invoice_number === invoice.invoice_number &&
        patch.load_number === (invoice.load_number || '') &&
        patch.broker_name === (invoice.broker_name || '') &&
        (patch.broker_id || '') === (invoice.broker_id || '') &&
        patch.invoice_date === invoice.invoice_date?.slice(0, 10) &&
        patch.amount === invoice.amount
      if (unchanged) return false
      await syncInvoiceDetailsToPages(invoice, patch)
      if (!opts?.silent) {
        showToast('Invoice details updated on invoice pages.', 'success')
      }
      return true
    },
    [factEdits, showToast, syncInvoiceDetailsToPages]
  )

  // Live-update invoice PDF pages as the admin edits packet fields (debounced).
  const invoicesRef = useRef(invoices)
  invoicesRef.current = invoices
  useEffect(() => {
    if (!selectedId || factEdits.invoiceId !== selectedId) return
    const timer = window.setTimeout(() => {
      const invoice = invoicesRef.current.find((inv) => inv.id === selectedId)
      if (!invoice || factEdits.invoiceId !== selectedId) return
      void saveFactEdits(invoice, { silent: true })
    }, 400)
    return () => window.clearTimeout(timer)
  }, [factEdits, selectedId, saveFactEdits])

  /** Persist note + who-you-spoke-with without changing OK/Hold status. */
  const saveVerificationFields = useCallback(
    (invoice: Invoice, overrides?: { note?: string; name?: string; email?: string }) => {
      const note = (overrides?.note ?? verifyNote).trim()
      const name = (overrides?.name ?? spokeWithName).trim()
      const email = (overrides?.email ?? spokeWithEmail).trim()
      const contacts = [name, email].filter(Boolean)
      const prevNote = (invoice.notes ?? invoice.hold_reason ?? '').trim()
      const prevName = (invoice.selected_contact_person ?? '').trim()
      const prevEmail =
        (invoice.contact_persons ?? []).find((p) => p.includes('@'))?.trim() ?? ''
      const unchanged =
        note === prevNote && name === prevName && email === prevEmail
      if (unchanged && !overrides) return invoice
      const updated = updateInvoice(invoice.id, {
        notes: note || undefined,
        selected_contact_person: name || undefined,
        contact_persons: contacts.length > 0 ? contacts : undefined,
      })
      patchInvoice(updated)
      return updated
    },
    [verifyNote, spokeWithName, spokeWithEmail]
  )

  const selected = invoices.find((inv) => inv.id === selectedId) ?? null
  const selectedDraft = selected
    ? draft?.invoices.find((d) => d.draftId === selected.id) ?? null
    : null

  /** Resolve on-file broker for the selected invoice. */
  const selectedBroker = useMemo((): Broker | null => {
    if (!selected) return null
    const paperDomain = invoiceAiReviewSnapshotFor(selected)?.paperwork?.brokerDomain
    const byId = mockBrokers.find((b) => b.id === selected.broker_id)
    if (byId) return byId
    const matched = matchBrokerByName(selected.broker_name || '', paperDomain)
    if (matched.broker_id) {
      return mockBrokers.find((b) => b.id === matched.broker_id) ?? null
    }
    return null
  }, [selected, tenantRevision])

  // Auto-link unmatched brokers when AI review finds a known email domain (or brand token).
  useEffect(() => {
    if (!selected || selected.broker_id) return
    const paperDomain =
      invoiceAiReviewSnapshotFor(selected)?.paperwork?.brokerDomain ?? undefined
    const matched = matchBrokerByName(selected.broker_name || '', paperDomain)
    if (!matched.broker_id) return
    void syncInvoiceDetailsToPages(selected, {
      broker_id: matched.broker_id,
      broker_name: matched.broker_name,
    })
    setFactEdits((prev) =>
      prev.invoiceId === selected.id
        ? { ...prev, broker_name: matched.broker_name }
        : prev
    )
  }, [
    selected,
    syncInvoiceDetailsToPages,
    tenantRevision,
  ])

  /** Resolve on-file carrier/client for this batch invoice. */
  const selectedClient = useMemo((): Client | null => {
    if (!selected) return null
    const byId =
      getClientById(selected.client_id) ??
      (batch?.client_id ? getClientById(batch.client_id) : undefined)
    if (byId) return byId
    const name = (selected.client_name || batch?.client_name || '').trim().toLowerCase()
    if (!name) return null
    return getAllClients().find((c) => c.name.trim().toLowerCase() === name) ?? null
  }, [selected, batch?.client_id, batch?.client_name, tenantRevision])

  const brokerDisplayName = selected
    ? selectedBroker?.name || selected.broker_name || '—'
    : '—'

  const onFileBrokerDomain = useMemo(
    () => primaryBrokerEmailDomain(selectedBroker),
    [selectedBroker]
  )

  const brokerDomain = onFileBrokerDomain || '—'

  /** True when invoice details or verification note fields differ from saved values. */
  const hasUnsavedEdits = useMemo(() => {
    if (!selected) return false
    const amount = Number.parseFloat(factEdits.amount)
    const factsDirty =
      (factEdits.invoice_number.trim() || selected.invoice_number) !== selected.invoice_number ||
      factEdits.load_number.trim() !== (selected.load_number || '') ||
      factEdits.broker_name.trim() !== (selected.broker_name || '') ||
      (factEdits.invoice_date || selected.invoice_date?.slice(0, 10)) !==
        selected.invoice_date?.slice(0, 10) ||
      (Number.isFinite(amount) ? amount : selected.amount) !== selected.amount
    const prevNote = (selected.notes ?? selected.hold_reason ?? '').trim()
    const prevName = (selected.selected_contact_person ?? '').trim()
    const prevEmail =
      (selected.contact_persons ?? []).find((p) => p.includes('@'))?.trim() ?? ''
    const verifyDirty =
      verifyNote.trim() !== prevNote ||
      spokeWithName.trim() !== prevName ||
      spokeWithEmail.trim() !== prevEmail
    return factsDirty || verifyDirty
  }, [selected, factEdits, verifyNote, spokeWithName, spokeWithEmail])

  /** Explicit Save — invoice details + notes are not persisted on blur. */
  const handleSaveEdits = useCallback(async () => {
    if (!selected || !hasUnsavedEdits || savingEdits) return
    setSavingEdits(true)
    try {
      const amount = Number.parseFloat(factEdits.amount)
      const factsDirty =
        (factEdits.invoice_number.trim() || selected.invoice_number) !==
          selected.invoice_number ||
        factEdits.load_number.trim() !== (selected.load_number || '') ||
        factEdits.broker_name.trim() !== (selected.broker_name || '') ||
        (factEdits.invoice_date || selected.invoice_date?.slice(0, 10)) !==
          selected.invoice_date?.slice(0, 10) ||
        (Number.isFinite(amount) ? amount : selected.amount) !== selected.amount
      const prevNote = (selected.notes ?? selected.hold_reason ?? '').trim()
      const prevName = (selected.selected_contact_person ?? '').trim()
      const prevEmail =
        (selected.contact_persons ?? []).find((p) => p.includes('@'))?.trim() ?? ''
      const verifyDirty =
        verifyNote.trim() !== prevNote ||
        spokeWithName.trim() !== prevName ||
        spokeWithEmail.trim() !== prevEmail

      if (factsDirty) await saveFactEdits(selected, { silent: true })
      if (verifyDirty) saveVerificationFields(selected)

      const msg =
        factsDirty && verifyDirty
          ? 'Invoice details and notes saved.'
          : factsDirty
            ? 'Invoice details saved.'
            : 'Notes saved.'
      showToast(msg, 'success')
    } catch (err) {
      console.warn('[BatchAiVerificationWorkspace] save failed', err)
      showToast('Could not save changes.', 'error')
    } finally {
      setSavingEdits(false)
    }
  }, [
    selected,
    hasUnsavedEdits,
    savingEdits,
    factEdits,
    verifyNote,
    spokeWithName,
    spokeWithEmail,
    saveFactEdits,
    saveVerificationFields,
    showToast,
  ])

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
    saveVerificationFields(invoice)
    // OK always approves and clears Hold / Review.
    patchInvoice(approveAdminInvoice(invoice.id, adminUserName))
    showToast(`#${invoice.invoice_number} marked OK`, 'success')
  }

  const markHold = (invoice: Invoice) => {
    const note = verifyNote.trim()
    saveVerificationFields(invoice, { note })
    patchInvoice(
      holdAdminInvoice(
        invoice.id,
        note || 'On hold — see portal for details',
        adminUserName
      )
    )
    showToast(`#${invoice.invoice_number} placed on hold`, 'success')
  }

  const setVerifyChannel = (invoice: Invoice, channel: Invoice['verification_status']) => {
    patchInvoice(updateInvoice(invoice.id, { verification_status: channel }))
  }

  const resolvePacketIssues = async (invoice: Invoice) => {
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
    await syncInvoiceDetailsToPages(invoice, fieldPatch)
    const merged = getInvoicesByBatchId(batchId).find((inv) => inv.id === invoice.id) ?? invoice
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
    setFactEdits({
      invoiceId: merged.id,
      invoice_number: merged.invoice_number,
      load_number: merged.load_number ?? '',
      amount: String(merged.amount ?? ''),
      broker_name: merged.broker_name ?? '',
      invoice_date: merged.invoice_date?.slice(0, 10) ?? '',
    })
    showToast('Packet + invoice pages updated. Carrier stayed as the submitting account.', 'success')
  }

  const verifiedCount = invoices.filter((inv) => isInvoiceReadyToProcess(inv)).length
  const allVerified = invoices.length > 0 && verifiedCount === invoices.length
  const holdCount = invoices.filter((inv) => inv.status === 'hold').length
  const reviewCount = invoices.filter((inv) => inv.status === 'review').length
  const okCount = invoices.filter((inv) => invoiceAiVerifyUi(inv).status === 'ok').length
  const needsCount = invoices.filter((inv) => {
    const ui = invoiceAiVerifyUi(inv)
    return ui.status === 'needs_review' && !ui.onHold
  }).length
  const sortedInvoices = useMemo(() => {
    const rows = [...invoices]
    const cmpStr = (a?: string | null, b?: string | null) =>
      (a ?? '').localeCompare(b ?? '', undefined, { numeric: true, sensitivity: 'base' })
    rows.sort((a, b) => {
      switch (railSort) {
        case 'load':
          return cmpStr(a.load_number, b.load_number) || cmpStr(a.invoice_number, b.invoice_number)
        case 'amount':
          return (b.amount ?? 0) - (a.amount ?? 0) || cmpStr(a.invoice_number, b.invoice_number)
        case 'broker':
          return cmpStr(a.broker_name, b.broker_name) || cmpStr(a.invoice_number, b.invoice_number)
        case 'inv':
        default:
          return cmpStr(a.invoice_number, b.invoice_number)
      }
    })
    return rows
  }, [invoices, railSort])
  const aiProgress = getAdminBatchAiReviewProgress(batchId)
  const liveBatch = getBatchById(batchId) ?? batch
  const packetsReady = liveBatch ? canOpenPacketRework(liveBatch) : false
  const needsDocSplit = liveBatch ? batchNeedsDocSplit(liveBatch) : false
  const stillCreating =
    liveBatch?.status !== 'rework' &&
    liveBatch?.status !== 'needs_split' &&
    !needsDocSplit &&
    (liveBatch?.status === 'creating' ||
      (liveBatch?.sort_status === 'sorting' && invoices.length === 0) ||
      (invoices.length === 0 &&
        liveBatch?.sort_status !== 'failed' &&
        (liveBatch?.upload_mode === 'ai' || liveBatch?.upload_mode === 'handoff')))

  const handleProcess = async () => {
    if (!batch || processing) return
    // Prefer live store so AI-ready invoices match Process gate after refresh.
    const live = getInvoicesByBatchId(batchId)
    const readyCount = live.filter((inv) => isInvoiceReadyToProcess(inv)).length
    if (live.length === 0 || readyCount !== live.length) {
      showToast(
        `Set every invoice to OK or Hold before processing (${readyCount}/${live.length || invoices.length}).`,
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
        refreshInvoices()
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
      refreshInvoices()
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
  const selectedLive =
    liveReview && selected && liveReview.invoiceId === selected.id ? liveReview : null
  const isExtractingSelected = Boolean(
    selectedLive && selectedLive.phase && selectedLive.phase !== 'done'
  )

  const paperBrokerDomain =
    normalizeEmailDomain(
      extracted?.brokerDomain || selectedLive?.extract?.brokerDomain || ''
    ) || ''
  const paperDomainInSystem = paperBrokerDomain
    ? hasBrokerWithEmailDomain(paperBrokerDomain)
    : true
  const paperDomainMatchesOnFile = Boolean(
    paperBrokerDomain && onFileBrokerDomain && paperBrokerDomain === onFileBrokerDomain
  )
  const paperDomainConflictsOnFile = Boolean(
    paperBrokerDomain && onFileBrokerDomain && paperBrokerDomain !== onFileBrokerDomain
  )
  const assignedBrokerName = (factEdits.broker_name || selected?.broker_name || '').trim()
  const brokerNotInSystem = Boolean(
    (paperBrokerDomain && !paperDomainInSystem) ||
      (assignedBrokerName && !selectedBroker && !findBrokerByName(assignedBrokerName))
  )

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
          {onOpenDocSplitter && needsDocSplit && (
            <button
              type="button"
              className="dashboard-btn-primary !h-8"
              title="Split combined PDFs before Packet Rework"
              onClick={() => onOpenDocSplitter(batchId)}
            >
              Doc Split
            </button>
          )}
          {onOpenPackets && (
            <button
              type="button"
              className={`dashboard-btn-secondary !h-8${packetsReady && !needsDocSplit ? '' : ' opacity-50'}`}
              title={
                needsDocSplit
                  ? 'Split combined PDFs in Doc Splitter first'
                  : packetsReady
                    ? 'Open Packets rework workspace'
                    : 'Packet rework unlocks when invoices are ready'
              }
              onClick={() => {
                const latest = getBatchById(batchId)
                if (latest && batchNeedsDocSplit(latest) && onOpenDocSplitter) {
                  showToast('Split combined PDFs in Doc Splitter before Packet Rework.', 'info')
                  onOpenDocSplitter(batchId)
                  return
                }
                if (!latest || !canOpenPacketRework(latest)) {
                  showToast(
                    'Packet rework unlocks when invoices are created and AI is not still running.',
                    'info'
                  )
                  refreshInvoices()
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
            title="Packet creation already scanned paperwork into JSON. Use this only when extracts are missing (e.g. manual packets) or you want a forced re-scan."
          >
            <Sparkles className="w-3.5 h-3.5" />
            {reviewing ? 'Reviewing…' : 'Re-scan paperwork'}
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

      {needsDocSplit ? (
        <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-3 p-8">
          <p className="text-sm font-medium" style={{ color: c.primary }}>
            Doc Split required
          </p>
          <p className="text-xs text-center max-w-md" style={{ color: c.secondary }}>
            Combined PDFs (invoice + RC + BOL) must be split before Packet Rework and AI
            verification continue.
          </p>
          <div className="flex flex-wrap gap-2 justify-center">
            {onOpenDocSplitter ? (
              <button
                type="button"
                className="dashboard-btn-primary"
                onClick={() => onOpenDocSplitter(batchId)}
              >
                Open Doc Splitter
              </button>
            ) : null}
            <button type="button" className="dashboard-btn-secondary" onClick={onClose}>
              <ArrowLeft className="w-4 h-4" />
              Back to batches
            </button>
          </div>
        </div>
      ) : stillCreating && invoices.length === 0 ? (
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
      ) : liveBatch?.status === 'rework' && invoices.length === 0 ? (
        <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-3 p-8">
          <p className="text-sm font-medium" style={{ color: c.primary }}>
            Manual creation — no invoices yet
          </p>
          <p className="text-xs text-center max-w-md" style={{ color: c.secondary }}>
            AI packet creation was stopped. Open Packet Rework to assign uploaded documents into
            packets.
          </p>
          <div className="flex flex-wrap gap-2 justify-center">
            {onOpenPackets ? (
              <button
                type="button"
                className="dashboard-btn-primary"
                onClick={() => onOpenPackets(batchId)}
              >
                Open Packet Rework
              </button>
            ) : null}
            <button type="button" className="dashboard-btn-secondary" onClick={onClose}>
              <ArrowLeft className="w-4 h-4" />
              Back to batches
            </button>
          </div>
        </div>
      ) : (
      <div className="flex-1 min-h-0 overflow-hidden client-ai-upload">
        <div className="client-ai-review client-ai-review--packets client-ai-review--verify">
          <div className="client-ai-review__toolbar">
            <div className="client-ai-review__toolbar-summary">
              <strong>
                {okCount} OK
              </strong>
              <span>· {reviewCount} review</span>
              <span>· {needsCount} needs review</span>
              <span>· {holdCount} hold</span>
              <span>· {verifiedCount}/{invoices.length} ready to process</span>
              {aiProgress.label && <span>· {aiProgress.label}</span>}
              {reviewProgress && <span>· {reviewProgress}</span>}
            </div>
          </div>

          <div className="client-ai-verify__main">
          <div className="client-ai-verify__left">
          <div className="client-ai-verify__overlay">
          <aside className="client-ai-review__rail">
            <div className="client-ai-review__rail-head client-ai-review__rail-head--compact client-ai-verify__rail-title">
              <p className="client-ai-review__rail-kicker">
                Invoices <span className="client-ai-verify__rail-count">#{invoices.length}</span>
              </p>
            </div>
            <div className="client-ai-verify__rail-sort" role="group" aria-label="Sort invoices">
              {(
                [
                  { id: 'inv', label: 'INV' },
                  { id: 'load', label: 'Load' },
                  { id: 'amount', label: 'Amount' },
                  { id: 'broker', label: 'Broker' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className={`client-ai-verify__sort-chip${railSort === opt.id ? ' is-on' : ''}`}
                  aria-pressed={railSort === opt.id}
                  onClick={() => setRailSort(opt.id)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <div className="client-ai-review__rail-list client-ai-review__rail-list--compact">
              {sortedInvoices.map((inv) => {
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
                    onContextMenu={(e) => openInvoiceMenu(e, inv)}
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
                <div className="client-ai-verify__editor-scroll">
                <div className="client-ai-review__editor-head client-ai-review__editor-head--compact">
                  <h3 className="client-ai-review__panel-title">#{selected.invoice_number}</h3>
                  <div className="client-ai-verify__editor-head-actions">
                    {selectedUi && (
                      <span className={`client-ai-verify__badge ${invoiceAiVerifyBadgeClass(selectedUi.status, selectedUi.label)}`}>
                        {selectedUi.label}
                      </span>
                    )}
                    <button
                      type="button"
                      className={`client-ai-verify__mini-btn client-ai-verify__mini-btn--save${
                        hasUnsavedEdits ? ' is-dirty' : ''
                      }`}
                      disabled={!hasUnsavedEdits || savingEdits || isExtractingSelected}
                      onClick={() => void handleSaveEdits()}
                      title={
                        hasUnsavedEdits
                          ? 'Save invoice details and notes'
                          : 'No unsaved changes'
                      }
                    >
                      {savingEdits ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Save className="w-3 h-3" />
                      )}
                      Save
                    </button>
                  </div>
                </div>

                <dl className="client-ai-verify__facts">
                  <div>
                    <dt>Inv #</dt>
                    <dd>
                      <input
                        className="client-ai-verify__fact-input"
                        value={factEdits.invoice_number}
                        disabled={isExtractingSelected}
                        onChange={(e) =>
                          setFactEdits((prev) => ({ ...prev, invoice_number: e.target.value }))
                        }
                      />
                    </dd>
                  </div>
                  <div>
                    <dt>Load #</dt>
                    <dd>
                      <input
                        className="client-ai-verify__fact-input"
                        value={factEdits.load_number}
                        disabled={isExtractingSelected}
                        onChange={(e) =>
                          setFactEdits((prev) => ({ ...prev, load_number: e.target.value }))
                        }
                      />
                    </dd>
                  </div>
                  <div>
                    <dt>Carrier</dt>
                    <dd>{selected.client_name || '—'}</dd>
                  </div>
                  <div>
                    <dt>Amount</dt>
                    <dd>
                      <input
                        className="client-ai-verify__fact-input"
                        type="number"
                        min={0}
                        step={0.01}
                        value={factEdits.amount}
                        disabled={isExtractingSelected}
                        onChange={(e) =>
                          setFactEdits((prev) => ({ ...prev, amount: e.target.value }))
                        }
                      />
                    </dd>
                  </div>
                  <div>
                    <dt>Broker</dt>
                    <dd className="client-ai-verify__fact-broker">
                      <input
                        className="client-ai-verify__fact-input"
                        value={factEdits.broker_name}
                        disabled={isExtractingSelected}
                        onChange={(e) =>
                          setFactEdits((prev) => ({ ...prev, broker_name: e.target.value }))
                        }
                      />
                      {brokerNotInSystem ? (
                        <span
                          className="client-ai-verify__broker-warn"
                          title="Broker is not in the system"
                          aria-label="Broker is not in the system"
                        >
                          !
                        </span>
                      ) : null}
                    </dd>
                  </div>
                  <div>
                    <dt>Date</dt>
                    <dd>
                      <input
                        className="client-ai-verify__fact-input"
                        type="date"
                        value={factEdits.invoice_date}
                        disabled={isExtractingSelected}
                        onChange={(e) =>
                          setFactEdits((prev) => ({ ...prev, invoice_date: e.target.value }))
                        }
                      />
                    </dd>
                  </div>
                </dl>

                {isExtractingSelected ? (
                  <AiReviewExtractProgressList
                    extracting
                    extract={selectedLive?.extract}
                  />
                ) : extracted &&
                  (extracted.loadNumber ||
                    extracted.amount != null ||
                    extracted.brokerName ||
                    extracted.brokerDomain ||
                    extracted.carrierName ||
                    extracted.pickup ||
                    extracted.destinations) ? (
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
                        <li
                          className={`client-ai-verify__check${
                            brokerNotInSystem ? ' is-warn' : ' is-ok'
                          }`}
                        >
                          {brokerNotInSystem ? (
                            <span
                              className="client-ai-verify__broker-warn"
                              title="Broker is not in the system"
                            >
                              !
                            </span>
                          ) : (
                            <Check className="w-3 h-3 shrink-0" />
                          )}
                          <span className="client-ai-verify__check-label">
                            Broker {extracted.brokerName}
                          </span>
                        </li>
                      ) : null}
                      {extracted.brokerDomain || paperBrokerDomain ? (
                        <li
                          className={`client-ai-verify__check${
                            paperDomainMatchesOnFile
                              ? ' is-ok'
                              : paperDomainConflictsOnFile || !paperDomainInSystem
                                ? ' is-warn'
                                : ' is-ok'
                          }`}
                          title={
                            paperDomainMatchesOnFile
                              ? `Matches on-file domain ${onFileBrokerDomain}`
                              : paperDomainConflictsOnFile
                                ? `On file: ${onFileBrokerDomain} · Paperwork: ${paperBrokerDomain}`
                                : !paperDomainInSystem
                                  ? 'Broker is not in the system'
                                  : undefined
                          }
                        >
                          {paperDomainMatchesOnFile ? (
                            <Check className="w-3 h-3 shrink-0" />
                          ) : paperDomainConflictsOnFile || !paperDomainInSystem ? (
                            <span className="client-ai-verify__broker-warn" aria-hidden>
                              !
                            </span>
                          ) : (
                            <Check className="w-3 h-3 shrink-0" />
                          )}
                          <span className="client-ai-verify__check-label">
                            Broker domain {paperBrokerDomain || extracted.brokerDomain}
                            {paperDomainMatchesOnFile
                              ? ' · matches on file'
                              : paperDomainConflictsOnFile
                                ? ` · on file ${onFileBrokerDomain}`
                                : !paperDomainInSystem
                                  ? ' · not in system'
                                  : ''}
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
                      {extracted.pickup ? (
                        <li className="client-ai-verify__check is-ok">
                          <Check className="w-3 h-3 shrink-0" />
                          <span className="client-ai-verify__check-label">
                            Pick {extracted.pickup}
                          </span>
                        </li>
                      ) : null}
                      {extracted.destinations ? (
                        <li className="client-ai-verify__check is-ok">
                          <Check className="w-3 h-3 shrink-0" />
                          <span className="client-ai-verify__check-label">
                            Del {extracted.destinations}
                          </span>
                        </li>
                      ) : null}
                    </ul>
                  </section>
                ) : null}

                {isExtractingSelected ? (
                  <AiReviewChecksProgressList
                    extracting
                    checks={selectedLive?.checks}
                  />
                ) : (
                  <InvoiceAiReviewOutcomePanel
                    invoice={selected}
                    snapshot={snapshot}
                    summary={selected.ai_review_summary}
                    canResolve={snapshotHasResolvablePacketIssues(snapshot)}
                    onResolve={() => void resolvePacketIssues(selected)}
                  />
                )}
                </div>
              </>
            ) : (
              <p className="client-ai-review__empty-main">Select an invoice.</p>
            )}
          </div>
          </div>

          <section
            className={`client-ai-verify__party-card${partyExpanded ? ' is-expanded' : ''}`}
            aria-label="Broker and client details"
          >
            <button
              type="button"
              className="client-ai-verify__party-summary"
              onClick={() => setPartyExpanded((v) => !v)}
              aria-expanded={partyExpanded}
              disabled={!selected}
              title={partyExpanded ? 'Collapse broker & client' : 'Expand broker & client'}
            >
              <span className="client-ai-verify__party-summary-main">
                <span className="client-ai-verify__party-summary-name">
                  {brokerDisplayName}
                  {brokerNotInSystem ? (
                    <span
                      className="client-ai-verify__broker-warn"
                      title="Broker is not in the system"
                      aria-label="Broker is not in the system"
                    >
                      !
                    </span>
                  ) : null}
                </span>
                <span className="client-ai-verify__party-summary-domain">{brokerDomain}</span>
              </span>
              {partyExpanded ? (
                <ChevronDown className="w-3.5 h-3.5 shrink-0" aria-hidden />
              ) : (
                <ChevronUp className="w-3.5 h-3.5 shrink-0" aria-hidden />
              )}
            </button>

            {partyExpanded ? (
              <>
                <div className="client-ai-verify__party-tabs" role="tablist">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={partyTab === 'broker'}
                    className={`client-ai-verify__party-tab${
                      partyTab === 'broker' ? ' is-on' : ''
                    }`}
                    onClick={() => setPartyTab('broker')}
                  >
                    Broker
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={partyTab === 'client'}
                    className={`client-ai-verify__party-tab${
                      partyTab === 'client' ? ' is-on' : ''
                    }`}
                    onClick={() => setPartyTab('client')}
                  >
                    Client
                  </button>
                </div>
                {!selected ? (
                  <p className="client-ai-verify__party-empty">Select an invoice.</p>
                ) : partyTab === 'broker' ? (
                  <>
                    <dl className="client-ai-verify__party-facts">
                      <div>
                        <dt>Name</dt>
                        <dd>{brokerDisplayName}</dd>
                      </div>
                      <div>
                        <dt>Domain</dt>
                        <dd>{brokerDomain}</dd>
                      </div>
                      <div>
                        <dt>MC</dt>
                        <dd>{selectedBroker?.mc_number || '—'}</dd>
                      </div>
                      <div>
                        <dt>DOT</dt>
                        <dd>{selectedBroker?.dot_number || '—'}</dd>
                      </div>
                      <div>
                        <dt>Contact</dt>
                        <dd>{selectedBroker?.contact_person || '—'}</dd>
                      </div>
                      <div>
                        <dt>Net</dt>
                        <dd>
                          {selectedBroker?.payment_terms_days != null
                            ? selectedBroker.payment_terms_days === 0
                              ? 'None'
                              : `${selectedBroker.payment_terms_days}d`
                            : '—'}
                        </dd>
                      </div>
                      <div className="client-ai-verify__party-span">
                        <dt>Email</dt>
                        <dd>
                          {selectedBroker?.emails?.length
                            ? selectedBroker.emails
                                .map((e) => e.email)
                                .filter(Boolean)
                                .join(', ') || '—'
                            : selectedBroker?.email || '—'}
                        </dd>
                      </div>
                      <div className="client-ai-verify__party-span">
                        <dt>Phone</dt>
                        <dd>
                          {selectedBroker?.phones?.length
                            ? selectedBroker.phones
                                .map((p) => p.phone)
                                .filter(Boolean)
                                .join(', ') || '—'
                            : selectedBroker?.phone || '—'}
                        </dd>
                      </div>
                      <div className="client-ai-verify__party-span">
                        <dt>Address</dt>
                        <dd>
                          {[
                            selectedBroker?.address,
                            [selectedBroker?.city, selectedBroker?.state, selectedBroker?.zip]
                              .filter(Boolean)
                              .join(', '),
                          ]
                            .filter(Boolean)
                            .join(' · ') || '—'}
                        </dd>
                      </div>
                      <div>
                        <dt>Prefer</dt>
                        <dd>{selectedBroker?.preferred_contact || '—'}</dd>
                      </div>
                      {selectedBroker?.notes ? (
                        <div className="client-ai-verify__party-span">
                          <dt>Notes</dt>
                          <dd className="client-ai-verify__party-notes">{selectedBroker.notes}</dd>
                        </div>
                      ) : null}
                    </dl>
                    {!selectedBroker || brokerNotInSystem ? (
                      <p className="client-ai-verify__party-hint">
                        {brokerNotInSystem
                          ? 'Broker is not in the system — no debtor match for this name/domain.'
                          : 'No on-file broker match — showing invoice name only.'}
                      </p>
                    ) : null}
                  </>
                ) : (
                  <>
                    <dl className="client-ai-verify__party-facts">
                      <div>
                        <dt>Name</dt>
                        <dd>
                          {selectedClient?.name ||
                            selected.client_name ||
                            batch?.client_name ||
                            '—'}
                        </dd>
                      </div>
                      <div>
                        <dt>MC</dt>
                        <dd>{selectedClient?.mc_number || '—'}</dd>
                      </div>
                      <div>
                        <dt>DOT</dt>
                        <dd>{selectedClient?.dot_number || '—'}</dd>
                      </div>
                      <div>
                        <dt>Contact</dt>
                        <dd>{selectedClient?.contact_person || '—'}</dd>
                      </div>
                      <div className="client-ai-verify__party-span">
                        <dt>Email</dt>
                        <dd>{selectedClient?.email || '—'}</dd>
                      </div>
                      <div className="client-ai-verify__party-span">
                        <dt>Phone</dt>
                        <dd>{selectedClient?.phone || '—'}</dd>
                      </div>
                      <div className="client-ai-verify__party-span">
                        <dt>Address</dt>
                        <dd>
                          {[
                            selectedClient?.address,
                            [selectedClient?.city, selectedClient?.state, selectedClient?.zip]
                              .filter(Boolean)
                              .join(', '),
                          ]
                            .filter(Boolean)
                            .join(' · ') || '—'}
                        </dd>
                      </div>
                      <div>
                        <dt>Tier</dt>
                        <dd>
                          {selectedClient?.service_tier
                            ? selectedClient.service_tier.replace('_', ' ')
                            : '—'}
                        </dd>
                      </div>
                      <div>
                        <dt>Status</dt>
                        <dd>{selectedClient?.status || '—'}</dd>
                      </div>
                      {selectedClient?.notes ? (
                        <div className="client-ai-verify__party-span">
                          <dt>Notes</dt>
                          <dd className="client-ai-verify__party-notes">{selectedClient.notes}</dd>
                        </div>
                      ) : null}
                    </dl>
                    {!selectedClient ? (
                      <p className="client-ai-verify__party-hint">
                        No on-file client match — showing invoice/batch name only.
                      </p>
                    ) : null}
                  </>
                )}
              </>
            ) : null}
          </section>

          <section
            className="client-ai-verify__footer-card"
            aria-label="Verification actions"
          >
            {selected ? (
              <>
                <div className="client-ai-verify__footer-top">
                  <div className="client-ai-verify__actions-row">
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
                        title="Place on hold"
                      >
                        <AlertCircle className="w-3 h-3" />
                        Hold
                      </button>
                    </div>
                  </div>
                  <div className="client-ai-verify__spoke">
                    <label className="client-ai-verify__hold">
                      Spoke with
                      <input
                        type="text"
                        value={spokeWithName}
                        onChange={(e) => setSpokeWithName(e.target.value)}
                        placeholder="Name"
                        autoComplete="off"
                      />
                    </label>
                    <label className="client-ai-verify__hold">
                      Email
                      <input
                        type="email"
                        value={spokeWithEmail}
                        onChange={(e) => setSpokeWithEmail(e.target.value)}
                        placeholder="name@broker.com"
                        autoComplete="off"
                      />
                    </label>
                  </div>
                </div>
                <label className="client-ai-verify__hold client-ai-verify__footer-notes">
                  Notes
                  <textarea
                    value={verifyNote}
                    onChange={(e) => setVerifyNote(e.target.value)}
                    rows={1}
                    placeholder="Note for OK or Hold — click Save to keep"
                  />
                </label>
                <div className="client-ai-verify__footer-save-row">
                  <button
                    type="button"
                    className={`client-ai-verify__mini-btn client-ai-verify__mini-btn--save${
                      hasUnsavedEdits ? ' is-dirty' : ''
                    }`}
                    disabled={!hasUnsavedEdits || savingEdits}
                    onClick={() => void handleSaveEdits()}
                  >
                    {savingEdits ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Save className="w-3 h-3" />
                    )}
                    Save
                  </button>
                  {hasUnsavedEdits ? (
                    <span className="client-ai-verify__unsaved-hint">Unsaved changes</span>
                  ) : null}
                </div>
              </>
            ) : (
              <p className="client-ai-verify__footer-empty">Select an invoice to verify.</p>
            )}
          </section>
          </div>

          <div className="client-ai-review__dual-docs">
            <CompactPacketDocPane
              title="Rate con"
              documents={rateConPaneDocs}
              emptyHint="No rate confirmation"
              onEnsureDocument={ensureDocumentFile}
              allowTempHighlight
              allowQualityTools
              qualityStorageKey="rate_con"
              highlightResetKey={selectedId}
            />
            <CompactPacketDocPane
              title="BOL"
              documents={bolPaneDocs}
              emptyHint="No BOL"
              onEnsureDocument={ensureDocumentFile}
              allowTempHighlight
              allowQualityTools
              qualityStorageKey="bol"
              highlightResetKey={selectedId}
            />
          </div>
          </div>
        </div>
      </div>
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
              disabled={reviewing}
              onClick={() => {
                const { invoiceId, invoiceNumber } = invoiceMenu
                closeInvoiceMenu()
                void rerunSingleInvoice(invoiceId, invoiceNumber)
              }}
            >
              <RefreshCw className="w-3.5 h-3.5 shrink-0" aria-hidden />
              Rerun AI check
            </button>
          </div>,
          document.body
        )}
    </div>
  )
}
