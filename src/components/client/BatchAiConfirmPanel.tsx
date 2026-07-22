import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Check, Eye, Loader2, Plus, Trash2 } from 'lucide-react'
import DocumentViewer from '../DocumentViewer'
import ClientInvoiceDocumentUploadModal, {
  type UploadModalDocument,
} from './ClientInvoiceDocumentUploadModal'
import { DOCSORT_AI_DISCLAIMER_SHORT } from '../../products/docSort/constants/aiDisclaimer'
import { isManualCredyxDraft } from '../../integrations/docSortToCredyx'
import type { BatchIntakeDraft, CredyxInvoiceDraft } from '../../types/credyxBatch'
import { formatCurrency } from '../../utils/format'
import { getDraftViewDocuments } from '../../utils/aiDraftDocuments'
import { isGeneratedInvoicePdfDoc } from '../../utils/aiDraftDocOps'
import { useClientTheme } from '../../theme/ThemeContext'
import { isInvoiceNumberTaken } from '../../utils/clientInvoiceNumbers'
import {
  formatLoadNumberWarning,
  getLoadNumberWarnings,
  invoiceNumbersConflict,
} from '../../utils/invoiceDuplicateChecks'

interface BatchAiConfirmPanelProps {
  draft: BatchIntakeDraft
  /** Carrier being billed — used for duplicate invoice/load checks. */
  clientId: string
  /** When true (Credyx admin), warn if other carriers reused the load #. */
  crossCarrierLoadWarnings?: boolean
  onUpdateDraft: (draftId: string, patch: Partial<CredyxInvoiceDraft>) => void
  onConfirmDraft: (draftId: string) => void
  onUnconfirmDraft: (draftId: string) => void
  onAddInvoice: () => void | Promise<void>
  onRemoveDraft: (draftId: string) => void
  onMoveDocument: (fromDraftId: string, docId: string, toDraftId: string | null) => void
  onAssignUnmatchedDoc: (docId: string, toDraftId: string) => void
  onAssignUnmatchedDocs: (docIds: string[], toDraftId: string) => void
  onAttachDocuments: (draftId: string, files: File[]) => void
  addingInvoice: boolean
  onSubmitBatch: () => void
  submitting: boolean
}

type ViewerMode =
  | { type: 'invoice'; draftId: string }
  | { type: 'unmatched' }
  | null

function docsSummary(inv: CredyxInvoiceDraft, docCount: number) {
  if (isManualCredyxDraft(inv)) {
    return docCount === 0 ? 'Add docs' : `${docCount} doc${docCount !== 1 ? 's' : ''}`
  }
  const parts: string[] = []
  if (inv.fingerprints.rateCons.length > 0) {
    parts.push(`${inv.fingerprints.rateCons.length} RC`)
  }
  if (inv.fingerprints.bols.length > 0) {
    parts.push(`${inv.fingerprints.bols.length} BOL`)
  }
  if (parts.length === 0) {
    return docCount > 0 ? `${docCount} doc${docCount !== 1 ? 's' : ''}` : '—'
  }
  let text = parts.join(' · ')
  if (inv.rate_missing) text += ' · rate?'
  return text
}

function shortFileName(name: string, max = 28) {
  return name.length > max ? `${name.slice(0, max - 1)}…` : name
}

/** Review table for AI-drafted invoices before batch submit. */
export default function BatchAiConfirmPanel({
  draft,
  clientId,
  crossCarrierLoadWarnings = false,
  onUpdateDraft,
  onConfirmDraft,
  onUnconfirmDraft,
  onAddInvoice,
  onRemoveDraft,
  onMoveDocument,
  onAssignUnmatchedDoc,
  onAssignUnmatchedDocs,
  onAttachDocuments,
  addingInvoice,
  onSubmitBatch,
  submitting,
}: BatchAiConfirmPanelProps) {
  const c = useClientTheme()
  const [viewerMode, setViewerMode] = useState<ViewerMode>(null)
  const [uploadDraftId, setUploadDraftId] = useState<string | null>(null)
  const [pendingDocs, setPendingDocs] = useState<UploadModalDocument[]>([])
  const [pendingFiles, setPendingFiles] = useState<Map<string, File>>(new Map())
  const [selectedUnmatched, setSelectedUnmatched] = useState<Set<string>>(new Set())

  const invoiceOptions = useMemo(
    () =>
      draft.invoices.map((inv, index) => ({
        draftId: inv.draftId,
        label: `Invoice #${index + 1}${inv.load_number ? ` · ${inv.load_number}` : ''}`,
      })),
    [draft.invoices]
  )

  const uploadDraft = useMemo(
    () => draft.invoices.find((inv) => inv.draftId === uploadDraftId) ?? null,
    [draft.invoices, uploadDraftId]
  )

  const viewingInvoice = useMemo(
    () =>
      viewerMode?.type === 'invoice'
        ? draft.invoices.find((inv) => inv.draftId === viewerMode.draftId) ?? null
        : null,
    [draft.invoices, viewerMode]
  )

  const viewingInvoiceIndex = useMemo(() => {
    if (!viewingInvoice) return 0
    return draft.invoices.findIndex((inv) => inv.draftId === viewingInvoice.draftId) + 1
  }, [draft.invoices, viewingInvoice])

  const unmatchedDocs = useMemo(
    () => [
      ...draft.unmatched.rateCons.map((fp) => ({ ...fp, bucket: 'RC' as const })),
      ...draft.unmatched.bols.map((fp) => ({ ...fp, bucket: 'BOL' as const })),
      ...draft.unmatched.other.map((fp) => ({ ...fp, bucket: 'Other' as const })),
    ],
    [draft.unmatched]
  )

  const hasUnmatched = unmatchedDocs.length > 0

  const viewerDocuments = useMemo(() => {
    if (viewerMode?.type === 'invoice' && viewingInvoice) {
      return getDraftViewDocuments(viewingInvoice, draft.fileById).map((doc) => ({
        id: doc.id,
        name: doc.name,
        file: doc.file,
      }))
    }
    if (viewerMode?.type === 'unmatched') {
      return unmatchedDocs
        .map((fp) => {
          const file = draft.fileById.get(fp.docId)
          if (!file) return null
          return { id: fp.docId, name: fp.fileName || file.name, file }
        })
        .filter((doc): doc is { id: string; name: string; file: File } => doc !== null)
    }
    return []
  }, [viewerMode, viewingInvoice, draft.fileById, unmatchedDocs])

  const viewerMoveTargets = useMemo(() => {
    if (viewerMode?.type === 'invoice' && viewingInvoice) {
      return [
        ...invoiceOptions
          .filter((opt) => opt.draftId !== viewingInvoice.draftId)
          .map((opt) => ({ draftId: opt.draftId, label: opt.label })),
        { draftId: null, label: 'Unmatched pool' },
      ]
    }
    if (viewerMode?.type === 'unmatched') {
      return invoiceOptions.map((opt) => ({ draftId: opt.draftId, label: opt.label }))
    }
    return []
  }, [viewerMode, viewingInvoice, invoiceOptions])

  const viewerLockedIds = useMemo(() => {
    if (!viewingInvoice) return []
    return viewerDocuments
      .filter((doc) => isGeneratedInvoicePdfDoc(viewingInvoice, doc.id))
      .map((doc) => doc.id)
  }, [viewingInvoice, viewerDocuments])

  const viewerMoveDisabled = viewingInvoice?.confirmed ?? false

  useEffect(() => {
    setSelectedUnmatched((prev) => {
      const next = new Set([...prev].filter((id) => unmatchedDocs.some((fp) => fp.docId === id)))
      return next.size === prev.size ? prev : next
    })
  }, [unmatchedDocs])

  useEffect(() => {
    if (viewerMode?.type === 'invoice' && !draft.invoices.some((i) => i.draftId === viewerMode.draftId)) {
      setViewerMode(null)
    }
    if (viewerMode?.type === 'unmatched' && unmatchedDocs.length === 0) {
      setViewerMode(null)
    }
  }, [draft.invoices, viewerMode, unmatchedDocs.length])

  const allConfirmed = draft.invoices.length > 0 && draft.invoices.every((i) => i.confirmed)
  const confirmedCount = draft.invoices.filter((i) => i.confirmed).length
  const batchTotal = useMemo(
    () => draft.invoices.reduce((s, i) => s + (i.amount || 0), 0),
    [draft.invoices]
  )

  const warnMode = crossCarrierLoadWarnings ? 'admin' : 'client'

  /** Per-draft invoice # / load # feedback for the confirm table. */
  const fieldFeedback = useMemo(() => {
    const map = new Map<string, { invoiceError?: string; loadWarning?: string }>()

    draft.invoices.forEach((inv, index) => {
      const otherNumbers = draft.invoices
        .filter((_, i) => i !== index)
        .map((o) => o.invoice_number)
      const num = inv.invoice_number?.trim() ?? ''
      let invoiceError: string | undefined
      if (num) {
        const inBatchDup = otherNumbers.some((n) => invoiceNumbersConflict(n, num))
        if (inBatchDup) {
          invoiceError = `Invoice number ${num} is duplicated in this batch`
        } else if (isInvoiceNumberTaken(clientId, num)) {
          invoiceError = crossCarrierLoadWarnings
            ? `Invoice number ${num} is already used for this carrier`
            : `Invoice number ${num} is already used for your account`
        }
      }

      const loadWarnings = getLoadNumberWarnings(inv.load_number, {
        forClientId: clientId,
        crossCarrier: crossCarrierLoadWarnings,
      })
      const loadWarning =
        loadWarnings.length > 0
          ? formatLoadNumberWarning(loadWarnings[0], warnMode)
          : undefined

      if (invoiceError || loadWarning) {
        map.set(inv.draftId, { invoiceError, loadWarning })
      }
    })

    return map
  }, [draft.invoices, clientId, crossCarrierLoadWarnings, warnMode])

  /** Block confirm when invoice # is taken; load warnings are informational only. */
  const tryConfirmDraft = (inv: CredyxInvoiceDraft): boolean => {
    const feedback = fieldFeedback.get(inv.draftId)
    if (feedback?.invoiceError) {
      window.alert(feedback.invoiceError)
      return false
    }
    const num = inv.invoice_number?.trim()
    if (!num) {
      window.alert('Invoice number is required before confirming')
      return false
    }
    onConfirmDraft(inv.draftId)
    return true
  }

  const handleConfirmAll = () => {
    draft.invoices.forEach((inv) => {
      if (!inv.confirmed && inv.amount > 0) {
        tryConfirmDraft(inv)
      }
    })
  }

  const toggleConfirm = (inv: CredyxInvoiceDraft) => {
    if (inv.confirmed) {
      onUnconfirmDraft(inv.draftId)
      return
    }
    tryConfirmDraft(inv)
  }

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

  const removePendingDoc = (docId: string) => {
    setPendingDocs((prev) => prev.filter((d) => d.id !== docId))
    setPendingFiles((prev) => {
      const next = new Map(prev)
      next.delete(docId)
      return next
    })
  }

  const handleDocUploadComplete = () => {
    if (!uploadDraftId) return
    onAttachDocuments(uploadDraftId, Array.from(pendingFiles.values()))
    closeDocUpload()
  }

  const handleDocsClick = (inv: CredyxInvoiceDraft, docCount: number) => {
    if (isManualCredyxDraft(inv) && docCount === 0 && !inv.confirmed) {
      openDocUpload(inv.draftId)
      return
    }
    if (docCount > 0) {
      setViewerMode({ type: 'invoice', draftId: inv.draftId })
    }
  }

  const toggleUnmatchedSelection = (docId: string) => {
    setSelectedUnmatched((prev) => {
      const next = new Set(prev)
      if (next.has(docId)) next.delete(docId)
      else next.add(docId)
      return next
    })
  }

  const handleBulkAssign = (toDraftId: string) => {
    if (!toDraftId || selectedUnmatched.size === 0) return
    onAssignUnmatchedDocs([...selectedUnmatched], toDraftId)
    setSelectedUnmatched(new Set())
  }

  const handleViewerMove = (docId: string, toDraftId: string | null) => {
    if (viewerMode?.type === 'invoice' && viewingInvoice) {
      onMoveDocument(viewingInvoice.draftId, docId, toDraftId)
      return
    }
    if (viewerMode?.type === 'unmatched' && toDraftId) {
      onAssignUnmatchedDoc(docId, toDraftId)
    }
  }

  const viewerTitle =
    viewerMode?.type === 'unmatched'
      ? 'Unmatched documents'
      : viewingInvoice
        ? `Invoice #${viewingInvoiceIndex}${viewingInvoice.load_number ? ` · Load ${viewingInvoice.load_number}` : ''}`
        : 'Documents'

  return (
    <div className="client-ai-confirm">
      <div className="client-ai-confirm__stats">
        <div className="client-ai-confirm__stat">
          <span className="invoice-detail-field-label">Invoices</span>
          <span className="client-ai-confirm__stat-value tabular-nums">{draft.invoices.length}</span>
        </div>
        <div className="client-ai-confirm__stat">
          <span className="invoice-detail-field-label">Confirmed</span>
          <span className="client-ai-confirm__stat-value tabular-nums">
            {confirmedCount}/{draft.invoices.length}
          </span>
        </div>
        <div className="client-ai-confirm__stat">
          <span className="invoice-detail-field-label">Batch total</span>
          <span className="client-ai-confirm__stat-value tabular-nums">
            {formatCurrency(batchTotal)}
          </span>
        </div>
        {hasUnmatched && (
          <div className="client-ai-confirm__stat">
            <span className="invoice-detail-field-label">Unmatched</span>
            <span className="client-ai-confirm__stat-value client-ai-confirm__stat-value--warn tabular-nums">
              {unmatchedDocs.length}
            </span>
          </div>
        )}
        <div className="client-ai-confirm__stat client-ai-confirm__stat--action">
          <button
            type="button"
            className="client-ai-confirm__add-btn"
            onClick={() => void onAddInvoice()}
            disabled={addingInvoice}
          >
            {addingInvoice ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Plus className="w-3.5 h-3.5" />
            )}
            Add invoice
          </button>
        </div>
      </div>

      <div className="client-ai-confirm__disclaimer">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0" style={{ color: c.warning }} />
        <span>{DOCSORT_AI_DISCLAIMER_SHORT}</span>
      </div>

      {hasUnmatched && (
        <div className="client-ai-confirm__unmatched-compact">
          <div className="client-ai-confirm__unmatched-head">
            <span className="client-ai-confirm__unmatched-title">
              {unmatchedDocs.length} unmatched
            </span>
            <button
              type="button"
              className="client-ai-confirm__unmatched-view"
              onClick={() => setViewerMode({ type: 'unmatched' })}
            >
              <Eye className="w-3.5 h-3.5" />
              View
            </button>
          </div>

          {selectedUnmatched.size > 0 && (
            <div className="client-ai-confirm__unmatched-bulk">
              <span>{selectedUnmatched.size} selected</span>
              <select
                className="client-ai-confirm__unmatched-bulk-select"
                defaultValue=""
                disabled={draft.invoices.length === 0}
                onChange={(e) => {
                  if (!e.target.value) return
                  handleBulkAssign(e.target.value)
                  e.target.value = ''
                }}
              >
                <option value="">Assign to…</option>
                {invoiceOptions.map((opt) => (
                  <option key={opt.draftId} value={opt.draftId}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="client-ai-confirm__unmatched-clear"
                onClick={() => setSelectedUnmatched(new Set())}
              >
                Clear
              </button>
            </div>
          )}

          <div className="client-ai-confirm__unmatched-chips">
            {unmatchedDocs.map((fp) => (
              <label key={fp.docId} className="client-ai-confirm__unmatched-chip">
                <input
                  type="checkbox"
                  checked={selectedUnmatched.has(fp.docId)}
                  onChange={() => toggleUnmatchedSelection(fp.docId)}
                />
                <span className="client-ai-confirm__unmatched-chip-name" title={fp.fileName}>
                  {shortFileName(fp.fileName)}
                </span>
                <span className="client-ai-confirm__unmatched-chip-kind">{fp.bucket}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="client-ai-confirm__table-wrap">
        <table className="dashboard-table dashboard-table--compact client-ai-confirm__table">
          <thead>
            <tr>
              <th className="client-ai-confirm__index-col">#</th>
              <th>Docs</th>
              <th>Invoice #</th>
              <th>Load #</th>
              <th>Broker</th>
              <th className="text-right">Amount</th>
              <th className="text-center client-ai-confirm__action-col"> </th>
            </tr>
          </thead>
          <tbody>
            {draft.invoices.length === 0 ? (
              <tr>
                <td colSpan={7} className="client-ai-confirm__empty-row">
                  No invoices yet. Click <strong>Add invoice</strong> to create one manually.
                </td>
              </tr>
            ) : (
              draft.invoices.map((inv, index) => {
                const docCount = getDraftViewDocuments(inv, draft.fileById).length
                const manual = isManualCredyxDraft(inv)
                const docsDisabled = docCount === 0 && (!manual || inv.confirmed)
                const feedback = fieldFeedback.get(inv.draftId)
                return (
                  <tr
                    key={inv.draftId}
                    className={inv.confirmed ? 'client-ai-confirm__row--confirmed' : ''}
                  >
                    <td className="client-ai-confirm__index-cell tabular-nums">
                      <span className="client-ai-confirm__index">{index + 1}</span>
                    </td>
                    <td className="client-ai-confirm__docs-cell">
                      <div className="client-ai-confirm__docs-wrap">
                        <button
                          type="button"
                          className={`client-ai-confirm__docs-link${manual && docCount === 0 ? ' client-ai-confirm__docs-link--add' : ''}`}
                          onClick={() => handleDocsClick(inv, docCount)}
                          disabled={docsDisabled}
                          title={
                            docCount > 0
                              ? `View ${docCount} document${docCount !== 1 ? 's' : ''}`
                              : manual
                                ? 'Attach supporting documents'
                                : undefined
                          }
                        >
                          {docsSummary(inv, docCount)}
                        </button>
                        {manual && docCount > 0 && !inv.confirmed && (
                          <button
                            type="button"
                            className="client-ai-confirm__docs-more"
                            onClick={() => openDocUpload(inv.draftId)}
                          >
                            + Add
                          </button>
                        )}
                      </div>
                    </td>
                    <td>
                      <input
                        type="text"
                        value={inv.invoice_number}
                        disabled={inv.confirmed}
                        onChange={(e) =>
                          onUpdateDraft(inv.draftId, { invoice_number: e.target.value })
                        }
                        className={`client-ai-confirm__input${feedback?.invoiceError ? ' client-ai-confirm__input--error' : ''}`}
                        aria-invalid={Boolean(feedback?.invoiceError)}
                      />
                      {feedback?.invoiceError && (
                        <p className="client-ai-confirm__field-msg client-ai-confirm__field-msg--error">
                          {feedback.invoiceError}
                        </p>
                      )}
                    </td>
                    <td>
                      <input
                        type="text"
                        value={inv.load_number}
                        disabled={inv.confirmed}
                        onChange={(e) => onUpdateDraft(inv.draftId, { load_number: e.target.value })}
                        className={`client-ai-confirm__input${feedback?.loadWarning ? ' client-ai-confirm__input--warn' : ''}`}
                      />
                      {feedback?.loadWarning && (
                        <p className="client-ai-confirm__field-msg client-ai-confirm__field-msg--warn">
                          {feedback.loadWarning}
                        </p>
                      )}
                    </td>
                    <td>
                      <input
                        type="text"
                        value={inv.broker_name}
                        disabled={inv.confirmed}
                        onChange={(e) => onUpdateDraft(inv.draftId, { broker_name: e.target.value })}
                        className="client-ai-confirm__input client-ai-confirm__input--wide"
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        value={inv.amount || ''}
                        disabled={inv.confirmed}
                        onChange={(e) =>
                          onUpdateDraft(inv.draftId, {
                            amount: Number.parseFloat(e.target.value) || 0,
                            rate_missing: false,
                          })
                        }
                        className="client-ai-confirm__input client-ai-confirm__input--amount"
                      />
                    </td>
                    <td className="client-ai-confirm__action-cell">
                      <div className="client-ai-confirm__action-wrap">
                        <button
                          type="button"
                          className={`client-ai-confirm__action-btn${inv.confirmed ? ' client-ai-confirm__action-btn--confirmed' : ''}`}
                          onClick={() => toggleConfirm(inv)}
                          disabled={
                            !inv.confirmed && (inv.amount <= 0 || Boolean(feedback?.invoiceError))
                          }
                          title={
                            feedback?.invoiceError
                              ? feedback.invoiceError
                              : inv.confirmed
                                ? 'Click to edit'
                                : 'Confirm invoice'
                          }
                        >
                          {inv.confirmed ? <Check className="w-3.5 h-3.5" /> : 'Confirm'}
                        </button>
                        {!inv.confirmed && (
                          <button
                            type="button"
                            className="client-ai-confirm__remove-btn"
                            onClick={() => onRemoveDraft(inv.draftId)}
                            title="Remove invoice"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="client-ai-confirm__footer">
        <div className="client-ai-confirm__footer-summary">
          <span className="client-ai-confirm__footer-label">Ready to submit</span>
          <span className="client-ai-confirm__footer-value">
            {confirmedCount}/{draft.invoices.length} confirmed · {formatCurrency(batchTotal)}
          </span>
        </div>
        <div className="client-ai-confirm__footer-actions">
          <button
            type="button"
            className="dashboard-btn-secondary"
            onClick={handleConfirmAll}
            disabled={allConfirmed || draft.invoices.length === 0}
          >
            Confirm all
          </button>
          <button
            type="button"
            className="dashboard-btn-primary"
            disabled={!allConfirmed || submitting}
            onClick={onSubmitBatch}
          >
            {submitting ? 'Submitting…' : 'Submit batch'}
          </button>
        </div>
      </div>

      <DocumentViewer
        isOpen={viewerMode !== null && viewerDocuments.length > 0}
        onClose={() => setViewerMode(null)}
        documents={viewerDocuments}
        invoiceNumber={viewingInvoice?.invoice_number}
        title={viewerTitle}
        moveTargets={viewerMoveTargets}
        onMoveDocument={handleViewerMove}
        lockedDocIds={viewerLockedIds}
        moveDisabled={viewerMoveDisabled}
      />

      {uploadDraft && (
        <ClientInvoiceDocumentUploadModal
          invoiceNumber={uploadDraft.invoice_number}
          brokerName={uploadDraft.broker_name || '—'}
          amount={String(uploadDraft.amount || 0)}
          loadNumber={uploadDraft.load_number || undefined}
          documents={pendingDocs}
          isEditingExistingInvoice={false}
          onClose={closeDocUpload}
          onComplete={handleDocUploadComplete}
          onFileSelect={(e) => {
            if (e.target.files?.length) addPendingFiles(e.target.files)
            e.target.value = ''
          }}
          onFileDrop={(files) => addPendingFiles(files)}
          onRemoveDocument={removePendingDoc}
        />
      )}
    </div>
  )
}
