import { useState, useEffect, useMemo, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { getClientInvoices } from '../data/clientDemoData'
import { useClientDemoSnapshot } from '../hooks/useClientDemoSnapshot'
import { useClientSession } from '../hooks/useClientSession'
import { Invoice } from '../types/invoice'
import { formatCurrency, formatDate } from '../utils/format'
import { FileText, Eye, Search, Filter, DollarSign, ChevronLeft, ChevronRight, AlertCircle } from 'lucide-react'
import DocumentViewer from '../components/DocumentViewer'
import ClientLayout from '../components/ClientLayout'
import InvoiceDetailWorkspace, {
  getInvoiceRowStatusBadge,
  InvoiceDisputeBadges,
} from '../components/client/InvoiceDetailWorkspace'
import ClientSortableHeader from '../components/client/ClientSortableHeader'
import ClientListTd from '../components/client/ClientListTd'
import { enrichInvoices, EnrichedInvoice, getDaysOutstandingColor, isOpenArInvoice, AR_POLICY } from '../utils/invoiceAging'
import { getInvoiceDocumentsForViewer } from '../services/invoiceDocumentStore'
import { useClientTheme } from '../theme/ThemeContext'
import {
  getInitialListPageSize,
  PAGE_SIZE_OPTIONS,
  type SortDir,
} from '../utils/clientListPage'

type InvoiceSortField =
  | 'invoice_number'
  | 'load_number'
  | 'broker_name'
  | 'batch_number'
  | 'amount'
  | 'invoice_date'
  | 'days_outstanding'
  | 'status'

function getSortableDaysOutstanding(invoice: EnrichedInvoice): number {
  if (!isOpenArInvoice(invoice) || invoice.status === 'force_closed') return -1
  return invoice.daysOutstanding
}

export default function ClientInvoices() {
  const c = useClientTheme()
  const { clientId, clientName } = useClientSession()
  const [searchParams, setSearchParams] = useSearchParams()
  const [highlightedInvoiceId, setHighlightedInvoiceId] = useState<string | null>(null)

  const [invoicesRefreshKey, setInvoicesRefreshKey] = useState(0)
  const { dashboard: data } = useClientDemoSnapshot(invoicesRefreshKey)

  const invoices = useMemo(
    () => getClientInvoices(clientId, clientName),
    [clientId, clientName, invoicesRefreshKey]
  )
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [showInvoiceDetailView, setShowInvoiceDetailView] = useState(false)
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null)
  const [showDocumentViewer, setShowDocumentViewer] = useState(false)
  const [viewingInvoiceDocuments, setViewingInvoiceDocuments] = useState<Invoice | null>(null)
  const [pageSize, setPageSize] = useState<number>(getInitialListPageSize)
  const [currentPage, setCurrentPage] = useState(1)
  const [sortField, setSortField] = useState<InvoiceSortField>('invoice_date')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const enrichedInvoices = useMemo(() => enrichInvoices(invoices), [invoices])

  const filteredInvoices = enrichedInvoices.filter((invoice) => {
    const matchesSearch =
      invoice.invoice_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      invoice.broker_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      invoice.load_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      invoice.batch_number?.toLowerCase().includes(searchTerm.toLowerCase())

    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'overdue' ? invoice.isOverdue : invoice.status === statusFilter)

    return matchesSearch && matchesStatus
  })

  const sortedInvoices = useMemo(() => {
    const sorted = [...filteredInvoices]
    sorted.sort((a, b) => {
      let cmp = 0
      switch (sortField) {
        case 'invoice_number':
          cmp = a.invoice_number.localeCompare(b.invoice_number, undefined, { numeric: true })
          break
        case 'load_number':
          cmp = (a.load_number ?? '').localeCompare(b.load_number ?? '', undefined, { numeric: true })
          break
        case 'broker_name':
          cmp = a.broker_name.localeCompare(b.broker_name)
          break
        case 'batch_number':
          cmp = (a.batch_number ?? '').localeCompare(b.batch_number ?? '', undefined, { numeric: true })
          break
        case 'amount':
          cmp = a.amount - b.amount
          break
        case 'invoice_date':
          cmp = new Date(a.invoice_date).getTime() - new Date(b.invoice_date).getTime()
          break
        case 'days_outstanding':
          cmp = getSortableDaysOutstanding(a) - getSortableDaysOutstanding(b)
          break
        case 'status':
          cmp = a.status.localeCompare(b.status)
          break
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
    return sorted
  }, [filteredInvoices, sortField, sortDir])

  const totalPages = Math.max(1, Math.ceil(sortedInvoices.length / pageSize))

  const paginatedInvoices = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return sortedInvoices.slice(start, start + pageSize)
  }, [sortedInvoices, currentPage, pageSize])

  const pageStart = sortedInvoices.length === 0 ? 0 : (currentPage - 1) * pageSize + 1
  const pageEnd = Math.min(currentPage * pageSize, sortedInvoices.length)

  const selectedInvoice = useMemo(
    () => enrichedInvoices.find((inv) => inv.id === selectedInvoiceId) ?? null,
    [enrichedInvoices, selectedInvoiceId]
  )

  const handleSort = useCallback(
    (field: InvoiceSortField) => {
      if (sortField === field) {
        setSortDir((dir) => (dir === 'asc' ? 'desc' : 'asc'))
      } else {
        setSortField(field)
        const defaultDesc =
          field === 'amount' || field === 'invoice_date' || field === 'days_outstanding'
        setSortDir(defaultDesc ? 'desc' : 'asc')
      }
    },
    [sortField]
  )

  useEffect(() => {
    const status = searchParams.get('status')
    const validStatuses = ['overdue', 'pending', 'approved', 'hold', 'paid', 'force_closed']
    if (status && validStatuses.includes(status)) {
      setStatusFilter(status)
      const next = new URLSearchParams(searchParams)
      next.delete('status')
      setSearchParams(next, { replace: true })
    }
  }, [searchParams, setSearchParams])

  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm, statusFilter, pageSize, sortField, sortDir])

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages)
    }
  }, [currentPage, totalPages])

  useEffect(() => {
    if (!showInvoiceDetailView || !selectedInvoiceId) return
    const stillVisible = filteredInvoices.some((inv) => inv.id === selectedInvoiceId)
    if (!stillVisible) {
      if (filteredInvoices.length > 0) {
        setSelectedInvoiceId(filteredInvoices[0].id)
      } else {
        setShowInvoiceDetailView(false)
      }
    }
  }, [filteredInvoices, selectedInvoiceId, showInvoiceDetailView])

  const handleViewInvoiceDetail = (invoice: EnrichedInvoice) => {
    setSelectedInvoiceId(invoice.id)
    setShowInvoiceDetailView(true)
  }

  const handleViewDocuments = (invoice: Invoice) => {
    setViewingInvoiceDocuments(invoice)
    setShowDocumentViewer(true)
  }

  const getDocumentsForInvoice = (invoice: Invoice) => {
    return getInvoiceDocumentsForViewer(invoice)
  }

  const overdueInvoices = enrichedInvoices.filter((inv) => inv.isOverdue)
  const overdueAmount = overdueInvoices.reduce((sum, inv) => sum + inv.amount, 0)
  const forceCloseEligible = enrichedInvoices.filter((inv) => inv.isForceCloseEligible)

  useEffect(() => {
    const highlightInvoiceId = searchParams.get('highlight_invoice')
    if (highlightInvoiceId) {
      setHighlightedInvoiceId(highlightInvoiceId)
      setSelectedInvoiceId(highlightInvoiceId)
      setShowInvoiceDetailView(true)
      const highlightIndex = sortedInvoices.findIndex((inv) => inv.id === highlightInvoiceId)
      if (highlightIndex >= 0) {
        setCurrentPage(Math.floor(highlightIndex / pageSize) + 1)
      }
      searchParams.delete('highlight_invoice')
      setSearchParams(searchParams, { replace: true })

      const timer = setTimeout(() => {
        setHighlightedInvoiceId(null)
      }, 3000)

      return () => clearTimeout(timer)
    }
  }, [searchParams, setSearchParams, sortedInvoices, pageSize])

  const inputCompactStyle = {
    backgroundColor: c.card,
    height: 34,
    paddingTop: 6,
    paddingBottom: 6,
    fontSize: 13,
  } as const

  return (
    <ClientLayout clientName={clientName} clientId={clientId} flushMain>
      <div className="client-invoices-page overflow-hidden flex flex-col min-h-0">
        <section
          className="client-stat-strip grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 border-b shrink-0"
          style={{ borderColor: c.border }}
        >
          <div
            className="flex items-center justify-between gap-2 px-4 py-2.5 sm:border-r border-b sm:border-b-0"
            style={{ backgroundColor: c.stat.blue, borderColor: c.border }}
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <FileText className="w-3.5 h-3.5 shrink-0" style={{ color: c.info }} />
              <span className="text-xs font-medium truncate client-stat-strip__label-full" style={{ color: c.secondary }}>
                Total Invoices
              </span>
              <span className="text-xs font-medium truncate client-stat-strip__label-short" style={{ color: c.secondary }}>
                Invoices
              </span>
            </div>
            <span className="text-lg font-bold tabular-nums shrink-0" style={{ color: c.primary }}>
              {enrichedInvoices.length}
            </span>
          </div>
          <div
            className="flex items-center justify-between gap-2 px-4 py-2.5 lg:border-r border-b sm:border-b-0"
            style={{ backgroundColor: c.stat.green, borderColor: c.border }}
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <DollarSign className="w-3.5 h-3.5 shrink-0" style={{ color: c.success }} />
              <span className="text-xs font-medium truncate client-stat-strip__label-full" style={{ color: c.secondary }}>
                Total Amount
              </span>
              <span className="text-xs font-medium truncate client-stat-strip__label-short" style={{ color: c.secondary }}>
                Amount
              </span>
            </div>
            <span className="text-lg font-bold tabular-nums shrink-0" style={{ color: c.primary }}>
              {formatCurrency(enrichedInvoices.reduce((sum, inv) => sum + inv.amount, 0))}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setStatusFilter(statusFilter === 'overdue' ? 'all' : 'overdue')}
            className="flex items-center justify-between gap-2 px-4 py-2.5 sm:border-r border-b lg:border-b-0 text-left transition-colors hover:opacity-90"
            style={{
              backgroundColor: statusFilter === 'overdue' ? c.stat.redActive : c.stat.red,
              borderColor: c.border,
            }}
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" style={{ color: c.error }} />
              <span className="text-xs font-medium truncate client-stat-strip__label-long" style={{ color: c.secondary }}>
                Overdue (15+ days past expected pay)
              </span>
              <span className="text-xs font-medium truncate client-stat-strip__label-short" style={{ color: c.secondary }}>
                Overdue
              </span>
            </div>
            <span className="text-lg font-bold tabular-nums shrink-0" style={{ color: c.error }}>
              {overdueInvoices.length}
            </span>
          </button>
          <div
            className="flex flex-col justify-center gap-0.5 px-4 py-2.5"
            style={{ backgroundColor: c.stat.amber }}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <DollarSign className="w-3.5 h-3.5 shrink-0" style={{ color: c.warning }} />
                <span className="text-xs font-medium truncate client-stat-strip__label-full" style={{ color: c.secondary }}>
                  Overdue Amount
                </span>
                <span className="text-xs font-medium truncate client-stat-strip__label-short" style={{ color: c.secondary }}>
                  Ovd Amt
                </span>
              </div>
              <span className="text-lg font-bold tabular-nums shrink-0" style={{ color: c.primary }}>
                {formatCurrency(overdueAmount)}
              </span>
            </div>
            {forceCloseEligible.length > 0 && (
              <p className="text-[11px] tabular-nums" style={{ color: '#7C3AED' }}>
                {forceCloseEligible.length} at {AR_POLICY.forceCloseDays}+ days past expected pay
              </p>
            )}
          </div>
        </section>

        <div
          className="client-page-toolbar px-4 py-2 border-b shrink-0"
          style={{ borderColor: c.border, backgroundColor: c.card }}
        >
          <div className="flex flex-col md:flex-row md:items-center gap-2">
            <div className="flex-1 relative">
              <Search
                className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5"
                style={{ color: c.secondary }}
              />
              <input
                type="text"
                placeholder="Search invoices..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="client-input pl-8"
                style={inputCompactStyle}
              />
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Filter className="w-3.5 h-3.5" style={{ color: c.secondary }} />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="client-input w-full md:w-auto min-w-[120px]"
                style={inputCompactStyle}
              >
                <option value="all">All Status</option>
                <option value="overdue">Overdue</option>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="hold">On Hold</option>
                <option value="paid">Paid</option>
                <option value="force_closed">Force Closed</option>
              </select>
            </div>
          </div>
        </div>

        {sortedInvoices.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-center py-6 px-4">
            <div>
              <FileText className="w-10 h-10 mx-auto mb-3" style={{ color: c.mutedLight }} />
              <p className="text-base font-medium mb-1" style={{ color: c.primary }}>
                No invoices found
              </p>
              <p className="text-sm" style={{ color: c.secondary }}>
                {searchTerm || statusFilter !== 'all'
                  ? 'Try adjusting your search or filters'
                  : 'Your invoices will appear here'}
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="client-table-scroll client-table-scroll--mobile-stack flex-1 min-h-0 overflow-y-auto overflow-x-auto">
              <table className="dashboard-table dashboard-table--compact">
                <thead>
                  <tr>
                    <ClientSortableHeader
                      field="invoice_number"
                      label="Invoice#"
                      sortField={sortField}
                      sortDir={sortDir}
                      onSort={handleSort}
                    />
                    <ClientSortableHeader
                      field="load_number"
                      label="Load#"
                      sortField={sortField}
                      sortDir={sortDir}
                      onSort={handleSort}
                    />
                    <ClientSortableHeader
                      field="broker_name"
                      label="Broker"
                      sortField={sortField}
                      sortDir={sortDir}
                      onSort={handleSort}
                    />
                    <ClientSortableHeader
                      field="batch_number"
                      label="Batch#"
                      sortField={sortField}
                      sortDir={sortDir}
                      onSort={handleSort}
                    />
                    <ClientSortableHeader
                      field="amount"
                      label="Amount"
                      sortField={sortField}
                      sortDir={sortDir}
                      onSort={handleSort}
                      className="text-right"
                      align="right"
                    />
                    <ClientSortableHeader
                      field="invoice_date"
                      label="Invoice Date"
                      sortField={sortField}
                      sortDir={sortDir}
                      onSort={handleSort}
                    />
                    <ClientSortableHeader
                      field="days_outstanding"
                      label="Days Out"
                      sortField={sortField}
                      sortDir={sortDir}
                      onSort={handleSort}
                      className="text-right"
                      align="right"
                    />
                    <ClientSortableHeader
                      field="status"
                      label="Status"
                      sortField={sortField}
                      sortDir={sortDir}
                      onSort={handleSort}
                    />
                    <th className="text-center">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedInvoices.map((invoice) => {
                    const isHighlighted = highlightedInvoiceId === invoice.id
                    return (
                      <tr
                        key={invoice.id}
                        className={`cursor-pointer ${isHighlighted ? 'batch-highlight-row' : ''} ${
                          invoice.isForceCloseEligible
                            ? 'invoice-row--force-close'
                            : invoice.isOverdue
                              ? 'invoice-row--overdue'
                              : ''
                        }`}
                        onClick={() => handleViewInvoiceDetail(invoice)}
                      >
                        <ClientListTd variant="primary" className="font-semibold">
                          {invoice.invoice_number}
                        </ClientListTd>
                        <ClientListTd variant="desktop" label="Load#" style={{ color: c.secondary }}>
                          {invoice.load_number || '-'}
                        </ClientListTd>
                        <ClientListTd variant="meta" className="truncate">
                          {invoice.broker_name}
                        </ClientListTd>
                        <ClientListTd variant="desktop" label="Batch#" style={{ color: c.secondary }}>
                          {invoice.batch_number || '-'}
                        </ClientListTd>
                        <ClientListTd variant="amount" className="text-right font-medium tabular-nums">
                          {formatCurrency(invoice.amount)}
                        </ClientListTd>
                        <ClientListTd variant="desktop" label="Invoice Date" style={{ color: c.secondary }}>
                          {formatDate(invoice.invoice_date)}
                        </ClientListTd>
                        <ClientListTd variant="desktop" label="Days Out" className="text-right tabular-nums">
                          {!isOpenArInvoice(invoice) || invoice.status === 'force_closed' ? (
                            <span style={{ color: c.mutedLight }}>—</span>
                          ) : (
                            <span
                              className="text-sm font-semibold"
                              style={{
                                color: invoice.isOverdue
                                  ? getDaysOutstandingColor(invoice.overdueSeverity)
                                  : c.secondary,
                              }}
                            >
                              {invoice.daysOutstanding}d
                              {invoice.isForceCloseEligible && (
                                <span className="block text-[10px] font-medium" style={{ color: '#7C3AED' }}>
                                  FC
                                </span>
                              )}
                            </span>
                          )}
                        </ClientListTd>
                        <ClientListTd variant="status">
                          <div className="inline-flex items-center gap-1 flex-nowrap min-w-0">
                            {getInvoiceRowStatusBadge(invoice)}
                            <InvoiceDisputeBadges invoice={invoice} />
                            {invoice.isForceCloseEligible && (
                              <span className="status-pill status-pill--hold text-[10px]">Force Close</span>
                            )}
                          </div>
                        </ClientListTd>
                        <ClientListTd variant="actions" className="text-center">
                          <div className="inline-flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleViewInvoiceDetail(invoice)
                              }}
                              className="p-1.5 rounded-lg transition-colors hover:bg-slate-100"
                              style={{ color: c.info }}
                              title="View Details"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            {(invoice.documents_count || 0) > 0 && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleViewDocuments(invoice)
                                }}
                                className="p-1.5 rounded-lg transition-colors client-icon-btn"
                                style={{ color: c.info }}
                                title="View Documents"
                              >
                                <FileText className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </ClientListTd>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div
              className="client-page-footer flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-4 py-2 border-t shrink-0"
              style={{ borderColor: c.border, backgroundColor: c.card }}
            >
              <p className="text-xs font-medium" style={{ color: c.secondary }}>
                Showing {pageStart}–{pageEnd} of {sortedInvoices.length}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-1.5 text-xs font-medium" style={{ color: c.secondary }}>
                  Rows
                  <select
                    value={pageSize}
                    onChange={(e) => setPageSize(Number(e.target.value))}
                    className="client-input"
                    style={{
                      backgroundColor: c.card,
                      height: 30,
                      paddingTop: 4,
                      paddingBottom: 4,
                      fontSize: 12,
                      width: 64,
                    }}
                  >
                    {PAGE_SIZE_OPTIONS.map((size) => (
                      <option key={size} value={size}>
                        {size}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage <= 1}
                    className="table-page-btn"
                    aria-label="Previous page"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-xs font-medium px-2 tabular-nums" style={{ color: c.primary }}>
                    {currentPage} / {totalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage >= totalPages}
                    className="table-page-btn"
                    aria-label="Next page"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      <InvoiceDetailWorkspace
        isOpen={showInvoiceDetailView}
        onClose={() => setShowInvoiceDetailView(false)}
        invoices={filteredInvoices}
        selectedInvoice={selectedInvoice}
        onSelectInvoice={(invoice) => setSelectedInvoiceId(invoice.id)}
        onViewDocuments={handleViewDocuments}
        highlightedInvoiceId={highlightedInvoiceId}
        clientName={data.client_name}
        onInvoiceUpdated={() => setInvoicesRefreshKey((key) => key + 1)}
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
      />

      {showDocumentViewer && viewingInvoiceDocuments && (
        <DocumentViewer
          isOpen={showDocumentViewer}
          onClose={() => {
            setShowDocumentViewer(false)
            setViewingInvoiceDocuments(null)
          }}
          documents={getDocumentsForInvoice(viewingInvoiceDocuments)}
          invoiceNumber={viewingInvoiceDocuments.invoice_number}
          title="View Documents"
        />
      )}
    </ClientLayout>
  )
}
