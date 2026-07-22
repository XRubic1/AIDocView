import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  FileText,
  Loader2,
  Monitor,
  Plus,
  Trash2,
  X,
} from 'lucide-react'
import { mockBrokers } from '../../data/mockBrokers'
import { submitHandoffInvoices } from '../../services/credyx/submitHandoffInvoices'
import {
  deleteHandoffInvoice,
  updateHandoffInvoice,
} from '../../services/credyx/manageHandoffInvoice'
import { formatCurrency } from '../../utils/format'
import {
  getNextClientInvoiceNumber,
  isInvoiceNumberTaken,
} from '../../utils/clientInvoiceNumbers'
import {
  formatLoadNumberWarning,
  formatLoadNumberWarningsSummary,
  getBatchLoadNumberWarnings,
  getLoadNumberWarnings,
  getWithinBatchLoadWarnings,
  isInvoiceNumberTakenExcluding,
  validateBatchInvoiceNumbers,
} from '../../utils/invoiceDuplicateChecks'
import {
  resolveHandoffDocuments,
  type HandoffDocument,
} from '../../utils/resolveHandoffDocuments'
import { resolveInvoiceDocumentsAsync } from '../../utils/resolveInvoiceDocuments'
import {
  ACTIVE_MESSAGE_TYPE,
  TOGGLE_MESSAGE_TYPE,
  openHandoffDocWindow,
  updateHandoffDocWindow,
  type HandoffWindowDoc,
} from '../../utils/handoffDocWindow'
import type { Invoice } from '../../types/invoice'
import { useToast } from '../ui/ToastProvider'
import { useClientTheme } from '../../theme/ThemeContext'

interface HandoffInvoiceDraft {
  invoice_number: string
  load_number: string
  broker_name: string
  amount: string
  invoice_date: string
  notes: string
  document_doc_ids: string[]
}

const emptyDraft = (clientId: string, reserved: string[]): HandoffInvoiceDraft => ({
  invoice_number: getNextClientInvoiceNumber(clientId, reserved),
  load_number: '',
  broker_name: '',
  amount: '',
  invoice_date: new Date().toISOString().split('T')[0],
  notes: '',
  document_doc_ids: [],
})

interface HandoffBatchWorkspaceProps {
  batchId: string
  clientId: string
  clientName: string
  /** Invoices already created on this batch (shown in the left list). */
  existingInvoices?: Invoice[]
  /** True for managed document-only handoff batches. */
  isHandoff?: boolean
  /** Open an existing invoice's full detail view. */
  onSelectInvoice?: (invoice: Invoice) => void
  onInvoicesCreated: () => void
}

/** Admin Ready-to-Post workspace — view batch documents and create/manage invoices. */
export default function HandoffBatchWorkspace({
  batchId,
  clientId,
  clientName,
  existingInvoices = [],
  isHandoff = false,
  onSelectInvoice,
  onInvoicesCreated,
}: HandoffBatchWorkspaceProps) {
  const c = useClientTheme()
  const { showToast } = useToast()
  const [documents, setDocuments] = useState<HandoffDocument[]>([])
  const [loadingDocs, setLoadingDocs] = useState(true)
  const [activeDocId, setActiveDocId] = useState<string | null>(null)
  const [docUrls, setDocUrls] = useState<Record<string, string>>({})
  const docWindowRef = useRef<Window | null>(null)
  const [queue, setQueue] = useState<HandoffInvoiceDraft[]>([])
  const [form, setForm] = useState<HandoffInvoiceDraft>(() => emptyDraft(clientId, []))
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([])
  const [brokerSuggestions, setBrokerSuggestions] = useState<typeof mockBrokers>([])
  const [showBrokerSuggestions, setShowBrokerSuggestions] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const submittingRef = useRef(false)
  // Id of the existing invoice being edited inline (null when creating new).
  const [editingInvoiceId, setEditingInvoiceId] = useState<string | null>(null)
  /** Index of a queued (not yet saved) invoice being edited. */
  const [editingQueueIndex, setEditingQueueIndex] = useState<number | null>(null)
  const [savingEdit, setSavingEdit] = useState(false)

  const loadDocuments = useCallback(async () => {
    setLoadingDocs(true)
    try {
      // Start with batch-level (handoff / unassigned) documents.
      const base = await resolveHandoffDocuments(batchId, clientId)
      const byId = new Map<string, HandoffDocument>()
      for (const doc of base) byId.set(doc.id, doc)

      // Merge in documents already attached to existing invoices.
      for (const invoice of existingInvoices) {
        const invoiceDocs = await resolveInvoiceDocumentsAsync(invoice)
        for (const doc of invoiceDocs) {
          if (!byId.has(doc.id)) {
            byId.set(doc.id, {
              id: doc.id,
              name: doc.name,
              type: doc.type,
              size: doc.size,
              file: doc.file,
            })
          }
        }
      }

      setDocuments(Array.from(byId.values()))
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Could not load batch documents',
        'error'
      )
    } finally {
      setLoadingDocs(false)
    }
    // existingInvoices is intentionally read fresh on each batch load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchId, clientId, showToast])

  useEffect(() => {
    void loadDocuments()
  }, [loadDocuments])

  /** Pick the next document that is not yet attached to a queued/existing invoice. */
  const selectNextUnassignedDocument = useCallback(
    (occupiedIds: Set<string>) => {
      const next = documents.find((d) => !occupiedIds.has(d.id))
      if (!next) {
        setSelectedDocIds([])
        return
      }
      setActiveDocId(next.id)
      setSelectedDocIds([next.id])
    },
    [documents]
  )

  // Create object URLs for every document (used by the standalone review window).
  useEffect(() => {
    const urls: Record<string, string> = {}
    for (const doc of documents) {
      if (doc.file) urls[doc.id] = URL.createObjectURL(doc.file)
    }
    setDocUrls(urls)

    return () => {
      Object.values(urls).forEach((url) => URL.revokeObjectURL(url))
    }
  }, [documents])

  // Close the standalone window when the workspace unmounts.
  useEffect(() => {
    return () => {
      if (docWindowRef.current && !docWindowRef.current.closed) {
        docWindowRef.current.close()
      }
    }
  }, [])

  // Documents attached to an invoice — either newly queued or already on the batch.
  const queuedDocIds = useMemo(() => {
    const ids = new Set<string>()
    for (const inv of queue) {
      for (const docId of inv.document_doc_ids) ids.add(docId)
    }
    for (const inv of existingInvoices) {
      for (const docId of inv.document_doc_ids ?? []) ids.add(docId)
    }
    return ids
  }, [queue, existingInvoices])

  // Seed active + selected document to the first unassigned file on first load.
  useEffect(() => {
    if (documents.length === 0 || activeDocId) return
    if (editingInvoiceId != null || editingQueueIndex != null) return

    const firstUnassigned = documents.find((d) => !queuedDocIds.has(d.id))
    const seed = firstUnassigned ?? documents[0]
    setActiveDocId(seed.id)
    if (firstUnassigned) setSelectedDocIds([firstUnassigned.id])
  }, [documents, queuedDocIds, activeDocId, editingInvoiceId, editingQueueIndex])

  // Queued documents plus the ones selected for the invoice being built.
  const assignedDocIds = useMemo(() => {
    const ids = new Set<string>(queuedDocIds)
    for (const docId of selectedDocIds) ids.add(docId)
    return ids
  }, [queuedDocIds, selectedDocIds])

  const unassignedCount = documents.length - assignedDocIds.size

  const storagePathsByDocId = useMemo(() => {
    const paths: Record<string, string> = {}
    for (const doc of documents) {
      if (doc.storagePath) paths[doc.id] = doc.storagePath
    }
    return paths
  }, [documents])

  const totalAmount = useMemo(
    () => queue.reduce((sum, inv) => sum + parseFloat(inv.amount || '0'), 0),
    [queue]
  )

  const activeIndex = activeDocId
    ? documents.findIndex((d) => d.id === activeDocId)
    : -1

  const goToPrevDoc = () => {
    if (activeIndex > 0) setActiveDocId(documents[activeIndex - 1].id)
  }

  const goToNextDoc = () => {
    if (activeIndex >= 0 && activeIndex < documents.length - 1) {
      setActiveDocId(documents[activeIndex + 1].id)
    }
  }

  // Build the document payload (with URLs + assignment status) for the standalone window.
  const windowDocs = useMemo<HandoffWindowDoc[]>(
    () =>
      documents
        .filter((doc) => docUrls[doc.id])
        .map((doc) => ({
          id: doc.id,
          name: doc.name,
          url: docUrls[doc.id],
          type: doc.type,
          assigned: queuedDocIds.has(doc.id),
          selected: selectedDocIds.includes(doc.id),
        })),
    [documents, docUrls, queuedDocIds, selectedDocIds]
  )

  /** Open the batch documents in a separate, movable browser window. */
  const openInNativeWindow = () => {
    if (windowDocs.length === 0) {
      showToast('No documents available to open yet.', 'error')
      return
    }
    const win = openHandoffDocWindow(
      {
        title: `${clientName} — handoff documents`,
        docs: windowDocs,
        activeId: activeDocId,
      },
      docWindowRef.current
    )
    if (!win) {
      showToast('Popup blocked. Allow popups to open documents in a new window.', 'error')
      return
    }
    docWindowRef.current = win
  }

  // Keep the standalone window in sync as assignment status or active doc changes.
  useEffect(() => {
    updateHandoffDocWindow(docWindowRef.current, windowDocs, activeDocId)
  }, [windowDocs, activeDocId])

  // Reflect selections/navigation made inside the standalone window back here.
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.source !== docWindowRef.current) return
      const data = event.data as { type?: string; id?: string } | null
      if (!data?.id) return

      if (data.type === ACTIVE_MESSAGE_TYPE) {
        setActiveDocId(data.id)
      } else if (data.type === TOGGLE_MESSAGE_TYPE) {
        const docId = data.id
        // Don't allow selecting documents already attached to a queued invoice.
        if (queuedDocIds.has(docId)) return
        setSelectedDocIds((prev) =>
          prev.includes(docId) ? prev.filter((id) => id !== docId) : [...prev, docId]
        )
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [queuedDocIds])

  const invoiceNumberError = useMemo(() => {
    const num = form.invoice_number.trim()
    if (!num) return null
    const reserved = queue
      .filter((_, i) => i !== editingQueueIndex)
      .map((inv) => inv.invoice_number)
    if (editingInvoiceId) {
      if (isInvoiceNumberTakenExcluding(clientId, num, reserved, [editingInvoiceId])) {
        return `Invoice number ${num} is already used for this carrier`
      }
      return null
    }
    if (isInvoiceNumberTaken(clientId, num, reserved)) {
      return `Invoice number ${num} is already used for this carrier`
    }
    return null
  }, [clientId, form.invoice_number, queue, editingInvoiceId, editingQueueIndex])

  const loadNumberWarning = useMemo(() => {
    const warnings = getLoadNumberWarnings(form.load_number, {
      forClientId: clientId,
      crossCarrier: true,
      excludeInvoiceIds: editingInvoiceId ? [editingInvoiceId] : undefined,
    })
    if (warnings.length === 0) return null
    return formatLoadNumberWarning(warnings[0], 'admin')
  }, [clientId, form.load_number, editingInvoiceId])

  const handleField = (field: keyof HandoffInvoiceDraft, value: string) => {
    setForm((prev) => {
      const next = { ...prev, [field]: value }
      if (field === 'broker_name') {
        const filtered = value.trim()
          ? mockBrokers.filter((b) => b.name.toLowerCase().includes(value.toLowerCase()))
          : []
        setBrokerSuggestions(filtered)
        setShowBrokerSuggestions(filtered.length > 0)
      }
      return next
    })
  }

  const handleBrokerSelect = (broker: (typeof mockBrokers)[0]) => {
    setForm((prev) => ({ ...prev, broker_name: broker.name }))
    setShowBrokerSuggestions(false)
  }

  const toggleDocSelection = (docId: string) => {
    setSelectedDocIds((prev) =>
      prev.includes(docId) ? prev.filter((id) => id !== docId) : [...prev, docId]
    )
  }

  /** Reset the form back to "create new invoice" mode. */
  const resetForm = useCallback(() => {
    setEditingInvoiceId(null)
    setEditingQueueIndex(null)
    setShowBrokerSuggestions(false)
    setForm(emptyDraft(clientId, queue.map((inv) => inv.invoice_number)))
    selectNextUnassignedDocument(queuedDocIds)
  }, [clientId, queue, queuedDocIds, selectNextUnassignedDocument])

  /** Load an existing invoice into the form for inline editing. */
  const startEditInvoice = (invoice: Invoice) => {
    setEditingInvoiceId(invoice.id)
    setEditingQueueIndex(null)
    setForm({
      invoice_number: invoice.invoice_number,
      load_number: invoice.load_number ?? '',
      broker_name: invoice.broker_name ?? '',
      amount: invoice.amount != null ? String(invoice.amount) : '',
      invoice_date: invoice.invoice_date ?? new Date().toISOString().split('T')[0],
      notes: invoice.notes ?? '',
      document_doc_ids: invoice.document_doc_ids ?? [],
    })
    setSelectedDocIds(invoice.document_doc_ids ?? [])
    setShowBrokerSuggestions(false)
  }

  /** Load a queued (unsaved) invoice into the form for editing. */
  const startEditQueueInvoice = (index: number) => {
    const inv = queue[index]
    if (!inv) return
    setEditingInvoiceId(null)
    setEditingQueueIndex(index)
    setForm({ ...inv })
    setSelectedDocIds([...inv.document_doc_ids])
    setShowBrokerSuggestions(false)
  }

  const handleAddInvoice = () => {
    if (!form.broker_name.trim() || !form.amount.trim()) {
      showToast('Broker name and amount are required.', 'error')
      return
    }
    if (selectedDocIds.length === 0) {
      showToast('Select at least one document for this invoice.', 'error')
      return
    }

    const reserved = queue
      .filter((_, i) => i !== editingQueueIndex)
      .map((inv) => inv.invoice_number)
    const invoiceNumber =
      form.invoice_number.trim() || getNextClientInvoiceNumber(clientId, reserved)

    // Keep the user's exact custom number — do not rewrite to the next system #.
    if (isInvoiceNumberTaken(clientId, invoiceNumber, reserved)) {
      showToast(
        `Invoice number ${invoiceNumber} is already used for this carrier. Enter a different number.`,
        'error'
      )
      return
    }

    const added: HandoffInvoiceDraft = {
      ...form,
      invoice_number: invoiceNumber,
      document_doc_ids: [...selectedDocIds],
    }

    let nextQueue: HandoffInvoiceDraft[]
    if (editingQueueIndex != null) {
      nextQueue = queue.map((inv, i) => (i === editingQueueIndex ? added : inv))
      setQueue(nextQueue)
      setEditingQueueIndex(null)
      showToast(`Invoice ${invoiceNumber} updated in queue`, 'success')
    } else {
      nextQueue = [...queue, added]
      setQueue(nextQueue)
    }

    const occupied = new Set<string>()
    for (const inv of nextQueue) {
      for (const docId of inv.document_doc_ids) occupied.add(docId)
    }
    for (const inv of existingInvoices) {
      for (const docId of inv.document_doc_ids ?? []) occupied.add(docId)
    }

    setForm(emptyDraft(clientId, nextQueue.map((inv) => inv.invoice_number)))
    setShowBrokerSuggestions(false)
    selectNextUnassignedDocument(occupied)
  }

  /** Save edits to the currently selected existing invoice. */
  const handleSaveEdit = async () => {
    if (!editingInvoiceId) return
    if (!form.broker_name.trim() || !form.amount.trim()) {
      showToast('Broker name and amount are required.', 'error')
      return
    }

    if (
      isInvoiceNumberTakenExcluding(
        clientId,
        form.invoice_number,
        queue.map((inv) => inv.invoice_number),
        [editingInvoiceId]
      )
    ) {
      showToast(
        `Invoice number ${form.invoice_number.trim()} is already used for this carrier.`,
        'error'
      )
      return
    }

    const editLoadWarnings = getLoadNumberWarnings(form.load_number, {
      forClientId: clientId,
      crossCarrier: true,
      excludeInvoiceIds: [editingInvoiceId],
    })
    if (editLoadWarnings.length > 0) {
      const summary = formatLoadNumberWarningsSummary(editLoadWarnings, 'admin')
      if (!window.confirm(summary)) return
    }

    setSavingEdit(true)
    try {
      await updateHandoffInvoice({
        invoiceId: editingInvoiceId,
        invoice_number: form.invoice_number,
        load_number: form.load_number,
        broker_name: form.broker_name,
        amount: form.amount,
        invoice_date: form.invoice_date,
        notes: form.notes,
        document_doc_ids: selectedDocIds,
        storagePathsByDocId,
      })
      showToast(`Invoice ${form.invoice_number} updated`, 'success')
      resetForm()
      onInvoicesCreated()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not update invoice', 'error')
    } finally {
      setSavingEdit(false)
    }
  }

  /** Delete the currently selected existing invoice. */
  const handleDeleteInvoice = async () => {
    if (!editingInvoiceId) return
    if (!window.confirm(`Delete invoice ${form.invoice_number}? This cannot be undone.`)) return
    setSavingEdit(true)
    try {
      await deleteHandoffInvoice(editingInvoiceId)
      showToast(`Invoice ${form.invoice_number} deleted`, 'success')
      resetForm()
      onInvoicesCreated()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not delete invoice', 'error')
    } finally {
      setSavingEdit(false)
    }
  }

  const handleSubmit = async () => {
    if (submittingRef.current || submitting) return
    if (queue.length === 0) {
      showToast('Add at least one invoice before saving.', 'error')
      return
    }

    const numberIssues = validateBatchInvoiceNumbers(
      clientId,
      queue.map((inv) => inv.invoice_number)
    )
    if (numberIssues.length > 0) {
      showToast(numberIssues[0].message, 'error')
      return
    }

    const loadWarnings = getBatchLoadNumberWarnings(
      clientId,
      queue.map((inv) => inv.load_number),
      { crossCarrier: true }
    )
    const withinBatchLoad = getWithinBatchLoadWarnings(queue.map((inv) => inv.load_number))
    if (loadWarnings.length > 0 || withinBatchLoad.length > 0) {
      const summary =
        loadWarnings.length > 0
          ? formatLoadNumberWarningsSummary(loadWarnings, 'admin')
          : `${withinBatchLoad.join('\n')}\n\nSubmit anyway?`
      if (!window.confirm(summary)) return
    }

    submittingRef.current = true
    setSubmitting(true)
    const queuedSnapshot = [...queue]
    try {
      await submitHandoffInvoices({
        batchId,
        clientId,
        clientName,
        invoices: queuedSnapshot,
        storagePathsByDocId,
      })
      // Clear queue immediately so remount/refresh cannot double-render the same invoices.
      setQueue([])
      setEditingQueueIndex(null)
      setForm(emptyDraft(clientId, []))
      setSelectedDocIds([])
      showToast(
        `${queuedSnapshot.length} invoice${queuedSnapshot.length !== 1 ? 's' : ''} created for ${clientName}`,
        'success'
      )
      onInvoicesCreated()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not create invoices', 'error')
    } finally {
      submittingRef.current = false
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      <div
        className="dashboard-card px-4 py-3 flex flex-wrap items-center justify-between gap-3"
        style={{ backgroundColor: c.stat.amber }}
      >
        <div>
          <p className="text-sm font-semibold" style={{ color: c.primary }}>
            {isHandoff ? 'Managed document handoff' : 'Documents & invoices'}
          </p>
          <p className="text-xs mt-0.5" style={{ color: c.secondary }}>
            {isHandoff
              ? `${clientName} sent paperwork only — review documents and create invoices for this batch.`
              : 'Review batch documents, open the movable window, and manage invoices.'}
          </p>
        </div>
        {isHandoff && <span className="status-pill status-pill--pending-batch">Handoff</span>}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[280px_1fr] gap-4">
        {/* Batch invoices list */}
        <section className="dashboard-card p-4 flex flex-col min-h-[320px]">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h3 className="text-sm font-semibold" style={{ color: c.primary }}>
              Invoices ({existingInvoices.length + queue.length})
            </h3>
          </div>

          {existingInvoices.length === 0 && queue.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-8" style={{ color: c.secondary }}>
              <FileText className="w-8 h-8 mb-2 opacity-60" />
              <p className="text-sm font-medium" style={{ color: c.primary }}>
                No invoices yet
              </p>
              <p className="text-xs mt-1">Build invoices from the batch documents.</p>
            </div>
          ) : (
            <ul className="space-y-2 flex-1 overflow-y-auto max-h-[520px] pr-1">
              {/* Existing invoices already on the batch */}
              {existingInvoices.map((inv) => {
                const hasPaperwork = !!(inv.documents_count && inv.documents_count > 0)
                const hasBroker = !!inv.broker_id
                const isEditing = editingInvoiceId === inv.id
                return (
                  <li
                    key={inv.id}
                    className="rounded-lg border px-3 py-2 transition-colors"
                    style={{
                      borderColor: isEditing ? c.info : c.border,
                      backgroundColor: isEditing ? c.stat.blue : 'transparent',
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold truncate" style={{ color: c.primary }}>
                        {inv.invoice_number}
                      </span>
                      <span
                        className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0"
                        style={{
                          backgroundColor: hasPaperwork && hasBroker ? c.stat.green : c.stat.amber,
                          color: c.primary,
                        }}
                      >
                        {hasPaperwork && hasBroker ? 'Ready' : 'Needs info'}
                      </span>
                    </div>
                    <div className="mt-1 text-xs truncate" style={{ color: c.secondary }}>
                      {inv.broker_name || 'No broker'}
                    </div>
                    <div className="mt-1 flex items-center justify-between text-xs" style={{ color: c.secondary }}>
                      <span className="tabular-nums font-medium" style={{ color: c.primary }}>
                        {formatCurrency(inv.amount)}
                      </span>
                      <span>
                        {inv.documents_count ?? 0} doc{(inv.documents_count ?? 0) !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => startEditInvoice(inv)}
                        className="text-xs underline"
                        style={{ color: c.info }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          if (
                            !window.confirm(
                              `Delete invoice ${inv.invoice_number}? This cannot be undone.`
                            )
                          ) {
                            return
                          }
                          try {
                            await deleteHandoffInvoice(inv.id)
                            if (editingInvoiceId === inv.id) resetForm()
                            showToast(`Invoice ${inv.invoice_number} deleted`, 'success')
                            onInvoicesCreated()
                          } catch (err) {
                            showToast(
                              err instanceof Error ? err.message : 'Could not delete invoice',
                              'error'
                            )
                          }
                        }}
                        className="text-xs underline"
                        style={{ color: c.error }}
                      >
                        Remove
                      </button>
                      {onSelectInvoice && (
                        <button
                          type="button"
                          onClick={() => onSelectInvoice(inv)}
                          className="text-xs underline ml-auto"
                          style={{ color: c.secondary }}
                        >
                          Details
                        </button>
                      )}
                    </div>
                  </li>
                )
              })}

              {/* New invoices queued for creation */}
              {queue.map((inv, index) => {
                const isEditing = editingQueueIndex === index
                return (
                  <li
                    key={`queue-${inv.invoice_number}-${index}`}
                    className="rounded-lg border px-3 py-2"
                    style={{
                      borderColor: isEditing ? c.info : c.info,
                      backgroundColor: c.stat.blue,
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold truncate" style={{ color: c.primary }}>
                        {inv.invoice_number}
                        <span className="ml-1.5 text-[10px] font-normal" style={{ color: c.secondary }}>
                          (new)
                        </span>
                      </span>
                    </div>
                    <div className="mt-1 text-xs truncate" style={{ color: c.secondary }}>
                      {inv.broker_name || 'No broker'}
                    </div>
                    <div className="mt-1 flex items-center justify-between text-xs" style={{ color: c.secondary }}>
                      <span className="tabular-nums font-medium" style={{ color: c.primary }}>
                        {formatCurrency(parseFloat(inv.amount || '0'))}
                      </span>
                      <span>
                        {inv.document_doc_ids.length} doc{inv.document_doc_ids.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => startEditQueueInvoice(index)}
                        className="text-xs underline"
                        style={{ color: c.info }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setQueue((prev) => prev.filter((_, i) => i !== index))
                          if (editingQueueIndex === index) resetForm()
                          else if (editingQueueIndex != null && editingQueueIndex > index) {
                            setEditingQueueIndex(editingQueueIndex - 1)
                          }
                        }}
                        className="text-xs underline"
                        style={{ color: c.error }}
                      >
                        Remove
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}

          {queue.length > 0 && (
            <div
              className="mt-3 flex items-center justify-between text-xs px-1"
              style={{ color: c.secondary }}
            >
              <span>{queue.length} new</span>
              <span className="tabular-nums font-medium" style={{ color: c.primary }}>
                {formatCurrency(totalAmount)}
              </span>
            </div>
          )}

          <button
            type="button"
            disabled={queue.length === 0 || submitting}
            onClick={handleSubmit}
            className="dashboard-btn-primary w-full justify-center mt-3 inline-flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving…
              </>
            ) : (
              <>
                <CheckCircle className="w-4 h-4" />
                {queue.length > 0
                  ? `Create ${queue.length} invoice${queue.length !== 1 ? 's' : ''}`
                  : 'Create invoices'}
              </>
            )}
          </button>
        </section>

        {/* Documents + create form */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Client documents */}
        <section className="dashboard-card p-4 flex flex-col min-h-[320px]">
          <div className="mb-3">
            <h3 className="text-sm font-semibold truncate" style={{ color: c.primary }}>
              Client documents ({documents.length}
              {unassignedCount < documents.length ? ` · ${unassignedCount} unassigned` : ''})
            </h3>
            <p className="text-xs mt-0.5" style={{ color: c.secondary }}>
              Select paperwork for invoice queue
            </p>
          </div>

          {loadingDocs ? (
            <div className="flex-1 flex items-center justify-center py-12" style={{ color: c.secondary }}>
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : documents.length === 0 ? (
            <div className="flex-1 text-center py-10" style={{ color: c.secondary }}>
              <FileText className="w-8 h-8 mx-auto mb-2 opacity-60" />
              <p className="text-sm font-medium">No documents found</p>
              <p className="text-xs mt-1">Files may still be uploading or were not persisted.</p>
            </div>
          ) : (
            <div className="flex flex-col flex-1 min-h-[360px]">
              <ul className="space-y-2 flex-1 overflow-y-auto max-h-[420px] pr-1">
                {documents.map((doc) => {
                  const isAssigned = assignedDocIds.has(doc.id)
                  const isSelected = selectedDocIds.includes(doc.id)
                  const isActive = activeDocId === doc.id

                  return (
                    <li
                      key={doc.id}
                      className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors cursor-pointer"
                      style={{
                        borderColor: isSelected ? c.info : isActive ? c.stat.blue : c.border,
                        backgroundColor: isSelected ? c.stat.blue : 'transparent',
                      }}
                      onClick={() => setActiveDocId(doc.id)}
                      role="button"
                      tabIndex={0}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        disabled={isAssigned && !isSelected}
                        onClick={(e) => e.stopPropagation()}
                        onChange={() => toggleDocSelection(doc.id)}
                        className="shrink-0"
                        aria-label={`Select ${doc.name}`}
                      />
                      <FileText className="w-4 h-4 shrink-0" style={{ color: c.mutedLight }} />
                      <span className="truncate flex-1" style={{ color: c.primary }}>
                        {doc.name}
                      </span>
                      {isAssigned && !isSelected && (
                        <span className="text-xs shrink-0" style={{ color: c.mutedLight }}>
                          Queued
                        </span>
                      )}
                    </li>
                  )
                })}
              </ul>

              <div className="mt-4 pt-3 border-t" style={{ borderColor: c.border }}>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={goToPrevDoc}
                      disabled={activeIndex <= 0}
                      className="dashboard-btn-secondary !h-7 !w-7 !p-0 disabled:opacity-40"
                      aria-label="Previous document"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="text-xs tabular-nums px-1" style={{ color: c.secondary }}>
                      {documents.length > 0 ? `${activeIndex + 1} / ${documents.length}` : '0 / 0'}
                    </span>
                    <button
                      type="button"
                      onClick={goToNextDoc}
                      disabled={activeIndex < 0 || activeIndex >= documents.length - 1}
                      className="dashboard-btn-secondary !h-7 !w-7 !p-0 disabled:opacity-40"
                      aria-label="Next document"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={openInNativeWindow}
                    className="dashboard-btn-primary !h-7 !px-2.5 !text-xs inline-flex items-center gap-1"
                    title="Open all batch documents in a separate, movable window"
                  >
                    <Monitor className="w-3.5 h-3.5" />
                    Open in window
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Invoice builder */}
        <section className="dashboard-card p-4">
          <h3 className="text-sm font-semibold mb-3" style={{ color: c.primary }}>
            {editingInvoiceId
              ? `Edit invoice ${form.invoice_number}`
              : editingQueueIndex != null
                ? `Edit queued invoice ${form.invoice_number}`
                : 'Create invoice'}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: c.secondary }}>
                Invoice number
              </label>
              <input
                type="text"
                value={form.invoice_number}
                onChange={(e) => handleField('invoice_number', e.target.value)}
                className="w-full text-sm px-3 py-2 rounded-lg border"
                style={{
                  borderColor: invoiceNumberError ? '#f87171' : c.border,
                  color: c.primary,
                }}
              />
              {invoiceNumberError && (
                <p className="text-xs mt-1" style={{ color: '#b91c1c' }}>
                  {invoiceNumberError}
                </p>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: c.secondary }}>
                Load number
              </label>
              <input
                type="text"
                value={form.load_number}
                onChange={(e) => handleField('load_number', e.target.value)}
                className="w-full text-sm px-3 py-2 rounded-lg border"
                style={{
                  borderColor: loadNumberWarning ? '#fbbf24' : c.border,
                  color: c.primary,
                }}
              />
              {loadNumberWarning && (
                <p className="text-xs mt-1" style={{ color: '#b45309' }}>
                  {loadNumberWarning}
                </p>
              )}
            </div>
            <div className="relative sm:col-span-2">
              <label className="block text-xs font-medium mb-1" style={{ color: c.secondary }}>
                Broker <span style={{ color: c.warning }}>*</span>
              </label>
              <input
                type="text"
                value={form.broker_name}
                onChange={(e) => handleField('broker_name', e.target.value)}
                onFocus={() => brokerSuggestions.length > 0 && setShowBrokerSuggestions(true)}
                onBlur={() => setTimeout(() => setShowBrokerSuggestions(false), 200)}
                className="w-full text-sm px-3 py-2 rounded-lg border"
                style={{ borderColor: c.border, color: c.primary }}
              />
              {showBrokerSuggestions && brokerSuggestions.length > 0 && (
                <div
                  className="absolute z-20 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-40 overflow-y-auto"
                  style={{ borderColor: c.border }}
                >
                  {brokerSuggestions.map((broker) => (
                    <button
                      key={broker.id}
                      type="button"
                      onClick={() => handleBrokerSelect(broker)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                      style={{ color: c.primary }}
                    >
                      {broker.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: c.secondary }}>
                Amount <span style={{ color: c.warning }}>*</span>
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={form.amount}
                onChange={(e) => handleField('amount', e.target.value)}
                className="w-full text-sm px-3 py-2 rounded-lg border"
                style={{ borderColor: c.border, color: c.primary }}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: c.secondary }}>
                Invoice date
              </label>
              <input
                type="date"
                value={form.invoice_date}
                onChange={(e) => handleField('invoice_date', e.target.value)}
                className="w-full text-sm px-3 py-2 rounded-lg border"
                style={{ borderColor: c.border, color: c.primary }}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium mb-1" style={{ color: c.secondary }}>
                Notes
              </label>
              <textarea
                value={form.notes}
                onChange={(e) => handleField('notes', e.target.value)}
                rows={2}
                className="w-full text-sm px-3 py-2 rounded-lg border resize-none"
                style={{ borderColor: c.border, color: c.primary }}
              />
            </div>
          </div>

          <p className="text-xs mt-3" style={{ color: c.secondary }}>
            {selectedDocIds.length > 0
              ? `${selectedDocIds.length} document${selectedDocIds.length !== 1 ? 's' : ''} selected for this invoice`
              : 'Select documents from the list to attach to this invoice'}
          </p>

          {editingInvoiceId ? (
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={handleSaveEdit}
                disabled={savingEdit}
                className="dashboard-btn-primary inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                {savingEdit ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Saving…
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    Save changes
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={resetForm}
                disabled={savingEdit}
                className="dashboard-btn-secondary inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                <X className="w-4 h-4" />
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteInvoice}
                disabled={savingEdit}
                className="dashboard-btn-secondary inline-flex items-center gap-1.5 ml-auto disabled:opacity-50"
                style={{ color: c.error, borderColor: c.error }}
              >
                <Trash2 className="w-4 h-4" />
                Delete
              </button>
            </div>
          ) : (
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={handleAddInvoice}
                className="dashboard-btn-secondary inline-flex items-center gap-1.5"
              >
                {editingQueueIndex != null ? (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    Update queue
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4" />
                    Add to queue
                  </>
                )}
              </button>
              {editingQueueIndex != null && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="dashboard-btn-secondary inline-flex items-center gap-1.5"
                >
                  <X className="w-4 h-4" />
                  Cancel
                </button>
              )}
            </div>
          )}
        </section>
        </div>
      </div>
    </div>
  )
}
