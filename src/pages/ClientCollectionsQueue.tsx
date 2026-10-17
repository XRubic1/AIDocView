/**
 * Carrier Collections — how open invoices are performing.
 * Plain-language performance (not Credyx internal chase queue).
 */
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Search, ChevronLeft, ChevronRight, Info } from 'lucide-react'
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
import { buildAdminCollectionsRows } from '../utils/adminCollections'
import {
  buildClientPerformanceRows,
  carrierAttentionLabel,
  clientCollectionsFocusLabel,
  clientPerformanceRank,
  matchesClientCollectionsFocus,
  primaryCarrierAttentionReason,
  type ClientCollectionsFocus,
} from '../utils/clientCollectionsPerformance'
import { mapClientVisibleInvoices } from '../utils/clientInvoiceView'
import {
  getInitialListPageSize,
  PAGE_SIZE_OPTIONS,
  type SortDir,
} from '../utils/clientListPage'
import { formatCurrency, formatDate } from '../utils/format'
import '../styles/clientCollectionsQueue.css'

type SortField =
  | 'invoice_number'
  | 'broker_name'
  | 'amount'
  | 'age'
  | 'due_date'
  | 'performance'
  | 'progress'
  | 'next_followup'

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
      } else if (sortField === 'next_followup') {
        cmp = (a.nextFollowup?.date || '').localeCompare(b.nextFollowup?.date || '')
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

  return (
    <>
      <div className="client-collections-page overflow-hidden flex flex-col min-h-0">
        {useFullPageDetail && showInvoiceDetail && selectedInvoice && invoiceDetailPanelProps ? (
          <InvoiceDetailPanel variant="mobile" {...invoiceDetailPanelProps} />
        ) : (
          <>
            <div
              className={`payments-workspace-body flex-1 min-h-0${
                detailPanelOpen && !useFullPageDetail ? ' payments-workspace-body--detail-open' : ''
              }${isResizing ? ' payments-workspace-body--resizing' : ''}`}
              ref={workspaceRef}
              style={
                detailPanelOpen && !useFullPageDetail
                  ? ({ '--payments-detail-width': `${detailWidth}px` } as CSSProperties)
                  : undefined
              }
            >
              <div className="payments-list-panel cq flex flex-col min-h-0 overflow-hidden">
                <div className="cq-toolbar shrink-0">
                  <div className="cq-toolbar__top">
                    <p className="cq-total">
                      <span className="cq-total__label">Open A/R</span>
                      <span className="cq-total__amount tabular-nums">{formatCurrency(counts.openAmount)}</span>
                      <span className="cq-total__count">
                        {counts.open} invoice{counts.open === 1 ? '' : 's'}
                      </span>
                    </p>
                    {!capabilities.canRunInvoiceOps ? (
                      <span
                        className="cq-managed"
                        title="Credyx handles broker follow-up on your plan. This page shows how each invoice is doing and what happens next."
                      >
                        <Info className="w-3.5 h-3.5 shrink-0" aria-hidden />
                        <span>Credyx handles broker follow-up</span>
                      </span>
                    ) : null}
                  </div>

                  <div className="cq-filters" role="group" aria-label="Show invoices">
                    {FOCUS_TABS.map((key) => {
                      const count = focusCount(key)
                      // Empty buckets are noise; keep All and whichever filter is active.
                      if (count === 0 && key !== 'all' && focus !== key) return null
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setFocusAndUrl(focus === key && key !== 'all' ? 'all' : key)}
                          aria-pressed={focus === key}
                          className={`cq-chip cq-chip--${key}${focus === key ? ' is-on' : ''}`}
                        >
                          {clientCollectionsFocusLabel(key)}
                          <span className="cq-chip__count tabular-nums">{count}</span>
                        </button>
                      )
                    })}
                  </div>

                  <label className="cq-search">
                    <Search className="cq-search__icon" aria-hidden />
                    <input
                      type="search"
                      placeholder="Search invoice, broker or load"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      aria-label="Search invoices"
                    />
                  </label>
                </div>

                {sorted.length === 0 ? (
                  <div className="flex-1 min-h-0 flex items-center justify-center p-6">
                    <EmptyState
                      title="No invoices in this view"
                      hint="Open invoices show here as soon as Credyx processes them, with the next broker follow-up date."
                    />
                  </div>
                ) : (
                  <div className="cq-scroll flex-1 min-h-0 overflow-y-auto">
                    <table className="cq-table">
                      <thead>
                        <tr>
                          <ClientSortableHeader
                            field="invoice_number"
                            label="Invoice"
                            sortField={sortField}
                            sortDir={sortDir}
                            onSort={onSort}
                            className="cq-col-invoice"
                          />
                          <ClientSortableHeader
                            field="amount"
                            label="Balance"
                            sortField={sortField}
                            sortDir={sortDir}
                            onSort={onSort}
                            align="right"
                            className="cq-col-balance"
                          />
                          <ClientSortableHeader
                            field="performance"
                            label="Status"
                            sortField={sortField}
                            sortDir={sortDir}
                            onSort={onSort}
                            className="cq-col-status"
                          />
                          <ClientSortableHeader
                            field="next_followup"
                            label="What's happening"
                            sortField={sortField}
                            sortDir={sortDir}
                            onSort={onSort}
                            className="cq-col-what"
                          />
                        </tr>
                      </thead>
                      <tbody>
                        {pageRows.map((row) => {
                          const selected = selectedInvoice?.id === row.invoice.id
                          const attention = primaryCarrierAttentionReason(row.urgentReasons)
                          const flagged = row.performance === 'needs_attention' || row.isOverdue
                          const nextLine =
                            row.nextFollowup && row.nextFollowup.kind !== 'send_ppw'
                              ? `${row.nextFollowup.due ? 'Follow-up due now' : `Follow-up ${formatDate(row.nextFollowup.date)}`}`
                              : row.whatsNext
                          return (
                            <tr
                              key={row.invoice.id}
                              className={`cq-row${selected ? ' is-selected' : ''}${flagged ? ' is-flagged' : ''}`}
                              onClick={() => handleViewInvoice(row.invoice)}
                            >
                              <td className="cq-col-invoice">
                                <span className="cq-main">#{row.invoice.invoice_number}</span>
                                <span className="cq-sub">{row.broker?.name || row.invoice.broker_name}</span>
                              </td>
                              <td className="cq-col-balance">
                                <span className="cq-main tabular-nums">{formatCurrency(row.amount)}</span>
                                {row.isOverdue ? (
                                  <span className="cq-sub cq-late">{row.daysPastDue} days late</span>
                                ) : row.confirmedPayDate ? (
                                  <span className="cq-sub">Pays {formatDate(row.confirmedPayDate)}</span>
                                ) : row.dueDate ? (
                                  <span className="cq-sub">Due {formatDate(row.dueDate)}</span>
                                ) : null}
                              </td>
                              <td className="cq-col-status">
                                <span className={row.performancePillClass}>{row.performanceLabel}</span>
                                {row.performance === 'needs_attention' ? (
                                  <span className="cq-sub cq-late">Action needed from you</span>
                                ) : attention === 'will_pay_missed' ? (
                                  <span className="cq-sub">{carrierAttentionLabel(attention)}</span>
                                ) : row.performance === 'credyx_working' && row.nextFollowup?.due ? (
                                  <span className="cq-sub">Follow-up due</span>
                                ) : null}
                              </td>
                              <td className="cq-col-what">
                                <span className="cq-what">{row.whatsHappening}</span>
                                {nextLine ? <span className="cq-sub">Next: {nextLine}</span> : null}
                              </td>
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
          </>
        )}
      </div>
    </>
  )
}
