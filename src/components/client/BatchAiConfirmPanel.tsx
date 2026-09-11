import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Bug, FileText, FolderOpen, Loader2, Plus, Trash2 } from 'lucide-react'
import DocumentViewer from '../DocumentViewer'
import ClientInvoiceDocumentUploadModal, {
  type UploadModalDocument,
} from './ClientInvoiceDocumentUploadModal'
import BrokerPicker from '../brokers/BrokerPicker'
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
import { invoiceDraftBlocker, isInvoiceDraftReady } from '../../utils/invoiceDraftReady'
import { groupPacketDocuments } from '../../utils/batchPacketDocs'
import BatchAiAssignmentDebug from './BatchAiAssignmentDebug'

interface BatchAiConfirmPanelProps {
  draft: BatchIntakeDraft
  clientId: string
  crossCarrierLoadWarnings?: boolean
  brokerPickerMode?: 'carrier' | 'admin'
  onUpdateDraft: (draftId: string, patch: Partial<CredyxInvoiceDraft>) => void
  onAddInvoice: () => void | Promise<void>
  onRemoveDraft: (draftId: string) => void
  onMoveDocument: (fromDraftId: string, docId: string, toDraftId: string | null) => void
  onAssignUnmatchedDoc: (docId: string, toDraftId: string) => void
  onAssignUnmatchedDocs: (docIds: string[], toDraftId: string) => void
  onAttachDocuments: (draftId: string, files: File[]) => void
  onDeleteDocument: (docId: string) => void
  addingInvoice: boolean
  onSubmitBatch: () => void
  submitting: boolean
}

type RailTab = 'invoices' | 'docs' | 'debug'
type Focus =
  | { type: 'invoice'; draftId: string; docId?: string }
  | { type: 'unassigned'; docId?: string }

function shortFileName(name: string, max = 32) {
  return name.length > max ? `${name.slice(0, max - 1)}…` : name
}

/** Packet workspace: edit invoices, assign docs, send to verification. */
export default function BatchAiConfirmPanel({
  draft,
  clientId,
  crossCarrierLoadWarnings = false,
  brokerPickerMode = 'carrier',
  onUpdateDraft,
  onAddInvoice,
  onRemoveDraft,
  onMoveDocument,
  onAssignUnmatchedDoc,
  onAssignUnmatchedDocs,
  onAttachDocuments,
  onDeleteDocument,
  addingInvoice,
  onSubmitBatch,
  submitting,
}: BatchAiConfirmPanelProps) {
  const c = useClientTheme()
  const [railTab, setRailTab] = useState<RailTab>('invoices')
  const [focus, setFocus] = useState<Focus | null>(null)
  const [uploadDraftId, setUploadDraftId] = useState<string | null>(null)
  const [pendingDocs, setPendingDocs] = useState<UploadModalDocument[]>([])
  const [pendingFiles, setPendingFiles] = useState<Map<string, File>>(new Map())
  const [selectedUnmatched, setSelectedUnmatched] = useState<Set<string>>(new Set())

  const invoiceOptions = useMemo(
    () =>
      draft.invoices.map((inv) => ({
        draftId: inv.draftId,
        label: `Inv #${inv.invoice_number}${inv.load_number ? ` · ${inv.load_number}` : ''}`,
      })),
    [draft.invoices]
  )

  const uploadDraft = useMemo(
    () => draft.invoices.find((inv) => inv.draftId === uploadDraftId) ?? null,
    [draft.invoices, uploadDraftId]
  )

  const unmatchedDocs = useMemo(
    () => [
      ...draft.unmatched.rateCons,
      ...draft.unmatched.bols,
      ...draft.unmatched.other,
    ],
    [draft.unmatched]
  )

  const unmatchedCount = unmatchedDocs.length

  useEffect(() => {
    setFocus((prev) => {
      if (prev?.type === 'invoice' && draft.invoices.some((i) => i.draftId === prev.draftId)) {
        return prev
      }
      if (prev?.type === 'unassigned' && unmatchedCount > 0) return prev
      if (draft.invoices[0]) return { type: 'invoice', draftId: draft.invoices[0].draftId }
      if (unmatchedCount > 0) return { type: 'unassigned' }
      return null
    })
  }, [draft.invoices, unmatchedCount])

  const selectedInvoice = useMemo(() => {
    if (focus?.type !== 'invoice') return null
    return draft.invoices.find((inv) => inv.draftId === focus.draftId) ?? null
  }, [draft.invoices, focus])

  const packetGroups = useMemo(
    () => (selectedInvoice ? groupPacketDocuments(selectedInvoice, draft.fileById) : []),
    [selectedInvoice, draft.fileById]
  )

  const paneDocuments = useMemo(() => {
    if (focus?.type === 'invoice' && selectedInvoice) {
      return getDraftViewDocuments(selectedInvoice, draft.fileById).map((doc) => ({
        id: doc.id,
        name: doc.name,
        file: doc.file,
      }))
    }
    if (focus?.type === 'unassigned') {
      return unmatchedDocs
        .map((fp) => {
          const file = draft.fileById.get(fp.docId)
          if (!file) return null
          return { id: fp.docId, name: fp.fileName || file.name, file }
        })
        .filter((doc): doc is { id: string; name: string; file: File } => doc !== null)
    }
    return []
  }, [focus, selectedInvoice, draft.fileById, unmatchedDocs])

  const viewerMoveTargets = useMemo(() => {
    if (focus?.type === 'invoice' && selectedInvoice) {
      return [
        ...invoiceOptions
          .filter((opt) => opt.draftId !== selectedInvoice.draftId)
          .map((opt) => ({ draftId: opt.draftId, label: opt.label })),
        { draftId: null, label: 'Unassigned pile' },
      ]
    }
    if (focus?.type === 'unassigned') {
      return invoiceOptions.map((opt) => ({ draftId: opt.draftId, label: opt.label }))
    }
    return []
  }, [focus, selectedInvoice, invoiceOptions])

  const viewerLockedIds = useMemo(() => {
    if (!selectedInvoice) return []
    return paneDocuments
      .filter((doc) => isGeneratedInvoicePdfDoc(selectedInvoice, doc.id))
      .map((doc) => doc.id)
  }, [selectedInvoice, paneDocuments])

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
        loadWarnings.length > 0 ? formatLoadNumberWarning(loadWarnings[0], warnMode) : undefined
      if (invoiceError || loadWarning) map.set(inv.draftId, { invoiceError, loadWarning })
    })
    return map
  }, [draft.invoices, clientId, crossCarrierLoadWarnings, warnMode])

  const readyCount = draft.invoices.filter((inv) =>
    isInvoiceDraftReady(inv, fieldFeedback.get(inv.draftId))
  ).length
  const allReady = draft.invoices.length > 0 && readyCount === draft.invoices.length
  const canSendToVerification = allReady && unmatchedCount === 0
  const selectedFeedback = selectedInvoice ? fieldFeedback.get(selectedInvoice.draftId) : undefined
  const selectedBlocker = selectedInvoice
    ? invoiceDraftBlocker(selectedInvoice, selectedFeedback)
    : null

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

  const handleViewerMove = (docId: string, toDraftId: string | null) => {
    if (focus?.type === 'invoice' && selectedInvoice) {
      onMoveDocument(selectedInvoice.draftId, docId, toDraftId)
      return
    }
    if (focus?.type === 'unassigned' && toDraftId) {
      onAssignUnmatchedDoc(docId, toDraftId)
    }
  }

  const viewerTitle =
    focus?.type === 'unassigned'
      ? 'Unassigned documents'
      : selectedInvoice
        ? `Inv #${selectedInvoice.invoice_number}${selectedInvoice.load_number ? ` · Load ${selectedInvoice.load_number}` : ''}`
        : 'Packet'

  return (
    <div className="client-ai-review">
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
            <div className="client-ai-review__rail-head">
              <div>
                <p className="client-ai-review__rail-kicker">Packets</p>
                <p className="client-ai-review__rail-count">
                  {readyCount}/{draft.invoices.length} ready
                </p>
              </div>
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
                Add
              </button>
            </div>
            <div className="client-ai-review__rail-list">
              {draft.invoices.length === 0 && (
                <p className="client-ai-review__empty">No invoices yet. Drop paperwork or add one.</p>
              )}
              {draft.invoices.map((inv, index) => {
                const ready = isInvoiceDraftReady(inv, fieldFeedback.get(inv.draftId))
                const active = focus?.type === 'invoice' && focus.draftId === inv.draftId
                const groups = groupPacketDocuments(inv, draft.fileById)
                const docCount = groups.reduce((n, g) => n + g.docs.length, 0)
                return (
                  <button
                    key={inv.draftId}
                    type="button"
                    className={`client-ai-packet__item${active ? ' is-active' : ''}${
                      ready ? '' : ' needs-review'
                    }`}
                    onClick={() => {
                      const firstDoc = groups[0]?.docs[0]?.docId
                      setFocus({ type: 'invoice', draftId: inv.draftId, docId: firstDoc })
                      setRailTab('invoices')
                    }}
                  >
                    <span className="client-ai-packet__item-index">{index + 1}</span>
                    <span className="client-ai-packet__item-title">
                      Inv #{inv.invoice_number}
                    </span>
                    <span className="client-ai-packet__item-load">
                      {inv.load_number ? `Load ${inv.load_number}` : 'No load #'}
                    </span>
                    <span className="client-ai-packet__item-meta">
                      {inv.broker_name?.trim() || 'No broker'}
                    </span>
                    <span className="client-ai-packet__item-amount tabular-nums">
                      {inv.amount > 0 ? formatCurrency(inv.amount) : '—'}
                    </span>
                    <span className="client-ai-packet__item-docs">{docCount} docs</span>
                    <span className={`client-ai-review__pill${ready ? ' client-ai-review__pill--ok' : ''}`}>
                      {ready ? 'Ready' : 'Needs review'}
                    </span>
                  </button>
                )
              })}
            </div>
          </>
        ) : railTab === 'docs' ? (
          <div className="client-ai-packet__tree">
            {draft.invoices.map((inv) => {
              const groups = groupPacketDocuments(inv, draft.fileById)
              const activePacket = focus?.type === 'invoice' && focus.draftId === inv.draftId
              return (
                <section
                  key={inv.draftId}
                  className={`client-ai-packet__block${activePacket ? ' is-active' : ''}`}
                >
                  <button
                    type="button"
                    className="client-ai-packet__block-head"
                    onClick={() => {
                      const firstDoc = groups[0]?.docs[0]?.docId
                      setFocus({ type: 'invoice', draftId: inv.draftId, docId: firstDoc })
                    }}
                  >
                    Inv #{inv.invoice_number}
                    {inv.load_number ? ` · Load ${inv.load_number}` : ''}
                  </button>
                  {groups.map((group) => (
                    <div key={group.category} className="client-ai-packet__tree-cat">
                      <p>{group.label}</p>
                      {group.docs.map((doc) => (
                        <button
                          key={doc.docId}
                          type="button"
                          className={`client-ai-packet__tree-doc${
                            focus?.type === 'invoice' && focus.docId === doc.docId ? ' is-active' : ''
                          }`}
                          onClick={() =>
                            setFocus({ type: 'invoice', draftId: inv.draftId, docId: doc.docId })
                          }
                          title={doc.fileName}
                        >
                          {shortFileName(doc.fileName)}
                        </button>
                      ))}
                    </div>
                  ))}
                </section>
              )
            })}

            <section className={`client-ai-packet__block client-ai-packet__block--unassigned${
              focus?.type === 'unassigned' ? ' is-active' : ''
            }`}>
              <button
                type="button"
                className="client-ai-packet__block-head"
                onClick={() => setFocus({ type: 'unassigned' })}
              >
                Unassigned docs ({unmatchedCount})
              </button>
              {unmatchedCount === 0 ? (
                <p className="client-ai-packet__tree-empty">All documents are in a packet.</p>
              ) : (
                unmatchedDocs.map((fp) => (
                  <div key={fp.docId} className="client-ai-packet__unassigned-row">
                    <button
                      type="button"
                      className={`client-ai-packet__tree-doc${
                        focus?.type === 'unassigned' && focus.docId === fp.docId ? ' is-active' : ''
                      }`}
                      onClick={() => setFocus({ type: 'unassigned', docId: fp.docId })}
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
                      <span title={fp.fileName}>{shortFileName(fp.fileName)}</span>
                    </button>
                    <button
                      type="button"
                      className="client-ai-confirm__remove-btn"
                      title="Delete document"
                      onClick={() => {
                        if (window.confirm(`Delete ${fp.fileName}?`)) onDeleteDocument(fp.docId)
                      }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
              {selectedUnmatched.size > 0 && (
                <div className="client-ai-packet__assign-bar">
                  <select
                    className="client-ai-confirm__unmatched-bulk-select"
                    defaultValue=""
                    onChange={(e) => {
                      if (!e.target.value) return
                      onAssignUnmatchedDocs([...selectedUnmatched], e.target.value)
                      setSelectedUnmatched(new Set())
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
          <p className="client-ai-review__empty" style={{ padding: 16 }}>
            Select a file on the right to see why it was grouped.
          </p>
        )}
      </div>

      <div className="client-ai-review__main">
        {railTab === 'debug' ? (
          <BatchAiAssignmentDebug draft={draft} />
        ) : (
        <>
        <p className="client-ai-review__disclaimer">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" style={{ color: c.warning }} />
          <span>{DOCSORT_AI_DISCLAIMER_SHORT}</span>
        </p>

        {focus?.type === 'unassigned' ? (
          <div className="client-ai-review__unmatched">
            <h3 className="client-ai-review__panel-title">Unassigned pile</h3>
            <p className="client-ai-review__panel-desc">
              Move each file into the correct invoice packet, or delete it. Every document must be
              assigned or deleted before verification.
            </p>
          </div>
        ) : selectedInvoice ? (
          <div className="client-ai-review__editor">
            <div className="client-ai-review__editor-head">
              <div>
                <h3 className="client-ai-review__panel-title">
                  Load #{selectedInvoice.load_number || '—'} ·{' '}
                  {selectedInvoice.broker_name || 'No broker'} ·{' '}
                  {selectedInvoice.amount > 0 ? formatCurrency(selectedInvoice.amount) : '—'}
                </h3>
                <p className="client-ai-review__panel-desc">
                  Generated invoice page is first in this packet. Edit fields, then check the docs.
                </p>
              </div>
              <div className="flex items-center gap-2">
                {isManualCredyxDraft(selectedInvoice) && (
                  <button
                    type="button"
                    className="client-ai-review__attach"
                    onClick={() => openDocUpload(selectedInvoice.draftId)}
                  >
                    <FolderOpen className="w-4 h-4" />
                    Attach
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

            {selectedBlocker && <p className="client-ai-review__blocker">{selectedBlocker}</p>}

            <div className="client-ai-review__fields">
              <label className="client-ai-review__field">
                <span>Invoice #</span>
                <input
                  type="text"
                  value={selectedInvoice.invoice_number}
                  onChange={(e) =>
                    onUpdateDraft(selectedInvoice.draftId, { invoice_number: e.target.value })
                  }
                  className={`client-ai-confirm__input${
                    selectedFeedback?.invoiceError ? ' client-ai-confirm__input--error' : ''
                  }`}
                />
              </label>
              <label className="client-ai-review__field">
                <span>Load #</span>
                <input
                  type="text"
                  value={selectedInvoice.load_number}
                  onChange={(e) =>
                    onUpdateDraft(selectedInvoice.draftId, { load_number: e.target.value })
                  }
                  className={`client-ai-confirm__input${
                    selectedFeedback?.loadWarning ? ' client-ai-confirm__input--warn' : ''
                  }`}
                />
              </label>
              <div className="client-ai-review__field">
                <span>Broker</span>
                <BrokerPicker
                  mode={brokerPickerMode}
                  compact
                  inputClassName="client-ai-confirm__input client-ai-confirm__input--wide"
                  value={{
                    broker_id: selectedInvoice.broker_id,
                    broker_name: selectedInvoice.broker_name,
                    pending_new: Boolean(selectedInvoice.broker_name && !selectedInvoice.broker_id),
                  }}
                  onChange={(next) =>
                    onUpdateDraft(selectedInvoice.draftId, {
                      broker_id: next.broker_id,
                      broker_name: next.broker_name,
                    })
                  }
                />
              </div>
              <label className="client-ai-review__field">
                <span>Rate</span>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={selectedInvoice.amount || ''}
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
          </div>
        ) : (
          <div className="client-ai-review__empty-main">Drop paperwork to create invoice packets.</div>
        )}

        <div className="client-ai-review__preview">
          {selectedInvoice && focus?.type === 'invoice' && (
            <div className="client-ai-packet__file-strip" aria-label="Packet documents">
              {packetGroups.flatMap((group) =>
                group.docs.map((doc) => (
                  <button
                    key={doc.docId}
                    type="button"
                    className={`client-ai-packet__file-chip${
                      (focus.docId === doc.docId) || (!focus.docId && doc.generated)
                        ? ' is-active'
                        : ''
                    }`}
                    onClick={() =>
                      setFocus({
                        type: 'invoice',
                        draftId: selectedInvoice.draftId,
                        docId: doc.docId,
                      })
                    }
                  >
                    <span className="client-ai-packet__file-kind">{group.label}</span>
                    <span>{shortFileName(doc.fileName, 22)}</span>
                  </button>
                ))
              )}
            </div>
          )}
          <div className="client-ai-review__docs">
          {paneDocuments.length > 0 ? (
            <DocumentViewer
              isOpen
              layout="pane"
              onClose={() => undefined}
              documents={paneDocuments}
              activeDocId={focus?.docId}
              invoiceNumber={selectedInvoice?.invoice_number}
              title={viewerTitle}
              moveTargets={viewerMoveTargets}
              onMoveDocument={handleViewerMove}
              onUnassignDocument={
                focus?.type === 'invoice'
                  ? (docId) =>
                      selectedInvoice && onMoveDocument(selectedInvoice.draftId, docId, null)
                  : undefined
              }
              onDeleteDocument={onDeleteDocument}
              lockedDocIds={viewerLockedIds}
            />
          ) : (
            <div className="client-ai-review__docs-empty">
              <FileText className="w-8 h-8 mb-2" style={{ color: c.mutedLight }} />
              <p>No documents in this view</p>
            </div>
          )}
          </div>
        </div>
        </>
        )}
      </div>

      <div className="client-ai-review__footer">
        <div className="client-ai-confirm__footer-summary">
          <span className="client-ai-confirm__footer-label">Send to verification</span>
          <span className="client-ai-confirm__footer-value">
            {readyCount}/{draft.invoices.length} invoices · {formatCurrency(batchTotal)}
            {unmatchedCount > 0 ? ` · ${unmatchedCount} unassigned` : ''}
          </span>
        </div>
        <button
          type="button"
          className="dashboard-btn-primary"
          disabled={!canSendToVerification || submitting}
          title={
            unmatchedCount > 0
              ? 'Assign or delete every document first'
              : !allReady
                ? 'Finish invoice fields first'
                : undefined
          }
          onClick={onSubmitBatch}
        >
          {submitting ? 'Sending…' : 'Send to verification'}
        </button>
      </div>

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
