import { useState, useMemo, useCallback, useEffect } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  DollarSign,
  Download,
  FileText,
  Search,
  XCircle,
  CheckCircle2,
} from 'lucide-react'
import AdminLayout from '../components/AdminLayout'
import ClientSortableHeader from '../components/client/ClientSortableHeader'
import ClientListTd from '../components/client/ClientListTd'
import { AccountingReportCharts } from '../components/admin/accounting/AccountingReportCharts'
import { getAdminBatchStatusBadge } from '../components/batches/adminBatchStatus'
import { getAllBatches } from '../data/mockBatches'
import { getAllClients } from '../services/clientRegistry'
import { formatCurrency, formatDate } from '../utils/format'
import { useClientTheme } from '../theme/ThemeContext'
import {
  buildBatchAccountingRows,
  buildMonthlyReportSeries,
  summarizeBatchAccounting,
  type DateRange,
  type BatchAccountingRow,
} from '../utils/accountingBatchMetrics'
import {
  getInitialListPageSize,
  PAGE_SIZE_OPTIONS,
  type SortDir,
} from '../utils/clientListPage'

type PageTab = 'batches' | 'reports'

type BatchSortField =
  | 'batch_number'
  | 'client_name'
  | 'submitted_at'
  | 'status'
  | 'total_invoices'
  | 'collectedCount'
  | 'forceClosedCount'
  | 'total_amount'
  | 'feeAmount'
  | 'netAmount'

export default function Accounting() {
  const c = useClientTheme()
  const batches = getAllBatches()
  const clients = getAllClients()

  const [pageTab, setPageTab] = useState<PageTab>('batches')
  const [dateRange, setDateRange] = useState<DateRange>('all')
  const [clientFilter, setClientFilter] = useState<string>('')
  const [searchTerm, setSearchTerm] = useState('')

  const [sortField, setSortField] = useState<BatchSortField>('submitted_at')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [pageSize, setPageSize] = useState(getInitialListPageSize)
  const [page, setPage] = useState(1)

  const batchRows = useMemo(
    () => buildBatchAccountingRows(batches, dateRange, clientFilter || undefined, searchTerm),
    [batches, dateRange, clientFilter, searchTerm]
  )

  const summary = useMemo(() => summarizeBatchAccounting(batchRows), [batchRows])
  const monthlySeries = useMemo(() => buildMonthlyReportSeries(batchRows), [batchRows])

  const sortedRows = useMemo(() => {
    const sorted = [...batchRows]
    sorted.sort((a, b) => {
      let cmp = 0
      switch (sortField) {
        case 'batch_number':
          cmp = a.batch_number.localeCompare(b.batch_number, undefined, { numeric: true })
          break
        case 'client_name':
          cmp = a.client_name.localeCompare(b.client_name)
          break
        case 'submitted_at':
          cmp = new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime()
          break
        case 'status':
          cmp = a.status.localeCompare(b.status)
          break
        case 'total_invoices':
          cmp = a.totalInvoices - b.totalInvoices
          break
        case 'collectedCount':
          cmp = a.collectedCount - b.collectedCount
          break
        case 'forceClosedCount':
          cmp = a.forceClosedCount - b.forceClosedCount
          break
        case 'total_amount':
          cmp = a.total_amount - b.total_amount
          break
        case 'feeAmount':
          cmp = a.feeAmount - b.feeAmount
          break
        case 'netAmount':
          cmp = a.netAmount - b.netAmount
          break
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
    return sorted
  }, [batchRows, sortField, sortDir])

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / pageSize))
  const paginatedRows = useMemo(() => {
    const start = (page - 1) * pageSize
    return sortedRows.slice(start, start + pageSize)
  }, [sortedRows, page, pageSize])

  const pageStart = sortedRows.length === 0 ? 0 : (page - 1) * pageSize + 1
  const pageEnd = Math.min(page * pageSize, sortedRows.length)

  const handleSort = useCallback(
    (field: BatchSortField) => {
      if (sortField === field) {
        setSortDir((dir) => (dir === 'asc' ? 'desc' : 'asc'))
      } else {
        setSortField(field)
        setSortDir(
          field === 'submitted_at' ||
            field === 'total_amount' ||
            field === 'feeAmount' ||
            field === 'netAmount' ||
            field === 'collectedCount' ||
            field === 'forceClosedCount' ||
            field === 'total_invoices'
            ? 'desc'
            : 'asc'
        )
      }
    },
    [sortField]
  )

  useEffect(() => {
    setPage(1)
  }, [searchTerm, clientFilter, dateRange, sortField, sortDir, pageSize])

  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  const handleExportReport = () => {
    alert('Export functionality will be implemented')
  }

  const inputStyle = {
    backgroundColor: c.card,
    height: 34,
    paddingTop: 6,
    paddingBottom: 6,
    fontSize: 13,
  } as const

  const dateFilters: { id: DateRange; label: string }[] = [
    { id: 'all', label: 'All time' },
    { id: 'month', label: 'This month' },
    { id: 'quarter', label: 'This quarter' },
    { id: 'year', label: 'This year' },
  ]

  const statStrip = [
    { label: 'Fees earned', value: formatCurrency(summary.totalFees), tone: c.stat.green, icon: DollarSign },
    {
      label: 'Collected',
      value: `${summary.collectedCount} · ${formatCurrency(summary.collectedAmount)}`,
      tone: c.stat.blue,
      icon: CheckCircle2,
    },
    {
      label: 'Force closed',
      value: `${summary.forceClosedCount} · ${formatCurrency(summary.forceClosedAmount)}`,
      tone: c.stat.amber,
      icon: XCircle,
    },
    { label: 'Batches', value: summary.batchCount, tone: c.stat.slate, icon: FileText },
  ]

  const renderToolbar = () => (
    <div
      className="client-page-toolbar px-4 py-2 border-b flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2 shrink-0"
      style={{ borderColor: c.border, backgroundColor: c.card }}
    >
      <div className="flex flex-wrap gap-1.5">
        {dateFilters.map((btn) => (
          <button
            key={btn.id}
            type="button"
            onClick={() => setDateRange(btn.id)}
            className={`batch-filter-pill ${dateRange === btn.id ? 'batch-filter-pill--active' : ''}`}
          >
            {btn.label}
          </button>
        ))}
      </div>
      <div className="flex flex-col sm:flex-row gap-2 w-full lg:w-auto lg:min-w-[420px]">
        <div className="relative flex-1">
          <Search
            className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5"
            style={{ color: c.secondary }}
          />
          <input
            type="text"
            placeholder="Search batch or client..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="client-input pl-8 w-full"
            style={inputStyle}
          />
        </div>
        <select
          value={clientFilter}
          onChange={(e) => setClientFilter(e.target.value)}
          className="client-input w-full sm:w-44"
          style={inputStyle}
        >
          <option value="">All clients</option>
          {clients.map((client) => (
            <option key={client.id} value={client.id}>
              {client.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  )

  const renderPagination = () => (
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
            style={{ ...inputStyle, width: 64, height: 30, fontSize: 12 }}
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
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="table-page-btn"
            aria-label="Previous page"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-xs font-medium px-2 tabular-nums" style={{ color: c.primary }}>
            {page} / {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="table-page-btn"
            aria-label="Next page"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )

  const renderBatchTable = (rows: BatchAccountingRow[]) => (
  <table className="dashboard-table dashboard-table--compact">
    <thead>
      <tr>
        <ClientSortableHeader
          field="batch_number"
          label="Batch#"
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
        />
        <ClientSortableHeader
          field="submitted_at"
          label="Submitted"
          sortField={sortField}
          sortDir={sortDir}
          onSort={handleSort}
        />
        <ClientSortableHeader
          field="status"
          label="Status"
          sortField={sortField}
          sortDir={sortDir}
          onSort={handleSort}
        />
        <ClientSortableHeader
          field="total_invoices"
          label="Invoices"
          sortField={sortField}
          sortDir={sortDir}
          onSort={handleSort}
          className="text-right"
          align="right"
        />
        <ClientSortableHeader
          field="collectedCount"
          label="Collected"
          sortField={sortField}
          sortDir={sortDir}
          onSort={handleSort}
          className="text-right"
          align="right"
        />
        <ClientSortableHeader
          field="forceClosedCount"
          label="Force closed"
          sortField={sortField}
          sortDir={sortDir}
          onSort={handleSort}
          className="text-right"
          align="right"
        />
        <ClientSortableHeader
          field="total_amount"
          label="Batch amount"
          sortField={sortField}
          sortDir={sortDir}
          onSort={handleSort}
          className="text-right"
          align="right"
        />
        <ClientSortableHeader
          field="feeAmount"
          label="Fee"
          sortField={sortField}
          sortDir={sortDir}
          onSort={handleSort}
          className="text-right"
          align="right"
        />
        <ClientSortableHeader
          field="netAmount"
          label="Net"
          sortField={sortField}
          sortDir={sortDir}
          onSort={handleSort}
          className="text-right"
          align="right"
        />
      </tr>
    </thead>
    <tbody>
      {rows.map((batch) => (
        <tr key={batch.id}>
          <ClientListTd variant="primary" className="font-semibold">
            {batch.batch_number}
          </ClientListTd>
          <ClientListTd variant="desktop" label="Client">
            {batch.client_name}
          </ClientListTd>
          <ClientListTd variant="desktop" label="Submitted" style={{ color: c.secondary }}>
            {formatDate(batch.submitted_at)}
          </ClientListTd>
          <ClientListTd variant="status">{getAdminBatchStatusBadge(batch.status)}</ClientListTd>
          <ClientListTd variant="desktop" label="Invoices" className="text-right tabular-nums">
            {batch.totalInvoices || batch.total_invoices}
          </ClientListTd>
          <ClientListTd
            variant="amount"
            className="text-right tabular-nums"
            style={{ color: batch.collectedCount > 0 ? c.success : c.secondary }}
          >
            <span className="block font-medium">{batch.collectedCount}</span>
            <span className="block text-xs" style={{ color: c.secondary }}>
              {formatCurrency(batch.collectedAmount)}
            </span>
          </ClientListTd>
          <ClientListTd
            variant="amount"
            className="text-right tabular-nums"
            style={{ color: batch.forceClosedCount > 0 ? c.chart.orange : c.secondary }}
          >
            <span className="block font-medium">{batch.forceClosedCount}</span>
            <span className="block text-xs" style={{ color: c.secondary }}>
              {formatCurrency(batch.forceClosedAmount)}
            </span>
          </ClientListTd>
          <ClientListTd variant="amount" className="text-right tabular-nums">
            {formatCurrency(batch.total_amount)}
          </ClientListTd>
          <ClientListTd
            variant="amount"
            className="text-right font-medium tabular-nums"
            style={{ color: batch.feeAmount > 0 ? c.success : c.secondary }}
          >
            {batch.feeAmount > 0 ? formatCurrency(batch.feeAmount) : '—'}
          </ClientListTd>
          <ClientListTd variant="amount" className="text-right tabular-nums">
            {batch.netAmount > 0 ? formatCurrency(batch.netAmount) : '—'}
          </ClientListTd>
        </tr>
      ))}
    </tbody>
  </table>
  )

  return (
    <AdminLayout userName="Admin User" flushMain>
      <div className="admin-accounting-page overflow-hidden flex flex-col min-h-0 h-full">
        <div
          className="client-page-tabs-bar shrink-0 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-4 py-2 border-b"
          style={{ borderColor: c.border, backgroundColor: c.card }}
        >
          <div className="page-tabs flex flex-wrap gap-1">
            <button
              type="button"
              onClick={() => setPageTab('batches')}
              className={`page-tab ${pageTab === 'batches' ? 'page-tab--active' : ''}`}
            >
              Batches
            </button>
            <button
              type="button"
              onClick={() => setPageTab('reports')}
              className={`page-tab ${pageTab === 'reports' ? 'page-tab--active' : ''}`}
            >
              Reports
            </button>
          </div>
          <button
            type="button"
            onClick={handleExportReport}
            className="dashboard-btn-secondary shrink-0 self-start sm:self-auto inline-flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            Export
          </button>
        </div>

        <section
          className="client-stat-strip grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 border-b shrink-0"
          style={{ borderColor: c.border }}
        >
          {statStrip.map((stat) => {
            const Icon = stat.icon
            return (
              <div
                key={stat.label}
                className="flex items-center justify-between gap-2 px-4 py-2.5 border-b sm:border-b-0 sm:border-r last:border-r-0"
                style={{ backgroundColor: stat.tone, borderColor: c.border }}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <Icon className="w-3.5 h-3.5 shrink-0" style={{ color: c.secondary }} strokeWidth={1.75} />
                  <span className="text-xs font-medium truncate" style={{ color: c.secondary }}>
                    {stat.label}
                  </span>
                </div>
                <span className="text-sm font-bold tabular-nums shrink-0 text-right" style={{ color: c.primary }}>
                  {stat.value}
                </span>
              </div>
            )
          })}
        </section>

        {renderToolbar()}

        {pageTab === 'reports' ? (
          <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
            <AccountingReportCharts
              monthlySeries={monthlySeries}
              totals={{
                collectedCount: summary.collectedCount,
                collectedAmount: summary.collectedAmount,
                forceClosedCount: summary.forceClosedCount,
                forceClosedAmount: summary.forceClosedAmount,
              }}
            />
            <div className="dashboard-card overflow-hidden">
              <div
                className="px-4 py-2.5 border-b text-sm font-semibold"
                style={{ borderColor: c.border, color: c.primary }}
              >
                Batch detail
              </div>
              <div className="client-table-scroll overflow-x-auto">
                {sortedRows.length === 0 ? (
                  <p className="text-sm text-center py-10" style={{ color: c.secondary }}>
                    No batches in the selected period
                  </p>
                ) : (
                  renderBatchTable(sortedRows.slice(0, 15))
                )}
              </div>
            </div>
          </div>
        ) : sortedRows.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-center py-12 px-4">
            <div>
              <DollarSign className="w-10 h-10 mx-auto mb-3" style={{ color: c.mutedLight }} />
              <p className="text-base font-medium mb-1" style={{ color: c.primary }}>
                No batch accounting data
              </p>
              <p className="text-sm" style={{ color: c.secondary }}>
                Try a different date range or filter
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="client-table-scroll client-table-scroll--mobile-stack flex-1 min-h-0 overflow-y-auto overflow-x-auto">
              {renderBatchTable(paginatedRows)}
            </div>
            {renderPagination()}
          </>
        )}
      </div>
    </AdminLayout>
  )
}
