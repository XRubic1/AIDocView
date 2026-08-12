/**
 * Carrier Collections — how open invoices are performing.
 * Plain-language performance (not Credyx internal chase queue).
 */
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Search, ChevronLeft, ChevronRight } from 'lucide-react'
import ClientListTd from '../components/client/ClientListTd'
import ClientSortableHeader from '../components/client/ClientSortableHeader'
import InvoiceDetailPanel from '../components/client/InvoiceDetailPanel'
import EmptyState from '../components/ui/EmptyState'
import { mockBrokers } from '../data/mockBrokers'
import { useClientCapabilities } from '../hooks/useClientCapabilities'
import { useClientDemoSnapshot } from '../hooks/useClientDemoSnapshot'
import { useCompactDetailViewport } from '../hooks/useIsMobileViewport'
import { useResizableSplitPane } from '../hooks/useResizableSplitPane'
import {
  applyCollectionsPolicy,
  loadCollectionsPolicy,
} from '../services/platformSettingsService'
import { useClientTheme } from '../theme/ThemeContext'
import type { Invoice } from '../types/invoice'
import { buildAdminCollectionsRows, formatBrokerNetDays } from '../utils/adminCollections'
import {
  buildClientPerformanceRows,
  carrierAttentionLabel,
  clientCollectionsFocusLabel,
  clientPerformanceRank,
  matchesClientCollectionsFocus,
  primaryCarrierAttentionReason,
  progressStepPillClass,
  type ClientCollectionsFocus,
  type ClientPerformanceRow,
} from '../utils/clientCollectionsPerformance'
import { mapClientVisibleInvoices } from '../utils/clientInvoiceView'
import {
  getInitialListPageSize,
  PAGE_SIZE_OPTIONS,
  type SortDir,
} from '../utils/clientListPage'
import { formatCurrency, formatDate } from '../utils/format'

type SortField =
  | 'invoice_number'
  | 'broker_name'
  | 'amount'
  | 'age'
  | 'due_date'
  | 'performance'
  | 'progress'

const FOCUS_TABS: ClientCollectionsFocus[] = [
  'all',
  'needs_attention',
  'overdue',
  'credyx_working',
  'payment_promised',
  'on_track',
]

export default function ClientCollectionsQueue() {
  const c = useClientTheme()
  const { capabilities } = useClientCapabilities()
  const useFullPageDetail = useCompactDetailViewport()
  const { workspaceRef, detailWidth, isResizing, resizeHandleProps } = useResizableSplitPane()
  const [refreshKey, setRefreshKey] = useState(0)
  const { dashboard: data, payments, invoices: rawInvoices } = useClientDemoSnapshot(refreshKey)
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  // Legacy Aging deep-links used /client/collections?broker=…
  useEffect(() => {
    const broker = searchParams.get('broker')?.trim()
    if (!broker) return
    navigate(`/client/aging-ar?broker=${encodeURIComponent(broker)}`, { replace: true })
  }, [searchParams, navigate])

  const [searchTerm, setSearchTerm] = useState('')
  const [focus, setFocus] = useState<ClientCollectionsFocus>('all')
  const [pageSize, setPageSize] = useState(getInitialListPageSize)
  const [currentPage, setCurrentPage] = useState(1)
  const [sortField, setSortField] = useState<SortField>('performance')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [policyTick, setPolicyTick] = useState(0)
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null)
  const [showInvoiceDetail, setShowInvoiceDetail] = useState(false)
  const [detailPanelClosing, setDetailPanelClosing] = useState(false)

  const clientInvoices = useMemo(
    () => mapClientVisibleInvoices(rawInvoices),
    [rawInvoices]
  )

  const brokers = useMemo(() => {
    const ids = new Set(clientInvoices.map((inv) => inv.broker_id).filter(Boolean))
    const names = new Set(clientInvoices.map((inv) => inv.broker_name))
    return mockBrokers.filter((b) => ids.has(b.id) || names.has(b.name))
  }, [clientInvoices])

  useEffect(() => {
    void loadCollectionsPolicy()
      .then((policy) => {
        applyCollectionsPolicy(policy)
        setPolicyTick((n) => n + 1)
      })
      .catch(() => {
        /* keep defaults */
      })
  }, [])

  useEffect(() => {
    const focusParam = searchParams.get('focus') as ClientCollectionsFocus | null
    if (focusParam && FOCUS_TABS.includes(focusParam)) {
      setFocus(focusParam)
    }
  }, [searchParams])

  const rows = useMemo(() => {
    const adminRows = buildAdminCollectionsRows(clientInvoices, payments, brokers)
    return buildClientPerformanceRows(adminRows)
  }, [clientInvoices, payments, brokers, policyTick])

  const counts = useMemo(() => {
    let needsAttention = 0
    let overdue = 0
    let working = 0
    let promised = 0
    let onTrack = 0
    let overdueAmount = 0
    let openAmount = 0
    for (const row of rows) {
      openAmount += row.amount
      if (row.performance === 'needs_attention') needsAttention += 1
      if (row.isOverdue || row.performance === 'overdue') {
        overdue += 1
        overdueAmount += row.amount
      }
      if (
        row.performance === 'credyx_working' ||
        row.performance === 'needs_attention' ||
        (row.chaseStatus !== 'not_due' && row.performance !== 'on_track')
      ) {
        working += 1
      }
      if (row.performance === 'payment_promised') promised += 1
      if (row.performance === 'on_track' || row.performance === 'with_broker') onTrack += 1
    }
    return {
      open: rows.length,
      openAmount,
      needsAttention,
      overdue,
      overdueAmount,
      working,
      promised,
      onTrack,
    }
  }, [rows])

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase()
    return rows.filter((row) => {
      if (!matchesClientCollectionsFocus(row, focus)) return false
      if (!q) return true
      const inv = row.invoice
      return (
        inv.invoice_number.toLowerCase().includes(q) ||
        inv.broker_name.toLowerCase().includes(q) ||
        (inv.load_number || '').toLowerCase().includes(q) ||
        row.whatsHappening.toLowerCase().includes(q) ||
        row.performanceLabel.toLowerCase().includes(q)
      )
    })
  }, [rows, focus, searchTerm])

  const sorted = useMemo(() => {
    const next = [...filtered]
    next.sort((a, b) => {
      let cmp = 0
      if (sortField === 'broker_name') {
        cmp = (a.broker?.name || a.invoice.broker_name).localeCompare(
          b.broker?.name || b.invoice.broker_name
        )
      } else if (sortField === 'invoice_number') {
        cmp = a.invoice.invoice_number.localeCompare(b.invoice.invoice_number)
      } else if (sortField === 'amount') {
        cmp = a.amount - b.amount
      } else if (sortField === 'age') {
        cmp = a.ageDays - b.ageDays
      } else if (sortField === 'due_date') {
        cmp = (a.dueDate || '').localeCompare(b.dueDate || '')
      } else if (sortField === 'progress') {
        const order = { submitted: 0, verified: 1, invoiced: 2, follow_up: 3 }
        cmp = order[a.progressStep] - order[b.progressStep]
      } else {
        cmp = clientPerformanceRank(a.performance) - clientPerformanceRank(b.performance)
        if (cmp === 0) cmp = b.ageDays - a.ageDays
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
    return next
  }, [filtered, sortField, sortDir])

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const pageRows = sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  const pageStart = sorted.length === 0 ? 0 : (currentPage - 1) * pageSize + 1
  const pageEnd = Math.min(currentPage * pageSize, sorted.length)

  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm, focus, pageSize])

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages)
  }, [currentPage, totalPages])

  const selectedInvoice = useMemo(
    () =>
      sorted.find((r) => r.invoice.id === selectedInvoiceId)?.invoice ??
      rows.find((r) => r.invoice.id === selectedInvoiceId)?.invoice ??
      null,
    [sorted, rows, selectedInvoiceId]
  )

  const detailPanelOpen = Boolean(selectedInvoice) && !detailPanelClosing
  const navigationInvoices = useMemo(() => sorted.map((r) => r.invoice), [sorted])

  const handleViewInvoice = (invoice: Invoice) => {
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

  useEffect(() => {
    const highlightId = searchParams.get('highlight_invoice')
    if (!highlightId) return
    const inv = rows.find((r) => r.invoice.id === highlightId)?.invoice
    if (inv) handleViewInvoice(inv)
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('highlight_invoice')
        return next
      },
      { replace: true }
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot deep link
  }, [searchParams, rows])

  const onSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortField(field)
    setSortDir(field === 'broker_name' || field === 'invoice_number' ? 'asc' : 'desc')
  }

  const setFocusAndUrl = (next: ClientCollectionsFocus) => {
    setFocus(next)
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev)
        if (next === 'all') params.delete('focus')
        else params.set('focus', next)
        return params
      },
      { replace: true }
    )
  }

  const inputStyle = { backgroundColor: c.card, color: c.primary }

  const invoiceDetailPanelProps = selectedInvoice
    ? {
        invoice: selectedInvoice,
        clientName: data.client_name,
        navigationInvoices,
        onClose: handleCloseInvoiceDetail,
        onNavigateInvoice: (invoice: Invoice) => handleViewInvoice(invoice),
        onInvoiceUpdated: () => setRefreshKey((key) => key + 1),
        enableClientActions: capabilities.canOpenDispute,
        payments,
      }
    : null

  const focusCount = (key: ClientCollectionsFocus) => {
    if (key === 'all') return counts.open
    if (key === 'needs_attention') return counts.needsAttention
    if (key === 'overdue') return counts.overdue
    if (key === 'credyx_working') return counts.working
    if (key === 'payment_promised') return counts.promised
    if (key === 'on_track') return counts.onTrack
    return 0
  }

  const renderPerformanceCell = (row: ClientPerformanceRow) => {
    const attention = primaryCarrierAttentionReason(row.urgentReasons)
    return (
      <div className="flex flex-col items-start gap-0.5 min-w-0">
        <span className={row.performancePillClass}>{row.performanceLabel}</span>
        {attention && row.performance === 'needs_attention' ? (
          <span className="text-[11px] leading-snug" style={{ color: c.secondary }}>
            {carrierAttentionLabel(attention)}
          </span>
        ) : null}
      </div>
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
                Credyx handles broker follow-up on your plan. Use this page to see how each invoice
                is performing and what happens next.
              </section>
            )}

            <div
              className="payments-workspace-body flex-1 min-h-0"
              ref={workspaceRef}
              style={
                {
                  '--detail-panel-width': `${detailWidth}px`,
                  cursor: isResizing ? 'col-resize' : undefined,
                } as CSSProperties
              }
            >
              <div className="payments-list-panel flex flex-col min-h-0 overflow-hidden">
                <section
                  className="client-stat-strip grid grid-cols-2 lg:grid-cols-5 border-b shrink-0"
                  style={{ borderColor: c.border }}
                >
                  <button
                    type="button"
                    onClick={() => setFocusAndUrl('all')}
                    className="flex items-center justify-between gap-2 px-4 py-2.5 sm:border-r border-b lg:border-b-0 text-left"
                    style={{
                      backgroundColor: focus === 'all' ? c.stat.blue : c.card,
                      borderColor: c.border,
                    }}
                  >
                    <span className="text-xs font-medium" style={{ color: c.secondary }}>
                      Open A/R
                    </span>
                    <span className="text-right">
                      <span
                        className="block text-lg font-bold tabular-nums"
                        style={{ color: c.primary }}
                      >
                        {counts.open}
                      </span>
                      <span className="block text-[11px] tabular-nums" style={{ color: c.secondary }}>
                        {formatCurrency(counts.openAmount)}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setFocusAndUrl(focus === 'needs_attention' ? 'all' : 'needs_attention')
                    }
                    className="flex items-center justify-between gap-2 px-4 py-2.5 lg:border-r border-b lg:border-b-0 text-left"
                    style={{
                      backgroundColor: focus === 'needs_attention' ? c.stat.red : c.card,
                      borderColor: c.border,
                    }}
                  >
                    <span className="text-xs font-medium" style={{ color: c.secondary }}>
                      Needs attention
                    </span>
                    <span className="text-lg font-bold tabular-nums" style={{ color: c.error }}>
                      {counts.needsAttention}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setFocusAndUrl(focus === 'overdue' ? 'all' : 'overdue')}
                    className="flex items-center justify-between gap-2 px-4 py-2.5 sm:border-r border-b lg:border-b-0 text-left"
                    style={{
                      backgroundColor: focus === 'overdue' ? c.stat.amber : c.card,
                      borderColor: c.border,
                    }}
                  >
                    <span className="text-xs font-medium" style={{ color: c.secondary }}>
                      Past due
                    </span>
                    <span className="text-right">
                      <span
                        className="block text-lg font-bold tabular-nums"
                        style={{ color: c.error }}
                      >
                        {counts.overdue}
                      </span>
                      <span className="block text-[11px] tabular-nums" style={{ color: c.secondary }}>
                        {formatCurrency(counts.overdueAmount)}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setFocusAndUrl(focus === 'credyx_working' ? 'all' : 'credyx_working')
                    }
                    className="flex items-center justify-between gap-2 px-4 py-2.5 lg:border-r border-b lg:border-b-0 text-left"
                    style={{
                      backgroundColor: focus === 'credyx_working' ? c.stat.blue : c.card,
                      borderColor: c.border,
                    }}
                  >
                    <span className="text-xs font-medium" style={{ color: c.secondary }}>
                      Credyx working
                    </span>
                    <span className="text-lg font-bold tabular-nums" style={{ color: c.primary }}>
                      {counts.working}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setFocusAndUrl(focus === 'payment_promised' ? 'all' : 'payment_promised')
                    }
                    className="flex items-center justify-between gap-2 px-4 py-2.5 text-left"
                    style={{
                      backgroundColor: focus === 'payment_promised' ? c.stat.green : c.card,
                      borderColor: c.border,
                    }}
                  >
                    <span className="text-xs font-medium" style={{ color: c.secondary }}>
                      Payment promised
                    </span>
                    <span className="text-lg font-bold tabular-nums" style={{ color: c.primary }}>
                      {counts.promised}
                    </span>
                  </button>
                </section>

                <div
                  className="client-page-toolbar px-4 py-2 border-b shrink-0 space-y-2"
                  style={{ borderColor: c.border, backgroundColor: c.card }}
                >
                  <div className="flex-1 relative">
                    <Search
                      className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5"
                      style={{ color: c.secondary }}
                    />
                    <input
                      type="text"
                      placeholder="Search invoice, broker, load, or status…"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="client-input pl-8"
                      style={inputStyle}
                    />
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {FOCUS_TABS.map((key) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setFocusAndUrl(key)}
                        className={`page-tab !py-1 !px-2 !text-xs ${
                          focus === key ? 'page-tab--active' : ''
                        }`}
                      >
                        {clientCollectionsFocusLabel(key)} ({focusCount(key)})
                      </button>
                    ))}
                  </div>
                </div>

                {sorted.length === 0 ? (
                  <div className="flex-1 min-h-0 flex items-center justify-center p-6">
                    <EmptyState
                      title="No invoices in this view"
                      hint="Try another filter. Open invoices show here with how they’re performing."
                    />
                  </div>
                ) : (
                  <div className="client-table-scroll flex-1 min-h-0 overflow-y-auto overflow-x-auto">
                    <table className="dashboard-table dashboard-table--compact">
                      <thead>
                        <tr>
                          <ClientSortableHeader
                            field="invoice_number"
                            label="Invoice"
                            sortField={sortField}
                            sortDir={sortDir}
                            onSort={onSort}
                          />
                          <ClientSortableHeader
                            field="broker_name"
                            label="Broker"
                            sortField={sortField}
                            sortDir={sortDir}
                            onSort={onSort}
                          />
                          <ClientSortableHeader
                            field="amount"
                            label="Balance"
                            sortField={sortField}
                            sortDir={sortDir}
                            onSort={onSort}
                            align="right"
                          />
                          <ClientSortableHeader
                            field="due_date"
                            label="Due"
                            sortField={sortField}
                            sortDir={sortDir}
                            onSort={onSort}
                          />
                          <ClientSortableHeader
                            field="progress"
                            label="Stage"
                            sortField={sortField}
                            sortDir={sortDir}
                            onSort={onSort}
                            title="Where this invoice is in the Credyx workflow"
                          />
                          <ClientSortableHeader
                            field="performance"
                            label="Performance"
                            sortField={sortField}
                            sortDir={sortDir}
                            onSort={onSort}
                            title="How this invoice is performing right now"
                          />
                          <th className="text-left" title="What Credyx or the broker is doing">
                            What’s happening
                          </th>
                          <th className="text-left">What’s next</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pageRows.map((row) => {
                          const selected = selectedInvoice?.id === row.invoice.id
                          return (
                            <tr
                              key={row.invoice.id}
                              className={`cursor-pointer ${selected ? 'invoice-row--selected' : ''} ${
                                row.performance === 'needs_attention' || row.isOverdue
                                  ? 'invoice-row--overdue'
                                  : ''
                              }`}
                              onClick={() => handleViewInvoice(row.invoice)}
                            >
                              <ClientListTd variant="primary">
                                <div className="font-medium" style={{ color: c.primary }}>
                                  {row.invoice.invoice_number}
                                </div>
                                <div className="text-[11px]" style={{ color: c.secondary }}>
                                  {row.invoice.load_number
                                    ? `Load ${row.invoice.load_number}`
                                    : `${row.ageDays}d old`}
                                </div>
                              </ClientListTd>
                              <ClientListTd>
                                <div className="truncate max-w-[140px]">
                                  {row.broker?.name || row.invoice.broker_name}
                                </div>
                                <div className="text-[11px]" style={{ color: c.secondary }}>
                                  {formatBrokerNetDays(row.dueDays)}
                                </div>
                              </ClientListTd>
                              <ClientListTd variant="amount" className="tabular-nums">
                                {formatCurrency(row.amount)}
                              </ClientListTd>
                              <ClientListTd>
                                <div className="tabular-nums">
                                  {row.dueDate ? formatDate(row.dueDate) : '—'}
                                </div>
                                {row.isOverdue ? (
                                  <span className="status-pill status-pill--overdue">
                                    {row.daysPastDue}d late
                                  </span>
                                ) : row.confirmedPayDate ? (
                                  <span className="text-[11px]" style={{ color: c.secondary }}>
                                    Pay by {formatDate(row.confirmedPayDate)}
                                  </span>
                                ) : null}
                              </ClientListTd>
                              <ClientListTd variant="status">
                                <span className={progressStepPillClass(row.progressStep)}>
                                  {row.progressLabel}
                                </span>
                              </ClientListTd>
                              <ClientListTd variant="status">
                                {renderPerformanceCell(row)}
                              </ClientListTd>
                              <ClientListTd>
                                <p
                                  className="text-xs leading-snug max-w-[280px]"
                                  style={{ color: c.primary }}
                                >
                                  {row.whatsHappening}
                                </p>
                              </ClientListTd>
                              <ClientListTd>
                                <p
                                  className="text-xs leading-snug max-w-[200px]"
                                  style={{ color: c.secondary }}
                                >
                                  {row.whatsNext ?? '—'}
                                </p>
                              </ClientListTd>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {sorted.length > 0 ? (
                  <div
                    className="client-page-footer flex items-center justify-between gap-2 px-3 py-2 border-t shrink-0"
                    style={{ borderColor: c.border }}
                  >
                    <div className="flex items-center gap-2 text-xs" style={{ color: c.secondary }}>
                      <span>
                        Showing {pageStart}–{pageEnd} of {sorted.length}
                      </span>
                      <label className="inline-flex items-center gap-1">
                        <span>Rows</span>
                        <select
                          value={pageSize}
                          onChange={(e) => setPageSize(Number(e.target.value))}
                          className="client-input !h-7 !py-0 !text-xs"
                          style={{ backgroundColor: c.card, width: 64 }}
                        >
                          {PAGE_SIZE_OPTIONS.map((n) => (
                            <option key={n} value={n}>
                              {n}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        className="table-page-btn"
                        disabled={currentPage <= 1}
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        aria-label="Previous page"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <span className="text-xs tabular-nums px-2" style={{ color: c.secondary }}>
                        {currentPage}/{totalPages}
                      </span>
                      <button
                        type="button"
                        className="table-page-btn"
                        disabled={currentPage >= totalPages}
                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                        aria-label="Next page"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ) : null}
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
          </>
        )}
      </div>
    </>
  )
}
