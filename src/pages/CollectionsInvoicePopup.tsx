import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ExternalLink, FileText, X } from 'lucide-react'
import CollectionsWorkspaceInvoiceList from '../components/collections/CollectionsWorkspaceInvoiceList'
import InvoiceDetailPanel from '../components/client/InvoiceDetailPanel'
import DocumentViewer from '../components/DocumentViewer'
import EmptyState from '../components/ui/EmptyState'
import { useToast } from '../components/ui/ToastProvider'
import { mockBrokers } from '../data/mockBrokers'
import { mockInvoices } from '../data/mockInvoices'
import { mockPayments } from '../data/mockPayments'
import { useAuth } from '../context/AuthContext'
import { getAdminUserDisplayName } from '../config/adminNav'
import { addAdminInvoiceNote, removeAdminInvoiceNote } from '../services/adminInvoiceNoteActions'
import { useTenantDataRevision } from '../hooks/useTenantDataRevision'
import { useClientTheme, useTheme } from '../theme/ThemeContext'
import { buildAdminCollectionsRows, type AdminCollectionsRow } from '../utils/adminCollections'
import { formatCurrency } from '../utils/format'
import { readCollectionsWorkspaceList } from '../utils/openCollectionsInvoiceWindow'
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

/**
 * Collections pop-out: same queue as the Collections table (left) + documents (right).
 */
export default function CollectionsInvoicePopup() {
  const { invoiceId = '' } = useParams()
  const navigate = useNavigate()
  const { resolvedTheme } = useTheme()
  const c = useClientTheme()
  const { showToast } = useToast()
  const { resolved } = useAuth()
  const adminName = getAdminUserDisplayName(resolved.user?.email ?? null)
  const tenantRevision = useTenantDataRevision()
  const [refreshKey, setRefreshKey] = useState(0)
  const bump = () => setRefreshKey((k) => k + 1)
  const [listSearch, setListSearch] = useState('')
  const [docs, setDocs] = useState<WorkspaceDoc[]>([])
  const [docsLoading, setDocsLoading] = useState(false)
  const dataRevision = refreshKey + tenantRevision

  const storedIds = useMemo(() => readCollectionsWorkspaceList(), [invoiceId, dataRevision])

  const allRows = useMemo(
    () => buildAdminCollectionsRows(mockInvoices, mockPayments, mockBrokers),
    [dataRevision]
  )

  const payments = useMemo(() => [...mockPayments], [dataRevision])

  const queueRows = useMemo(() => {
    if (!storedIds.length) return allRows
    const byId = new Map(allRows.map((row) => [row.invoice.id, row]))
    const ordered = storedIds
      .map((id) => byId.get(id))
      .filter((row): row is AdminCollectionsRow => row != null)
    // Keep the clicked invoice even if filters dropped it from the live queue.
    const selected = allRows.find(
      (row) => row.invoice.id === invoiceId || row.invoice.invoice_number === invoiceId
    )
    if (selected && !ordered.some((row) => row.invoice.id === selected.invoice.id)) {
      return [selected, ...ordered]
    }
    return ordered.length ? ordered : allRows
  }, [allRows, storedIds, invoiceId])

  const visibleRows = useMemo(() => {
    const q = listSearch.trim().toLowerCase()
    if (!q) return queueRows
    return queueRows.filter((row) => {
      const inv = row.invoice
      return (
        inv.invoice_number.toLowerCase().includes(q) ||
        inv.client_name.toLowerCase().includes(q) ||
        inv.broker_name.toLowerCase().includes(q) ||
        (inv.load_number || '').toLowerCase().includes(q)
      )
    })
  }, [queueRows, listSearch])

  const selectedRow = useMemo(() => {
    const fromQueue =
      queueRows.find((row) => row.invoice.id === invoiceId) ||
      queueRows.find((row) => row.invoice.invoice_number === invoiceId)
    if (fromQueue) return fromQueue
    return (
      allRows.find((row) => row.invoice.id === invoiceId) ||
      allRows.find((row) => row.invoice.invoice_number === invoiceId) ||
      queueRows[0] ||
      null
    )
  }, [queueRows, allRows, invoiceId])

  const selectedInvoice = useMemo(() => {
    const fromRow = selectedRow?.invoice
    if (!fromRow) return null
    return mockInvoices.find((inv) => inv.id === fromRow.id) ?? fromRow
  }, [selectedRow, dataRevision])

  useEffect(() => {
    const label = selectedInvoice?.invoice_number || 'Invoice'
    document.title = `${label} · Credyx Collections`
    return () => {
      document.title = 'Credyx'
    }
  }, [selectedInvoice?.invoice_number])

  useEffect(() => {
    if (!selectedInvoice) {
      setDocs([])
      setDocsLoading(false)
      return
    }

    let cancelled = false
    setDocsLoading(true)
    setDocs([])

    void resolveInvoiceDocumentsAsync(selectedInvoice)
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
  }, [selectedInvoice, dataRevision])

  const selectInvoice = useCallback(
    (id: string) => {
      if (id === invoiceId) return
      navigate(`/collections/invoice/${encodeURIComponent(id)}`, { replace: true })
    },
    [invoiceId, navigate]
  )

  const selectInvoiceRecord = useCallback(
    (invoice: Invoice) => {
      selectInvoice(invoice.id)
    },
    [selectInvoice]
  )

  const handleClose = () => {
    if (window.opener && !window.opener.closed) {
      window.close()
      return
    }
    navigate('/collections', { replace: true })
  }

  const expectedDocCount = selectedInvoice?.documents_count ?? 0

  return (
    <div
      className="client-portal collections-workspace h-screen w-screen overflow-hidden flex flex-col"
      data-theme={resolvedTheme}
      style={{ backgroundColor: c.surface, color: c.primary }}
    >
      <header
        className="flex items-center justify-between gap-3 px-4 py-2.5 border-b shrink-0"
        style={{ borderColor: c.border, backgroundColor: c.card }}
      >
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide" style={{ color: c.secondary }}>
            Collections workspace
          </p>
          <p className="text-sm font-semibold truncate" style={{ color: c.primary }}>
            {selectedInvoice
              ? `${selectedInvoice.invoice_number} · ${selectedInvoice.client_name} · ${formatCurrency(selectedRow?.amount ?? selectedInvoice.amount)}`
              : 'No invoice selected'}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link
            to="/collections"
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
            onClick={handleClose}
            className="p-1.5 rounded border transition-colors"
            style={{ borderColor: c.border, color: c.secondary }}
            aria-label="Close window"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </header>

      {!selectedInvoice ? (
        <div className="flex-1 flex items-center justify-center p-8">
          <EmptyState
            icon={FileText}
            title="Invoice not found"
            hint="Open an invoice from the Collections list, then try Pop out again."
          />
        </div>
      ) : (
        <div className="collections-workspace-grid flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[minmax(240px,300px)_minmax(360px,1fr)_minmax(320px,1fr)]">
          <div
            className="min-h-0 overflow-hidden flex flex-col border-b lg:border-b-0 lg:border-r"
            style={{ borderColor: c.border }}
          >
            <CollectionsWorkspaceInvoiceList
              rows={visibleRows}
              selectedId={selectedInvoice.id}
              search={listSearch}
              onSearchChange={setListSearch}
              onSelect={selectInvoice}
            />
          </div>

          <div
            className="min-h-0 overflow-hidden flex flex-col border-b lg:border-b-0 lg:border-r"
            style={{ borderColor: c.border }}
          >
            <InvoiceDetailPanel
              variant="sidebar"
              invoice={selectedInvoice}
              clientName={selectedInvoice.client_name}
              noteAuthorName={adminName}
              navigationInvoices={queueRows.map((row) => row.invoice)}
              onClose={handleClose}
              onNavigateInvoice={selectInvoiceRecord}
              onInvoiceUpdated={bump}
              onAddNote={(id, note, options) => {
                addAdminInvoiceNote(id, note, adminName, {
                  visibility: options?.visibility ?? 'client',
                })
                bump()
                showToast(
                  options?.visibility === 'internal' ? 'Internal note added' : 'Note added',
                  'success'
                )
              }}
              onRemoveNote={(id, noteId) => {
                const updated = removeAdminInvoiceNote(id, noteId)
                if (!updated) {
                  showToast('Only Credyx notes can be removed', 'error')
                  return false
                }
                bump()
                return true
              }}
              payments={payments}
              enableClientActions={false}
              enableNotes
              portalMode="admin"
              detailTabs="details_notes"
              hidePanelChrome
            />
          </div>

          <div className="min-h-0 overflow-hidden flex flex-col" style={{ backgroundColor: c.card }}>
            {docsLoading ? (
              <div
                className="flex-1 flex items-center justify-center text-sm"
                style={{ color: c.secondary }}
              >
                Loading documents…
              </div>
            ) : docs.length === 0 ? (
              <div className="flex-1 flex items-center justify-center p-6">
                <EmptyState
                  icon={FileText}
                  title={expectedDocCount > 0 ? 'Documents unavailable' : 'No documents'}
                  hint={
                    expectedDocCount > 0
                      ? 'This invoice lists documents, but the files could not be loaded. Open the batch to reattach or re-upload them.'
                      : 'Documents attached to this invoice will appear here.'
                  }
                />
              </div>
            ) : (
              <DocumentViewer
                isOpen
                layout="pane"
                onClose={() => undefined}
                documents={docs}
                invoiceNumber={selectedInvoice.invoice_number}
                title="Documents"
              />
            )}
          </div>
        </div>
      )}
    </div>
  )
}
