import { useState, useEffect, useMemo, useCallback, type CSSProperties } from 'react'
import {
  Search,
  DollarSign,
  ChevronLeft,
  ChevronRight,
  FileText,
} from 'lucide-react'
import AdminLayout from '../components/AdminLayout'
import ClientSortableHeader from '../components/client/ClientSortableHeader'
import ClientListTd from '../components/client/ClientListTd'
import InvoiceDetailPanel from '../components/client/InvoiceDetailPanel'
import { mockInvoices } from '../data/mockInvoices'
import { mockPayments } from '../data/mockPayments'
import type { Invoice } from '../types/invoice'
import { formatCurrency, formatDate } from '../utils/format'
import {
  DISPLAY_AGING_BUCKETS,
  DisplayAgingBucketId,
  EnrichedInvoice,
  enrichInvoices,
  getDaysOutstandingColor,
  getDisplayAgingBucketId,
  getDisplayAgingBucketLabel,
  getOverdueSeverity,
  isOpenArInvoice,
} from '../utils/invoiceAging'
import { AMOUNT_EPSILON, getInvoiceOpenArBalance } from '../utils/paymentVariance'
import { useClientTheme } from '../theme/ThemeContext'
import { useCompactDetailViewport } from '../hooks/useIsMobileViewport'
import { useResizableSplitPane } from '../hooks/useResizableSplitPane'
import {
  getInitialListPageSize,
  PAGE_SIZE_OPTIONS,
  type SortDir,
} from '../utils/clientListPage'
import { getInvoiceStatusBadge } from '../components/client/invoiceDetailShared'

type ScopeFilter = 'open' | 'all'
type ViewMode = 'invoices' | 'brokers' | 'clients'
type BucketFilter = 'all' | DisplayAgingBucketId
type GroupDrillDown = { type: 'broker' | 'client'; name: string } | null

type InvoiceSortField =
  | 'invoice_number'
  | 'client_name'
  | 'broker_name'
  | 'amount'
  | 'balance'
  | 'expected_payment_date'
  | 'days_outstanding'
  | 'aging_bucket'
  | 'status'

type GroupSortField =
  | 'name'
  | 'total_amount'
  | 'invoice_count'
  | DisplayAgingBucketId

interface GroupAgingRow {
  id: string
  name: string
  invoice_count: number
  total_amount: number
  buckets: Record<DisplayAgingBucketId, { amount: number; count: number }>
}

function createEmptyBuckets(): Record<DisplayAgingBucketId, { amount: number; count: number }> {
  return {
    '0_15': { amount: 0, count: 0 },
    '16_30': { amount: 0, count: 0 },
    '31_45': { amount: 0, count: 0 },
    '46_60': { amount: 0, count: 0 },
    '61_90': { amount: 0, count: 0 },
    over_91: { amount: 0, count: 0 },
  }
}

function getBucketPillClass(bucketId: DisplayAgingBucketId): string {
  switch (bucketId) {
    case '0_15':
      return 'status-pill status-pill--approved'
    case '16_30':
      return 'status-pill status-pill--pending'
    case '31_45':
    case '46_60':
      return 'status-pill status-pill--review'
    case '61_90':
      return 'status-pill status-pill--hold'
    case 'over_91':
      return 'status-pill status-pill--overdue'
    default:
      return 'status-pill'
  }
}

/** Days past expected pay — includes closed invoices for historical "show all" aging. */
function getAgingDays(invoice: EnrichedInvoice, includeClosed: boolean): number {
  if (!includeClosed || isOpenArInvoice(invoice)) {
    return invoice.daysOutstanding
  }
  if (!invoice.expected_payment_date) return invoice.invoiceAgeDays
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const expected = new Date(invoice.expected_payment_date)
  expected.setHours(0, 0, 0, 0)
  return Math.max(0, Math.floor((today.getTime() - expected.getTime()) / (1000 * 60 * 60 * 24)))
}

function isClosedInvoice(invoice: Invoice): boolean {
  return (
    invoice.status === 'paid' ||
    invoice.status === 'force_closed' ||
    invoice.status === 'written_off' ||
    invoice.status === 'write_off_pending' ||
    invoice.status === 'rejected'
  )
}

export default function AgingAR() {
  const c = useClientTheme()
  const useFullPageDetail = useCompactDetailViewport()
  const { workspaceRef, detailWidth, isResizing, resizeHandleProps } = useResizableSplitPane()

  const [refreshKey, setRefreshKey] = useState(0)
  const invoices = useMemo(() => [...mockInvoices], [refreshKey])
  const payments = useMemo(() => [...mockPayments], [refreshKey])

  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>('open')
  const [viewMode, setViewMode] = useState<ViewMode>('invoices')
  const [groupDrillDown, setGroupDrillDown] = useState<GroupDrillDown>(null)
  const [bucketFilter, setBucketFilter] = useState<BucketFilter>('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [showInvoiceDetail, setShowInvoiceDetail] = useState(false)
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null)
  const [detailPanelClosing, setDetailPanelClosing] = useState(false)
  const [pageSize, setPageSize] = useState<number>(getInitialListPageSize)
  const [currentPage, setCurrentPage] = useState(1)
  const [invoiceSortField, setInvoiceSortField] = useState<InvoiceSortField>('days_outstanding')
  const [invoiceSortDir, setInvoiceSortDir] = useState<SortDir>('desc')
  const [groupSortField, setGroupSortField] = useState<GroupSortField>('total_amount')
  const [groupSortDir, setGroupSortDir] = useState<SortDir>('desc')

  const includeClosed = scopeFilter === 'all'

  const openBalanceById = useMemo(() => {
    const map = new Map<string, number>()
    for (const inv of invoices) {
      map.set(inv.id, getInvoiceOpenArBalance(inv, payments))
    }
    return map
  }, [invoices, payments])

  const scopedInvoices = useMemo(() => {
    const enriched = enrichInvoices(invoices)
    if (includeClosed) return enriched
    return enriched.filter((inv) => {
      if (!isOpenArInvoice(inv)) return false
      return (openBalanceById.get(inv.id) ?? inv.amount) > AMOUNT_EPSILON
    })
  }, [invoices, includeClosed, openBalanceById])

  const getRowBalance = useCallback(
    (inv: EnrichedInvoice) => {
      if (includeClosed && isClosedInvoice(inv)) return 0
      return openBalanceById.get(inv.id) ?? inv.amount
    },
    [includeClosed, openBalanceById]
  )

  const bucketSummary = useMemo(() => {
    const summary = createEmptyBuckets()
    scopedInvoices.forEach((inv) => {
      const bucketId = getDisplayAgingBucketId(getAgingDays(inv, includeClosed))
      const balance = getRowBalance(inv)
      // For open A/R totals use balance; for "all" include face amount of closed in bucket counts
      const amount = includeClosed && isClosedInvoice(inv) ? inv.amount : balance
      summary[bucketId].amount += amount
      summary[bucketId].count += 1
    })
    return summary
  }, [scopedInvoices, includeClosed, getRowBalance])

  const totalAr = useMemo(() => {
    if (!includeClosed) {
      return scopedInvoices.reduce((sum, inv) => sum + getRowBalance(inv), 0)
    }
    // Open balance only for headline when showing all (closed don't inflate open A/R)
    return scopedInvoices
      .filter((inv) => isOpenArInvoice(inv))
      .reduce((sum, inv) => sum + getRowBalance(inv), 0)
  }, [scopedInvoices, includeClosed, getRowBalance])

  const openCount = useMemo(
    () => scopedInvoices.filter((inv) => isOpenArInvoice(inv) && getRowBalance(inv) > AMOUNT_EPSILON).length,
    [scopedInvoices, getRowBalance]
  )

  const bucketColors = useMemo(
    () => ({
      '0_15': c.chart.blue,
      '16_30': c.chart.cyan,
      '31_45': c.chart.purple,
      '46_60': c.chart.amber,
      '61_90': c.chart.orange,
      over_91: c.chart.red,
    }),
    [c.chart]
  )

  const filteredInvoices = useMemo(() => {
    return scopedInvoices.filter((inv) => {
      if (groupDrillDown?.type === 'client' && inv.client_name !== groupDrillDown.name) return false
      if (groupDrillDown?.type === 'broker' && inv.broker_name !== groupDrillDown.name) return false
      const bucketId = getDisplayAgingBucketId(getAgingDays(inv, includeClosed))
      const matchesBucket = bucketFilter === 'all' || bucketId === bucketFilter
      const term = searchTerm.toLowerCase()
      const matchesSearch =
        !term ||
        inv.invoice_number.toLowerCase().includes(term) ||
        inv.client_name.toLowerCase().includes(term) ||
        inv.broker_name.toLowerCase().includes(term) ||
        inv.load_number?.toLowerCase().includes(term) ||
        inv.batch_number?.toLowerCase().includes(term)
      return matchesBucket && matchesSearch
    })
  }, [scopedInvoices, bucketFilter, searchTerm, includeClosed, groupDrillDown])

  const sortedInvoices = useMemo(() => {
    const sorted = [...filteredInvoices]
    sorted.sort((a, b) => {
      let cmp = 0
      switch (invoiceSortField) {
        case 'invoice_number':
          cmp = a.invoice_number.localeCompare(b.invoice_number, undefined, { numeric: true })
          break
        case 'client_name':
          cmp = a.client_name.localeCompare(b.client_name)
          break
        case 'broker_name':
          cmp = a.broker_name.localeCompare(b.broker_name)
          break
        case 'amount':
          cmp = a.amount - b.amount
          break
        case 'balance':
          cmp = getRowBalance(a) - getRowBalance(b)
          break
        case 'expected_payment_date':
          cmp =
            new Date(a.expected_payment_date).getTime() - new Date(b.expected_payment_date).getTime()
          break
        case 'days_outstanding':
          cmp = getAgingDays(a, includeClosed) - getAgingDays(b, includeClosed)
          break
        case 'aging_bucket':
          cmp = getDisplayAgingBucketId(getAgingDays(a, includeClosed)).localeCompare(
            getDisplayAgingBucketId(getAgingDays(b, includeClosed))
          )
          break
        case 'status':
          cmp = a.status.localeCompare(b.status)
          break
      }
      return invoiceSortDir === 'asc' ? cmp : -cmp
    })
    return sorted
  }, [filteredInvoices, invoiceSortField, invoiceSortDir, includeClosed, getRowBalance])

  const buildGroupRows = useCallback(
    (mode: 'brokers' | 'clients'): GroupAgingRow[] => {
      const map = new Map<string, GroupAgingRow>()
      scopedInvoices.forEach((inv) => {
        const bucketId = getDisplayAgingBucketId(getAgingDays(inv, includeClosed))
        const amount =
          includeClosed && isClosedInvoice(inv) ? inv.amount : getRowBalance(inv)
        const id = mode === 'brokers' ? inv.broker_id || inv.broker_name : inv.client_id || inv.client_name
        const name = mode === 'brokers' ? inv.broker_name : inv.client_name
        const existing =
          map.get(id) ??
          ({
            id,
            name,
            invoice_count: 0,
            total_amount: 0,
            buckets: createEmptyBuckets(),
          } satisfies GroupAgingRow)

        existing.invoice_count += 1
        existing.total_amount += amount
        existing.buckets[bucketId].amount += amount
        existing.buckets[bucketId].count += 1
        map.set(id, existing)
      })
      return Array.from(map.values())
    },
    [scopedInvoices, includeClosed, getRowBalance]
  )

  const brokerRows = useMemo(() => buildGroupRows('brokers'), [buildGroupRows])
  const clientRows = useMemo(() => buildGroupRows('clients'), [buildGroupRows])

  const activeGroupRows = viewMode === 'brokers' ? brokerRows : clientRows

  const filteredGroups = useMemo(() => {
    return activeGroupRows.filter((row) => {
      const term = searchTerm.toLowerCase()
      const matchesSearch = !term || row.name.toLowerCase().includes(term)
      const matchesBucket = bucketFilter === 'all' || row.buckets[bucketFilter].count > 0
      return matchesSearch && matchesBucket
    })
  }, [activeGroupRows, searchTerm, bucketFilter])

  const sortedGroups = useMemo(() => {
    const sorted = [...filteredGroups]
    sorted.sort((a, b) => {
      let cmp = 0
      if (groupSortField === 'name') {
        cmp = a.name.localeCompare(b.name)
      } else if (groupSortField === 'total_amount') {
        cmp = a.total_amount - b.total_amount
      } else if (groupSortField === 'invoice_count') {
        cmp = a.invoice_count - b.invoice_count
      } else {
        cmp = a.buckets[groupSortField].amount - b.buckets[groupSortField].amount
      }
      return groupSortDir === 'asc' ? cmp : -cmp
    })
    return sorted
  }, [filteredGroups, groupSortField, groupSortDir])

  const activeListLength = viewMode === 'invoices' ? sortedInvoices.length : sortedGroups.length
  const totalPages = Math.max(1, Math.ceil(activeListLength / pageSize))

  const paginatedInvoices = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return sortedInvoices.slice(start, start + pageSize)
  }, [sortedInvoices, currentPage, pageSize])

  const paginatedGroups = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return sortedGroups.slice(start, start + pageSize)
  }, [sortedGroups, currentPage, pageSize])

  const pageStart = activeListLength === 0 ? 0 : (currentPage - 1) * pageSize + 1
  const pageEnd = Math.min(currentPage * pageSize, activeListLength)

  const handleInvoiceSort = useCallback(
    (field: InvoiceSortField) => {
      if (invoiceSortField === field) {
        setInvoiceSortDir((dir) => (dir === 'asc' ? 'desc' : 'asc'))
      } else {
        setInvoiceSortField(field)
        setInvoiceSortDir(
          field === 'amount' || field === 'balance' || field === 'days_outstanding'
            ? 'desc'
            : 'asc'
        )
      }
    },
    [invoiceSortField]
  )

  const handleGroupSort = useCallback(
    (field: GroupSortField) => {
      if (groupSortField === field) {
        setGroupSortDir((dir) => (dir === 'asc' ? 'desc' : 'asc'))
      } else {
        setGroupSortField(field)
        setGroupSortDir(field === 'name' ? 'asc' : 'desc')
      }
    },
    [groupSortField]
  )

  useEffect(() => {
    setCurrentPage(1)
  }, [
    searchTerm,
    bucketFilter,
    pageSize,
    viewMode,
    scopeFilter,
    invoiceSortField,
    invoiceSortDir,
    groupSortField,
    groupSortDir,
    groupDrillDown,
  ])

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages)
  }, [currentPage, totalPages])

  const selectedInvoice = useMemo(
    () =>
      sortedInvoices.find((inv) => inv.id === selectedInvoiceId) ??
      scopedInvoices.find((inv) => inv.id === selectedInvoiceId) ??
      null,
    [sortedInvoices, scopedInvoices, selectedInvoiceId]
  )

  const detailPanelOpen = Boolean(selectedInvoice) && !detailPanelClosing && viewMode === 'invoices'

  const handleViewInvoice = (invoice: EnrichedInvoice) => {
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

  const toggleBucket = (id: DisplayAgingBucketId) => {
    setBucketFilter((prev) => (prev === id ? 'all' : id))
  }

  const handleGroupDrillDown = (type: 'broker' | 'client', name: string) => {
    setGroupDrillDown({ type, name })
    setViewMode('invoices')
    setSearchTerm('')
    setCurrentPage(1)
  }

  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode)
    setGroupDrillDown(null)
    if (mode !== 'invoices') {
      setSearchTerm('')
      setSelectedInvoiceId(null)
      setShowInvoiceDetail(false)
      setDetailPanelClosing(false)
    }
    setCurrentPage(1)
  }

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
        onNavigateInvoice: (invoice: Invoice) => handleViewInvoice(invoice as EnrichedInvoice),
        onInvoiceUpdated: () => setRefreshKey((k) => k + 1),
        enableClientActions: false,
        payments,
      }
    : null

  return (
    <AdminLayout userName="Admin User" userRole="Administrator" flushMain>
      <div className="client-collections-page overflow-hidden flex flex-col min-h-0">
        {useFullPageDetail && showInvoiceDetail && selectedInvoice && invoiceDetailPanelProps ? (
          <InvoiceDetailPanel variant="mobile" {...invoiceDetailPanelProps} />
        ) : (
          <>
            <section
              className="flex items-center justify-between gap-3 px-4 py-2 border-b shrink-0"
              style={{ borderColor: c.border, backgroundColor: c.stat.slate }}
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <DollarSign className="w-3.5 h-3.5 shrink-0" style={{ color: c.info }} />
                <span className="text-xs font-medium" style={{ color: c.secondary }}>
                  Total open A/R
                </span>
              </div>
              <div className="text-right shrink-0">
                <span className="text-lg font-bold tabular-nums" style={{ color: c.primary }}>
                  {formatCurrency(totalAr)}
                </span>
                <p className="text-[11px] tabular-nums" style={{ color: c.secondary }}>
                  {openCount} open invoice{openCount !== 1 ? 's' : ''}
                  {includeClosed ? ` · ${scopedInvoices.length} shown` : ''}
                </p>
              </div>
            </section>

            <section className="aging-bucket-strip shrink-0">
              {DISPLAY_AGING_BUCKETS.map((bucket) => {
                const summary = bucketSummary[bucket.id]
                const isActive = bucketFilter === bucket.id
                return (
                  <button
                    key={bucket.id}
                    type="button"
                    onClick={() => toggleBucket(bucket.id)}
                    className={`aging-bucket-cell ${isActive ? 'aging-bucket-cell--active' : ''}`}
                    style={{
                      backgroundColor: isActive ? `${bucketColors[bucket.id]}18` : c.card,
                      borderColor: c.border,
                    }}
                    aria-pressed={isActive}
                  >
                    <span
                      className="text-[11px] font-semibold uppercase tracking-wide"
                      style={{ color: bucketColors[bucket.id] }}
                    >
                      {bucket.label}
                    </span>
                    <span className="text-sm font-bold tabular-nums" style={{ color: c.primary }}>
                      {formatCurrency(summary.amount)}
                    </span>
                    <span className="text-[11px] tabular-nums" style={{ color: c.secondary }}>
                      {summary.count} invoice{summary.count !== 1 ? 's' : ''}
                    </span>
                  </button>
                )
              })}
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
                    placeholder={
                      viewMode === 'invoices'
                        ? 'Search invoice, client, broker, load, or batch...'
                        : viewMode === 'brokers'
                          ? 'Search by broker name...'
                          : 'Search by client name...'
                    }
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="client-input pl-8"
                    style={inputCompactStyle}
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {bucketFilter !== 'all' && (
                    <button
                      type="button"
                      onClick={() => setBucketFilter('all')}
                      className="dashboard-btn-secondary"
                    >
                      Clear {getDisplayAgingBucketLabel(bucketFilter)} filter
                    </button>
                  )}
                  <div className="client-segmented-control" role="tablist" aria-label="Invoice scope">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={scopeFilter === 'open'}
                      onClick={() => setScopeFilter('open')}
                      className={`client-segmented-control__btn ${
                        scopeFilter === 'open' ? 'client-segmented-control__btn--active' : ''
                      }`}
                    >
                      Open A/R
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={scopeFilter === 'all'}
                      onClick={() => setScopeFilter('all')}
                      className={`client-segmented-control__btn ${
                        scopeFilter === 'all' ? 'client-segmented-control__btn--active' : ''
                      }`}
                    >
                      All invoices
                    </button>
                  </div>
                  <label className="flex items-center gap-1.5 text-xs font-medium" style={{ color: c.secondary }}>
                    View
                    <select
                      value={viewMode}
                      onChange={(e) => handleViewModeChange(e.target.value as ViewMode)}
                      className="client-input min-w-[120px]"
                      style={inputCompactStyle}
                      aria-label="A/R view"
                    >
                      <option value="invoices">Invoices</option>
                      <option value="brokers">Brokers</option>
                      <option value="clients">Clients</option>
                    </select>
                  </label>
                </div>
              </div>
              {groupDrillDown && viewMode === 'invoices' && (
                <div
                  className="flex items-center gap-2 pt-2 mt-2 border-t"
                  style={{ borderColor: c.border }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      const backMode = groupDrillDown.type === 'broker' ? 'brokers' : 'clients'
                      setGroupDrillDown(null)
                      setViewMode(backMode)
                    }}
                    className="client-page-back"
                  >
                    <ChevronLeft className="w-4 h-4 shrink-0" aria-hidden />
                    {groupDrillDown.type === 'broker' ? 'Brokers' : 'Clients'}
                  </button>
                  <span className="text-xs font-medium truncate" style={{ color: c.secondary }}>
                    {groupDrillDown.name}
                  </span>
                </div>
              )}
        </div>

            {activeListLength === 0 ? (
              <div className="payments-workspace-body flex-1 min-h-0">
                <div className="payments-list-panel flex items-center justify-center text-center py-6 px-4">
                  <div>
                    <FileText className="w-10 h-10 mx-auto mb-3" style={{ color: c.mutedLight }} />
                    <p className="text-base font-medium mb-1" style={{ color: c.primary }}>
                      {viewMode === 'brokers'
                        ? 'No brokers found'
                        : viewMode === 'clients'
                          ? 'No clients found'
                          : includeClosed
                            ? 'No invoices found'
                            : 'No open A/R'}
                    </p>
                    <p className="text-sm" style={{ color: c.secondary }}>
                      {searchTerm || bucketFilter !== 'all'
                        ? 'Try adjusting your search or aging bucket filter'
                        : viewMode === 'brokers'
                          ? 'Brokers with open A/R will appear here'
                          : viewMode === 'clients'
                            ? 'Clients with open A/R will appear here'
                            : includeClosed
                              ? 'Invoices will appear here'
                              : 'Open invoices awaiting payment will appear here'}
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
                  <div className="client-table-scroll client-table-scroll--mobile-stack flex-1 min-h-0 overflow-y-auto overflow-x-auto">
                    {viewMode === 'invoices' ? (
                      <table className="dashboard-table dashboard-table--compact">
                        <thead>
                          <tr>
                            <ClientSortableHeader
                              field="invoice_number"
                              label="Invoice#"
                              sortField={invoiceSortField}
                              sortDir={invoiceSortDir}
                              onSort={handleInvoiceSort}
                            />
                            <ClientSortableHeader
                              field="client_name"
                              label="Client"
                              sortField={invoiceSortField}
                              sortDir={invoiceSortDir}
                              onSort={handleInvoiceSort}
                            />
                            <ClientSortableHeader
                              field="broker_name"
                              label="Broker"
                              sortField={invoiceSortField}
                              sortDir={invoiceSortDir}
                              onSort={handleInvoiceSort}
                            />
                            <ClientSortableHeader
                              field="amount"
                              label="Amount"
                              sortField={invoiceSortField}
                              sortDir={invoiceSortDir}
                              onSort={handleInvoiceSort}
                              className="text-right"
                              align="right"
                            />
                            <ClientSortableHeader
                              field="balance"
                              label="Balance"
                              sortField={invoiceSortField}
                              sortDir={invoiceSortDir}
                              onSort={handleInvoiceSort}
                              className="text-right"
                              align="right"
                            />
                            <ClientSortableHeader
                              field="expected_payment_date"
                              label="Expected Date"
                              sortField={invoiceSortField}
                              sortDir={invoiceSortDir}
                              onSort={handleInvoiceSort}
                            />
                            <ClientSortableHeader
                              field="days_outstanding"
                              label="Days Out"
                              sortField={invoiceSortField}
                              sortDir={invoiceSortDir}
                              onSort={handleInvoiceSort}
                              className="text-right"
                              align="right"
                            />
                            <ClientSortableHeader
                              field="aging_bucket"
                              label="Bucket"
                              sortField={invoiceSortField}
                              sortDir={invoiceSortDir}
                              onSort={handleInvoiceSort}
                            />
                            {includeClosed && (
                              <ClientSortableHeader
                                field="status"
                                label="Status"
                                sortField={invoiceSortField}
                                sortDir={invoiceSortDir}
                                onSort={handleInvoiceSort}
                              />
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {paginatedInvoices.map((invoice) => {
                            const agingDays = getAgingDays(invoice, includeClosed)
                            const bucketId = getDisplayAgingBucketId(agingDays)
                            const balance = getRowBalance(invoice)
                            const isOverdue = isOpenArInvoice(invoice) && agingDays >= 15
                            const severity = getOverdueSeverity(agingDays, isOverdue)
                            const isSelected = selectedInvoice?.id === invoice.id
                            return (
                              <tr
                                key={invoice.id}
                                className={`cursor-pointer ${isSelected ? 'bg-slate-50' : ''} ${
                                  isOverdue ? 'invoice-row--overdue' : ''
                                }`}
                                onClick={() => handleViewInvoice(invoice)}
                              >
                                <ClientListTd
                                  variant="primary"
                                  className="font-semibold"
                                  title={invoice.invoice_number}
                                >
                                  {invoice.invoice_number}
                                </ClientListTd>
                                <ClientListTd
                                  variant="meta"
                                  className="client-list-td--ellipsis"
                                  title={invoice.client_name}
                                >
                                  <span className="client-list-td__clip">{invoice.client_name}</span>
                                </ClientListTd>
                                <ClientListTd
                                  variant="meta"
                                  className="client-list-td--ellipsis"
                                  title={invoice.broker_name}
                                >
                                  <span className="client-list-td__clip">{invoice.broker_name}</span>
                                </ClientListTd>
                                <ClientListTd
                                  variant="amount"
                                  className="text-right font-medium tabular-nums"
                                >
                                  {formatCurrency(invoice.amount)}
                                </ClientListTd>
                                <ClientListTd
                                  variant="desktop"
                                  label="Balance"
                                  className="text-right font-medium tabular-nums"
                                >
                                  {formatCurrency(balance)}
                                </ClientListTd>
                                <ClientListTd
                                  variant="desktop"
                                  label="Expected"
                                  style={{ color: c.secondary }}
                                >
                                  {formatDate(invoice.expected_payment_date)}
                                </ClientListTd>
                                <ClientListTd
                                  variant="desktop"
                                  label="Days Out"
                                  className="text-right tabular-nums"
                                >
                                  <span
                                    className="text-sm font-semibold"
                                    style={{
                                      color: isOverdue
                                        ? getDaysOutstandingColor(severity)
                                        : c.secondary,
                                    }}
                                  >
                                    {agingDays}d
                                  </span>
                                </ClientListTd>
                                <ClientListTd variant="status">
                                  <span
                                    className={`inline-flex items-center ${getBucketPillClass(bucketId)}`}
                                  >
                                    {getDisplayAgingBucketLabel(bucketId)}
                                  </span>
                                </ClientListTd>
                                {includeClosed && (
                                  <ClientListTd variant="status">
                                    {getInvoiceStatusBadge(invoice.status, { compact: true })}
                                  </ClientListTd>
                                )}
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    ) : (
                      <table className="dashboard-table dashboard-table--compact">
                        <thead>
                          <tr>
                            <ClientSortableHeader
                              field="name"
                              label={viewMode === 'brokers' ? 'Broker' : 'Client'}
                              sortField={groupSortField}
                              sortDir={groupSortDir}
                              onSort={handleGroupSort}
                            />
                            {DISPLAY_AGING_BUCKETS.map((bucket) => (
                              <ClientSortableHeader
                                key={bucket.id}
                                field={bucket.id}
                                label={bucket.label}
                                sortField={groupSortField}
                                sortDir={groupSortDir}
                                onSort={handleGroupSort}
                                className="text-right"
                                align="right"
                              />
                            ))}
                            <ClientSortableHeader
                              field="total_amount"
                              label="Total"
                              sortField={groupSortField}
                              sortDir={groupSortDir}
                              onSort={handleGroupSort}
                              className="text-right"
                              align="right"
                            />
                            <ClientSortableHeader
                              field="invoice_count"
                              label="Invoices"
                              sortField={groupSortField}
                              sortDir={groupSortDir}
                              onSort={handleGroupSort}
                              className="text-right"
                              align="right"
                            />
                          </tr>
                        </thead>
                        <tbody>
                          {paginatedGroups.map((row) => (
                            <tr
                              key={row.id}
                              className="cursor-pointer"
                              onClick={() =>
                                handleGroupDrillDown(
                                  viewMode === 'brokers' ? 'broker' : 'client',
                                  row.name
                                )
                              }
                            >
                              <ClientListTd variant="primary" className="font-semibold">
                                {row.name}
                              </ClientListTd>
                              {DISPLAY_AGING_BUCKETS.map((bucket) => (
                                <ClientListTd
                                  key={bucket.id}
                                  variant="desktop"
                                  label={bucket.label}
                                  className="text-right tabular-nums"
                                  style={{
                                    color:
                                      row.buckets[bucket.id].amount > 0 ? c.primary : c.mutedLight,
                                  }}
                                >
                                  {row.buckets[bucket.id].amount > 0
                                    ? formatCurrency(row.buckets[bucket.id].amount)
                                    : '—'}
                                </ClientListTd>
                              ))}
                              <ClientListTd
                                variant="amount"
                                className="text-right font-medium tabular-nums"
                              >
                                {formatCurrency(row.total_amount)}
                              </ClientListTd>
                              <ClientListTd
                                variant="desktop"
                                label="Invoices"
                                className="text-right tabular-nums"
                                style={{ color: c.secondary }}
                              >
                                {row.invoice_count}
                              </ClientListTd>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>

                  <div
                    className="client-page-footer flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-4 py-2 border-t shrink-0"
                    style={{ borderColor: c.border, backgroundColor: c.card }}
                  >
                    <p className="text-xs font-medium" style={{ color: c.secondary }}>
                      Showing {pageStart}–{pageEnd} of {activeListLength}
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

                {!useFullPageDetail && viewMode === 'invoices' && (
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
    </AdminLayout>
  )
}
