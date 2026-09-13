import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { FileText, Search, X } from 'lucide-react'
import InvoiceDetailPanel from '../components/client/InvoiceDetailPanel'
import DocumentViewer from '../components/DocumentViewer'
import EmptyState from '../components/ui/EmptyState'
import DocumentDownloadOverlay, {
  useDocumentDownloadProgress,
} from '../components/ui/DocumentDownloadOverlay'
import { useToast } from '../components/ui/ToastProvider'
import { mockInvoices } from '../data/mockInvoices'
import { mockPayments } from '../data/mockPayments'
import { addAdminInvoiceNote, removeAdminInvoiceNote } from '../services/adminInvoiceNoteActions'
import { useAuth } from '../context/AuthContext'
import { getAdminUserDisplayName } from '../config/adminNav'
import { useTenantDataRevision } from '../hooks/useTenantDataRevision'
import { useClientTheme, useTheme } from '../theme/ThemeContext'
import { formatCurrency } from '../utils/format'
import { getInvoiceAgeDays, isOpenArInvoice } from '../utils/invoiceAging'
import { invoiceHasOpenDisputedStatus } from '../utils/clientInvoiceDisputeStatus'
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
 * Broker aging pop-out: invoice list (left) + details and documents (right).
 */
export default function BrokerAgingInvoicesPopup() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { resolvedTheme } = useTheme()
  const c = useClientTheme()
  const { showToast } = useToast()
  const { resolved } = useAuth()
  const adminName = getAdminUserDisplayName(resolved.user?.email ?? null)
  const tenantRevision = useTenantDataRevision()
  const [refreshKey, setRefreshKey] = useState(0)
  const bump = () => setRefreshKey((k) => k + 1)
  const dataRevision = refreshKey + tenantRevision
  const [listSearch, setListSearch] = useState('')
  const [docs, setDocs] = useState<WorkspaceDoc[]>([])
  const [docsLoading, setDocsLoading] = useState(false)
  const docsDownloadProgress = useDocumentDownloadProgress(docsLoading)

  const brokerId = searchParams.get('broker') || ''
  const brokerNameParam = searchParams.get('name') || ''
  const clientId = searchParams.get('client') || ''
  const carrierNameParam = searchParams.get('carrier') || ''
  const invoiceParam = searchParams.get('invoice') || ''

  const invoices = useMemo(() => {
    void dataRevision
    return mockInvoices.filter((invoice) => {
      if (!isOpenArInvoice(invoice)) return false
      const brokerMatch =
        (brokerId && invoice.broker_id === brokerId) ||
        (brokerNameParam && invoice.broker_name === brokerNameParam)
      if (!brokerMatch) return false
      if (clientId && invoice.client_id !== clientId && invoice.client_name !== carrierNameParam) {
        return false
      }
      return true
    })
  }, [brokerId, brokerNameParam, clientId, carrierNameParam, dataRevision])

  const brokerName = brokerNameParam || invoices[0]?.broker_name || 'Broker'
  const carrierName = carrierNameParam || invoices[0]?.client_name
  const q = listSearch.trim().toLowerCase()
  const visible = useMemo(() => {
    if (!q) return invoices
    return invoices.filter((invoice) => {
      return (
        invoice.invoice_number.toLowerCase().includes(q) ||
        invoice.client_name.toLowerCase().includes(q) ||
        (invoice.load_number || '').toLowerCase().includes(q)
      )
    })
  }, [invoices, q])

  const selectedInvoice = useMemo(() => {
    if (!visible.length) return invoices[0] ?? null
    if (!invoiceParam) return visible[0]
    return (
      visible.find((invoice) => invoice.id === invoiceParam) ||
      invoices.find((invoice) => invoice.id === invoiceParam) ||
      visible[0]
    )
  }, [visible, invoices, invoiceParam])

  const payments = useMemo(() => [...mockPayments], [dataRevision])
  const total = invoices.reduce((sum, invoice) => sum + invoice.amount, 0)

  useEffect(() => {
    if (!selectedInvoice) return
    if (invoiceParam === selectedInvoice.id) return
    const next = new URLSearchParams(searchParams)
    next.set('invoice', selectedInvoice.id)
    setSearchParams(next, { replace: true })
  }, [selectedInvoice, invoiceParam, searchParams, setSearchParams])

  useEffect(() => {
    document.title = `${brokerName} · Broker aging · Credyx`
    return () => {
      document.title = 'Credyx'
    }
  }, [brokerName])

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
      .then((resolvedDocs) => {
        if (cancelled) return
        setDocs(
          resolvedDocs.map((doc) => ({
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

  const selectInvoiceId = useCallback(
    (id: string) => {
      const next = new URLSearchParams(searchParams)
      next.set('invoice', id)
      setSearchParams(next, { replace: true })
    },
    [searchParams, setSearchParams]
  )

  const selectInvoiceRecord = useCallback(
    (invoice: Invoice) => {
      selectInvoiceId(invoice.id)
    },
    [selectInvoiceId]
  )

  const handleClose = () => {
    if (window.opener && !window.opener.closed) {
      window.close()
      return
    }
    window.close()
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
          <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: c.secondary }}>
            Broker aging
          </p>
          <h1 className="text-sm font-semibold truncate" style={{ color: c.primary }}>
            {brokerName}
          </h1>
          <p className="text-xs mt-0.5 truncate" style={{ color: c.secondary }}>
            {carrierName ? `${carrierName} · ` : ''}
            {invoices.length} open invoice{invoices.length === 1 ? '' : 's'} · {formatCurrency(total)}
          </p>
        </div>
        <button
          type="button"
          onClick={handleClose}
          className="p-1.5 rounded border transition-colors"
          style={{ borderColor: c.border, color: c.secondary }}
          aria-label="Close window"
        >
          <X className="w-4 h-4" />
        </button>
      </header>

      {invoices.length === 0 ? (
        <div className="flex-1 flex items-center justify-center p-8">
          <EmptyState title="No open invoices" hint="This broker has no open A/R in the current filter." />
        </div>
      ) : (
        <div className="collections-workspace-grid flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[minmax(240px,300px)_minmax(360px,1fr)_minmax(320px,1fr)]">
          <aside
            className="min-h-0 overflow-hidden flex flex-col border-b lg:border-b-0 lg:border-r"
            style={{ borderColor: c.border, backgroundColor: c.card }}
          >
            <div className="shrink-0 px-3 py-2.5 border-b" style={{ borderColor: c.border }}>
              <p className="text-[11px] font-semibold uppercase tracking-wide mb-2" style={{ color: c.secondary }}>
                Invoices
              </p>
              <label className="relative block">
                <Search
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none"
                  style={{ color: c.mutedLight }}
                />
                <input
                  type="search"
                  value={listSearch}
                  onChange={(event) => setListSearch(event.target.value)}
                  placeholder="Search invoice, carrier, load…"
                  className="client-input w-full !pl-8 !py-1.5 !text-sm"
                  style={{ backgroundColor: c.surface, color: c.primary }}
                />
              </label>
            </div>
            <div className="invoice-list-scroll flex-1 min-h-0 overflow-y-auto">
              {visible.length === 0 ? (
                <p className="p-4 text-sm" style={{ color: c.secondary }}>
                  No invoices match this search.
                </p>
              ) : (
                visible.map((invoice) => {
                  const isActive = invoice.id === selectedInvoice?.id
                  const ageDays = getInvoiceAgeDays(invoice)
                  return (
                    <button
                      key={invoice.id}
                      type="button"
                      onClick={() => selectInvoiceId(invoice.id)}
                      className={`invoice-list-item ${isActive ? 'invoice-list-item--active' : ''} ${
                        ageDays >= 60 ? 'invoice-list-item--overdue' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-0.5 min-w-0">
                        <span className="text-sm font-semibold truncate" style={{ color: c.primary }}>
                          {invoice.invoice_number}
                        </span>
                        <span className="text-sm font-semibold tabular-nums shrink-0" style={{ color: c.primary }}>
                          {formatCurrency(invoice.amount)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2 text-[11px] min-w-0">
                        <span className="truncate" style={{ color: c.secondary }}>
                          {invoice.client_name}
                          {invoice.load_number ? ` · ${invoice.load_number}` : ''}
                        </span>
                        <span className="shrink-0 tabular-nums" style={{ color: c.secondary }}>
                          {ageDays}d
                        </span>
                      </div>
                      {invoiceHasOpenDisputedStatus(invoice) ? (
                        <div className="mt-1.5">
                          <span className="status-pill status-pill--overdue">Open disputed</span>
                        </div>
                      ) : invoice.status === 'hold' ? (
                        <div className="mt-1.5">
                          <span className="status-pill status-pill--hold">On hold</span>
                        </div>
                      ) : (
                        <div className="mt-1.5">
                          <span className="status-pill status-pill--open">Open</span>
                        </div>
                      )}
                    </button>
                  )
                })
              )}
            </div>
            <div className="invoice-list-footer text-[11px]" style={{ color: c.secondary }}>
              {visible.length} invoice{visible.length === 1 ? '' : 's'}
            </div>
          </aside>

          {!selectedInvoice ? (
            <div className="flex-1 flex items-center justify-center p-6 lg:col-span-2">
              <EmptyState icon={FileText} title="Select an invoice" hint="Choose a load on the left." />
            </div>
          ) : (
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

              <div className="min-h-0 overflow-hidden flex flex-col relative" style={{ backgroundColor: c.card }}>
                <DocumentDownloadOverlay
                  open={docsLoading}
                  progress={docsDownloadProgress}
                  title="Downloading documents"
                  subtitle="Fetching invoice paperwork so you can review it…"
                  variant="absolute"
                />
                {docsLoading ? (
                  <div className="flex-1 min-h-[240px]" />
                ) : docs.length === 0 ? (
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
            </>
          )}
        </div>
      )}
    </div>
  )
}
