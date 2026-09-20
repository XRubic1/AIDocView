import { useState, useEffect, useMemo, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useClientDemoSnapshot } from '../hooks/useClientDemoSnapshot'
import { useClientCapabilities } from '../hooks/useClientCapabilities'
import { useCompactDetailViewport } from '../hooks/useIsMobileViewport'
import { useResizableSplitPane } from '../hooks/useResizableSplitPane'
import type { Invoice } from '../types/invoice'
import { formatCurrency, formatDate } from '../utils/format'
import {
  Search,
  DollarSign,
  ChevronLeft,
  ChevronRight,
  FileText,
  Building2,
} from 'lucide-react'
import ClientSortableHeader from '../components/client/ClientSortableHeader'
import ClientListTd from '../components/client/ClientListTd'
import InvoiceDetailPanel from '../components/client/InvoiceDetailPanel'
import {
  getInitialListPageSize,
  PAGE_SIZE_OPTIONS,
  type SortDir,
} from '../utils/clientListPage'
import {
  AR_POLICY,
  DISPLAY_AGING_BUCKETS,
  DisplayAgingBucketId,
  EnrichedInvoice,
  enrichInvoices,
  getDaysOutstandingColor,
  getDisplayAgingBucketId,
  getDisplayAgingBucketLabel,
  getOverdueSeverity,
  isForceCloseApplicable,
  isOpenArInvoice,
} from '../utils/invoiceAging'
import { mapClientVisibleInvoices } from '../utils/clientInvoiceView'
import { AMOUNT_EPSILON, getInvoiceOpenArBalance } from '../utils/paymentVariance'
import { useClientTheme } from '../theme/ThemeContext'

type ViewMode = 'invoices' | 'brokers'
type BucketFilter = 'all' | DisplayAgingBucketId

type InvoiceSortField =
  | 'invoice_number'
  | 'broker_name'
  | 'amount'
  | 'balance'
  | 'expected_payment_date'
  | 'days_outstanding'
  | 'aging_bucket'

type BrokerSortField =
  | 'broker_name'
  | 'total_amount'
  | 'invoice_count'
  | DisplayAgingBucketId

interface BrokerAgingRow {
  broker_id: string
  broker_name: string
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

export default function ClientCollections() {
  const c = useClientTheme()
  const { capabilities } = useClientCapabilities()
  const useFullPageDetail = useCompactDetailViewport()
  const { workspaceRef, detailWidth, isResizing, resizeHandleProps } = useResizableSplitPane()
  const [refreshKey, setRefreshKey] = useState(0)
  const { dashboard: data, payments, invoices: rawInvoices } = useClientDemoSnapshot(refreshKey)
  const [searchParams, setSearchParams] = useSearchParams()
  const [highlightedInvoiceId, setHighlightedInvoiceId] = useState<string | null>(null)

  const clientInvoices = useMemo(
    () => mapClientVisibleInvoices(rawInvoices),
    [rawInvoices]
  )

  const openBalanceById = useMemo(() => {
    const map = new Map<string, number>()
    for (const inv of clientInvoices) {
      map.set(inv.id, getInvoiceOpenArBalance(inv, payments))
    }
    return map
  }, [clientInvoices, payments])

  const openArInvoices = useMemo(() => {
    return enrichInvoices(clientInvoices, new Date(), capabilities).filter((inv) => {
      if (!isOpenArInvoice(inv)) return false
      return (openBalanceById.get(inv.id) ?? inv.amount) > AMOUNT_EPSILON
    })
  }, [clientInvoices, openBalanceById, capabilities])

  const [viewMode, setViewMode] = useState<ViewMode>('invoices')
  const [brokerDrillDown, setBrokerDrillDown] = useState<string | null>(null)
  const [bucketFilter, setBucketFilter] = useState<BucketFilter>('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [showInvoiceDetail, setShowInvoiceDetail] = useState(false)
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null)
  const [detailPanelClosing, setDetailPanelClosing] = useState(false)
  const [pageSize, setPageSize] = useState<number>(getInitialListPageSize)
  const [currentPage, setCurrentPage] = useState(1)
  const [invoiceSortField, setInvoiceSortField] = useState<InvoiceSortField>('days_outstanding')
  const [invoiceSortDir, setInvoiceSortDir] = useState<SortDir>('desc')
  const [brokerSortField, setBrokerSortField] = useState<BrokerSortField>('total_amount')
  const [brokerSortDir, setBrokerSortDir] = useState<SortDir>('desc')

  const bucketSummary = useMemo(() => {
    const summary = createEmptyBuckets()
    openArInvoices.forEach((inv) => {
      const bucketId = getDisplayAgingBucketId(inv.invoiceAgeDays)
      const balance = openBalanceById.get(inv.id) ?? inv.amount
      summary[bucketId].amount += balance
      summary[bucketId].count += 1
    })
    return summary
  }, [openArInvoices, openBalanceById])

  const totalAr = useMemo(
    () =>
      openArInvoices.reduce((sum, inv) => sum + (openBalanceById.get(inv.id) ?? inv.amount), 0),
    [openArInvoices, openBalanceById]
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
    return openArInvoices.filter((inv) => {
      const bucketId = getDisplayAgingBucketId(inv.invoiceAgeDays)
      const matchesBucket = bucketFilter === 'all' || bucketId === bucketFilter
      const term = searchTerm.toLowerCase()
      const matchesSearch =
        inv.invoice_number.toLowerCase().includes(term) ||
        inv.broker_name.toLowerCase().includes(term) ||
        inv.load_number?.toLowerCase().includes(term) ||
        inv.batch_number?.toLowerCase().includes(term)
      return matchesBucket && matchesSearch
    })
  }, [openArInvoices, bucketFilter, searchTerm])

  const sortedInvoices = useMemo(() => {
    const sorted = [...filteredInvoices]
    sorted.sort((a, b) => {
      let cmp = 0
      switch (invoiceSortField) {
        case 'invoice_number':
          cmp = a.invoice_number.localeCompare(b.invoice_number, undefined, { numeric: true })
          break
        case 'broker_name':
          cmp = a.broker_name.localeCompare(b.broker_name)
          break
        case 'amount':
          cmp = a.amount - b.amount
          break
        case 'balance':
          cmp =
            (openBalanceById.get(a.id) ?? a.amount) - (openBalanceById.get(b.id) ?? b.amount)
          break
        case 'expected_payment_date': {
          const aDate = a.expected_payment_date || a.due_date || ''
          const bDate = b.expected_payment_date || b.due_date || ''
          cmp = new Date(aDate || 0).getTime() - new Date(bDate || 0).getTime()
          break
        }
        case 'days_outstanding':
          cmp = a.invoiceAgeDays - b.invoiceAgeDays
          break
        case 'aging_bucket':
          cmp = getDisplayAgingBucketId(a.invoiceAgeDays).localeCompare(
            getDisplayAgingBucketId(b.invoiceAgeDays)
          )
          break
      }
      return invoiceSortDir === 'asc' ? cmp : -cmp
    })
    return sorted
  }, [filteredInvoices, invoiceSortField, invoiceSortDir, openBalanceById])

  const brokerRows = useMemo(() => {
    const map = new Map<string, BrokerAgingRow>()

    openArInvoices.forEach((inv) => {
      const bucketId = getDisplayAgingBucketId(inv.invoiceAgeDays)
      const balance = openBalanceById.get(inv.id) ?? inv.amount
      const key = inv.broker_id || inv.broker_name
      const existing =
        map.get(key) ??
        ({
          broker_id: inv.broker_id || key,
          broker_name: inv.broker_name,
          invoice_count: 0,
          total_amount: 0,
          buckets: createEmptyBuckets(),
        } satisfies BrokerAgingRow)

      existing.invoice_count += 1
      existing.total_amount += balance
      existing.buckets[bucketId].amount += balance
      existing.buckets[bucketId].count += 1
      map.set(key, existing)
    })

    return Array.from(map.values())
  }, [openArInvoices, openBalanceById])

  const filteredBrokers = useMemo(() => {
    return brokerRows.filter((row) => {
      const term = searchTerm.toLowerCase()
      const matchesSearch = row.broker_name.toLowerCase().includes(term)
      const matchesBucket =
        bucketFilter === 'all' || row.buckets[bucketFilter].count > 0
      return matchesSearch && matchesBucket
    })
  }, [brokerRows, searchTerm, bucketFilter])

  const sortedBrokers = useMemo(() => {
    const sorted = [...filteredBrokers]
    sorted.sort((a, b) => {
      let cmp = 0
      if (brokerSortField === 'broker_name') {
        cmp = a.broker_name.localeCompare(b.broker_name)
      } else if (brokerSortField === 'total_amount') {
        cmp = a.total_amount - b.total_amount
      } else if (brokerSortField === 'invoice_count') {
        cmp = a.invoice_count - b.invoice_count
      } else {
        cmp = a.buckets[brokerSortField].amount - b.buckets[brokerSortField].amount
      }
      return brokerSortDir === 'asc' ? cmp : -cmp
    })
    return sorted
  }, [filteredBrokers, brokerSortField, brokerSortDir])

  const activeListLength = viewMode === 'invoices' ? sortedInvoices.length : sortedBrokers.length
  const totalPages = Math.max(1, Math.ceil(activeListLength / pageSize))

  const paginatedInvoices = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return sortedInvoices.slice(start, start + pageSize)
  }, [sortedInvoices, currentPage, pageSize])

  const paginatedBrokers = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return sortedBrokers.slice(start, start + pageSize)
  }, [sortedBrokers, currentPage, pageSize])

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

  const handleBrokerSort = useCallback(
    (field: BrokerSortField) => {
      if (brokerSortField === field) {
        setBrokerSortDir((dir) => (dir === 'asc' ? 'desc' : 'asc'))
      } else {
        setBrokerSortField(field)
        setBrokerSortDir(field === 'broker_name' ? 'asc' : 'desc')
      }
    },
    [brokerSortField]
  )

  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm, bucketFilter, pageSize, viewMode, invoiceSortField, invoiceSortDir, brokerSortField, brokerSortDir])

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages)
    }
  }, [currentPage, totalPages])

  const highlightInvoiceId = searchParams.get('highlight_invoice')

  useEffect(() => {
    if (!highlightInvoiceId) return

    setHighlightedInvoiceId(highlightInvoiceId)
    setSelectedInvoiceId(highlightInvoiceId)
    setDetailPanelClosing(false)
    if (useFullPageDetail) setShowInvoiceDetail(true)
    setViewMode('invoices')
    const highlightIndex = sortedInvoices.findIndex((inv) => inv.id === highlightInvoiceId)
    if (highlightIndex >= 0) {
      setCurrentPage(Math.floor(highlightIndex / pageSize) + 1)
    }
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('highlight_invoice')
        return next
      },
      { replace: true }
    )

    const timer = setTimeout(() => {
      setHighlightedInvoiceId(null)
    }, 3000)

    return () => clearTimeout(timer)
  }, [highlightInvoiceId, setSearchParams, sortedInvoices, pageSize, useFullPageDetail])

  const selectedInvoice = useMemo(
    () =>
      sortedInvoices.find((inv) => inv.id === selectedInvoiceId) ??
      openArInvoices.find((inv) => inv.id === selectedInvoiceId) ??
      null,
    [sortedInvoices, openArInvoices, selectedInvoiceId]
  )

  const detailPanelOpen = Boolean(selectedInvoice) && !detailPanelClosing

  useEffect(() => {
    if (!selectedInvoiceId) return
    const stillVisible = openArInvoices.some((inv) => inv.id === selectedInvoiceId)
    if (!stillVisible) {
      if (sortedInvoices.length > 0 && (showInvoiceDetail || !useFullPageDetail)) {
        setSelectedInvoiceId(sortedInvoices[0].id)
      } else {
        setShowInvoiceDetail(false)
        setSelectedInvoiceId(null)
      }
    }
  }, [openArInvoices, sortedInvoices, selectedInvoiceId, showInvoiceDetail, useFullPageDetail])

  const handleViewInvoiceDetail = (invoice: EnrichedInvoice | string) => {
    const id = typeof invoice === 'string' ? invoice : invoice.id
    setDetailPanelClosing(false)
    setSelectedInvoiceId(id)
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

  const handleBrokerDrillDown = (brokerName: string) => {
    setViewMode('invoices')
    setSearchTerm(brokerName)
    setBrokerDrillDown(brokerName)
    setCurrentPage(1)
  }

  const handleBackFromDrillDown = () => {
    setViewMode('brokers')
    setSearchTerm('')
    setBrokerDrillDown(null)
    setCurrentPage(1)
    if (searchParams.has('broker')) {
      const next = new URLSearchParams(searchParams)
      next.delete('broker')
      setSearchParams(next, { replace: true })
    }
  }

  useEffect(() => {
    if (brokerDrillDown && searchTerm !== brokerDrillDown) {
      setBrokerDrillDown(null)
    }
  }, [searchTerm, brokerDrillDown])

  // Deep-link from Brokers tab: /client/aging-ar?broker=Name
  useEffect(() => {
    const broker = searchParams.get('broker')?.trim()
    if (!broker) return
    setViewMode('invoices')
    setSearchTerm(broker)
    setBrokerDrillDown(broker)
    setBucketFilter('all')
    setCurrentPage(1)
  }, [searchParams])

  const inputCompactStyle = {
    backgroundColor: c.card,
    height: 34,
    paddingTop: 6,
    paddingBottom: 6,
    fontSize: 13,
  } as const

  const toggleBucket = (bucketId: DisplayAgingBucketId) => {
    setBucketFilter((prev) => (prev === bucketId ? 'all' : bucketId))
  }

  const invoiceDetailPanelProps = selectedInvoice
    ? {
        invoice: selectedInvoice,
        clientName: data.client_name,
        navigationInvoices: sortedInvoices,
        onClose: handleCloseInvoiceDetail,
        onNavigateInvoice: (invoice: Invoice) => handleViewInvoiceDetail(invoice as EnrichedInvoice),
        onInvoiceUpdated: () => setRefreshKey((key) => key + 1),
        enableClientActions: capabilities.canOpenDispute,
        payments,
      }
    : null

  const renderInvoiceRow = (invoice: EnrichedInvoice) => {
    const isHighlighted = highlightedInvoiceId === invoice.id
    const isSelected = selectedInvoice?.id === invoice.id
    const bucketId = getDisplayAgingBucketId(invoice.invoiceAgeDays)
    const isOverdue = invoice.daysOutstanding >= AR_POLICY.collectionsOverdueDays
    const isForceCloseRow = isForceCloseApplicable(invoice, capabilities)
    const severity = getOverdueSeverity(
      invoice.daysOutstanding,
      isOverdue,
      capabilities.hasForceClose
    )

    return (
      <tr
        key={invoice.id}
        className={`cursor-pointer ${isHighlighted ? 'batch-highlight-row' : ''} ${
          isSelected ? 'bg-slate-50' : ''
        } ${
          isForceCloseRow ? 'invoice-row--force-close' : isOverdue ? 'invoice-row--overdue' : ''
        }`}
        onClick={() => handleViewInvoiceDetail(invoice)}
      >
        <ClientListTd variant="primary" className="font-semibold">
          {invoice.invoice_number}
        </ClientListTd>
        <ClientListTd variant="meta" className="truncate">
          {invoice.broker_name}
        </ClientListTd>
        <ClientListTd
          variant="desktop"
          label="Invoice Amount"
          className="text-right font-medium tabular-nums"
          style={{ color: c.secondary }}
        >
          {formatCurrency(invoice.amount)}
        </ClientListTd>
        <ClientListTd variant="amount" className="text-right font-medium tabular-nums">
          {formatCurrency(openBalanceById.get(invoice.id) ?? invoice.amount)}
        </ClientListTd>
        <ClientListTd variant="desktop" label="Expected Date" style={{ color: c.secondary }}>
          {formatDate(invoice.expected_payment_date)}
        </ClientListTd>
        <ClientListTd variant="desktop" label="Invoice Age" className="text-right tabular-nums">
          <span
            className="text-sm font-semibold"
            style={{
              color: isOverdue ? getDaysOutstandingColor(severity) : c.secondary,
            }}
          >
            {invoice.invoiceAgeDays}d
          </span>
        </ClientListTd>
        <ClientListTd variant="status">
          <span className={`inline-flex items-center ${getBucketPillClass(bucketId)}`}>
            {getDisplayAgingBucketLabel(bucketId)}
          </span>
        </ClientListTd>
      </tr>
    )
  }

  return (
    <>
      <div className="client-collections-page overflow-hidden flex flex-col min-h-0">
        {useFullPageDetail && showInvoiceDetail && selectedInvoice && invoiceDetailPanelProps ? (
          <InvoiceDetailPanel variant="mobile" {...invoiceDetailPanelProps} />
        ) : (
          <>
            {!capabilities.canRunInvoiceOps && (
              <section
                className="shrink-0 px-4 py-2.5 border-b text-sm"
                style={{ borderColor: c.border, backgroundColor: c.stat.amber, color: c.secondary }}
              >
                Collections follow-up is managed by Credyx on your plan. View aging and invoice details
                here; contact Credyx for broker outreach and force-close actions.
              </section>
            )}
            {capabilities.canRunInvoiceOps &&
              !capabilities.hasForceClose &&
              openArInvoices.some((inv) => inv.isForceCloseEligible) && (
                <section
                  className="shrink-0 px-4 py-2.5 border-b text-sm"
                  style={{ borderColor: c.border, backgroundColor: c.stat.amber, color: c.secondary }}
                >
                  Some invoices are aged 90+ days — awaiting your action (post payment, write-off
                  request, or dispute). Self-service plans do not use Credyx force-close.
                </section>
              )}
            <section
              className="flex items-center justify-between gap-3 px-4 py-2 border-b shrink-0"
              style={{ borderColor: c.border, backgroundColor: c.stat.slate }}
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <DollarSign className="w-3.5 h-3.5 shrink-0" style={{ color: c.info }} />
                <span className="text-xs font-medium" style={{ color: c.secondary }}>
                  Total A/R
                </span>
              </div>
              <div className="text-right shrink-0">
                <span className="text-lg font-bold tabular-nums" style={{ color: c.primary }}>
                  {formatCurrency(totalAr)}
                </span>
                <p className="text-[11px] tabular-nums" style={{ color: c.secondary }}>
                  {openArInvoices.length} open invoice{openArInvoices.length !== 1 ? 's' : ''}
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
                        ? 'Search by invoice, broker, load, or batch...'
                        : 'Search by broker name...'
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
                  <div className="client-segmented-control" role="tablist" aria-label="A/R view">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={viewMode === 'invoices'}
                      onClick={() => {
                        setViewMode('invoices')
                        setBrokerDrillDown(null)
                      }}
                      className={`client-segmented-control__btn ${
                        viewMode === 'invoices' ? 'client-segmented-control__btn--active' : ''
                      }`}
                    >
                      <FileText className="w-3.5 h-3.5 shrink-0" aria-hidden />
                      Invoices
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={viewMode === 'brokers'}
                      onClick={() => {
                        setViewMode('brokers')
                        setBrokerDrillDown(null)
                        setSearchTerm('')
                      }}
                      className={`client-segmented-control__btn ${
                        viewMode === 'brokers' ? 'client-segmented-control__btn--active' : ''
                      }`}
                    >
                      <Building2 className="w-3.5 h-3.5 shrink-0" aria-hidden />
                      Brokers
                    </button>
                  </div>
                </div>
              </div>
              {brokerDrillDown && viewMode === 'invoices' && (
                <div
                  className="flex items-center gap-2 pt-2 mt-2 border-t"
                  style={{ borderColor: c.border }}
                >
                  <button
                    type="button"
                    onClick={handleBackFromDrillDown}
                    className="client-page-back"
                  >
                    <ChevronLeft className="w-4 h-4 shrink-0" aria-hidden />
                    Brokers
                  </button>
                  <span className="text-xs font-medium truncate" style={{ color: c.secondary }}>
                    {brokerDrillDown}
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
                      No open A/R
                    </p>
                    <p className="text-sm" style={{ color: c.secondary }}>
                      {searchTerm || bucketFilter !== 'all'
                        ? 'Try adjusting your search or aging bucket filter'
                        : 'Open invoices awaiting payment will appear here'}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div
                ref={workspaceRef}
                className={`payments-workspace-body flex-1 min-h-0 ${
                  detailPanelOpen && viewMode === 'invoices'
                    ? 'payments-workspace-body--detail-open'
                    : ''
                } ${isResizing ? 'payments-workspace-body--resizing' : ''}`}
                style={
                  detailPanelOpen && viewMode === 'invoices'
                    ? ({ '--payments-detail-width': `${detailWidth}px` } as React.CSSProperties)
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
                              field="broker_name"
                              label="Broker"
                              sortField={invoiceSortField}
                              sortDir={invoiceSortDir}
                              onSort={handleInvoiceSort}
                            />
                            <ClientSortableHeader
                              field="amount"
                              label="Invoice Amount"
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
                              label="Invoice Age"
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
                          </tr>
                        </thead>
                        <tbody>{paginatedInvoices.map(renderInvoiceRow)}</tbody>
                      </table>
                    ) : (
                      <table className="dashboard-table dashboard-table--compact">
                        <thead>
                          <tr>
                            <ClientSortableHeader
                              field="broker_name"
                              label="Broker"
                              sortField={brokerSortField}
                              sortDir={brokerSortDir}
                              onSort={handleBrokerSort}
                            />
                            {DISPLAY_AGING_BUCKETS.map((bucket) => (
                              <ClientSortableHeader
                                key={bucket.id}
                                field={bucket.id}
                                label={bucket.label}
                                sortField={brokerSortField}
                                sortDir={brokerSortDir}
                                onSort={handleBrokerSort}
                                className="text-right"
                                align="right"
                              />
                            ))}
                            <ClientSortableHeader
                              field="total_amount"
                              label="Total"
                              sortField={brokerSortField}
                              sortDir={brokerSortDir}
                              onSort={handleBrokerSort}
                              className="text-right"
                              align="right"
                            />
                            <ClientSortableHeader
                              field="invoice_count"
                              label="Invoices"
                              sortField={brokerSortField}
                              sortDir={brokerSortDir}
                              onSort={handleBrokerSort}
                              className="text-right"
                              align="right"
                            />
                          </tr>
                        </thead>
                        <tbody>
                          {paginatedBrokers.map((row) => (
                            <tr
                              key={row.broker_id}
                              className="cursor-pointer"
                              onClick={() => handleBrokerDrillDown(row.broker_name)}
                            >
                              <ClientListTd variant="primary" className="font-semibold">
                                {row.broker_name}
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
                        aria-valuemin={280}
                        aria-valuemax={480}
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
    </>
  )
}
