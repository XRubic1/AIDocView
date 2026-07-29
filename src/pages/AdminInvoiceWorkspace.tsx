import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ExternalLink, FileText, X } from 'lucide-react'
import InvoiceDetailPanel from '../components/client/InvoiceDetailPanel'
import DocumentViewer from '../components/DocumentViewer'
import EmptyState from '../components/ui/EmptyState'
import { useToast } from '../components/ui/ToastProvider'
import { mockInvoices } from '../data/mockInvoices'
import { mockPayments } from '../data/mockPayments'
import { addAdminInvoiceNote } from '../services/adminInvoiceNoteActions'
import { useClientTheme, useTheme } from '../theme/ThemeContext'
import { useTenantDataRevision } from '../hooks/useTenantDataRevision'
import { useAuth } from '../context/AuthContext'
import { getAdminUserDisplayName } from '../config/adminNav'
import { enrichAdminInvoices } from '../utils/adminInvoiceQueue'
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
 * Standalone pop-out window: invoice detail (left) + document viewer (right).
 * Opened via `openAdminInvoiceWorkspace` from the Invoices dashboard.
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
  const selectedInvoice = useMemo(() => {
    if (!invoices.length) return null
    if (!invoiceParam) return invoices[0]
    return (
      invoices.find((inv) => inv.id === invoiceParam) ||
      invoices.find((inv) => inv.invoice_number === invoiceParam) ||
      invoices[0]
    )
  }, [invoices, invoiceParam])

  const [docs, setDocs] = useState<WorkspaceDoc[]>([])
  const [docsLoading, setDocsLoading] = useState(false)

  // Keep URL in sync with the active invoice.
  useEffect(() => {
    if (!selectedInvoice) return
    if (invoiceParam === selectedInvoice.id) return
    setSearchParams({ invoice: selectedInvoice.id }, { replace: true })
  }, [selectedInvoice, invoiceParam, setSearchParams])

  useEffect(() => {
    const label = selectedInvoice
      ? `Invoice ${selectedInvoice.invoice_number} · Documents`
      : 'Invoice workspace'
    document.title = `${label} · Credyx`
  }, [selectedInvoice])

  // Resolve real PDF/files from batch store or Supabase (not placeholder stubs).
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
    (invoice: Invoice) => {
      setSearchParams({ invoice: invoice.id }, { replace: true })
    },
    [setSearchParams]
  )

  const handleCloseWindow = () => {
    window.close()
  }

  const expectedDocCount = selectedInvoice?.documents_count ?? 0

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
            Invoice workspace
          </p>
          <p className="text-sm font-semibold truncate" style={{ color: c.primary }}>
            {selectedInvoice
              ? `${selectedInvoice.invoice_number} · ${selectedInvoice.client_name}`
              : 'No invoice selected'}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link
            to={
              selectedInvoice
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

      {!selectedInvoice ? (
        <div className="flex-1 flex items-center justify-center p-8">
          <EmptyState
            icon={FileText}
            title="No invoices available"
            hint="Open an invoice from the Invoices dashboard, then use Pop out again."
          />
        </div>
      ) : (
        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-2">
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
              payments={payments}
              enableClientActions={false}
              enableNotes={true}
              portalMode="admin"
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
