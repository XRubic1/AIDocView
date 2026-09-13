import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ExternalLink, FileText, X } from 'lucide-react'
import InvoiceDetailPanel from '../components/client/InvoiceDetailPanel'
import DocumentViewer from '../components/DocumentViewer'
import EmptyState from '../components/ui/EmptyState'
import { useToast } from '../components/ui/ToastProvider'
import { getBatchById } from '../data/mockBatches'
import { mockInvoices } from '../data/mockInvoices'
import { mockPayments } from '../data/mockPayments'
import { addAdminInvoiceNote, removeAdminInvoiceNote } from '../services/adminInvoiceNoteActions'
import { useClientTheme, useTheme } from '../theme/ThemeContext'
import { useTenantDataRevision } from '../hooks/useTenantDataRevision'
import { useAuth } from '../context/AuthContext'
import { getAdminUserDisplayName } from '../config/adminNav'
import { enrichAdminInvoices } from '../utils/adminInvoiceQueue'
import { formatCurrency, formatDate } from '../utils/format'
import { resolveInvoiceDocumentsAsync } from '../utils/resolveInvoiceDocuments'
import type { Invoice } from '../types/invoice'
import '../styles/clientPortal.css'
import '../styles/clientPortalDark.css'

type WorkspaceDoc = {
  id: string
  name: string
  type: string
  size: number
  file?: File
}

type BatchReviewFilter = 'open' | 'paid'

/** Submitted batches enter A/R review; earlier stages are docs-only preview. */
function isBatchSubmittedForReview(status: string | undefined): boolean {
  return status === 'submitted' || status === 'processing'
}

/** Open A/R (not paid / closed). */
function isOpenBatchInvoice(invoice: Invoice): boolean {
  return (
    invoice.status !== 'paid' &&
    invoice.status !== 'written_off' &&
    invoice.status !== 'force_closed'
  )
}

function isPaidBatchInvoice(invoice: Invoice): boolean {
  return invoice.status === 'paid'
}

/**
 * Standalone pop-out window: invoice detail (left) + document viewer (right).
 * Batch mode: unsubmitted → docs-only preview; submitted → invoice list + Open/Paid filters.
 */
export default function AdminInvoiceWorkspace() {
  const c = useClientTheme()
  const { resolvedTheme } = useTheme()
  const { showToast } = useToast()
  const { resolved } = useAuth()
  const adminName = getAdminUserDisplayName(resolved.user?.email ?? null)
  const tenantRevision = useTenantDataRevision()
  const [searchParams, setSearchParams] = useSearchParams()
  const [refreshKey, setRefreshKey] = useState(0)
  const bump = () => setRefreshKey((k) => k + 1)
  const dataRevision = refreshKey + tenantRevision

  const invoices = useMemo(() => enrichAdminInvoices([...mockInvoices]), [dataRevision])
  const payments = useMemo(() => [...mockPayments], [dataRevision])

  const invoiceParam = searchParams.get('invoice')
  const batchParam = searchParams.get('batch')

  const batch = useMemo(
    () => (batchParam ? getBatchById(batchParam) : undefined),
    [batchParam, dataRevision]
  )

  const batchSubmitted = isBatchSubmittedForReview(batch?.status)
  const batchMode = Boolean(batchParam)
  /** Review = submitted batch invoice list + detail. Preview = docs only when not submitted. */
  const canReview = !batchMode || batchSubmitted

  const [displayFlags, setDisplayFlags] = useState<Record<BatchReviewFilter, boolean>>({
    open: true,
    paid: false,
  })

  const batchInvoices = useMemo(() => {
    if (!batchParam) return invoices
    return invoices.filter((inv) => inv.batch_id === batchParam)
  }, [invoices, batchParam])

  const filterCounts = useMemo(() => {
    let open = 0
    let paid = 0
    for (const inv of batchInvoices) {
      if (isPaidBatchInvoice(inv)) paid += 1
      else if (isOpenBatchInvoice(inv)) open += 1
    }
    return { open, paid }
  }, [batchInvoices])

  const filteredBatchInvoices = useMemo(() => {
    if (!batchMode) return batchInvoices
    return batchInvoices.filter((inv) => {
      if (isPaidBatchInvoice(inv)) return displayFlags.paid
      if (isOpenBatchInvoice(inv)) return displayFlags.open
      return displayFlags.open
    })
  }, [batchInvoices, batchMode, displayFlags])

  const selectedInvoice = useMemo(() => {
    const pool = batchMode
      ? canReview
        ? filteredBatchInvoices
        : batchInvoices
      : invoices
    if (!pool.length) return null
    if (!invoiceParam) return canReview && batchMode ? null : pool[0]
    return (
      pool.find((inv) => inv.id === invoiceParam) ||
      pool.find((inv) => inv.invoice_number === invoiceParam) ||
      (canReview && batchMode ? null : pool[0])
    )
  }, [batchMode, canReview, filteredBatchInvoices, batchInvoices, invoices, invoiceParam])

  const [docs, setDocs] = useState<WorkspaceDoc[]>([])
  const [docsLoading, setDocsLoading] = useState(false)

  const showList = batchMode && canReview
  const showDetail = Boolean(selectedInvoice) && canReview
  const showDocsOnlyPreview = batchMode && !canReview

  // Keep URL in sync with selection (preserve batch scope).
  useEffect(() => {
    if (!batchParam && !selectedInvoice) return

    if (batchMode && canReview && !selectedInvoice) {
      // List mode with no selection — drop stale invoice id.
      if (!invoiceParam && searchParams.get('batch') === batchParam) return
      setSearchParams({ batch: batchParam! }, { replace: true })
      return
    }

    if (!selectedInvoice) return
    const next: Record<string, string> = { invoice: selectedInvoice.id }
    if (batchParam) next.batch = batchParam
    if (
      invoiceParam === selectedInvoice.id &&
      (!batchParam || searchParams.get('batch') === batchParam)
    ) {
      return
    }
    setSearchParams(next, { replace: true })
  }, [
    selectedInvoice,
    invoiceParam,
    batchParam,
    batchMode,
    canReview,
    searchParams,
    setSearchParams,
  ])

  useEffect(() => {
    const label = batchMode
      ? canReview
        ? `Batch review · ${batch?.batch_number ?? 'Batch'}`
        : `Batch preview · ${batch?.batch_number ?? 'Batch'}`
      : selectedInvoice
        ? `Invoice ${selectedInvoice.invoice_number} · Documents`
        : 'Invoice workspace'
    document.title = `${label} · Credyx`
  }, [batchMode, canReview, batch?.batch_number, selectedInvoice])

  // Resolve documents for the active invoice (review selection or unsubmitted preview).
  const docsInvoice =
    selectedInvoice ??
    (showDocsOnlyPreview
      ? invoiceParam
        ? batchInvoices.find((inv) => inv.id === invoiceParam) ?? batchInvoices[0]
        : batchInvoices[0]
      : null)

  useEffect(() => {
    if (!docsInvoice) {
      setDocs([])
      setDocsLoading(false)
      return
    }

    let cancelled = false
    setDocsLoading(true)
    setDocs([])

    void resolveInvoiceDocumentsAsync(docsInvoice)
      .then((resolved) => {
        if (cancelled) return
        setDocs(
          resolved.map((doc) => ({
            id: doc.id,
            name: doc.name,
            type: doc.type,
            size: doc.size,
            file: doc.file,
          }))
        )
      })
      .catch(() => {
        if (!cancelled) setDocs([])
      })
      .finally(() => {
        if (!cancelled) setDocsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [docsInvoice, dataRevision])

  const selectInvoice = useCallback(
    (invoice: Invoice) => {
      if (batchMode && !canReview) return
      const next: Record<string, string> = { invoice: invoice.id }
      if (batchParam) next.batch = batchParam
      setSearchParams(next, { replace: true })
    },
    [batchMode, canReview, batchParam, setSearchParams]
  )

  const clearSelection = useCallback(() => {
    if (!batchParam) return
    setSearchParams({ batch: batchParam }, { replace: true })
  }, [batchParam, setSearchParams])

  const toggleFilter = (key: BatchReviewFilter) => {
    setDisplayFlags((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const handleCloseWindow = () => {
    window.close()
  }

  const expectedDocCount = (docsInvoice ?? selectedInvoice)?.documents_count ?? 0

  const renderDocsPane = () => {
    if (!selectedInvoice && !showDocsOnlyPreview) {
      return (
        <div className="flex-1 flex items-center justify-center p-6">
          <EmptyState
            icon={FileText}
            title="Select an invoice"
            hint="Choose an invoice from the list to review details and documents."
          />
        </div>
      )
    }

    if (showDocsOnlyPreview && batchInvoices.length === 0) {
      return (
        <div className="flex-1 flex items-center justify-center p-6">
          <EmptyState
            icon={FileText}
            title="No documents yet"
            hint="This batch has no invoices. Finish Ready to Post before documents appear here."
          />
        </div>
      )
    }

    // Unsubmitted preview: show docs for first / URL invoice without review panel.
    const previewInvoice =
      selectedInvoice ??
      (invoiceParam
        ? batchInvoices.find((inv) => inv.id === invoiceParam) ?? batchInvoices[0]
        : batchInvoices[0]) ??
      null

    if (!previewInvoice) {
      return (
        <div className="flex-1 flex items-center justify-center p-6">
          <EmptyState
            icon={FileText}
            title="No invoices available"
            hint="Open an invoice from the Invoices dashboard, then use Pop out again."
          />
        </div>
      )
    }

    if (docsLoading) {
      return (
        <div className="flex-1 flex items-center justify-center text-sm" style={{ color: c.secondary }}>
          Loading documents…
        </div>
      )
    }

    if (docs.length === 0) {
      return (
        <div className="flex-1 flex items-center justify-center p-6">
          <EmptyState
            icon={FileText}
            title={expectedDocCount > 0 ? 'Documents unavailable' : 'No documents'}
            hint={
              expectedDocCount > 0
                ? 'This invoice lists documents, but the files could not be loaded.'
                : 'Documents attached to this invoice will appear here.'
            }
          />
        </div>
      )
    }

    return (
      <DocumentViewer
        isOpen
        layout="pane"
        onClose={() => undefined}
        documents={docs}
        invoiceNumber={previewInvoice.invoice_number}
        title="Documents"
      />
    )
  }

  return (
    <div
      className="client-portal h-screen w-screen overflow-hidden flex flex-col"
      data-theme={resolvedTheme}
      style={{ backgroundColor: c.surface, color: c.primary }}
    >
      <header
        className="flex items-center justify-between gap-3 px-4 py-2.5 border-b shrink-0"
        style={{ borderColor: c.border, backgroundColor: c.card }}
      >
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide" style={{ color: c.secondary }}>
            {batchMode
              ? canReview
                ? 'Batch invoice review'
                : 'Batch document preview'
              : 'Invoice workspace'}
          </p>
          <p className="text-sm font-semibold truncate" style={{ color: c.primary }}>
            {batchMode
              ? `${batch?.batch_number ?? 'Batch'}${
                  selectedInvoice ? ` · ${selectedInvoice.invoice_number}` : ''
                }${batch?.client_name ? ` · ${batch.client_name}` : ''}`
              : selectedInvoice
                ? `${selectedInvoice.invoice_number} · ${selectedInvoice.client_name}`
                : 'No invoice selected'}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link
            to={
              batchParam
                ? `/batches`
                : selectedInvoice
                  ? `/invoices?invoice=${encodeURIComponent(selectedInvoice.id)}`
                  : '/invoices'
            }
            className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded border transition-colors"
            style={{ borderColor: c.border, color: c.primary }}
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Open in main app
          </Link>
          <button
            type="button"
            onClick={handleCloseWindow}
            className="p-1.5 rounded border transition-colors"
            style={{ borderColor: c.border, color: c.secondary }}
            aria-label="Close window"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </header>

      {showDocsOnlyPreview && (
        <div
          className="shrink-0 px-4 py-2 text-sm border-b"
          style={{
            borderColor: c.border,
            backgroundColor: c.stat?.amber ?? '#fef3c7',
            color: c.primary,
          }}
        >
          This batch is not submitted yet — document preview only. Invoice review unlocks after the
          batch is processed to <strong>Submitted</strong>.
        </div>
      )}

      {!batchMode && !selectedInvoice ? (
        <div className="flex-1 flex items-center justify-center p-8">
          <EmptyState
            icon={FileText}
            title="No invoices available"
            hint="Open an invoice from the Invoices dashboard, then use Pop out again."
          />
        </div>
      ) : showDocsOnlyPreview ? (
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col" style={{ backgroundColor: c.card }}>
          {batchInvoices.length > 1 && (
            <div
              className="shrink-0 flex flex-wrap gap-1.5 px-4 py-2 border-b"
              style={{ borderColor: c.border }}
            >
              {batchInvoices.map((inv) => {
                const active = (docsInvoice?.id ?? '') === inv.id
                return (
                  <button
                    key={inv.id}
                    type="button"
                    onClick={() => {
                      const next: Record<string, string> = {
                        batch: batchParam!,
                        invoice: inv.id,
                      }
                      setSearchParams(next, { replace: true })
                    }}
                    className={`page-tab !py-1 !px-2 !text-xs ${
                      active ? 'page-tab--active' : 'opacity-60'
                    }`}
                  >
                    {inv.invoice_number}
                  </button>
                )
              })}
            </div>
          )}
          {renderDocsPane()}
        </div>
      ) : (
        <div
          className={`flex-1 min-h-0 grid ${
            showList
              ? selectedInvoice
                ? 'grid-cols-1 lg:grid-cols-[minmax(280px,340px)_minmax(0,1fr)_minmax(0,1fr)]'
                : 'grid-cols-1'
              : 'grid-cols-1 lg:grid-cols-2'
          }`}
        >
          {showList && (
            <div
              className="min-h-0 overflow-hidden flex flex-col border-b lg:border-b-0 lg:border-r"
              style={{ borderColor: c.border, backgroundColor: c.card }}
            >
              <div
                className="shrink-0 px-3 py-2 border-b space-y-2"
                style={{ borderColor: c.border }}
              >
                <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: c.secondary }}>
                  Invoices
                </p>
                <div
                  className="flex flex-wrap gap-1.5"
                  role="group"
                  aria-label="Invoice status filters"
                >
                  {(
                    [
                      { key: 'open' as const, label: 'Open' },
                      { key: 'paid' as const, label: 'Paid' },
                    ] as const
                  ).map(({ key, label }) => {
                    const showing = displayFlags[key]
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => toggleFilter(key)}
                        aria-pressed={showing}
                        className={`page-tab !py-1 !px-2 !text-xs ${
                          showing ? 'page-tab--active' : 'opacity-50'
                        }`}
                      >
                        {label}
                        <span className="tabular-nums"> ({filterCounts[key]})</span>
                      </button>
                    )
                  })}
                </div>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto">
                {filteredBatchInvoices.length === 0 ? (
                  <div className="p-6 text-center text-sm" style={{ color: c.secondary }}>
                    No invoices match the selected filters.
                  </div>
                ) : (
                  <ul className="divide-y" style={{ borderColor: c.border }}>
                    {filteredBatchInvoices.map((inv) => {
                      const active = selectedInvoice?.id === inv.id
                      const paid = isPaidBatchInvoice(inv)
                      return (
                        <li key={inv.id}>
                          <button
                            type="button"
                            onClick={() => selectInvoice(inv)}
                            className="w-full text-left px-3 py-2.5 transition-colors"
                            style={{
                              backgroundColor: active ? c.stat?.blue ?? '#e0f2fe' : 'transparent',
                              borderLeft: active
                                ? `3px solid ${c.info ?? '#0284c7'}`
                                : '3px solid transparent',
                            }}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div
                                  className="text-sm font-semibold truncate"
                                  style={{ color: c.primary }}
                                >
                                  {inv.invoice_number}
                                </div>
                                <div className="text-xs truncate" style={{ color: c.secondary }}>
                                  {inv.broker_name || 'No broker'} · {inv.load_number || '—'}
                                </div>
                              </div>
                              <div className="text-right shrink-0">
                                <div className="text-sm font-medium tabular-nums" style={{ color: c.primary }}>
                                  {formatCurrency(inv.amount)}
                                </div>
                                <span
                                  className={`status-pill status-pill--${paid ? 'paid' : 'pending'} !text-[10px]`}
                                >
                                  {paid ? 'Paid' : 'Open'}
                                </span>
                              </div>
                            </div>
                            <div className="text-[11px] mt-1 tabular-nums" style={{ color: c.muted }}>
                              {formatDate(inv.invoice_date)}
                            </div>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            </div>
          )}

          {showDetail && selectedInvoice ? (
            <>
              <div
                className="min-h-0 overflow-hidden flex flex-col border-b lg:border-b-0 lg:border-r"
                style={{ borderColor: c.border }}
              >
                <InvoiceDetailPanel
                  variant="sidebar"
                  invoice={selectedInvoice}
                  clientName={selectedInvoice.client_name}
                  noteAuthorName={adminName}
                  navigationInvoices={
                    batchMode ? filteredBatchInvoices : invoices
                  }
                  onClose={batchMode ? clearSelection : handleCloseWindow}
                  onNavigateInvoice={selectInvoice}
                  onInvoiceUpdated={bump}
                  onAddNote={(invoiceId, note, options) => {
                    addAdminInvoiceNote(invoiceId, note, adminName, {
                      visibility: options?.visibility ?? 'client',
                    })
                    bump()
                    showToast(
                      options?.visibility === 'internal' ? 'Internal note added' : 'Note added',
                      'success'
                    )
                  }}
                  onRemoveNote={(invoiceId, noteId) => {
                    const updated = removeAdminInvoiceNote(invoiceId, noteId)
                    if (!updated) {
                      showToast('Only Credyx notes can be removed', 'error')
                      return false
                    }
                    bump()
                    return true
                  }}
                  payments={payments}
                  enableClientActions={false}
                  enableNotes={true}
                  portalMode="admin"
                />
              </div>
              <div
                className="min-h-0 overflow-hidden flex flex-col"
                style={{ backgroundColor: c.card }}
              >
                {renderDocsPane()}
              </div>
            </>
          ) : showList ? (
            <div className="min-h-0 overflow-hidden flex flex-col lg:col-span-2">
              {renderDocsPane()}
            </div>
          ) : selectedInvoice ? (
            <>
              <div
                className="min-h-0 overflow-hidden flex flex-col border-b lg:border-b-0 lg:border-r"
                style={{ borderColor: c.border }}
              >
                <InvoiceDetailPanel
                  variant="sidebar"
                  invoice={selectedInvoice}
                  clientName={selectedInvoice.client_name}
                  noteAuthorName={adminName}
                  navigationInvoices={invoices}
                  onClose={handleCloseWindow}
                  onNavigateInvoice={selectInvoice}
                  onInvoiceUpdated={bump}
                  onAddNote={(invoiceId, note, options) => {
                    addAdminInvoiceNote(invoiceId, note, adminName, {
                      visibility: options?.visibility ?? 'client',
                    })
                    bump()
                    showToast(
                      options?.visibility === 'internal' ? 'Internal note added' : 'Note added',
                      'success'
                    )
                  }}
                  onRemoveNote={(invoiceId, noteId) => {
                    const updated = removeAdminInvoiceNote(invoiceId, noteId)
                    if (!updated) {
                      showToast('Only Credyx notes can be removed', 'error')
                      return false
                    }
                    bump()
                    return true
                  }}
                  payments={payments}
                  enableClientActions={false}
                  enableNotes={true}
                  portalMode="admin"
                />
              </div>
              <div
                className="min-h-0 overflow-hidden flex flex-col"
                style={{ backgroundColor: c.card }}
              >
                {renderDocsPane()}
              </div>
            </>
          ) : null}
        </div>
      )}
    </div>
  )
}
