import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Link, useSearchParams, useLocation } from 'react-router-dom'
import { AlertCircle } from 'lucide-react'
import { useClientSession } from '../hooks/useClientSession'
import { getAllBatches, getBatchById, getClientDraftBatch } from '../data/mockBatches'
import { getInvoicesByBatchId, getInvoiceById } from '../data/mockInvoices'
import BatchAiUploadFlow, { type RestoredAiDraftSession } from '../components/client/BatchAiUploadFlow'
import { submitManualBatch } from '../services/credyx/submitManualBatch'
import {
  clearClientDraftBatch,
  clearClientDraftStorage,
  isAiDraftEmpty,
  isManualDraftEmpty,
  loadAiDraftSnapshot,
  loadManualDraftSnapshot,
  persistAiDraftIfNeeded,
  persistManualDraftIfNeeded,
} from '../services/clientBatchDraftService'
import { generateInvoice } from '../../pdfTemplate'
import jsPDF from 'jspdf'
import {
  buildInvoiceRemittanceInfo,
  buildRemittanceUpdatedBannerHtml,
  detectRemittanceChanged,
} from '../utils/carrierRemittance'
import { getClientById } from '../services/clientRegistry'
import DocumentViewer from '../components/DocumentViewer'
import DocumentDownloadOverlay, {
  useDocumentDownloadProgress,
} from '../components/ui/DocumentDownloadOverlay'
import ClientBatchesListView from '../components/client/ClientBatchesListView'
import ClientBatchDetailView from '../components/client/ClientBatchDetailView'
import ClientSubmitDocsView from '../components/client/ClientSubmitDocsView'
import ManagedDocHandoffView from '../components/client/ManagedDocHandoffView'
import { useClientCapabilities } from '../hooks/useClientCapabilities'
import { useToast } from '../components/ui/ToastProvider'
import ClientManualBatchForm, { type ManualBatchInvoiceFormData } from '../components/client/ClientManualBatchForm'
import ClientInvoiceDocumentUploadModal from '../components/client/ClientInvoiceDocumentUploadModal'
import InvoiceDetailWorkspace from '../components/client/InvoiceDetailWorkspace'
import { Invoice, InvoiceDispute, InvoiceNote } from '../types/invoice'
import {
  addClientInvoiceNote,
  openClientInvoiceDispute,
  markClientInvoiceAsPaid,
  buildPaymentConfirmationNote,
  getDisputeReasonLabel,
  type ClientMarkPaidOptions,
} from '../services/clientInvoiceActions'
import { clearClientTenantCache } from '../data/clientDemoData'
import { resolveInvoiceDocumentsAsync } from '../utils/resolveInvoiceDocuments'
import type { BatchIntakeDraft } from '../types/credyxBatch'
import {
  getNextClientInvoiceNumber,
  isInvoiceNumberTaken,
} from '../utils/clientInvoiceNumbers'
import {
  formatLoadNumberWarning,
  formatLoadNumberWarningsSummary,
  getBatchLoadNumberWarnings,
  getLoadNumberWarnings,
  getWithinBatchLoadWarnings,
  validateBatchInvoiceNumbers,
} from '../utils/invoiceDuplicateChecks'
import { mapClientVisibleInvoices } from '../utils/clientInvoiceView'
import ClientReturnBanner from '../components/client/ClientReturnBanner'
import { useTenantDataRevision } from '../hooks/useTenantDataRevision'
import { useClientTheme } from '../theme/ThemeContext'
import {
  getSetupChecklist,
  isClientSetupComplete,
} from '../utils/clientSetupDocuments'
import {
  getClientBatchAiProgress,
  type BatchProcessingJobSnapshot,
  type ClientBatchAiProgress,
} from '../utils/clientBatchAiProgress'
import { fetchClientBatchProcessingJobs } from '../services/credyx/batchProcessingJobs'

type ClientBatchRow = {
  id: string
  batch_number: string
  total_invoices: number
  total_amount: number
  submitted_at: string
  status: string
  reviewed_at: string | null
  upload_mode?: string
  sort_status?: string
  approved_count?: number
  rejected_count?: number
}

interface InvoiceDocument {
  id: string
  name: string
  file: File
  size: number
}

interface InvoiceFormData extends Omit<ManualBatchInvoiceFormData, 'documents'> {
  documents?: InvoiceDocument[]
}

function formInvoiceToInvoice(
  form: InvoiceFormData,
  batchId: string,
  index: number,
  clientId: string,
  clientName: string,
  batchNumber?: string
): Invoice {
  return {
    id: `batch-form-${batchId}-${index}`,
    invoice_number: form.invoice_number,
    client_id: clientId,
    client_name: clientName,
    broker_id: form.broker_id || '',
    broker_name: form.broker_name,
    amount: parseFloat(form.amount || '0'),
    invoice_date: form.invoice_date || new Date().toISOString().split('T')[0],
    due_date: '',
    expected_payment_date: '',
    status: 'pending',
    load_number: form.load_number,
    batch_id: batchId,
    batch_number: batchNumber,
    created_at: new Date().toISOString(),
    notes: form.notes,
    documents_count: form.documents?.length || 0,
  }
}

function mergeInvoiceExtras(invoice: Invoice, extras?: Partial<Invoice>): Invoice {
  if (!extras) return invoice
  return {
    ...invoice,
    notes_history: extras.notes_history ?? invoice.notes_history,
    disputes: extras.disputes ?? invoice.disputes,
  }
}

export default function ClientBatches() {
  const { showToast } = useToast()
  const { clientId, clientName, client } = useClientSession()
  const c = useClientTheme()
  const tenantRevision = useTenantDataRevision()
  const setupComplete = useMemo(
    () => isClientSetupComplete(clientId, client),
    [clientId, client, tenantRevision]
  )
  const setupChecklist = useMemo(
    () => getSetupChecklist(clientId, client),
    [clientId, client, tenantRevision]
  )
  const { capabilities } = useClientCapabilities()
  const [batches, setBatches] = useState<ClientBatchRow[]>([])
  const [createSubMode, setCreateSubMode] = useState<'choose' | 'ai' | 'manual'>('choose')
  const [dashboardAiFiles, setDashboardAiFiles] = useState<File[] | undefined>(undefined)
  const [activeDraftBatchId, setActiveDraftBatchId] = useState<string | null>(null)
  const activeDraftBatchIdRef = useRef<string | null>(null)
  activeDraftBatchIdRef.current = activeDraftBatchId
  const [aiDraftRestored, setAiDraftRestored] = useState<RestoredAiDraftSession | null>(null)
  const [aiDraftReady, setAiDraftReady] = useState(false)
  const [manualDraftReady, setManualDraftReady] = useState(false)

  const refreshBatches = useCallback(() => {
    const rows = getAllBatches()
      .filter((b) => b.client_id === clientId)
      .map((b) => ({
        id: b.id,
        batch_number: b.batch_number,
        total_invoices: b.total_invoices,
        total_amount: b.total_amount,
        submitted_at: b.submitted_at,
        status: b.status,
        reviewed_at: b.reviewed_at ?? null,
        upload_mode: b.upload_mode,
        sort_status: b.sort_status,
        approved_count: b.approved_count,
        rejected_count: b.rejected_count,
      }))
      .sort((a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime())
    setBatches(rows)
  }, [clientId])

  useEffect(() => {
    refreshBatches()
  }, [refreshBatches, tenantRevision])

  /** Latest AI job per batch — drives client PPW progress UI. */
  const [jobByBatchId, setJobByBatchId] = useState<Record<string, BatchProcessingJobSnapshot>>(
    {}
  )
  /** Batches just submitted — show processing before the job row is readable. */
  const [optimisticProcessingIds, setOptimisticProcessingIds] = useState<Set<string>>(
    () => new Set()
  )
  /** Recompute ETA labels while processing (clock ticks). */
  const [etaTick, setEtaTick] = useState(0)

  const refreshProcessingJobs = useCallback(async () => {
    if (!clientId) return
    const jobs = await fetchClientBatchProcessingJobs(clientId)
    setJobByBatchId(jobs)
  }, [clientId])

  useEffect(() => {
    void refreshProcessingJobs()
  }, [refreshProcessingJobs, tenantRevision])

  const aiProgressByBatchId = useMemo(() => {
    const map: Record<string, ClientBatchAiProgress> = {}
    for (const batch of batches) {
      if (batch.status === 'draft') continue
      const invoices = getInvoicesByBatchId(batch.id)
      map[batch.id] = getClientBatchAiProgress({
        batchId: batch.id,
        uploadMode: batch.upload_mode,
        sortStatus: batch.sort_status,
        batchStatus: batch.status,
        submittedAt: batch.submitted_at,
        invoices,
        job: jobByBatchId[batch.id] ?? null,
        optimisticProcessing: optimisticProcessingIds.has(batch.id),
      })
    }
    return map
  }, [batches, jobByBatchId, optimisticProcessingIds, tenantRevision, etaTick])

  const anyAiProcessing = useMemo(
    () => Object.values(aiProgressByBatchId).some((p) => p.phase === 'processing'),
    [aiProgressByBatchId]
  )

  useEffect(() => {
    if (!anyAiProcessing) return
    const id = window.setInterval(() => setEtaTick((n) => n + 1), 15_000)
    return () => window.clearInterval(id)
  }, [anyAiProcessing])

  // Poll while any AI batch is still processing paperwork.
  useEffect(() => {
    if (!anyAiProcessing && optimisticProcessingIds.size === 0) return
    const tick = () => {
      refreshBatches()
      void refreshProcessingJobs()
    }
    const id = window.setInterval(tick, 3000)
    return () => window.clearInterval(id)
  }, [
    anyAiProcessing,
    optimisticProcessingIds.size,
    refreshBatches,
    refreshProcessingJobs,
  ])

  // Clear optimistic flags once the job row exists, or local review finished without Supabase.
  useEffect(() => {
    if (optimisticProcessingIds.size === 0) return
    setOptimisticProcessingIds((prev) => {
      let changed = false
      const next = new Set(prev)
      for (const batchId of prev) {
        const batch = batches.find((b) => b.id === batchId)
        const settled = getClientBatchAiProgress({
          batchId,
          uploadMode: batch?.upload_mode,
          sortStatus: batch?.sort_status,
          batchStatus: batch?.status,
          submittedAt: batch?.submitted_at,
          invoices: getInvoicesByBatchId(batchId),
          job: jobByBatchId[batchId] ?? null,
          optimisticProcessing: false,
        })
        if (
          jobByBatchId[batchId] ||
          settled.phase === 'done' ||
          settled.phase === 'failed'
        ) {
          next.delete(batchId)
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [batches, jobByBatchId, optimisticProcessingIds, tenantRevision])

  // Safety: drop optimistic flags that never settle (e.g. offline).
  useEffect(() => {
    if (optimisticProcessingIds.size === 0) return
    const timer = window.setTimeout(() => {
      setOptimisticProcessingIds(new Set())
    }, 120_000)
    return () => window.clearTimeout(timer)
  }, [optimisticProcessingIds])

  const [selectedBatch, setSelectedBatch] = useState<string | null>(null)
  const [searchParams, setSearchParams] = useSearchParams()
  const location = useLocation()
  const [highlightedBatchId, setHighlightedBatchId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'create' | 'view'>(() => {
    // Check URL parameter for tab
    const tabParam = searchParams.get('tab')
    return tabParam === 'create' ? 'create' : 'view'
  })
  const [currentBatchInvoices, setCurrentBatchInvoices] = useState<InvoiceFormData[]>([])
  const [invoiceFormData, setInvoiceFormData] = useState<InvoiceFormData>({
    invoice_number: '',
    load_number: '',
    broker_id: '',
    broker_name: '',
    broker_address: '',
    pending_new_broker: false,
    amount: '',
    invoice_date: new Date().toISOString().split('T')[0],
    notes: '',
  })

  // Suggest next invoice number for this client (001, 002, …)
  useEffect(() => {
    if (!clientId) return
    if (!invoiceFormData.invoice_number && currentBatchInvoices.length === 0) {
      setInvoiceFormData((prev) => ({
        ...prev,
        invoice_number: getNextClientInvoiceNumber(clientId),
      }))
    }
  }, [clientId, currentBatchInvoices.length, invoiceFormData.invoice_number])

  // Check for highlight parameter from notification / onboarding tour
  useEffect(() => {
    const highlightBatchId = searchParams.get('highlight_batch')
    if (highlightBatchId) {
      setHighlightedBatchId(highlightBatchId)
      const tourStep = searchParams.get('tour_step')
      // Remove the parameter from URL
      searchParams.delete('highlight_batch')
      setSearchParams(searchParams, { replace: true })

      // Tour keeps the flash longer so the row stays easy to spot.
      const ms =
        tourStep === 'batchesNav' || tourStep === 'batches' || tourStep === 'openBatch'
          ? 12_000
          : 3000
      const timer = setTimeout(() => {
        setHighlightedBatchId(null)
      }, ms)

      return () => clearTimeout(timer)
    }
  }, [searchParams, setSearchParams])

  // Status tour list steps need the batch list visible (not detail).
  useEffect(() => {
    const tourStep = searchParams.get('tour_step')
    if (tourStep === 'batchesNav' || tourStep === 'batches' || tourStep === 'openBatch') {
      setSelectedBatch(null)
      setActiveTab('view')
    }
  }, [searchParams])

  const [showDocumentUploadModal, setShowDocumentUploadModal] = useState(false)
  const [showDocumentViewer, setShowDocumentViewer] = useState(false)
  const [docsDownloading, setDocsDownloading] = useState(false)
  const docsDownloadProgress = useDocumentDownloadProgress(docsDownloading)
  const [viewerDocumentsFromStore, setViewerDocumentsFromStore] = useState<
    Array<{ id: string; name: string; file?: File; type: string; size: number }>
  >([])
  const [viewerInvoiceNumber, setViewerInvoiceNumber] = useState('')
  const [showInvoiceDetailView, setShowInvoiceDetailView] = useState(false)
  const [selectedBatchInvoiceId, setSelectedBatchInvoiceId] = useState<string | null>(null)
  const [currentInvoiceForDocuments, setCurrentInvoiceForDocuments] = useState<InvoiceFormData | null>(null)
  const [currentInvoiceIndex, setCurrentInvoiceIndex] = useState<number | null>(null)
  const [uploadedDocuments, setUploadedDocuments] = useState<InvoiceDocument[]>([])
  const [isEditingExistingInvoice, setIsEditingExistingInvoice] = useState(false)
  const [documentUploadSaving, setDocumentUploadSaving] = useState(false)
  const documentUploadInFlightRef = useRef(false)
  const [viewingInvoiceDocuments, setViewingInvoiceDocuments] = useState<InvoiceFormData | null>(null)
  const [batchInvoices, setBatchInvoices] = useState<Record<string, InvoiceFormData[]>>({})
  const [invoiceExtras, setInvoiceExtras] = useState<Record<string, Partial<Invoice>>>({})
  const [invoicesRefreshKey, setInvoicesRefreshKey] = useState(0)

  useEffect(() => {
    setShowInvoiceDetailView(false)
    setSelectedBatchInvoiceId(null)
  }, [selectedBatch])

  // Update tab when URL parameter changes
  useEffect(() => {
    const tabParam = searchParams.get('tab')
    if (tabParam === 'create' && activeTab !== 'create') {
      setActiveTab('create')
    } else if (tabParam === 'view' && activeTab !== 'view') {
      setActiveTab('view')
    } else if (!tabParam && activeTab === 'create' && searchParams.has('highlight_batch')) {
      // Tour / deep-link to list: leave the create tab.
      setActiveTab('view')
    }
  }, [searchParams, activeTab])

  useEffect(() => {
    if (!capabilities.canCreateBatch && searchParams.get('mode') === 'ai') {
      const next = new URLSearchParams(searchParams)
      next.delete('mode')
      setSearchParams(next, { replace: true })
    }
  }, [capabilities.canCreateBatch, searchParams, setSearchParams])

  const draftBatches = useMemo(
    () => batches.filter((batch) => batch.status === 'draft'),
    [batches]
  )


  const activeDraftBatch = activeDraftBatchId ? getBatchById(activeDraftBatchId) : undefined

  const resetManualEditorState = useCallback(() => {
    setCurrentBatchInvoices([])
    const year = new Date().getFullYear()
    setInvoiceFormData({
      invoice_number: `INV-${year}-001`,
      load_number: '',
      broker_id: '',
      broker_name: '',
      broker_address: '',
      pending_new_broker: false,
      amount: '',
      invoice_date: new Date().toISOString().split('T')[0],
      notes: '',
    })
  }, [])

  const handleDeleteDraft = useCallback(
    async (batchId: string) => {
      const batch = getBatchById(batchId)
      if (!batch || batch.status !== 'draft') return
      if (!window.confirm(`Delete draft ${batch.batch_number}? This cannot be undone.`)) return

      await clearClientDraftBatch(batchId)

      if (activeDraftBatchId === batchId) {
        setActiveDraftBatchId(null)
        setAiDraftRestored(null)
        setAiDraftReady(false)
        setManualDraftReady(false)
        resetManualEditorState()
        setCreateSubMode('choose')
      }

      refreshBatches()
    },
    [activeDraftBatchId, refreshBatches, resetManualEditorState]
  )

  const handleOpenCreateBatch = () => {
    setActiveTab('create')
    setSelectedBatch(null)
    setCreateSubMode('choose')
    setActiveDraftBatchId(null)
    setAiDraftRestored(null)
    setAiDraftReady(false)
    setManualDraftReady(false)
    searchParams.set('tab', 'create')
    setSearchParams(searchParams, { replace: true })
  }

  const resumeDraftBatch = useCallback(
    async (batchId: string, uploadMode?: string) => {
      const batch = getBatchById(batchId)
      if (!batch || batch.status !== 'draft') return

      setActiveDraftBatchId(batchId)
      setActiveTab('create')
      setSelectedBatch(null)
      searchParams.set('tab', 'create')
      setSearchParams(searchParams, { replace: true })

      const mode = uploadMode === 'manual' || batch.upload_mode === 'manual' ? 'manual' : 'ai'
      if (mode === 'manual') {
        const restored = await loadManualDraftSnapshot(batchId)
        if (!restored || isManualDraftEmpty(restored.invoices)) {
          await clearClientDraftBatch(batchId)
          setActiveDraftBatchId(null)
          setCreateSubMode('choose')
          refreshBatches()
          return
        }
        setInvoiceFormData(restored.invoiceFormData)
        setCurrentBatchInvoices(restored.invoices)
        setManualDraftReady(true)
        setCreateSubMode('manual')
        return
      }

      const restored = await loadAiDraftSnapshot(batchId)
      if (!restored || isAiDraftEmpty(restored.uploadFiles, restored.intake)) {
        await clearClientDraftBatch(batchId)
        setActiveDraftBatchId(null)
        setCreateSubMode('choose')
        refreshBatches()
        return
      }
      setAiDraftRestored(
        {
          step: restored.snapshot.step,
          uploadFiles: restored.uploadFiles,
          intake: restored.intake,
        }
      )
      setAiDraftReady(true)
      setCreateSubMode('ai')
    },
    [searchParams, setSearchParams, refreshBatches]
  )

  const handleSelectBatch = (batchId: string) => {
    const batch = batches.find((b) => b.id === batchId)
    // Only carrier-owned idle drafts are resumable/deletable. Credyx "creating" opens as view.
    if (batch?.status === 'draft') {
      void resumeDraftBatch(batchId, batch.upload_mode)
      return
    }
    setSelectedBatch(batchId)
  }

  // Deep-link from invoice details: open the batch and show all its invoices
  useEffect(() => {
    const batchId = searchParams.get('batch')
    if (!batchId || batches.length === 0) return

    const match = batches.find((b) => b.id === batchId)
    if (!match) return

    if (match.status === 'draft') {
      void resumeDraftBatch(batchId, match.upload_mode)
    } else {
      setActiveTab('view')
      setSelectedBatch(batchId)
    }

    const next = new URLSearchParams(searchParams)
    next.delete('batch')
    if (next.get('tab') === 'view') next.delete('tab')
    // Preserve returnTo so "Back to payment" stays available.
    setSearchParams(next, { replace: true, state: location.state })
  }, [batches, resumeDraftBatch, searchParams, setSearchParams, location.state])

  const startAiDraft = useCallback(async () => {
    const existing = getClientDraftBatch(clientId, 'ai')
    if (existing) {
      const restored = await loadAiDraftSnapshot(existing.id)
      if (restored && !isAiDraftEmpty(restored.uploadFiles, restored.intake)) {
        setActiveDraftBatchId(existing.id)
        setAiDraftRestored({
          step: restored.snapshot.step,
          uploadFiles: restored.uploadFiles,
          intake: restored.intake,
        })
      } else {
        await clearClientDraftBatch(existing.id)
        setActiveDraftBatchId(null)
        setAiDraftRestored(null)
      }
    } else {
      setActiveDraftBatchId(null)
      setAiDraftRestored(null)
    }
    setAiDraftReady(true)
    setCreateSubMode('ai')
    refreshBatches()
  }, [clientId, refreshBatches])

  const startManualDraft = useCallback(async () => {
    const existing = getClientDraftBatch(clientId, 'manual')
    if (existing) {
      const restored = await loadManualDraftSnapshot(existing.id)
      if (restored && !isManualDraftEmpty(restored.invoices)) {
        setActiveDraftBatchId(existing.id)
        setInvoiceFormData(restored.invoiceFormData)
        setCurrentBatchInvoices(restored.invoices)
      } else {
        await clearClientDraftBatch(existing.id)
        setActiveDraftBatchId(null)
        resetManualEditorState()
      }
    } else {
      setActiveDraftBatchId(null)
      resetManualEditorState()
    }
    setManualDraftReady(true)
    setCreateSubMode('manual')
    refreshBatches()
  }, [clientId, refreshBatches, resetManualEditorState])

  const handlePersistAiDraft = useCallback(
    async (payload: {
      step: 'upload' | 'processing' | 'confirm'
      files: File[]
      intake: BatchIntakeDraft | null
    }) => {
      const { batchId, result } = await persistAiDraftIfNeeded(
        clientId,
        clientName,
        activeDraftBatchIdRef.current,
        { step: payload.step },
        payload.intake,
        payload.files
      )
      if (batchId !== activeDraftBatchIdRef.current) {
        setActiveDraftBatchId(batchId)
        activeDraftBatchIdRef.current = batchId
      }
      if (result !== 'skipped') {
        refreshBatches()
      }
    },
    [clientId, clientName, refreshBatches]
  )

  useEffect(() => {
    if (createSubMode !== 'manual' || !manualDraftReady) return
    const timer = setTimeout(() => {
      void persistManualDraftIfNeeded(
        clientId,
        clientName,
        activeDraftBatchId,
        invoiceFormData,
        currentBatchInvoices
      ).then(({ batchId, result }) => {
        if (batchId !== activeDraftBatchId) {
          setActiveDraftBatchId(batchId)
        }
        if (result !== 'skipped') {
          refreshBatches()
        }
      })
    }, 900)
    return () => clearTimeout(timer)
  }, [
    activeDraftBatchId,
    createSubMode,
    manualDraftReady,
    invoiceFormData,
    currentBatchInvoices,
    clientId,
    clientName,
    refreshBatches,
  ])

  useEffect(() => {
    const mode = searchParams.get('mode')
    const state = location.state as { initialFiles?: File[] } | null
    if (mode === 'ai') {
      setActiveTab('create')
      if (state?.initialFiles?.length) {
        setDashboardAiFiles(state.initialFiles)
      }
      void startAiDraft()
      searchParams.delete('mode')
      setSearchParams(searchParams, { replace: true })
    }
  }, [searchParams, setSearchParams, location.state, startAiDraft])

  const handleOpenViewBatches = () => {
    setActiveTab('view')
    setSelectedBatch(null)
    searchParams.delete('tab')
    setSearchParams(searchParams, { replace: true })
  }

  const pendingInvoiceNumbers = useCallback(
    () => currentBatchInvoices.map((inv) => inv.invoice_number),
    [currentBatchInvoices]
  )

  // Live field validation while typing (client-scoped only).
  const manualInvoiceNumberError = useMemo(() => {
    const num = invoiceFormData.invoice_number.trim()
    if (!num || !clientId) return null
    if (isInvoiceNumberTaken(clientId, num, pendingInvoiceNumbers())) {
      return `Invoice number ${num} is already used for your account`
    }
    return null
  }, [clientId, invoiceFormData.invoice_number, pendingInvoiceNumbers, tenantRevision])

  const manualLoadNumberWarning = useMemo(() => {
    if (!clientId) return null
    const warnings = getLoadNumberWarnings(invoiceFormData.load_number, {
      forClientId: clientId,
      crossCarrier: false,
    })
    if (warnings.length === 0) return null
    return formatLoadNumberWarning(warnings[0], 'client')
  }, [clientId, invoiceFormData.load_number, tenantRevision])

  const generateNextInvoiceNumber = useCallback(() => {
    if (!clientId) return '001'
    return getNextClientInvoiceNumber(clientId, pendingInvoiceNumbers())
  }, [clientId, pendingInvoiceNumbers])

  const handleInvoiceInputChange = (field: keyof InvoiceFormData, value: string) => {
    setInvoiceFormData((prev) => ({ ...prev, [field]: value }))
  }

  const handleBrokerChange = (next: {
    broker_id: string
    broker_name: string
    pending_new?: boolean
    broker_address?: string
  }) => {
    setInvoiceFormData((prev) => ({
      ...prev,
      broker_id: next.broker_id,
      broker_name: next.broker_name,
      pending_new_broker: Boolean(next.pending_new),
      broker_address: next.broker_address ?? (next.pending_new ? '' : prev.broker_address),
    }))
  }

  const handleAddInvoice = () => {
    const hasBroker =
      Boolean(invoiceFormData.broker_id) ||
      (Boolean(invoiceFormData.pending_new_broker) && Boolean(invoiceFormData.broker_name.trim()))
    if (!hasBroker || !invoiceFormData.amount) {
      showToast('Select or request a broker, and enter an amount', 'error')
      return
    }
    // Address is optional for pending-new brokers (Credyx completes the profile later).
    if (invoiceFormData.broker_id && !invoiceFormData.broker_address.trim()) {
      showToast('Broker address is required for directory brokers', 'error')
      return
    }

    const invoiceNumber =
      invoiceFormData.invoice_number.trim() || generateNextInvoiceNumber()

    if (!invoiceNumber) {
      showToast('Invoice number is required', 'error')
      return
    }

    if (isInvoiceNumberTaken(clientId, invoiceNumber, pendingInvoiceNumbers())) {
      showToast(
        `Invoice number ${invoiceNumber} is already used for your account. Enter a different number.`,
        'error'
      )
      return
    }

    documentUploadInFlightRef.current = false
    setDocumentUploadSaving(false)

    // Store the invoice data temporarily to show in upload modal
    const invoiceToAdd: InvoiceFormData = {
      ...invoiceFormData,
      invoice_number: invoiceNumber,
      documents: [],
    }

    // Show document upload modal
    setCurrentInvoiceForDocuments(invoiceToAdd)
    setUploadedDocuments([])
    setShowDocumentUploadModal(true)
  }

  const closeDocumentUploadModal = () => {
    documentUploadInFlightRef.current = false
    setDocumentUploadSaving(false)
    setShowDocumentUploadModal(false)
    setCurrentInvoiceForDocuments(null)
    setCurrentInvoiceIndex(null)
    setUploadedDocuments([])
    setIsEditingExistingInvoice(false)
  }

  const resetInvoiceFormAfterAdd = () => {
    const nextInvoiceNumber = generateNextInvoiceNumber()
    setInvoiceFormData({
      invoice_number: nextInvoiceNumber,
      load_number: '',
      broker_id: '',
      broker_name: '',
      broker_address: '',
      pending_new_broker: false,
      amount: '',
      invoice_date: new Date().toISOString().split('T')[0],
      notes: '',
    })
  }

  const beginDocumentUploadAction = (): boolean => {
    if (documentUploadInFlightRef.current) return false
    documentUploadInFlightRef.current = true
    setDocumentUploadSaving(true)
    return true
  }

  const endDocumentUploadAction = () => {
    documentUploadInFlightRef.current = false
    setDocumentUploadSaving(false)
  }

  const generateInvoicePdfDocument = async (
    invoice: InvoiceFormData
  ): Promise<InvoiceDocument | null> => {
    try {
      const pdfFile = await generatePDFInvoice(invoice)
      return {
        id: `pdf-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: pdfFile.name,
        file: pdfFile,
        size: pdfFile.size,
      }
    } catch (error) {
      console.error('Error generating PDF invoice:', error)
      return null
    }
  }

  const handleDocumentUploadComplete = async () => {
    if (!currentInvoiceForDocuments || !beginDocumentUploadAction()) return

    try {
      const pdfDocument = await generateInvoicePdfDocument(currentInvoiceForDocuments)
      const allDocuments = pdfDocument ? [pdfDocument, ...uploadedDocuments] : uploadedDocuments

      if (isEditingExistingInvoice && currentInvoiceIndex !== null) {
        setCurrentBatchInvoices((prev) => {
          const updated = [...prev]
          updated[currentInvoiceIndex] = {
            ...updated[currentInvoiceIndex],
            documents: allDocuments,
          }
          return updated
        })
      } else {
        setCurrentBatchInvoices((prev) => [
          ...prev,
          { ...currentInvoiceForDocuments, documents: allDocuments },
        ])
        resetInvoiceFormAfterAdd()
      }

      closeDocumentUploadModal()
    } catch (error) {
      console.error('Error saving invoice documents:', error)
      endDocumentUploadAction()
    }
  }

  const handleDocumentUploadSkip = async () => {
    if (!currentInvoiceForDocuments || documentUploadInFlightRef.current) return

    if (isEditingExistingInvoice) {
      closeDocumentUploadModal()
      return
    }

    if (!beginDocumentUploadAction()) return

    try {
      const pdfDocument = await generateInvoicePdfDocument(currentInvoiceForDocuments)
      setCurrentBatchInvoices((prev) => [
        ...prev,
        {
          ...currentInvoiceForDocuments,
          documents: pdfDocument ? [pdfDocument] : [],
        },
      ])
      resetInvoiceFormAfterAdd()
      closeDocumentUploadModal()
    } catch (error) {
      console.error('Error adding invoice:', error)
      endDocumentUploadAction()
    }
  }

  const handleUploadDocumentsForInvoice = (invoice: ManualBatchInvoiceFormData, index: number) => {
    documentUploadInFlightRef.current = false
    setDocumentUploadSaving(false)
    setCurrentInvoiceForDocuments(invoice as InvoiceFormData)
    setCurrentInvoiceIndex(index)
    setUploadedDocuments((invoice.documents || []) as InvoiceDocument[])
    setIsEditingExistingInvoice(true)
    setShowDocumentUploadModal(true)
  }

  const handleViewDocuments = (invoice: ManualBatchInvoiceFormData) => {
    setViewingInvoiceDocuments(invoice as InvoiceFormData)
    setShowDocumentViewer(true)
  }

  // Convert invoice documents to DocumentViewer format
  const getDocumentsForInvoice = (invoice: InvoiceFormData) => {
    if (!invoice.documents || invoice.documents.length === 0) return []
    return invoice.documents.map((doc) => ({
      id: doc.id,
      name: doc.name,
      file: doc.file,
      type: doc.file.type,
      size: doc.size,
    }))
  }

  // Convert image file to PDF
  const convertImageToPDF = async (imageFile: File): Promise<File> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        const img = new Image()
        img.onload = () => {
          const pdf = new jsPDF('p', 'mm', 'a4')
          const imgWidth = img.width
          const imgHeight = img.height
          const pdfWidth = pdf.internal.pageSize.getWidth()
          const pdfHeight = (imgHeight * pdfWidth) / imgWidth
          
          // If image is taller than one page, split it
          if (pdfHeight > pdf.internal.pageSize.getHeight()) {
            const pageHeight = pdf.internal.pageSize.getHeight()
            let heightLeft = pdfHeight
            let position = 0
            
            pdf.addImage(img.src, 'PNG', 0, position, pdfWidth, pdfHeight)
            heightLeft -= pageHeight
            
            while (heightLeft > 0) {
              position = heightLeft - pdfHeight
              pdf.addPage()
              pdf.addImage(img.src, 'PNG', 0, position, pdfWidth, pdfHeight)
              heightLeft -= pageHeight
            }
          } else {
            pdf.addImage(img.src, 'PNG', 0, 0, pdfWidth, pdfHeight)
          }
          
          const pdfBlob = pdf.output('blob')
          const pdfFileName = imageFile.name.replace(/\.(png|jpeg|jpg)$/i, '.pdf')
          const pdfFile = new File([pdfBlob], pdfFileName, { type: 'application/pdf' })
          resolve(pdfFile)
        }
        img.onerror = reject
        img.src = e.target?.result as string
      }
      reader.onerror = reject
      reader.readAsDataURL(imageFile)
    })
  }

  // Check if file is an image
  const isImageFile = (file: File): boolean => {
    const imageTypes = ['image/png', 'image/jpeg', 'image/jpg']
    return imageTypes.includes(file.type.toLowerCase())
  }

  // Process files and convert images to PDF
  const processFiles = async (files: FileList | File[]): Promise<InvoiceDocument[]> => {
    const fileArray = Array.from(files)
    const processedDocuments: InvoiceDocument[] = []

    for (const file of fileArray) {
      if (isImageFile(file)) {
        try {
          const pdfFile = await convertImageToPDF(file)
          processedDocuments.push({
            id: `doc-${Date.now()}-${Math.random()}`,
            name: pdfFile.name,
            file: pdfFile,
            size: pdfFile.size,
          })
        } catch (error) {
          console.error('Error converting image to PDF:', error)
          // Fallback to original file if conversion fails
          processedDocuments.push({
            id: `doc-${Date.now()}-${Math.random()}`,
            name: file.name,
            file: file,
            size: file.size,
          })
        }
      } else {
        // For non-image files, add as-is
        processedDocuments.push({
          id: `doc-${Date.now()}-${Math.random()}`,
          name: file.name,
          file: file,
          size: file.size,
        })
      }
    }

    return processedDocuments
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return

    const processedDocuments = await processFiles(files)
    setUploadedDocuments((prev) => [...prev, ...processedDocuments])
    e.target.value = ''
  }

  const handleRemoveDocument = (docId: string) => {
    setUploadedDocuments((prev) => prev.filter((doc) => doc.id !== docId))
  }

  const handleDocumentFileDrop = async (files: FileList) => {
    const processedDocuments = await processFiles(files)
    setUploadedDocuments((prev) => [...prev, ...processedDocuments])
  }

  // Generate PDF invoice file
  const generatePDFInvoice = async (invoice: InvoiceFormData): Promise<File> => {
    // Get client information from dashboard data
  
    const clientAddress = `${clientName}\nAddress information here`
    
    // Load logo and convert to base64
    let logoBase64: string | undefined = undefined
    try {
      // In Vite, public assets are served from root, so try /Logo.png first
      const logoPaths = [
        '/credyx-logo-black-cred-no-bg.png',
        '/Logo.png',
      ]
      
      console.log('Attempting to load logo...')
      for (const path of logoPaths) {
        try {
          console.log('Trying logo path:', path)
          const response = await fetch(path)
          
          // Check if response is actually an image
          const contentType = response.headers.get('content-type') || ''
          if (!contentType.startsWith('image/')) {
            console.log('Logo not found at:', path, 'Content-Type:', contentType)
            continue
          }
          
          if (response.ok) {
            const blob = await response.blob()
            
            // Double-check it's actually an image blob
            if (!blob.type.startsWith('image/')) {
              console.log('Response is not an image, type:', blob.type)
              continue
            }
            
            logoBase64 = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader()
              reader.onloadend = () => {
                const result = reader.result as string
                if (result && result.startsWith('data:image')) {
                  console.log('✓ Logo loaded successfully from:', path, 'Size:', result.length)
                  resolve(result)
                } else {
                  reject(new Error('Invalid image data'))
                }
              }
              reader.onerror = () => reject(new Error('FileReader error'))
              reader.readAsDataURL(blob)
            })
            if (logoBase64) {
              break
            }
          } else {
            console.log('Logo not found at:', path, 'Status:', response.status)
          }
        } catch (err) {
          console.log('Error loading logo from', path, ':', err)
          // Try next path
          continue
        }
      }
      
      if (!logoBase64) {
        console.warn('⚠️ Credyx logo not found. PDF will be generated without logo.')
      }
    } catch (error) {
      console.error('Error loading logo:', error)
      // Continue without logo if it fails
    }
    
    // Generate invoice HTML
    const carrierClient = getClientById(clientId)
    const previewInvoiceId =
      'id' in invoice && typeof (invoice as { id?: string }).id === 'string'
        ? (invoice as { id: string }).id
        : `preview-${invoice.invoice_number}`
    const previewSnapshot =
      'remittance_snapshot' in invoice
        ? (invoice as { remittance_snapshot?: string }).remittance_snapshot
        : undefined
    const { changed: remittanceChanged } = detectRemittanceChanged(carrierClient, {
      id: previewInvoiceId,
      client_id: clientId,
      remittance_snapshot: previewSnapshot,
    })
    const invoiceHTML = generateInvoice({
      invoiceNumber: invoice.invoice_number,
      invoiceDate: invoice.invoice_date || new Date().toISOString().split('T')[0],
      invoiceAmount: parseFloat(invoice.amount || '0'),
      loadNumber: invoice.load_number,
      brokerName: invoice.broker_name,
      brokerAddress: invoice.broker_address,
      carrierName: clientName,
      clientName: clientName,
      clientAddress: clientAddress,
      remittanceInfo: buildInvoiceRemittanceInfo(carrierClient),
      remittanceUpdatedBannerHtml: remittanceChanged
        ? buildRemittanceUpdatedBannerHtml(carrierClient?.remittance_updated_at)
        : undefined,
      bankName: carrierClient?.bank_name,
      accountNumber: carrierClient?.account_number,
      routingNumber: carrierClient?.routing_number,
      charges: [
        {
          description: 'Linehaul',
          amount: parseFloat(invoice.amount || '0'),
        },
      ],
      logoBase64: logoBase64,
    })

    // Create a temporary iframe to render the HTML with proper styling
    const iframe = document.createElement('iframe')
    iframe.style.position = 'absolute'
    iframe.style.left = '-9999px'
    iframe.style.width = '800px'
    iframe.style.height = '2000px' // Increased height to ensure footer is captured
    iframe.style.border = 'none'
    iframe.style.overflow = 'visible'
    document.body.appendChild(iframe)

    // Wait for iframe to load
    await new Promise((resolve) => {
      iframe.onload = resolve
      iframe.src = 'about:blank'
    })

    // Write HTML to iframe
    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document
    if (!iframeDoc) {
      throw new Error('Could not access iframe document')
    }

    iframeDoc.open()
    iframeDoc.write(invoiceHTML)
    iframeDoc.close()

    // Wait for images to load in iframe and ensure they're visible
    await new Promise((resolve) => {
      setTimeout(() => {
        const images = iframeDoc.getElementsByTagName('img')
        let loadedCount = 0
        const totalImages = images.length

        if (totalImages === 0) {
          setTimeout(resolve, 300)
          return
        }

        const checkComplete = () => {
          loadedCount++
          if (loadedCount === totalImages) {
            setTimeout(resolve, 500) // Additional delay to ensure rendering
          }
        }

        Array.from(images).forEach((img) => {
          // Skip if image src is HTML (404 response that returns index.html)
          if (img.src && (img.src.startsWith('data:text/html') || img.src.includes('text/html'))) {
            console.warn('Skipping invalid image (HTML response):', img.src.substring(0, 100))
            checkComplete()
            return
          }
          
          // Ensure images are visible
          img.style.display = 'block'
          img.style.visibility = 'visible'
          img.style.opacity = '1'
          img.style.maxHeight = '70px'
          img.style.maxWidth = '200px'
          
          // For base64 images, they should already be loaded
          if (img.src && img.src.startsWith('data:image')) {
            if (img.complete) {
              checkComplete()
            } else {
              img.onload = checkComplete
              img.onerror = () => {
                console.warn('Base64 image failed to load')
                checkComplete()
              }
            }
          } else {
            img.crossOrigin = 'anonymous'
            if (img.complete && img.naturalHeight !== 0) {
              checkComplete()
            } else {
              img.onload = checkComplete
              img.onerror = () => {
                console.warn('Image failed to load:', img.src.substring(0, 50))
                checkComplete()
              }
            }
          }
        })
      }, 100)
    })

    // Get the container element from iframe
    const container = iframeDoc.querySelector('.container') as HTMLElement
    if (!container) {
      throw new Error('Could not find container element')
    }

    // Ensure container has proper dimensions
    container.style.minHeight = 'auto'
    container.style.height = 'auto'

    // Use html2canvas to convert HTML to canvas, then to PDF
    const { default: html2canvas } = await import('html2canvas')
    
    // Ensure container is fully rendered
    await new Promise(resolve => setTimeout(resolve, 300))
    
    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      allowTaint: false,
      logging: false,
      backgroundColor: '#f5f5f5',
      width: container.scrollWidth || 800,
      height: container.scrollHeight || 1500, // Increased to capture footer
      windowWidth: 800,
      windowHeight: container.scrollHeight || 1500,
      onclone: (clonedDoc, element) => {
        // Ensure all images are visible in cloned document
        const clonedImages = clonedDoc.getElementsByTagName('img')
        console.log('Found', clonedImages.length, 'images in cloned document')
        Array.from(clonedImages).forEach((img, idx) => {
          // Skip invalid images (HTML responses)
          if (img.src && (img.src.startsWith('data:text/html') || img.src.includes('text/html'))) {
            console.warn(`⚠ Skipping invalid image ${idx} (HTML response)`)
            img.style.display = 'none'
            return
          }
          
          img.style.display = 'block'
          img.style.visibility = 'visible'
          img.style.opacity = '1'
          img.style.maxHeight = '70px'
          img.style.maxWidth = '200px'
          img.style.position = 'absolute'
          img.style.top = '0'
          img.style.left = '50%'
          img.style.transform = 'translateX(-50%)'
          // Log if logo is found
          if (img.src && img.src.startsWith('data:image')) {
            console.log(`✓ Logo ${idx} found in cloned document, base64 length:`, img.src.length)
          } else if (img.src) {
            console.warn(`⚠ Image ${idx} src:`, img.src.substring(0, 100))
          }
        })
        
        // Ensure footer is visible and positioned correctly
        const footer = clonedDoc.querySelector('.footer') as HTMLElement
        if (footer) {
          footer.style.display = 'block'
          footer.style.visibility = 'visible'
          footer.style.position = 'relative'
          footer.style.marginTop = 'auto'
          footer.style.padding = '20px 40px'
          footer.style.borderTop = '1px solid #e0e0e0'
          console.log('Footer found and styled in cloned document')
        } else {
          console.warn('⚠️ Footer not found in cloned document')
        }
        
        // Ensure container has proper height to show footer
        const clonedContainer = element as HTMLElement
        if (clonedContainer) {
          clonedContainer.style.minHeight = 'auto'
          clonedContainer.style.height = 'auto'
          clonedContainer.style.display = 'flex'
          clonedContainer.style.flexDirection = 'column'
        }
      },
    })
    
    console.log('Canvas created, dimensions:', canvas.width, 'x', canvas.height)

    // Remove temporary iframe
    document.body.removeChild(iframe)

    // Convert canvas to PDF
    const imgData = canvas.toDataURL('image/png')
    const pdf = new jsPDF('p', 'mm', 'a4')
    const imgWidth = 210 // A4 width in mm
    const pageHeight = 297 // A4 height in mm
    const imgHeight = (canvas.height * imgWidth) / canvas.width
    let heightLeft = imgHeight
    let position = 0

    pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight)
    heightLeft -= pageHeight

    // Add additional pages if needed
    while (heightLeft >= 0) {
      position = heightLeft - imgHeight
      pdf.addPage()
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight)
      heightLeft -= pageHeight
    }

    // Convert PDF to blob
    const pdfBlob = pdf.output('blob')
    
    // Create a File object from the blob
    const fileName = `Invoice_${invoice.invoice_number}_${invoice.invoice_date?.replace(/\//g, '-') || new Date().toISOString().split('T')[0]}.pdf`
    const file = new File([pdfBlob], fileName, { type: 'application/pdf' })
    
    return file
  }

  const handleRemoveInvoice = (index: number) => {
    setCurrentBatchInvoices((prev) => prev.filter((_, i) => i !== index))
  }

  const handleCreateBatch = async () => {
    const numberIssues = validateBatchInvoiceNumbers(
      clientId,
      currentBatchInvoices.map((inv) => inv.invoice_number)
    )
    if (numberIssues.length > 0) {
      showToast(numberIssues[0].message, 'error')
      return
    }

    const loadWarnings = getBatchLoadNumberWarnings(
      clientId,
      currentBatchInvoices.map((inv) => inv.load_number),
      { crossCarrier: false }
    )
    const withinBatchLoad = getWithinBatchLoadWarnings(
      currentBatchInvoices.map((inv) => inv.load_number)
    )
    if (loadWarnings.length > 0 || withinBatchLoad.length > 0) {
      const summary =
        loadWarnings.length > 0
          ? formatLoadNumberWarningsSummary(loadWarnings, 'client')
          : `${withinBatchLoad.join('\n')}\n\nSubmit anyway?`
      if (!window.confirm(summary)) return
    }

    try {
      const { batch } = await submitManualBatch({
        clientId: clientId,
        clientName: clientName,
        existingBatchId: activeDraftBatchId ?? undefined,
        invoices: currentBatchInvoices.map((inv) => ({
          invoice_number: inv.invoice_number,
          load_number: inv.load_number,
          broker_id: inv.broker_id,
          broker_name: inv.broker_name,
          pending_new_broker: inv.pending_new_broker,
          amount: inv.amount,
          invoice_date: inv.invoice_date,
          notes: inv.notes,
          documents: inv.documents?.map((d) => ({ id: d.id, file: d.file })),
        })),
      })
      setBatchInvoices((prev) => ({
        ...prev,
        [batch.id]: [...currentBatchInvoices],
      }))
      setCurrentBatchInvoices([])
      setCreateSubMode('choose')
      setActiveDraftBatchId(null)
      setManualDraftReady(false)
      if (activeDraftBatchId) {
        void clearClientDraftStorage(activeDraftBatchId)
      }
      refreshBatches()
      setInvoicesRefreshKey((key) => key + 1)
      clearClientTenantCache(clientId)
      setActiveTab('view')
      setSelectedBatch(batch.id)
      showToast(`Batch ${batch.batch_number} submitted. Credyx will review your paperwork.`, 'success')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not create batch', 'error')
    }
  }

  const handleViewInvoiceDetail = (invoice: Invoice) => {
    setSelectedBatchInvoiceId(invoice.id)
    setShowInvoiceDetailView(true)
  }

  const selectedBatchData = batches.find((b) => b.id === selectedBatch)
  const selectedBatchStoreInvoices = selectedBatch ? getInvoicesByBatchId(selectedBatch) : []

  const batchDetailInvoices = useMemo(() => {
    if (!selectedBatch) return []
    const base =
      selectedBatchStoreInvoices.length > 0
        ? selectedBatchStoreInvoices
        : (batchInvoices[selectedBatch] || []).map((form, index) =>
            formInvoiceToInvoice(
              form,
              selectedBatch,
              index,
              clientId,
              clientName,
              selectedBatchData?.batch_number
            )
          )
    return mapClientVisibleInvoices(
      base.map((invoice) => mergeInvoiceExtras(invoice, invoiceExtras[invoice.id]))
    )
  }, [
    selectedBatch,
    selectedBatchStoreInvoices,
    batchInvoices,
    clientId,
    clientName,
    selectedBatchData?.batch_number,
    invoiceExtras,
    invoicesRefreshKey,
  ])

  const selectedBatchInvoice = useMemo(
    () => batchDetailInvoices.find((inv) => inv.id === selectedBatchInvoiceId) ?? null,
    [batchDetailInvoices, selectedBatchInvoiceId]
  )

  const handleBatchInvoiceDocuments = async (invoice: Invoice) => {
    const formMatch = selectedBatch
      ? batchInvoices[selectedBatch]?.find((f) => f.invoice_number === invoice.invoice_number)
      : null
    if (formMatch?.documents?.length) {
      handleViewDocuments(formMatch)
      return
    }

    setDocsDownloading(true)
    try {
      const resolved = await resolveInvoiceDocumentsAsync(invoice)
      if (resolved.length === 0) {
        showToast('No documents found for this invoice.', 'error')
        return
      }

      setViewerDocumentsFromStore(
        resolved.map((doc) => ({
          id: doc.id,
          name: doc.name,
          file: doc.file,
          type: doc.type,
          size: doc.size,
        }))
      )
      setViewerInvoiceNumber(invoice.invoice_number)
      setShowDocumentViewer(true)
    } finally {
      setDocsDownloading(false)
    }
  }

  const handleBatchAddNote = async (invoiceId: string, note: string) => {
    if (getInvoiceById(invoiceId)) {
      addClientInvoiceNote(invoiceId, note, clientName)
      setInvoicesRefreshKey((key) => key + 1)
      return
    }

    const newNote: InvoiceNote = {
      id: `note-${Date.now()}`,
      note,
      created_by: clientName,
      created_at: new Date().toISOString(),
      type: 'client_note',
    }

    setInvoiceExtras((prev) => ({
      ...prev,
      [invoiceId]: {
        ...prev[invoiceId],
        notes_history: [...(prev[invoiceId]?.notes_history || []), newNote],
      },
    }))
  }

  const handleBatchOpenDispute = async (invoiceId: string, reason: string, description: string) => {
    if (getInvoiceById(invoiceId)) {
      openClientInvoiceDispute(invoiceId, reason, description, clientName)
      setInvoicesRefreshKey((key) => key + 1)
      return
    }

    const reasonLabel = getDisputeReasonLabel(reason)
    const dispute: InvoiceDispute = {
      id: `dispute-${Date.now()}`,
      reason,
      description,
      status: 'open',
      created_by: clientName,
      created_at: new Date().toISOString(),
    }
    const disputeNote: InvoiceNote = {
      id: `note-dispute-${Date.now()}`,
      note: `Dispute opened: ${reasonLabel} — ${description}`,
      created_by: clientName,
      created_at: new Date().toISOString(),
      type: 'dispute',
    }

    setInvoiceExtras((prev) => ({
      ...prev,
      [invoiceId]: {
        ...prev[invoiceId],
        disputes: [...(prev[invoiceId]?.disputes || []), dispute],
        notes_history: [...(prev[invoiceId]?.notes_history || []), disputeNote],
      },
    }))
  }

  const handleBatchMarkAsPaid = async (invoiceId: string, options: ClientMarkPaidOptions) => {
    if (getInvoiceById(invoiceId)) {
      markClientInvoiceAsPaid(invoiceId, clientName, options)
      setInvoicesRefreshKey((key) => key + 1)
      return
    }

    const invoice = batchDetailInvoices.find((inv) => inv.id === invoiceId)
    if (!invoice || invoice.status !== 'approved') return

    const noteText = buildPaymentConfirmationNote(
      invoice.amount,
      options.amountReceived,
      options.optionalNote
    )

    const paidNote: InvoiceNote = {
      id: `note-paid-${Date.now()}`,
      note: noteText,
      created_by: clientName,
      created_at: new Date().toISOString(),
      type: 'client_note',
    }

    setInvoiceExtras((prev) => ({
      ...prev,
      [invoiceId]: {
        ...prev[invoiceId],
        status: 'paid',
        paid_amount: options.amountReceived,
        days_since_expected: 0,
        notes_history: [...(prev[invoiceId]?.notes_history || []), paidNote],
      },
    }))
  }

  return (
    <>
      <div className="client-flush-shell flex flex-col min-h-0 flex-1 overflow-hidden">
        <ClientReturnBanner />
        {activeTab === 'create' && !setupComplete ? (
          <div className="p-6 max-w-xl mx-auto">
            <div
              className="rounded-lg border px-4 py-4"
              style={{ borderColor: `${c.warning}66`, backgroundColor: c.stat.amber }}
            >
              <div className="flex items-start gap-2 mb-3">
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" style={{ color: c.warning }} />
                <div>
                  <p className="text-sm font-semibold" style={{ color: c.primary }}>
                    Complete Document Vault setup first
                  </p>
                  <p className="text-xs mt-1" style={{ color: c.secondary }}>
                    Credyx must approve your required setup documents before you can send invoices.
                  </p>
                </div>
              </div>
              <ul className="space-y-1.5 mb-4">
                {setupChecklist.map((item) => (
                  <li
                    key={item.key}
                    className="flex items-center justify-between gap-2 text-xs px-2 py-1.5 rounded"
                    style={{ backgroundColor: c.card, border: `1px solid ${c.border}` }}
                  >
                    <span style={{ color: c.primary }}>{item.label}</span>
                    <span className="font-medium capitalize" style={{ color: c.secondary }}>
                      {item.status}
                    </span>
                  </li>
                ))}
              </ul>
              <Link to="/client/documents" className="dashboard-btn-primary inline-flex">
                Open Document Vault
              </Link>
            </div>
          </div>
        ) : activeTab === 'create' && !capabilities.canCreateBatch ? (
          <ManagedDocHandoffView
            clientId={clientId}
            clientName={clientName}
            onSubmitted={({ batchId, etaLabel }) => {
              refreshBatches()
              void refreshProcessingJobs()
              setOptimisticProcessingIds((prev) => new Set(prev).add(batchId))
              setActiveTab('view')
              setSelectedBatch(batchId)
              showToast(
                `Thank you — invoices are being created (${etaLabel}). We’ll notify you to review.`,
                'success'
              )
            }}
          />
        ) : activeTab === 'create' ? (
          <ClientSubmitDocsView
            mode={createSubMode}
            onBackToBatches={handleOpenViewBatches}
            onBackToChoose={() => setCreateSubMode('choose')}
            onSelectAi={() => void startAiDraft()}
            onSelectManual={() => void startManualDraft()}
            draftBatches={draftBatches}
            onResumeDraft={(batchId) => void resumeDraftBatch(batchId)}
            onDeleteDraft={(batchId) => void handleDeleteDraft(batchId)}
            activeDraftBatchId={activeDraftBatchId}
          >
            {createSubMode === 'ai' && aiDraftReady && (
              <BatchAiUploadFlow
                embedded
                clientId={clientId}
                clientName={clientName}
                draftBatchId={activeDraftBatchId ?? undefined}
                draftBatchNumber={activeDraftBatch?.batch_number}
                restoredDraft={aiDraftRestored}
                draftReady={aiDraftReady}
                onPersistDraft={handlePersistAiDraft}
                initialFiles={dashboardAiFiles}
                onCancel={() => {
                  setCreateSubMode('choose')
                  setDashboardAiFiles(undefined)
                }}
                onComplete={(batchId) => {
                  setDashboardAiFiles(undefined)
                  setCreateSubMode('choose')
                  setActiveDraftBatchId(null)
                  setAiDraftRestored(null)
                  setAiDraftReady(false)
                  void clearClientDraftStorage(batchId)
                  setOptimisticProcessingIds((prev) => new Set(prev).add(batchId))
                  refreshBatches()
                  void refreshProcessingJobs()
                  setActiveTab('view')
                  setSelectedBatch(batchId)
                  showToast(
                    'Thank you for submitting. Invoices are being checked — we’ll notify you when they’re ready to review.',
                    'success'
                  )
                }}
              />
            )}

            {createSubMode === 'manual' && manualDraftReady && (
              <ClientManualBatchForm
                formData={invoiceFormData}
                draftBatchNumber={activeDraftBatch?.batch_number}
                onFormChange={handleInvoiceInputChange}
                onBrokerChange={handleBrokerChange}
                onAddInvoice={handleAddInvoice}
                invoices={currentBatchInvoices}
                onViewDocuments={handleViewDocuments}
                onUploadDocuments={handleUploadDocumentsForInvoice}
                onRemoveInvoice={handleRemoveInvoice}
                onClearAll={() => {
                  resetManualEditorState()
                }}
                onSubmit={handleCreateBatch}
                invoiceNumberError={manualInvoiceNumberError}
                loadNumberWarning={manualLoadNumberWarning}
              />
            )}
          </ClientSubmitDocsView>
        ) : selectedBatch && selectedBatchData ? (
          <ClientBatchDetailView
            batch={selectedBatchData}
            invoices={batchDetailInvoices}
            aiProgress={aiProgressByBatchId[selectedBatchData.id] ?? null}
            onBack={() => setSelectedBatch(null)}
            onViewInvoice={handleViewInvoiceDetail}
          />
        ) : (
          <ClientBatchesListView
            batches={batches}
            aiProgressByBatchId={aiProgressByBatchId}
            highlightedBatchId={highlightedBatchId}
            onSelectBatch={handleSelectBatch}
            onCreateBatch={capabilities.canCreateBatch ? handleOpenCreateBatch : undefined}
            onDeleteDraft={(batchId) => void handleDeleteDraft(batchId)}
          />
        )}
      </div>

      {/* Document Upload Modal */}
      {showDocumentUploadModal && currentInvoiceForDocuments && (
        <ClientInvoiceDocumentUploadModal
          invoiceNumber={currentInvoiceForDocuments.invoice_number}
          brokerName={currentInvoiceForDocuments.broker_name}
          amount={currentInvoiceForDocuments.amount}
          loadNumber={currentInvoiceForDocuments.load_number}
          documents={uploadedDocuments}
          isEditingExistingInvoice={isEditingExistingInvoice}
          saving={documentUploadSaving}
          onClose={handleDocumentUploadSkip}
          onComplete={handleDocumentUploadComplete}
          onFileSelect={handleFileSelect}
          onFileDrop={handleDocumentFileDrop}
          onRemoveDocument={handleRemoveDocument}
        />
      )}

      {/* Document Viewer */}
      <DocumentDownloadOverlay
        open={docsDownloading}
        progress={docsDownloadProgress}
        title="Downloading documents"
        subtitle="Fetching invoice paperwork so you can review it…"
        variant="fixed"
      />
      {showDocumentViewer && (viewingInvoiceDocuments || viewerDocumentsFromStore.length > 0) && (
        <DocumentViewer
          isOpen={showDocumentViewer}
          onClose={() => {
            setShowDocumentViewer(false)
            setViewingInvoiceDocuments(null)
            setViewerDocumentsFromStore([])
            setViewerInvoiceNumber('')
          }}
          documents={
            viewingInvoiceDocuments
              ? getDocumentsForInvoice(viewingInvoiceDocuments)
              : viewerDocumentsFromStore
          }
          invoiceNumber={viewingInvoiceDocuments?.invoice_number ?? viewerInvoiceNumber}
          title="View Documents"
        />
      )}

      <InvoiceDetailWorkspace
        isOpen={showInvoiceDetailView}
        onClose={() => setShowInvoiceDetailView(false)}
        invoices={batchDetailInvoices}
        selectedInvoice={selectedBatchInvoice}
        onSelectInvoice={(invoice) => setSelectedBatchInvoiceId(invoice.id)}
        onViewDocuments={handleBatchInvoiceDocuments}
        onAddNote={handleBatchAddNote}
        onOpenDispute={handleBatchOpenDispute}
        onMarkAsPaid={handleBatchMarkAsPaid}
        onInvoiceUpdated={() => setInvoicesRefreshKey((key) => key + 1)}
        clientName={clientName}
        title={selectedBatchData ? `Batch ${selectedBatchData.batch_number}` : 'Invoice Details'}
        showStatusFilter={false}
        enableClientActions={capabilities.canOpenDispute}
      />
    </>
  )
}
