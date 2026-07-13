import { useState, useEffect, useMemo, useCallback, type CSSProperties } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { FileText, Search, Filter, DollarSign, ChevronLeft, ChevronRight, AlertCircle } from 'lucide-react'
import AdminLayout from '../components/AdminLayout'
import DocumentViewer from '../components/DocumentViewer'
import {
  getInvoiceRowStatusBadge,
  InvoiceDisputeBadges,
} from '../components/client/InvoiceDetailWorkspace'
import InvoiceDetailPanel from '../components/client/InvoiceDetailPanel'
import ClientSortableHeader from '../components/client/ClientSortableHeader'
import ClientListTd from '../components/client/ClientListTd'
import { mockInvoices } from '../data/mockInvoices'
import { mockPayments } from '../data/mockPayments'
import { Invoice } from '../types/invoice'
import { formatCurrency, formatDate } from '../utils/format'
import {
  enrichInvoices,
  EnrichedInvoice,
  getDaysOutstandingColor,
  isOpenArInvoice,
  AR_POLICY,
} from '../utils/invoiceAging'
import { getInvoiceDocumentsForViewer } from '../services/invoiceDocumentStore'
import { useClientTheme } from '../theme/ThemeContext'
import { useCompactDetailViewport } from '../hooks/useIsMobileViewport'
import { useResizableSplitPane } from '../hooks/useResizableSplitPane'
import {
  getInitialListPageSize,
  PAGE_SIZE_OPTIONS,
  type SortDir,
} from '../utils/clientListPage'
import { getAwaitingReceiptPaymentForInvoice } from '../utils/paymentStatus'
import { getAdminInvoiceAttention } from '../utils/adminInvoiceAttention'
import {
  getClientInvoiceStatusParts,
  getClientPostedPendingTotal,
  getInvoiceBalanceState,
  getInvoiceReceivedAmount,
  type InvoiceBalanceState,
} from '../utils/paymentVariance'

type InvoiceSortField =
  | 'invoice_number'
  | 'load_number'
  | 'client_name'
  | 'broker_name'
  | 'batch_number'
  | 'amount'
  | 'balance'
  | 'invoice_date'
  | 'days_outstanding'
  | 'status'

/** Open balance display — remaining due, $0 when settled, +overage when overpaid. */
function formatInvoiceOpenBalance(
  balance: InvoiceBalanceState,
  mutedColor: string,
  textColor: string
): { text: string; color: string } {
  switch (balance.tone) {
    case 'over':
      return { text: `+${formatCurrency(Math.abs(balance.signedBalance))}`, color: '#16a34a' }
    case 'zero':
      return { text: formatCurrency(0), color: mutedColor }
    case 'short':
      return { text: formatCurrency(balance.signedBalance), color: '#dc2626' }
    case 'open':
    default:
      return { text: formatCurrency(balance.signedBalance), color: textColor }
  }
}

function getSortableInvoiceAge(invoice: EnrichedInvoice): number {
  return invoice.invoiceAgeDays
}

/** Resolve deep-link param to an invoice (id or invoice number). */
function findInvoiceByParam(invoices: EnrichedInvoice[], param: string): EnrichedInvoice | undefined {
  const normalized = param.trim()
  if (!normalized) return undefined
  return (
    invoices.find((inv) => inv.id === normalized) ??
    invoices.find((inv) => inv.invoice_number.toLowerCase() === normalized.toLowerCase())
  )
}

export default function InvoiceSearch() {
  const c = useClientTheme()
  const navigate = useNavigate()
  const useFullPageDetail = useCompactDetailViewport()
  const { workspaceRef, detailWidth, isResizing, resizeHandleProps } = useResizableSplitPane()
  const [searchParams, setSearchParams] = useSearchParams()
  const [highlightedInvoiceId, setHighlightedInvoiceId] = useState<string | null>(null)

  const [invoicesRefreshKey, setInvoicesRefreshKey] = useState(0)
  const invoices = useMemo(() => [...mockInvoices], [invoicesRefreshKey])
  const payments = useMemo(() => [...mockPayments], [invoicesRefreshKey])

  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [showInvoiceDetail, setShowInvoiceDetail] = useState(false)
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null)
  const [detailPanelClosing, setDetailPanelClosing] = useState(false)
  const [showDocumentViewer, setShowDocumentViewer] = useState(false)
  const [viewingInvoiceDocuments, setViewingInvoiceDocuments] = useState<Invoice | null>(null)
  const [pageSize, setPageSize] = useState<number>(getInitialListPageSize)
  const [currentPage, setCurrentPage] = useState(1)
  const [sortField, setSortField] = useState<InvoiceSortField>('invoice_date')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const handleViewPaymentForInvoice = useCallback(
    (paymentId: string) => {
      navigate(`/payment-posting?paymentId=${encodeURIComponent(paymentId)}`)
    },
    [navigate]
  )

  const enrichedInvoices = useMemo(() => enrichInvoices(invoices), [invoices])

  const invoiceBalanceById = useMemo(() => {
    const map = new Map<string, InvoiceBalanceState>()
    for (const invoice of enrichedInvoices) {
      const received = getInvoiceReceivedAmount(invoice, payments)
      map.set(invoice.id, getInvoiceBalanceState(invoice.amount, received))
    }
    return map
  }, [enrichedInvoices, payments])

  const invoicePendingById = useMemo(() => {
    const map = new Map<string, { pending: number; confirmed: number }>()
    for (const invoice of enrichedInvoices) {
      map.set(invoice.id, {
        pending: getClientPostedPendingTotal(invoice.id, payments),
        confirmed: getInvoiceReceivedAmount(invoice, payments),
      })
    }
    return map
  }, [enrichedInvoices, payments])

  const filteredInvoices = enrichedInvoices.filter((invoice) => {
    const q = searchTerm.toLowerCase()
    const matchesSearch =
      !q ||
      invoice.invoice_number.toLowerCase().includes(q) ||
      invoice.client_name.toLowerCase().includes(q) ||
      invoice.broker_name.toLowerCase().includes(q) ||
      invoice.load_number?.toLowerCase().includes(q) ||
      invoice.batch_number?.toLowerCase().includes(q)

    const balance =
      invoiceBalanceById.get(invoice.id) ?? getInvoiceBalanceState(invoice.amount, 0)
    const pendingInfo = invoicePendingById.get(invoice.id)
    const { status: displayStatus } = getClientInvoiceStatusParts(invoice, balance, {
      pendingClientPosted: pendingInfo?.pending,
      confirmedReceived: pendingInfo?.confirmed,
      invoiceAmount: invoice.amount,
    })

    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'overdue'
        ? invoice.isOverdue
        : statusFilter === 'approved' || statusFilter === 'paid'
          ? displayStatus === statusFilter
          : invoice.status === statusFilter)

    return matchesSearch && matchesStatus
  })

  const sortedInvoices = useMemo(() => {
    const sorted = [...filteredInvoices]
    sorted.sort((a, b) => {
      const aAttention = getAdminInvoiceAttention(a, payments).needsAttention ? 0 : 1
      const bAttention = getAdminInvoiceAttention(b, payments).needsAttention ? 0 : 1
      if (aAttention !== bAttention) return aAttention - bAttention

      let cmp = 0
      switch (sortField) {
        case 'invoice_number':
          cmp = a.invoice_number.localeCompare(b.invoice_number, undefined, { numeric: true })
          break
        case 'load_number':
          cmp = (a.load_number ?? '').localeCompare(b.load_number ?? '', undefined, { numeric: true })
          break
        case 'client_name':
          cmp = a.client_name.localeCompare(b.client_name)
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
        case 'balance': {
          const aBal = invoiceBalanceById.get(a.id)?.signedBalance ?? a.amount
          const bBal = invoiceBalanceById.get(b.id)?.signedBalance ?? b.amount
          cmp = aBal - bBal
          break
        }
        case 'invoice_date':
          cmp = new Date(a.invoice_date).getTime() - new Date(b.invoice_date).getTime()
          break
        case 'days_outstanding':
          cmp = getSortableInvoiceAge(a) - getSortableInvoiceAge(b)
          break
        case 'status':
          cmp = a.status.localeCompare(b.status)
          break
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
    return sorted
  }, [filteredInvoices, sortField, sortDir, invoiceBalanceById, payments])

  const totalPages = Math.max(1, Math.ceil(sortedInvoices.length / pageSize))

  const paginatedInvoices = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return sortedInvoices.slice(start, start + pageSize)
  }, [sortedInvoices, currentPage, pageSize])

  const pageStart = sortedInvoices.length === 0 ? 0 : (currentPage - 1) * pageSize + 1
  const pageEnd = Math.min(currentPage * pageSize, sortedInvoices.length)

  const selectedInvoice = useMemo(
    () => sortedInvoices.find((inv) => inv.id === selectedInvoiceId) ?? null,
    [sortedInvoices, selectedInvoiceId]
  )

  const detailPanelOpen = Boolean(selectedInvoice) && !detailPanelClosing

  const handleSort = useCallback(
    (field: InvoiceSortField) => {
      if (sortField === field) {
        setSortDir((dir) => (dir === 'asc' ? 'desc' : 'asc'))
      } else {
        setSortField(field)
        const defaultDesc =
          field === 'amount' ||
          field === 'balance' ||
          field === 'invoice_date' ||
          field === 'days_outstanding'
        setSortDir(defaultDesc ? 'desc' : 'asc')
      }
    },
    [sortField]
  )

  useEffect(() => {
    const status = searchParams.get('status')
    const validStatuses = [
      'overdue',
      'pending',
      'approved',
      'hold',
      'paid',
      'rejected',
      'force_closed',
      'written_off',
      'write_off_pending',
    ]
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
    if (!selectedInvoiceId) return
    const stillVisible = sortedInvoices.some((inv) => inv.id === selectedInvoiceId)
    if (!stillVisible) {
      if (sortedInvoices.length > 0 && (showInvoiceDetail || !useFullPageDetail)) {
        setSelectedInvoiceId(sortedInvoices[0].id)
      } else {
        setShowInvoiceDetail(false)
        setSelectedInvoiceId(null)
      }
    }
  }, [sortedInvoices, selectedInvoiceId, showInvoiceDetail, useFullPageDetail])

  const handleViewInvoiceDetail = (invoice: EnrichedInvoice) => {
    setDetailPanelClosing(false)
    setSelectedInvoiceId(invoice.id)
    if (useFullPageDetail) setShowInvoiceDetail(true)
  }

  const handleCloseInvoiceDetail = useCallback(() => {
    if (useFullPageDetail) {
      setShowInvoiceDetail(false)
      setSelectedInvoiceId(null)
      setDetailPanelClosing(false)
      return
    }

    if (!selectedInvoice) return

    setDetailPanelClosing(true)
    window.setTimeout(() => {
      setSelectedInvoiceId(null)
      setDetailPanelClosing(false)
      setShowInvoiceDetail(false)
    }, 400)
  }, [useFullPageDetail, selectedInvoice])

  const handleViewDocuments = (invoice: Invoice) => {
    setViewingInvoiceDocuments(invoice)
    setShowDocumentViewer(true)
  }

  const overdueInvoices = enrichedInvoices.filter((inv) => inv.isOverdue)
  const overdueAmount = overdueInvoices.reduce((sum, inv) => sum + inv.amount, 0)
  const forceCloseEligible = enrichedInvoices.filter((inv) => inv.isForceCloseEligible)

  // Deep-link: ?invoice=<id|invoice_number>
  useEffect(() => {
    const invoiceParam = searchParams.get('invoice')
    if (!invoiceParam || enrichedInvoices.length === 0) return

    const match = findInvoiceByParam(enrichedInvoices, invoiceParam)
    if (!match) return

    setStatusFilter('all')
    setSearchTerm('')
    setHighlightedInvoiceId(match.id)
    setSelectedInvoiceId(match.id)
    setDetailPanelClosing(false)
    if (useFullPageDetail) setShowInvoiceDetail(true)

    const next = new URLSearchParams(searchParams)
    next.delete('invoice')
    setSearchParams(next, { replace: true })

    const timer = setTimeout(() => setHighlightedInvoiceId(null), 3000)
    return () => clearTimeout(timer)
  }, [searchParams, setSearchParams, enrichedInvoices, useFullPageDetail])

  // Keep highlighted deep-link row on the visible page once filters settle
  useEffect(() => {
    if (!highlightedInvoiceId) return
    const idx = sortedInvoices.findIndex((inv) => inv.id === highlightedInvoiceId)
    if (idx >= 0) {
      setCurrentPage(Math.floor(idx / pageSize) + 1)
    }
  }, [highlightedInvoiceId, sortedInvoices, pageSize])

  const inputCompactStyle = {
    backgroundColor: c.card,
    height: 34,
    paddingTop: 6,
    paddingBottom: 6,
    fontSize: 13,
  } as const

  const invoiceDetailPanelProps = selectedInvoice
    ? {
        invoice: selectedInvoice,
        clientName: selectedInvoice.client_name,
        navigationInvoices: sortedInvoices,
        onClose: handleCloseInvoiceDetail,
        onNavigateInvoice: (invoice: Invoice) => handleViewInvoiceDetail(invoice as EnrichedInvoice),
        onViewDocuments: () => handleViewDocuments(selectedInvoice),
        onInvoiceUpdated: () => setInvoicesRefreshKey((key) => key + 1),
        enableClientActions: false,
        payments,
        onViewPayment: handleViewPaymentForInvoice,
      }
    : null

  return (
    <AdminLayout userName="Admin User" userRole="Administrator" flushMain>
      <div className="client-invoices-page admin-invoice-search-page overflow-hidden flex flex-col min-h-0">
        {useFullPageDetail && showInvoiceDetail && selectedInvoice && invoiceDetailPanelProps ? (
          <InvoiceDetailPanel variant="mobile" {...invoiceDetailPanelProps} />
        ) : (
          <>
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
                  <span
                    className="text-xs font-medium truncate client-stat-strip__label-full"
                    style={{ color: c.secondary }}
                  >
                    Total Invoices
                  </span>
                  <span
                    className="text-xs font-medium truncate client-stat-strip__label-short"
                    style={{ color: c.secondary }}
                  >
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
                  <span
                    className="text-xs font-medium truncate client-stat-strip__label-full"
                    style={{ color: c.secondary }}
                  >
                    Total Amount
                  </span>
                  <span
                    className="text-xs font-medium truncate client-stat-strip__label-short"
                    style={{ color: c.secondary }}
                  >
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
                  <span
                    className="text-xs font-medium truncate client-stat-strip__label-long"
                    style={{ color: c.secondary }}
                  >
                    Overdue (15+ days past expected pay)
                  </span>
                  <span
                    className="text-xs font-medium truncate client-stat-strip__label-short"
                    style={{ color: c.secondary }}
                  >
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
                    <span
                      className="text-xs font-medium truncate client-stat-strip__label-full"
                      style={{ color: c.secondary }}
                    >
                      Overdue Amount
                    </span>
                    <span
                      className="text-xs font-medium truncate client-stat-strip__label-short"
                      style={{ color: c.secondary }}
                    >
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
                    placeholder="Search invoices, clients, brokers..."
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
                    <option value="approved">Open</option>
                    <option value="hold">On Hold</option>
                    <option value="paid">Paid</option>
                    <option value="rejected">Rejected</option>
                    <option value="force_closed">Force Closed</option>
                    <option value="written_off">Written Off</option>
                    <option value="write_off_pending">Write-off Pending</option>
                  </select>
                </div>
              </div>
            </div>

            {sortedInvoices.length === 0 ? (
              <div className="payments-workspace-body flex-1 min-h-0">
                <div className="payments-list-panel flex items-center justify-center text-center py-6 px-4">
                  <div>
                    <FileText className="w-10 h-10 mx-auto mb-3" style={{ color: c.mutedLight }} />
                    <p className="text-base font-medium mb-1" style={{ color: c.primary }}>
                      No invoices found
                    </p>
                    <p className="text-sm" style={{ color: c.secondary }}>
                      {searchTerm || statusFilter !== 'all'
                        ? 'Try adjusting your search or filters'
                        : 'Invoices will appear here'}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div
                ref={workspaceRef}
                className={`payments-workspace-body flex-1 min-h-0 ${
                  detailPanelOpen ? 'payments-workspace-body--detail-open' : ''
                } ${isResizing ? 'payments-workspace-body--resizing' : ''}`}
                style={
                  detailPanelOpen
                    ? ({ '--payments-detail-width': `${detailWidth}px` } as CSSProperties)
                    : undefined
                }
              >
                <div className="payments-list-panel">
                  <div className="client-table-scroll client-table-scroll--mobile-stack flex-1 min-h-0 overflow-y-auto">
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
                            field="client_name"
                            label="Client"
                            sortField={sortField}
                            sortDir={sortDir}
                            onSort={handleSort}
                            className="client-list-td--client"
                          />
                          <ClientSortableHeader
                            field="broker_name"
                            label="Broker"
                            sortField={sortField}
                            sortDir={sortDir}
                            onSort={handleSort}
                            className="client-list-td--broker"
                          />
                          <ClientSortableHeader
                            field="batch_number"
                            label="Batch#"
                            sortField={sortField}
                            sortDir={sortDir}
                            onSort={handleSort}
                            className="client-list-td--batch"
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
                            field="balance"
                            label="Balance"
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
                            className="client-list-td--status-col"
                          />
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedInvoices.map((invoice) => {
                          const isHighlighted = highlightedInvoiceId === invoice.id
                          const isSelected = selectedInvoice?.id === invoice.id
                          const awaitingPayment = getAwaitingReceiptPaymentForInvoice(
                            invoice.id,
                            payments
                          )
                          const attention = getAdminInvoiceAttention(invoice, payments)
                          const balance =
                            invoiceBalanceById.get(invoice.id) ??
                            getInvoiceBalanceState(invoice.amount, 0)
                          const isWrittenOff =
                            invoice.status === 'written_off' || invoice.status === 'write_off_pending'
                          const writtenOffAmount =
                            invoice.write_off_request?.shortfall ??
                            (balance.signedBalance > 0 ? balance.signedBalance : invoice.amount)
                          const balanceDisplay = isWrittenOff
                            ? { text: formatCurrency(writtenOffAmount), color: c.warning }
                            : formatInvoiceOpenBalance(balance, c.mutedLight, c.primary)

                          return (
                            <tr
                              key={invoice.id}
                              className={`cursor-pointer ${isHighlighted ? 'batch-highlight-row' : ''} ${
                                isSelected ? 'bg-slate-50' : ''
                              } ${
                                attention.needsAttention
                                  ? 'invoice-row--needs-attention'
                                  : invoice.isForceCloseEligible
                                    ? 'invoice-row--force-close'
                                    : invoice.isOverdue
                                      ? 'invoice-row--overdue'
                                      : ''
                              }`}
                              onClick={() => handleViewInvoiceDetail(invoice)}
                            >
                              <ClientListTd
                                variant="primary"
                                className="font-semibold"
                                title={
                                  attention.needsAttention
                                    ? `${invoice.invoice_number} — ${attention.label}`
                                    : invoice.invoice_number
                                }
                              >
                                <span className="inline-flex items-center gap-1.5 min-w-0">
                                  {attention.needsAttention && (
                                    <AlertCircle
                                      className="w-3.5 h-3.5 shrink-0 text-amber-600"
                                      aria-label="Needs attention"
                                    />
                                  )}
                                  <span className="truncate">{invoice.invoice_number}</span>
                                </span>
                              </ClientListTd>
                              <ClientListTd
                                variant="desktop"
                                label="Load#"
                                style={{ color: c.secondary }}
                                title={invoice.load_number || undefined}
                              >
                                {invoice.load_number || '-'}
                              </ClientListTd>
                              <ClientListTd
                                variant="meta"
                                className="client-list-td--ellipsis client-list-td--client"
                                title={invoice.client_name}
                              >
                                <span className="client-list-td__clip">{invoice.client_name}</span>
                              </ClientListTd>
                              <ClientListTd
                                variant="meta"
                                className="client-list-td--ellipsis client-list-td--broker"
                                title={invoice.broker_name}
                              >
                                <span className="client-list-td__clip">{invoice.broker_name}</span>
                              </ClientListTd>
                              <ClientListTd
                                variant="desktop"
                                label="Batch#"
                                className="client-list-td--ellipsis client-list-td--batch"
                                style={{ color: c.secondary }}
                                title={invoice.batch_number || undefined}
                              >
                                <span className="client-list-td__clip">{invoice.batch_number || '-'}</span>
                              </ClientListTd>
                              <ClientListTd variant="amount" className="text-right font-medium tabular-nums">
                                {formatCurrency(invoice.amount)}
                              </ClientListTd>
                              <ClientListTd
                                variant="desktop"
                                label="Balance"
                                className="text-right font-medium tabular-nums"
                              >
                                <span style={{ color: balanceDisplay.color }}>{balanceDisplay.text}</span>
                              </ClientListTd>
                              <ClientListTd
                                variant="desktop"
                                label="Invoice Date"
                                style={{ color: c.secondary }}
                              >
                                {formatDate(invoice.invoice_date)}
                              </ClientListTd>
                              <ClientListTd
                                variant="desktop"
                                label="Days Out"
                                className="text-right tabular-nums"
                              >
                                <span
                                  className="text-sm font-semibold"
                                  style={{
                                    color:
                                      isOpenArInvoice(invoice) && invoice.isOverdue
                                        ? getDaysOutstandingColor(invoice.overdueSeverity)
                                        : c.secondary,
                                  }}
                                >
                                  {invoice.invoiceAgeDays}d
                                  {invoice.isForceCloseEligible && (
                                    <span
                                      className="block text-[10px] font-medium"
                                      style={{ color: '#7C3AED' }}
                                    >
                                      FC
                                    </span>
                                  )}
                                </span>
                              </ClientListTd>
                              <ClientListTd variant="status" className="client-list-td--status-col">
                                <div className="inline-flex items-center gap-1 flex-nowrap min-w-0">
                                  {attention.needsAttention && (
                                    <span className="status-pill status-pill--review text-[10px]">
                                      Needs attention
                                    </span>
                                  )}
                                  {getInvoiceRowStatusBadge(invoice, {
                                    balance,
                                    pendingClientPosted: invoicePendingById.get(invoice.id)?.pending,
                                    confirmedReceived: invoicePendingById.get(invoice.id)?.confirmed,
                                  })}
                                  <InvoiceDisputeBadges invoice={invoice} />
                                  {attention.reason === 'receipt_dispute' && (
                                    <span className="status-pill status-pill--overdue text-[10px]">
                                      {attention.label}
                                    </span>
                                  )}
                                  {awaitingPayment && (
                                    <span className="status-pill status-pill--pending text-[10px]">
                                      Awaiting receipt
                                    </span>
                                  )}
                                  {invoice.isForceCloseEligible && (
                                    <span className="status-pill status-pill--hold text-[10px]">
                                      Force Close
                                    </span>
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
                      <label
                        className="flex items-center gap-1.5 text-xs font-medium"
                        style={{ color: c.secondary }}
                      >
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
                        <span
                          className="text-xs font-medium px-2 tabular-nums"
                          style={{ color: c.primary }}
                        >
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
                </div>

                {!useFullPageDetail && (
                  <aside className="payments-detail-panel" aria-hidden={!selectedInvoice}>
                    {detailPanelOpen && (
                      <div
                        className="payments-resize-handle"
                        role="separator"
                        aria-orientation="vertical"
                        aria-label="Resize invoice details panel"
                        aria-valuemin={320}
                        aria-valuemax={720}
                        aria-valuenow={detailWidth}
                        {...resizeHandleProps}
                      />
                    )}
                    {selectedInvoice && invoiceDetailPanelProps ? (
                      <div className="payments-detail-panel__inner">
                        <InvoiceDetailPanel variant="sidebar" {...invoiceDetailPanelProps} />
                      </div>
                    ) : null}
                  </aside>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {showDocumentViewer && viewingInvoiceDocuments && (
        <DocumentViewer
          isOpen={showDocumentViewer}
          onClose={() => {
            setShowDocumentViewer(false)
            setViewingInvoiceDocuments(null)
          }}
          documents={getInvoiceDocumentsForViewer(viewingInvoiceDocuments)}
          invoiceNumber={viewingInvoiceDocuments.invoice_number}
          title="View Documents"
        />
      )}
    </AdminLayout>
  )
}
