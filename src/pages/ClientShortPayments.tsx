import { useState, useMemo, useCallback, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useClientDemoSnapshot } from '../hooks/useClientDemoSnapshot'
import { useClientSession } from '../hooks/useClientSession'
import { useClientCapabilities } from '../hooks/useClientCapabilities'
import { Invoice } from '../types/invoice'
import { formatCurrency, formatDate } from '../utils/format'
import {
  Search,
  Eye,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  DollarSign,
  Ban,
  FileText,
  CircleCheck,
  TrendingUp,
} from 'lucide-react'
import InvoiceDetailWorkspace from '../components/client/InvoiceDetailWorkspace'
import ShortPaymentCloseModal from '../components/client/ShortPaymentCloseModal'
import OverpaymentAcceptModal from '../components/client/OverpaymentAcceptModal'
import ClientSortableHeader from '../components/client/ClientSortableHeader'
import ClientListTd from '../components/client/ClientListTd'
import DocumentViewer from '../components/DocumentViewer'
import { useClientTheme } from '../theme/ThemeContext'
import {
  getInitialListPageSize,
  PAGE_SIZE_OPTIONS,
  type SortDir,
} from '../utils/clientListPage'
import {
  filterShortPaymentsByResolution,
  listShortPayments,
  type ShortPaymentRecord,
  type ShortPaymentResolution,
} from '../utils/shortPayments'
import {
  filterOverpaymentsByResolution,
  listOverpayments,
  type OverpaymentRecord,
  type OverpaymentResolution,
} from '../utils/overPayments'
import {
  addClientInvoiceNote,
  acceptClientOverpayment,
  closeClientInvoiceAsUncollectable,
} from '../services/clientInvoiceActions'
import { getInvoiceDocumentsForViewer } from '../services/invoiceDocumentStore'
import { mapClientVisibleInvoices } from '../utils/clientInvoiceView'

type VarianceTab = 'short' | 'over'
type ShortFilter = 'all' | ShortPaymentResolution
type OverFilter = 'all' | OverpaymentResolution

type SortField =
  | 'invoice_number'
  | 'broker_name'
  | 'invoice_amount'
  | 'received_amount'
  | 'variance_amount'
  | 'invoice_date'

function getShortResolutionPill(resolution: ShortPaymentResolution) {
  if (resolution === 'written_off') {
    return <span className="status-pill status-pill--hold">Written off</span>
  }
  return <span className="status-pill status-pill--review">Open</span>
}

function getOverResolutionPill(resolution: OverpaymentResolution) {
  if (resolution === 'accepted') {
    return <span className="status-pill status-pill--approved">Accepted</span>
  }
  return <span className="status-pill status-pill--pending">Open</span>
}

export default function ClientShortPayments() {
  const c = useClientTheme()
  const { clientId, clientName } = useClientSession()
  const { capabilities } = useClientCapabilities()
  const authorName = clientName
  const [searchParams, setSearchParams] = useSearchParams()

  const [varianceTab, setVarianceTab] = useState<VarianceTab>('short')
  const [refreshKey, setRefreshKey] = useState(0)
  const { dashboard: data, invoices: rawInvoices, payments: clientPayments } =
    useClientDemoSnapshot(refreshKey)
  const clientInvoices = useMemo(() => mapClientVisibleInvoices(rawInvoices), [rawInvoices])
  const [searchTerm, setSearchTerm] = useState('')
  const [shortFilter, setShortFilter] = useState<ShortFilter>('open')
  const [overFilter, setOverFilter] = useState<OverFilter>('open')
  const [pageSize, setPageSize] = useState<number>(getInitialListPageSize)
  const [currentPage, setCurrentPage] = useState(1)
  const [sortField, setSortField] = useState<SortField>('variance_amount')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [showDetail, setShowDetail] = useState(false)
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null)
  const [closeTarget, setCloseTarget] = useState<ShortPaymentRecord | null>(null)
  const [acceptTarget, setAcceptTarget] = useState<OverpaymentRecord | null>(null)
  const [showDocumentViewer, setShowDocumentViewer] = useState(false)
  const [viewingInvoice, setViewingInvoice] = useState<Invoice | null>(null)

  const shortPayments = useMemo(
    () => listShortPayments(clientInvoices, clientPayments),
    [clientInvoices, clientPayments]
  )

  const overpayments = useMemo(
    () => listOverpayments(clientInvoices, clientPayments),
    [clientInvoices, clientPayments]
  )

  const openShortRows = useMemo(
    () => shortPayments.filter((row) => row.resolution === 'open'),
    [shortPayments]
  )
  const writtenOffRows = useMemo(
    () => shortPayments.filter((row) => row.resolution === 'written_off'),
    [shortPayments]
  )
  const totalOpenShortfall = openShortRows.reduce((sum, row) => sum + row.shortfall_amount, 0)

  const openOverRows = useMemo(
    () => overpayments.filter((row) => row.resolution === 'open'),
    [overpayments]
  )
  const acceptedOverRows = useMemo(
    () => overpayments.filter((row) => row.resolution === 'accepted'),
    [overpayments]
  )
  const totalOpenOverage = openOverRows.reduce((sum, row) => sum + row.overage_amount, 0)

  const filteredShortRows = useMemo(() => {
    const byResolution = filterShortPaymentsByResolution(shortPayments, shortFilter)
    const term = searchTerm.trim().toLowerCase()
    if (!term) return byResolution
    return byResolution.filter(
      (row) =>
        row.invoice.invoice_number.toLowerCase().includes(term) ||
        row.invoice.broker_name.toLowerCase().includes(term) ||
        row.invoice.load_number?.toLowerCase().includes(term)
    )
  }, [shortPayments, shortFilter, searchTerm])

  const filteredOverRows = useMemo(() => {
    const byResolution = filterOverpaymentsByResolution(overpayments, overFilter)
    const term = searchTerm.trim().toLowerCase()
    if (!term) return byResolution
    return byResolution.filter(
      (row) =>
        row.invoice.invoice_number.toLowerCase().includes(term) ||
        row.invoice.broker_name.toLowerCase().includes(term) ||
        row.invoice.load_number?.toLowerCase().includes(term)
    )
  }, [overpayments, overFilter, searchTerm])

  const activeRows = varianceTab === 'short' ? filteredShortRows : filteredOverRows

  const sortedRows = useMemo(() => {
    const rows = [...activeRows]
    rows.sort((a, b) => {
      let cmp = 0
      const varianceA =
        'shortfall_amount' in a ? a.shortfall_amount : (a as OverpaymentRecord).overage_amount
      const varianceB =
        'shortfall_amount' in b ? b.shortfall_amount : (b as OverpaymentRecord).overage_amount
      switch (sortField) {
        case 'invoice_number':
          cmp = a.invoice.invoice_number.localeCompare(b.invoice.invoice_number, undefined, {
            numeric: true,
          })
          break
        case 'broker_name':
          cmp = a.invoice.broker_name.localeCompare(b.invoice.broker_name)
          break
        case 'invoice_amount':
          cmp = a.invoice_amount - b.invoice_amount
          break
        case 'received_amount':
          cmp = a.received_amount - b.received_amount
          break
        case 'variance_amount':
          cmp = varianceA - varianceB
          break
        case 'invoice_date':
          cmp = a.invoice.invoice_date.localeCompare(b.invoice.invoice_date)
          break
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
    return rows
  }, [activeRows, sortField, sortDir])

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / pageSize))
  const pageStart = sortedRows.length === 0 ? 0 : (currentPage - 1) * pageSize + 1
  const pageEnd = Math.min(currentPage * pageSize, sortedRows.length)
  const pageRows = sortedRows.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  const detailInvoices = useMemo(
    () => sortedRows.map((row) => row.invoice),
    [sortedRows]
  )
  const selectedInvoice = detailInvoices.find((inv) => inv.id === selectedInvoiceId) ?? null

  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm, shortFilter, overFilter, pageSize, varianceTab])

  useEffect(() => {
    const invoiceId = searchParams.get('invoice')
    const tab = searchParams.get('tab')
    if (tab === 'over') setVarianceTab('over')
    if (!invoiceId) return
    const shortRow = shortPayments.find((r) => r.invoice.id === invoiceId)
    const overRow = overpayments.find((r) => r.invoice.id === invoiceId)
    if (shortRow) {
      setVarianceTab('short')
      setSelectedInvoiceId(invoiceId)
      setShowDetail(true)
      setSearchParams({}, { replace: true })
    } else if (overRow) {
      setVarianceTab('over')
      setSelectedInvoiceId(invoiceId)
      setShowDetail(true)
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, shortPayments, overpayments, setSearchParams])

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDir('desc')
    }
  }

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), [])

  const handleAddNote = useCallback(
    async (invoiceId: string, note: string) => {
      addClientInvoiceNote(invoiceId, note, authorName)
      refresh()
    },
    [authorName, refresh]
  )

  const handleCloseUncollectable = useCallback(
    async (invoiceId: string, note: string) => {
      const updated = closeClientInvoiceAsUncollectable(
        invoiceId,
        authorName,
        { note },
        clientPayments
      )
      if (!updated) throw new Error('Close failed')
      refresh()
    },
    [authorName, clientPayments, refresh]
  )

  const handleAcceptOverpayment = useCallback(
    async (invoiceId: string, note: string) => {
      const updated = acceptClientOverpayment(invoiceId, authorName, { note }, clientPayments)
      if (!updated) throw new Error('Accept failed')
      refresh()
    },
    [authorName, clientPayments, refresh]
  )

  const openDetail = (invoiceId: string) => {
    setSelectedInvoiceId(invoiceId)
    setShowDetail(true)
  }

  const inputCompactStyle = {
    backgroundColor: c.card,
    height: 34,
    paddingTop: 6,
    paddingBottom: 6,
    fontSize: 13,
  } as const

  return (
    <>
      <div className="client-short-payments-page overflow-hidden flex flex-col min-h-0">
        {!capabilities.canRequestWriteOff && varianceTab === 'short' && (
          <section
            className="shrink-0 px-4 py-2.5 border-b text-sm"
            style={{ borderColor: c.border, backgroundColor: c.stat.amber, color: c.secondary }}
          >
            Write-offs and short-pay closures are managed by Credyx on your plan. Contact your
            Credyx team to close a remaining balance.
          </section>
        )}
        <section
          className="client-stat-strip grid grid-cols-2 lg:grid-cols-4 border-b shrink-0"
          style={{ borderColor: c.border }}
        >
          {varianceTab === 'short' ? (
            <>
              <button
                type="button"
                onClick={() => setShortFilter(shortFilter === 'open' ? 'all' : 'open')}
                className="flex items-center justify-between gap-2 px-4 py-2.5 sm:border-r border-b lg:border-b-0 text-left transition-colors hover:opacity-90"
                style={{ backgroundColor: c.stat.amber, borderColor: c.border }}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" style={{ color: c.warning }} />
                  <span className="text-xs font-medium truncate" style={{ color: c.secondary }}>
                    Open short pays
                  </span>
                </div>
                <span className="text-lg font-bold tabular-nums shrink-0" style={{ color: c.primary }}>
                  {openShortRows.length}
                </span>
              </button>
              <div
                className="flex items-center justify-between gap-2 px-4 py-2.5 sm:border-r border-b lg:border-b-0"
                style={{ backgroundColor: c.stat.red, borderColor: c.border }}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <DollarSign className="w-3.5 h-3.5 shrink-0" style={{ color: c.error }} />
                  <span className="text-xs font-medium truncate" style={{ color: c.secondary }}>
                    Open shortfall
                  </span>
                </div>
                <span className="text-lg font-bold tabular-nums shrink-0" style={{ color: c.error }}>
                  {formatCurrency(totalOpenShortfall)}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShortFilter(shortFilter === 'written_off' ? 'all' : 'written_off')}
                className="flex items-center justify-between gap-2 px-4 py-2.5 sm:border-r border-b lg:border-b-0 text-left transition-colors hover:opacity-90"
                style={{ backgroundColor: c.stat.slate, borderColor: c.border }}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <Ban className="w-3.5 h-3.5 shrink-0" style={{ color: c.secondary }} />
                  <span className="text-xs font-medium truncate" style={{ color: c.secondary }}>
                    Written off
                  </span>
                </div>
                <span className="text-lg font-bold tabular-nums shrink-0" style={{ color: c.primary }}>
                  {writtenOffRows.length}
                </span>
              </button>
              <div
                className="flex items-center justify-between gap-2 px-4 py-2.5"
                style={{ backgroundColor: c.stat.blue, borderColor: c.border }}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <FileText className="w-3.5 h-3.5 shrink-0" style={{ color: c.info }} />
                  <span className="text-xs font-medium truncate" style={{ color: c.secondary }}>
                    All short pays
                  </span>
                </div>
                <span className="text-lg font-bold tabular-nums shrink-0" style={{ color: c.primary }}>
                  {shortPayments.length}
                </span>
              </div>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setOverFilter(overFilter === 'open' ? 'all' : 'open')}
                className="flex items-center justify-between gap-2 px-4 py-2.5 sm:border-r border-b lg:border-b-0 text-left transition-colors hover:opacity-90"
                style={{ backgroundColor: c.stat.amber, borderColor: c.border }}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <TrendingUp className="w-3.5 h-3.5 shrink-0" style={{ color: c.warning }} />
                  <span className="text-xs font-medium truncate" style={{ color: c.secondary }}>
                    Open overpays
                  </span>
                </div>
                <span className="text-lg font-bold tabular-nums shrink-0" style={{ color: c.primary }}>
                  {openOverRows.length}
                </span>
              </button>
              <div
                className="flex items-center justify-between gap-2 px-4 py-2.5 sm:border-r border-b lg:border-b-0"
                style={{ backgroundColor: c.stat.green, borderColor: c.border }}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <DollarSign className="w-3.5 h-3.5 shrink-0" style={{ color: c.success }} />
                  <span className="text-xs font-medium truncate" style={{ color: c.secondary }}>
                    Open excess
                  </span>
                </div>
                <span className="text-lg font-bold tabular-nums shrink-0" style={{ color: c.success }}>
                  {formatCurrency(totalOpenOverage)}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setOverFilter(overFilter === 'accepted' ? 'all' : 'accepted')}
                className="flex items-center justify-between gap-2 px-4 py-2.5 sm:border-r border-b lg:border-b-0 text-left transition-colors hover:opacity-90"
                style={{ backgroundColor: c.stat.slate, borderColor: c.border }}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <CircleCheck className="w-3.5 h-3.5 shrink-0" style={{ color: c.success }} />
                  <span className="text-xs font-medium truncate" style={{ color: c.secondary }}>
                    Accepted
                  </span>
                </div>
                <span className="text-lg font-bold tabular-nums shrink-0" style={{ color: c.primary }}>
                  {acceptedOverRows.length}
                </span>
              </button>
              <div
                className="flex items-center justify-between gap-2 px-4 py-2.5"
                style={{ backgroundColor: c.stat.blue, borderColor: c.border }}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <FileText className="w-3.5 h-3.5 shrink-0" style={{ color: c.info }} />
                  <span className="text-xs font-medium truncate" style={{ color: c.secondary }}>
                    All overpays
                  </span>
                </div>
                <span className="text-lg font-bold tabular-nums shrink-0" style={{ color: c.primary }}>
                  {overpayments.length}
                </span>
              </div>
            </>
          )}
        </section>

        <div
          className="client-page-toolbar px-4 py-2 border-b shrink-0"
          style={{ borderColor: c.border, backgroundColor: c.card }}
        >
          <div className="flex flex-col md:flex-row md:items-center gap-2">
            <div className="flex gap-1 shrink-0">
              <button
                type="button"
                onClick={() => setVarianceTab('short')}
                className={`batch-filter-pill batch-filter-pill--sm ${
                  varianceTab === 'short' ? 'batch-filter-pill--active' : ''
                }`}
              >
                Short payments
              </button>
              <button
                type="button"
                onClick={() => setVarianceTab('over')}
                className={`batch-filter-pill batch-filter-pill--sm ${
                  varianceTab === 'over' ? 'batch-filter-pill--active' : ''
                }`}
              >
                Overpayments
              </button>
            </div>
            <div className="flex-1 relative">
              <Search
                className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5"
                style={{ color: c.secondary }}
              />
              <input
                type="text"
                placeholder="Search invoice, broker, load..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="client-input pl-8"
                style={inputCompactStyle}
              />
            </div>
            <div className="flex gap-1 shrink-0">
              {varianceTab === 'short'
                ? (
                    [
                      { id: 'open' as const, label: 'Open' },
                      { id: 'written_off' as const, label: 'Written off' },
                      { id: 'all' as const, label: 'All' },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setShortFilter(opt.id)}
                      className={`batch-filter-pill batch-filter-pill--sm ${
                        shortFilter === opt.id ? 'batch-filter-pill--active' : ''
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))
                : (
                    [
                      { id: 'open' as const, label: 'Open' },
                      { id: 'accepted' as const, label: 'Accepted' },
                      { id: 'all' as const, label: 'All' },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setOverFilter(opt.id)}
                      className={`batch-filter-pill batch-filter-pill--sm ${
                        overFilter === opt.id ? 'batch-filter-pill--active' : ''
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
            </div>
          </div>
        </div>

        {sortedRows.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-center py-8 px-4">
            <div>
              <DollarSign className="w-10 h-10 mx-auto mb-3" style={{ color: c.mutedLight }} />
              <p className="text-base font-medium mb-1" style={{ color: c.primary }}>
                {varianceTab === 'short' ? 'No short payments' : 'No overpayments'}
              </p>
              <p className="text-sm max-w-sm mx-auto" style={{ color: c.secondary }}>
                {varianceTab === 'short'
                  ? 'When a broker pays less than the invoice amount, it appears here for follow-up or write-off.'
                  : 'When a broker pays more than the invoiced load amount, it appears here to review and accept.'}
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="client-table-scroll flex-1 min-h-0 overflow-y-auto overflow-x-auto">
              <table className="dashboard-table dashboard-table--compact w-full">
                <thead>
                  <tr>
                    <ClientSortableHeader
                      label="Invoice"
                      field="invoice_number"
                      sortField={sortField}
                      sortDir={sortDir}
                      onSort={handleSort}
                    />
                    <ClientSortableHeader
                      label="Broker"
                      field="broker_name"
                      sortField={sortField}
                      sortDir={sortDir}
                      onSort={handleSort}
                    />
                    <ClientSortableHeader
                      label="Invoiced"
                      field="invoice_amount"
                      sortField={sortField}
                      sortDir={sortDir}
                      onSort={handleSort}
                      align="right"
                    />
                    <ClientSortableHeader
                      label="Received"
                      field="received_amount"
                      sortField={sortField}
                      sortDir={sortDir}
                      onSort={handleSort}
                      align="right"
                    />
                    <ClientSortableHeader
                      label={varianceTab === 'short' ? 'Shortfall' : 'Excess'}
                      field="variance_amount"
                      sortField={sortField}
                      sortDir={sortDir}
                      onSort={handleSort}
                      align="right"
                    />
                    <th>Status</th>
                    <th className="text-right w-28">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {varianceTab === 'short'
                    ? (pageRows as ShortPaymentRecord[]).map((row) => (
                        <tr
                          key={row.invoice.id}
                          className="cursor-pointer hover:bg-slate-50/80 transition-colors"
                          onClick={() => openDetail(row.invoice.id)}
                        >
                          <ClientListTd>
                            <div>
                              <span className="font-medium" style={{ color: c.primary }}>
                                {row.invoice.invoice_number}
                              </span>
                              <p className="text-[11px] mt-0.5" style={{ color: c.mutedLight }}>
                                {formatDate(row.invoice.invoice_date)}
                              </p>
                            </div>
                          </ClientListTd>
                          <ClientListTd>
                            <span className="truncate block max-w-[160px]">{row.invoice.broker_name}</span>
                          </ClientListTd>
                          <ClientListTd align="right">
                            <span className="tabular-nums">{formatCurrency(row.invoice_amount)}</span>
                          </ClientListTd>
                          <ClientListTd align="right">
                            <span className="tabular-nums" style={{ color: c.success }}>
                              {formatCurrency(row.received_amount)}
                            </span>
                          </ClientListTd>
                          <ClientListTd align="right">
                            <span className="tabular-nums font-semibold" style={{ color: c.error }}>
                              {formatCurrency(row.shortfall_amount)}
                            </span>
                          </ClientListTd>
                          <ClientListTd>{getShortResolutionPill(row.resolution)}</ClientListTd>
                          <ClientListTd align="right">
                            <div
                              className="flex items-center justify-end gap-1"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                type="button"
                                onClick={() => openDetail(row.invoice.id)}
                                className="p-1.5 rounded-lg transition-colors client-icon-btn"
                                style={{ color: c.info }}
                                title="View invoice"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                              {row.resolution === 'open' && capabilities.canRequestWriteOff && (
                                <button
                                  type="button"
                                  onClick={() => setCloseTarget(row)}
                                  className="p-1.5 rounded-lg transition-colors client-icon-btn"
                                  style={{ color: c.error }}
                                  title="Close as uncollectable"
                                >
                                  <Ban className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </ClientListTd>
                        </tr>
                      ))
                    : (pageRows as OverpaymentRecord[]).map((row) => (
                        <tr
                          key={row.invoice.id}
                          className="cursor-pointer hover:bg-slate-50/80 transition-colors"
                          onClick={() => openDetail(row.invoice.id)}
                        >
                          <ClientListTd>
                            <div>
                              <span className="font-medium" style={{ color: c.primary }}>
                                {row.invoice.invoice_number}
                              </span>
                              <p className="text-[11px] mt-0.5" style={{ color: c.mutedLight }}>
                                {formatDate(row.invoice.invoice_date)}
                              </p>
                            </div>
                          </ClientListTd>
                          <ClientListTd>
                            <span className="truncate block max-w-[160px]">{row.invoice.broker_name}</span>
                          </ClientListTd>
                          <ClientListTd align="right">
                            <span className="tabular-nums">{formatCurrency(row.invoice_amount)}</span>
                          </ClientListTd>
                          <ClientListTd align="right">
                            <span className="tabular-nums" style={{ color: c.success }}>
                              {formatCurrency(row.received_amount)}
                            </span>
                          </ClientListTd>
                          <ClientListTd align="right">
                            <span className="tabular-nums font-semibold" style={{ color: c.info }}>
                              {formatCurrency(row.overage_amount)}
                            </span>
                          </ClientListTd>
                          <ClientListTd>{getOverResolutionPill(row.resolution)}</ClientListTd>
                          <ClientListTd align="right">
                            <div
                              className="flex items-center justify-end gap-1"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                type="button"
                                onClick={() => openDetail(row.invoice.id)}
                                className="p-1.5 rounded-lg transition-colors client-icon-btn"
                                style={{ color: c.info }}
                                title="View invoice"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                              {row.resolution === 'open' && (
                                <button
                                  type="button"
                                  onClick={() => setAcceptTarget(row)}
                                  className="p-1.5 rounded-lg transition-colors client-icon-btn"
                                  style={{ color: c.success }}
                                  title="Accept overpayment"
                                >
                                  <CircleCheck className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </ClientListTd>
                        </tr>
                      ))}
                </tbody>
              </table>
            </div>

            <div
              className="client-page-footer flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-4 py-2 border-t shrink-0"
              style={{ borderColor: c.border, backgroundColor: c.card }}
            >
              <p className="text-xs font-medium" style={{ color: c.secondary }}>
                Showing {pageStart}–{pageEnd} of {sortedRows.length}
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
        isOpen={showDetail}
        onClose={() => setShowDetail(false)}
        invoices={detailInvoices}
        selectedInvoice={selectedInvoice}
        onSelectInvoice={(invoice) => setSelectedInvoiceId(invoice.id)}
        onViewDocuments={(invoice) => {
          setViewingInvoice(invoice)
          setShowDocumentViewer(true)
        }}
        clientName={data.client_name}
        title={varianceTab === 'short' ? 'Short payment' : 'Overpayment'}
        onInvoiceUpdated={refresh}
        onAddNote={handleAddNote}
        onCloseAsUncollectable={
          varianceTab === 'short' && capabilities.canRequestWriteOff
            ? handleCloseUncollectable
            : undefined
        }
        onAcceptOverpayment={varianceTab === 'over' ? handleAcceptOverpayment : undefined}
        payments={clientPayments}
        showStatusFilter={false}
        enableClientActions={capabilities.canRunInvoiceOps}
      />

      {closeTarget && (
        <ShortPaymentCloseModal
          isOpen={!!closeTarget}
          invoiceNumber={closeTarget.invoice.invoice_number}
          invoiceAmount={closeTarget.invoice_amount}
          receivedAmount={closeTarget.received_amount}
          shortfallAmount={closeTarget.shortfall_amount}
          onClose={() => setCloseTarget(null)}
          onConfirm={(note) => handleCloseUncollectable(closeTarget.invoice.id, note)}
        />
      )}

      {acceptTarget && (
        <OverpaymentAcceptModal
          isOpen={!!acceptTarget}
          invoiceNumber={acceptTarget.invoice.invoice_number}
          invoiceAmount={acceptTarget.invoice_amount}
          receivedAmount={acceptTarget.received_amount}
          overageAmount={acceptTarget.overage_amount}
          onClose={() => setAcceptTarget(null)}
          onConfirm={(note) => handleAcceptOverpayment(acceptTarget.invoice.id, note)}
        />
      )}

      {showDocumentViewer && viewingInvoice && (
        <DocumentViewer
          isOpen={showDocumentViewer}
          onClose={() => {
            setShowDocumentViewer(false)
            setViewingInvoice(null)
          }}
          documents={getInvoiceDocumentsForViewer(viewingInvoice)}
          invoiceNumber={viewingInvoice.invoice_number}
          title="View Documents"
        />
      )}
    </>
  )
}
