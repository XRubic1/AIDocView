/**
 * Credyx Collections — open A/R chase list.
 * Due dates = invoice_date + broker Net; overdue = 15+ days past due;
 * Will Pay (confirmed pay date) is separate from due date; inquiry days ≠ due.
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  Fragment,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, ChevronRight, Mail, Search } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { openCollectionsInvoiceWindow } from '../utils/openCollectionsInvoiceWindow'
import ClientListTd from '../components/client/ClientListTd'
import ClientSortableHeader from '../components/client/ClientSortableHeader'
import EmptyState from '../components/ui/EmptyState'
import { useToast } from '../components/ui/ToastProvider'
import { mockBrokers } from '../data/mockBrokers'
import { mockInvoices } from '../data/mockInvoices'
import { mockPayments } from '../data/mockPayments'
import { useTenantDataRevision } from '../hooks/useTenantDataRevision'
import { sendManualBrokerChaseEmail } from '../services/emailLifecycleService'
import { useClientTheme } from '../theme/ThemeContext'
import { getAllClients } from '../services/clientRegistry'
import type { Invoice } from '../types/invoice'
import {
  buildAdminCollectionsRows,
  brokerRiskPillClass,
  brokerRiskPillLabel,
  chaseStatusLabel,
  chaseStatusPillClass,
  collectionsFocusLabel,
  collectionsUrgentLabel,
  formatBrokerNetDays,
  matchesCollectionsFocus,
  reviewReasonPillClass,
  reviewReasonPillLabel,
  type AdminCollectionsRow,
  type CollectionsFocus,
} from '../utils/adminCollections'
import { collectionsTrackLabel } from '../utils/collectionsTrack'
import { formatCurrency, formatDate, formatRelativeTime } from '../utils/format'
import {
  applyCollectionsPolicy,
  loadCollectionsPolicy,
} from '../services/platformSettingsService'
import {
  getInitialListPageSize,
  PAGE_SIZE_OPTIONS,
  type SortDir,
} from '../utils/clientListPage'
import { compareByClientName } from '../utils/compareByClientName'

type SortField =
  | 'invoice_number'
  | 'broker_name'
  | 'amount'
  | 'age'
  | 'due_date'
  | 'pay_date'
  | 'ppw'
  | 'chase'
  | 'last_contact'
  | 'next_followup'
  | 'urgent'

type CollectionsContextMenuState = {
  x: number
  y: number
  row: AdminCollectionsRow
}

type ClientCollectionsGroup = {
  clientId: string
  clientName: string
  rows: AdminCollectionsRow[]
  amount: number
  urgentCount: number
  overdueCount: number
  chaseCount: number
}

/** Table columns under each client (client name lives on the parent row). */
const INVOICE_COL_COUNT = 11

/** Expand every carrier when the filtered list is this size or smaller. */
const AUTO_EXPAND_CLIENT_MAX = 12

const FOCUS_TABS: CollectionsFocus[] = [
  'all',
  'urgent',
  'chase',
  'ppw_check',
  'payment_verify',
  'overdue',
  'will_pay',
  'callback',
  'no_ppw',
]

const CHASE_RANK: Record<string, number> = {
  past_due_urgent: 0,
  needs_attention: 1,
  due_for_followup: 2,
  payment_verify: 3,
  ppw_check_due: 4,
  due_for_inquiry: 5,
  awaiting_response: 6,
  payment_waiting: 7,
  not_due: 8,
}

export default function Collections() {
  const c = useClientTheme()
  const { showToast } = useToast()
  const tenantRevision = useTenantDataRevision()
  const [searchParams, setSearchParams] = useSearchParams()
  const [searchTerm, setSearchTerm] = useState('')
  const [clientFilter, setClientFilter] = useState(() => searchParams.get('client') || '')
  const [focus, setFocus] = useState<CollectionsFocus>('all')
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null)
  const [pageSize, setPageSize] = useState(getInitialListPageSize)
  const [currentPage, setCurrentPage] = useState(1)
  const [sortField, setSortField] = useState<SortField>('urgent')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [policyTick, setPolicyTick] = useState(0)
  const [chaseBusy, setChaseBusy] = useState(false)
  const [contextMenu, setContextMenu] = useState<CollectionsContextMenuState | null>(null)
  const [expandedClientIds, setExpandedClientIds] = useState<Set<string>>(() => new Set())
  const contextMenuRef = useRef<HTMLDivElement | null>(null)
  const openedInvoiceParam = useRef<string | null>(null)

  const closeContextMenu = useCallback(() => setContextMenu(null), [])

  /** Right-click a row to send PPW / payment chase emails manually. */
  const openRowContextMenu = useCallback((event: ReactMouseEvent, row: AdminCollectionsRow) => {
    event.preventDefault()
    event.stopPropagation()
    setSelectedInvoice(row.invoice)
    setContextMenu({ x: event.clientX, y: event.clientY, row })
  }, [])

  useLayoutEffect(() => {
    if (!contextMenu || !contextMenuRef.current) return
    const el = contextMenuRef.current
    const pad = 8
    const rect = el.getBoundingClientRect()
    let x = contextMenu.x
    let y = contextMenu.y
    if (x + rect.width > window.innerWidth - pad) {
      x = Math.max(pad, window.innerWidth - rect.width - pad)
    }
    if (y + rect.height > window.innerHeight - pad) {
      y = Math.max(pad, window.innerHeight - rect.height - pad)
    }
    if (x !== contextMenu.x || y !== contextMenu.y) {
      setContextMenu((prev) => (prev ? { ...prev, x, y } : prev))
    }
  }, [contextMenu])

  useEffect(() => {
    if (!contextMenu) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeContextMenu()
    }
    const onPointer = (e: PointerEvent) => {
      if (contextMenuRef.current?.contains(e.target as Node)) return
      closeContextMenu()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onPointer, true)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onPointer, true)
    }
  }, [contextMenu, closeContextMenu])

  const sendChaseFromMenu = useCallback(
    async (track: 'paperwork' | 'payment', step: 'first' | 'second') => {
      const row = contextMenu?.row
      closeContextMenu()
      if (!row) return
      if (!row.broker) {
        showToast('Broker not found on this invoice', 'error')
        return
      }
      setChaseBusy(true)
      try {
        const result = await sendManualBrokerChaseEmail(row.invoice, row.broker, { track, step })
        if (result.ok) {
          const label =
            track === 'paperwork'
              ? step === 'first'
                ? 'PPW chase email sent'
                : 'PPW chase follow-up sent'
              : step === 'first'
                ? 'Payment chase email sent'
                : 'Payment chase follow-up sent'
          showToast(result.error ? `${label} — ${result.error}` : label, result.error ? 'info' : 'success')
        } else {
          showToast(result.error ?? 'Send failed', 'error')
        }
      } finally {
        setChaseBusy(false)
      }
    },
    [closeContextMenu, contextMenu?.row, showToast]
  )

  const clients = useMemo(
    () =>
      getAllClients()
        .map((client) => ({ id: client.id, name: client.name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [tenantRevision]
  )

  useEffect(() => {
    setClientFilter(searchParams.get('client') || '')
  }, [searchParams])

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

  const rows = useMemo(
    () => buildAdminCollectionsRows(mockInvoices, mockPayments, mockBrokers, clientFilter),
    [clientFilter, tenantRevision, policyTick]
  )

  const counts = useMemo(() => {
    let chase = 0
    let overdue = 0
    let willPay = 0
    let urgent = 0
    let ppwCheck = 0
    let paymentVerify = 0
    let noPpw = 0
    let overdueAmount = 0
    let openAmount = 0
    for (const row of rows) {
      openAmount += row.amount
      if (matchesCollectionsFocus(row, 'chase')) chase += 1
      if (row.isOverdue) {
        overdue += 1
        overdueAmount += row.amount
      }
      if (row.collectionStatus === 'W/P') willPay += 1
      if (row.isUrgentCollection) urgent += 1
      if (row.trackStage === 'ppw_check' || row.trackStage === 'ppw_waiting') ppwCheck += 1
      if (row.trackStage === 'payment_verify' || row.trackStage === 'payment_waiting') {
        paymentVerify += 1
      }
      if (row.trackStage === 'no_ppw') noPpw += 1
    }
    return {
      open: rows.length,
      openAmount,
      chase,
      overdue,
      overdueAmount,
      willPay,
      urgent,
      ppwCheck,
      paymentVerify,
      noPpw,
    }
  }, [rows])

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase()
    return rows.filter((row) => {
      if (!matchesCollectionsFocus(row, focus)) return false
      if (!q) return true
      const inv = row.invoice
      return (
        inv.invoice_number.toLowerCase().includes(q) ||
        inv.client_name.toLowerCase().includes(q) ||
        inv.broker_name.toLowerCase().includes(q) ||
        (inv.load_number || '').toLowerCase().includes(q)
      )
    })
  }, [rows, focus, searchTerm])

  /** Sort invoices within a client group. */
  const compareInvoiceRows = useCallback(
    (a: AdminCollectionsRow, b: AdminCollectionsRow) => {
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
      } else if (sortField === 'pay_date') {
        cmp = (a.confirmedPayDate || '').localeCompare(b.confirmedPayDate || '')
      } else if (sortField === 'ppw') {
        cmp = (a.ppwSentAt || '').localeCompare(b.ppwSentAt || '')
      } else if (sortField === 'last_contact') {
        cmp = (a.lastContact || '').localeCompare(b.lastContact || '')
      } else if (sortField === 'next_followup') {
        cmp = (a.nextFollowup?.date || '').localeCompare(b.nextFollowup?.date || '')
      } else if (sortField === 'urgent') {
        cmp = Number(a.isUrgentCollection) - Number(b.isUrgentCollection)
        if (cmp === 0) cmp = Number(a.isUrgent) - Number(b.isUrgent)
        if (cmp === 0) cmp = CHASE_RANK[b.chaseStatus] - CHASE_RANK[a.chaseStatus]
      } else {
        cmp = CHASE_RANK[a.chaseStatus] - CHASE_RANK[b.chaseStatus]
        if (cmp === 0) cmp = Number(b.isUrgent) - Number(a.isUrgent)
        if (cmp === 0) cmp = b.ageDays - a.ageDays
      }
      return sortDir === 'asc' ? cmp : -cmp
    },
    [sortField, sortDir]
  )

  /** Carriers as parents; invoices nested under each client. */
  const clientGroups = useMemo(() => {
    const byClient = new Map<string, ClientCollectionsGroup>()
    for (const row of filtered) {
      const clientId = row.invoice.client_id || row.invoice.client_name
      let group = byClient.get(clientId)
      if (!group) {
        group = {
          clientId,
          clientName: row.invoice.client_name,
          rows: [],
          amount: 0,
          urgentCount: 0,
          overdueCount: 0,
          chaseCount: 0,
        }
        byClient.set(clientId, group)
      }
      group.rows.push(row)
      group.amount += row.amount
      if (row.isUrgentCollection || row.isUrgent) group.urgentCount += 1
      if (row.isOverdue) group.overdueCount += 1
      if (matchesCollectionsFocus(row, 'chase')) group.chaseCount += 1
    }

    const groups = [...byClient.values()]
    for (const group of groups) {
      group.rows.sort(compareInvoiceRows)
    }

    groups.sort((a, b) => {
      // Urgent carriers first, then highest open A/R, then name.
      const urgentCmp = Number(b.urgentCount > 0) - Number(a.urgentCount > 0)
      if (urgentCmp !== 0) return urgentCmp
      const overdueCmp = Number(b.overdueCount > 0) - Number(a.overdueCount > 0)
      if (overdueCmp !== 0) return overdueCmp
      if (sortField === 'amount') {
        const cmp = a.amount - b.amount
        return sortDir === 'asc' ? cmp : -cmp
      }
      return compareByClientName(a.clientName, b.clientName, 'asc')
    })
    return groups
  }, [filtered, compareInvoiceRows, sortField, sortDir])

  const queueInvoiceIds = useMemo(
    () => clientGroups.flatMap((group) => group.rows.map((row) => row.invoice.id)),
    [clientGroups]
  )

  const openQueueInvoice = (invoiceId: string) => {
    openCollectionsInvoiceWindow(invoiceId, queueInvoiceIds)
  }

  useEffect(() => {
    const invoiceParam = searchParams.get('invoice')
    if (!invoiceParam || openedInvoiceParam.current === invoiceParam) return
    const inv = mockInvoices.find((i) => i.id === invoiceParam || i.invoice_number === invoiceParam)
    if (!inv) return
    openedInvoiceParam.current = invoiceParam
    setSelectedInvoice(inv)
    openCollectionsInvoiceWindow(inv.id, queueInvoiceIds)
  }, [searchParams, queueInvoiceIds])

  useEffect(() => {
    setExpandedClientIds((prev) => {
      const ids = clientGroups.map((g) => g.clientId)
      const expandAll =
        Boolean(clientFilter) ||
        Boolean(searchTerm.trim()) ||
        clientGroups.length <= AUTO_EXPAND_CLIENT_MAX
      if (expandAll) return new Set(ids)
      const next = new Set<string>()
      for (const group of clientGroups) {
        if (prev.has(group.clientId) || group.urgentCount > 0) next.add(group.clientId)
      }
      return next
    })
  }, [clientGroups, clientFilter, searchTerm])

  const totalPages = Math.max(1, Math.ceil(clientGroups.length / pageSize))
  const pageGroups = clientGroups.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm, clientFilter, focus, pageSize])

  const onSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortField(field)
    setSortDir(field === 'broker_name' || field === 'invoice_number' ? 'asc' : 'desc')
  }

  const toggleClientExpanded = (clientId: string) => {
    setExpandedClientIds((prev) => {
      const next = new Set(prev)
      if (next.has(clientId)) next.delete(clientId)
      else next.add(clientId)
      return next
    })
  }

  const expandAllVisible = () => {
    setExpandedClientIds(new Set(pageGroups.map((g) => g.clientId)))
  }

  const collapseAllVisible = () => {
    setExpandedClientIds((prev) => {
      const next = new Set(prev)
      for (const group of pageGroups) next.delete(group.clientId)
      return next
    })
  }

  const updateClientFilter = (nextClient: string) => {
    setClientFilter(nextClient)
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (nextClient) next.set('client', nextClient)
        else next.delete('client')
        return next
      },
      { replace: true }
    )
  }

  const inputStyle = { backgroundColor: c.card, color: c.primary }

  return (
    <>
      <div className="client-invoices-page overflow-hidden flex flex-col min-h-0 h-full">
        <div className="payments-workspace-body flex-1 min-h-0">
          <div className="payments-list-panel flex flex-col min-h-0 overflow-hidden">
            <section
              className="client-stat-strip grid grid-cols-2 lg:grid-cols-5 border-b shrink-0"
              style={{ borderColor: c.border }}
            >
              <button
                type="button"
                onClick={() => setFocus('all')}
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
                  <span className="block text-lg font-bold tabular-nums" style={{ color: c.primary }}>
                    {counts.open}
                  </span>
                  <span className="block text-[11px] tabular-nums" style={{ color: c.secondary }}>
                    {formatCurrency(counts.openAmount)}
                  </span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => setFocus(focus === 'overdue' ? 'all' : 'overdue')}
                className="flex items-center justify-between gap-2 px-4 py-2.5 lg:border-r border-b lg:border-b-0 text-left"
                style={{
                  backgroundColor: focus === 'overdue' ? c.stat.amber : c.card,
                  borderColor: c.border,
                }}
              >
                <span className="text-xs font-medium" style={{ color: c.secondary }}>
                  Overdue
                </span>
                <span className="text-right">
                  <span className="block text-lg font-bold tabular-nums" style={{ color: c.error }}>
                    {counts.overdue}
                  </span>
                  <span className="block text-[11px] tabular-nums" style={{ color: c.secondary }}>
                    {formatCurrency(counts.overdueAmount)}
                  </span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => setFocus(focus === 'chase' ? 'all' : 'chase')}
                className="flex items-center justify-between gap-2 px-4 py-2.5 sm:border-r border-b lg:border-b-0 text-left"
                style={{
                  backgroundColor: focus === 'chase' ? c.stat.blue : c.card,
                  borderColor: c.border,
                }}
              >
                <span className="text-xs font-medium" style={{ color: c.secondary }}>
                  Chase
                </span>
                <span className="text-lg font-bold tabular-nums" style={{ color: c.primary }}>
                  {counts.chase}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setFocus(focus === 'will_pay' ? 'all' : 'will_pay')}
                className="flex items-center justify-between gap-2 px-4 py-2.5 lg:border-r border-b lg:border-b-0 text-left"
                style={{
                  backgroundColor: focus === 'will_pay' ? c.stat.green : c.card,
                  borderColor: c.border,
                }}
              >
                <span className="text-xs font-medium" style={{ color: c.secondary }}>
                  Will Pay
                </span>
                <span className="text-lg font-bold tabular-nums" style={{ color: c.primary }}>
                  {counts.willPay}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setFocus(focus === 'urgent' ? 'all' : 'urgent')}
                className={`flex items-center justify-between gap-2 px-4 py-2.5 text-left${
                  focus === 'urgent' ? ' collections-urgent-stat' : ''
                }`}
                style={{
                  backgroundColor: focus === 'urgent' ? '#7f1d1d' : c.card,
                  borderColor: focus === 'urgent' ? '#7f1d1d' : c.border,
                }}
              >
                <span
                  className="text-xs font-semibold uppercase tracking-wide"
                  style={{ color: focus === 'urgent' ? '#fecaca' : c.secondary }}
                >
                  Urgent collection
                </span>
                <span
                  className="text-lg font-bold tabular-nums"
                  style={{ color: focus === 'urgent' ? '#fff' : c.error }}
                >
                  {counts.urgent}
                </span>
              </button>
            </section>

            <div
              className="client-page-toolbar px-4 py-2 border-b shrink-0 space-y-2"
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
                    placeholder="Search invoice, client, broker, load…"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="client-input pl-8"
                    style={inputStyle}
                  />
                </div>
                <Link
                  to="/admin/inbox"
                  className="text-sm font-medium text-[#1684FE] shrink-0"
                >
                  Inbox
                </Link>
                <select
                  value={clientFilter}
                  onChange={(e) => updateClientFilter(e.target.value)}
                  className="client-input w-full md:w-auto min-w-[160px]"
                  style={inputStyle}
                  aria-label="Filter by client"
                >
                  <option value="">All clients</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap gap-1.5">
                  {FOCUS_TABS.map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setFocus(key)}
                      className={`page-tab !py-1 !px-2 !text-xs ${focus === key ? 'page-tab--active' : ''}${
                        key === 'urgent' ? ' collections-urgent-tab' : ''
                      }`}
                    >
                      {collectionsFocusLabel(key)}
                      {key === 'chase'
                        ? ` (${counts.chase})`
                        : key === 'overdue'
                          ? ` (${counts.overdue})`
                          : key === 'will_pay'
                            ? ` (${counts.willPay})`
                            : key === 'urgent'
                              ? ` (${counts.urgent})`
                              : key === 'ppw_check'
                                ? ` (${counts.ppwCheck})`
                                : key === 'payment_verify'
                                  ? ` (${counts.paymentVerify})`
                                  : key === 'no_ppw'
                                    ? ` (${counts.noPpw})`
                                    : key === 'all'
                                      ? ` (${counts.open})`
                                      : ''}
                    </button>
                  ))}
                </div>
                {clientGroups.length > 0 ? (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      className="text-[11px] font-medium text-[#1684FE]"
                      onClick={expandAllVisible}
                    >
                      Expand
                    </button>
                    <span className="text-[11px]" style={{ color: c.muted }}>
                      ·
                    </span>
                    <button
                      type="button"
                      className="text-[11px] font-medium"
                      style={{ color: c.secondary }}
                      onClick={collapseAllVisible}
                    >
                      Collapse
                    </button>
                  </div>
                ) : null}
              </div>
            </div>

            {clientGroups.length === 0 ? (
              <div className="flex-1 min-h-0 flex items-center justify-center p-6">
                <EmptyState
                  title="Nothing in this queue"
                  hint="Invoices land here as soon as a batch is processed. Try another filter if this view is empty."
                />
              </div>
            ) : (
              <div className="client-table-scroll flex-1 min-h-0 overflow-y-auto">
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
                        field="age"
                        label="Age"
                        sortField={sortField}
                        sortDir={sortDir}
                        onSort={onSort}
                      />
                      <ClientSortableHeader
                        field="due_date"
                        label="Due"
                        sortField={sortField}
                        sortDir={sortDir}
                        onSort={onSort}
                      />
                      <ClientSortableHeader
                        field="pay_date"
                        label="Pay date"
                        sortField={sortField}
                        sortDir={sortDir}
                        onSort={onSort}
                      />
                      <ClientSortableHeader
                        field="ppw"
                        label="PPW"
                        sortField={sortField}
                        sortDir={sortDir}
                        onSort={onSort}
                      />
                      <ClientSortableHeader
                        field="last_contact"
                        label="Last follow-up"
                        sortField={sortField}
                        sortDir={sortDir}
                        onSort={onSort}
                        title="Last PPW / payment chase email or broker call"
                      />
                      <ClientSortableHeader
                        field="next_followup"
                        label="Chase goes out"
                        sortField={sortField}
                        sortDir={sortDir}
                        onSort={onSort}
                        title="When the next PPW or payment chase email is scheduled"
                      />
                      <ClientSortableHeader
                        field="chase"
                        label="Chase"
                        sortField={sortField}
                        sortDir={sortDir}
                        onSort={onSort}
                      />
                      <ClientSortableHeader
                        field="urgent"
                        label="Urgent"
                        sortField={sortField}
                        sortDir={sortDir}
                        onSort={onSort}
                        title="Why this invoice needs attention — including risky brokers"
                      />
                    </tr>
                  </thead>
                  <tbody>
                    {pageGroups.map((group) => {
                      const expanded = expandedClientIds.has(group.clientId)
                      return (
                        <Fragment key={group.clientId}>
                          <tr
                            className="collections-client-row cursor-pointer"
                            onClick={() => toggleClientExpanded(group.clientId)}
                          >
                            <td colSpan={INVOICE_COL_COUNT} className="!py-2.5">
                              <div className="flex items-center gap-2 min-w-0 flex-wrap">
                                {expanded ? (
                                  <ChevronDown
                                    className="w-4 h-4 shrink-0"
                                    style={{ color: c.secondary }}
                                  />
                                ) : (
                                  <ChevronRight
                                    className="w-4 h-4 shrink-0"
                                    style={{ color: c.secondary }}
                                  />
                                )}
                                <span
                                  className="font-semibold text-sm truncate"
                                  style={{ color: c.primary }}
                                >
                                  {group.clientName}
                                </span>
                                <span
                                  className="text-[11px] tabular-nums shrink-0"
                                  style={{ color: c.secondary }}
                                >
                                  {group.rows.length} invoice
                                  {group.rows.length === 1 ? '' : 's'}
                                </span>
                                <span
                                  className="text-sm font-semibold tabular-nums shrink-0"
                                  style={{ color: c.primary }}
                                >
                                  {formatCurrency(group.amount)}
                                </span>
                                {group.urgentCount > 0 ? (
                                  <span className="status-pill status-pill--urgent-collection">
                                    {group.urgentCount} urgent
                                  </span>
                                ) : null}
                                {group.overdueCount > 0 ? (
                                  <span className="status-pill status-pill--overdue">
                                    {group.overdueCount} overdue
                                  </span>
                                ) : null}
                                {group.chaseCount > 0 ? (
                                  <span className="status-pill status-pill--pending">
                                    {group.chaseCount} chase
                                  </span>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                          {expanded
                            ? group.rows.map((row) => {
                                const selected = selectedInvoice?.id === row.invoice.id
                                return (
                                  <tr
                                    key={row.invoice.id}
                                    className={`cursor-pointer collections-invoice-row ${
                                      selected ? 'invoice-row--selected' : ''
                                    } ${
                                      row.isUrgentCollection
                                        ? 'invoice-row--urgent-collection'
                                        : row.isOverdue
                                          ? 'invoice-row--overdue'
                                          : ''
                                    }`}
                                    onClick={() => {
                                      setSelectedInvoice(row.invoice)
                                      openQueueInvoice(row.invoice.id)
                                    }}
                                    onContextMenu={(e) => openRowContextMenu(e, row)}
                                  >
                                    <ClientListTd variant="primary">
                                      <div className="pl-5">
                                        <div className="font-medium" style={{ color: c.primary }}>
                                          {row.invoice.invoice_number}
                                        </div>
                                        <div className="text-[11px]" style={{ color: c.secondary }}>
                                          {row.invoice.load_number
                                            ? `Load ${row.invoice.load_number}`
                                            : '—'}
                                        </div>
                                      </div>
                                    </ClientListTd>
                                    <ClientListTd>
                                      <div>{row.broker?.name || row.invoice.broker_name}</div>
                                      <div className="text-[11px]" style={{ color: c.secondary }}>
                                        {formatBrokerNetDays(row.dueDays)}
                                        {` · PPW check ${row.paperworkCheckDays}d`}
                                      </div>
                                      {brokerRiskPillClass(row.brokerRiskLevel) ? (
                                        <span className={brokerRiskPillClass(row.brokerRiskLevel)!}>
                                          {brokerRiskPillLabel(row.brokerRiskLevel)}
                                        </span>
                                      ) : null}
                                    </ClientListTd>
                                    <ClientListTd variant="amount" className="tabular-nums">
                                      {formatCurrency(row.amount)}
                                    </ClientListTd>
                                    <ClientListTd className="tabular-nums">{row.ageDays}d</ClientListTd>
                                    <ClientListTd>
                                      <div className="tabular-nums">
                                        {row.dueDate ? formatDate(row.dueDate) : '—'}
                                      </div>
                                      {row.isOverdue ? (
                                        <span className="status-pill status-pill--overdue">
                                          {row.daysPastDue}d past due
                                        </span>
                                      ) : null}
                                    </ClientListTd>
                                    <ClientListTd>
                                      {row.confirmedPayDate ? (
                                        <>
                                          <div className="tabular-nums">
                                            {formatDate(row.confirmedPayDate)}
                                          </div>
                                          <span className="status-pill status-pill--approved">
                                            Will Pay
                                          </span>
                                        </>
                                      ) : row.collectionStatus === 'C/B' ? (
                                        <>
                                          {row.invoice.collection_date ? (
                                            <div className="tabular-nums">
                                              {formatDate(row.invoice.collection_date)}
                                            </div>
                                          ) : null}
                                          <span
                                            className={`status-pill ${
                                              row.isCallbackDue
                                                ? 'status-pill--overdue'
                                                : 'status-pill--pending'
                                            }`}
                                          >
                                            Call back
                                          </span>
                                        </>
                                      ) : (
                                        <span style={{ color: c.secondary }}>—</span>
                                      )}
                                    </ClientListTd>
                                    <ClientListTd>
                                      {row.ppwSentAt ? (
                                        <>
                                          <div className="tabular-nums">
                                            {formatDate(row.ppwSentAt)}
                                          </div>
                                          <div className="text-[11px]" style={{ color: c.secondary }}>
                                            {row.daysSincePpw}d ago
                                          </div>
                                          {row.invoice.email_lifecycle?.paperwork_status ===
                                          'good' ? (
                                            <span className="status-pill status-pill--approved">
                                              Broker confirmed
                                            </span>
                                          ) : row.trackStage === 'ppw_check' ? (
                                            <span className="status-pill status-pill--pending">
                                              PPW check
                                            </span>
                                          ) : (
                                            <span className="status-pill status-pill--hold">
                                              Waiting
                                            </span>
                                          )}
                                        </>
                                      ) : (
                                        <span className="status-pill status-pill--urgent-collection">
                                          PPW not sent
                                        </span>
                                      )}
                                    </ClientListTd>
                                    <ClientListTd>
                                      {row.lastFollowup ? (
                                        <>
                                          <div className="tabular-nums font-medium">
                                            {formatDate(row.lastFollowup.at)}
                                          </div>
                                          <div className="text-[11px]" style={{ color: c.secondary }}>
                                            {row.lastFollowup.label}
                                          </div>
                                          <div className="text-[11px]" style={{ color: c.secondary }}>
                                            {formatRelativeTime(row.lastFollowup.at)}
                                          </div>
                                        </>
                                      ) : (
                                        <span style={{ color: c.secondary }}>Never</span>
                                      )}
                                    </ClientListTd>
                                    <ClientListTd>
                                      {row.nextFollowup ? (
                                        <>
                                          <div
                                            className={`tabular-nums font-medium ${
                                              row.nextFollowup.due ? 'text-red-600' : ''
                                            }`}
                                          >
                                            {formatDate(row.nextFollowup.date)}
                                          </div>
                                          <div className="text-[11px]" style={{ color: c.secondary }}>
                                            {row.nextFollowup.label}
                                          </div>
                                          {row.nextFollowup.due ? (
                                            <span className="status-pill status-pill--overdue">
                                              Due now
                                            </span>
                                          ) : (
                                            <div className="text-[11px]" style={{ color: c.secondary }}>
                                              Scheduled
                                            </div>
                                          )}
                                        </>
                                      ) : (
                                        <span style={{ color: c.secondary }}>—</span>
                                      )}
                                    </ClientListTd>
                                    <ClientListTd variant="status">
                                      <span className={chaseStatusPillClass(row.chaseStatus)}>
                                        {row.chaseStatus === 'not_due'
                                          ? collectionsTrackLabel(row.trackStage)
                                          : chaseStatusLabel(row.chaseStatus)}
                                      </span>
                                    </ClientListTd>
                                    <ClientListTd>
                                      {row.isUrgent || row.isUrgentCollection ? (
                                        <div className="flex flex-col items-start gap-0.5 max-w-[11rem]">
                                          {row.isUrgentCollection ? (
                                            <span className="status-pill status-pill--urgent-collection">
                                              Urgent
                                            </span>
                                          ) : (
                                            <span className="status-pill status-pill--overdue">
                                              Urgent
                                            </span>
                                          )}
                                          {row.urgentReasons.map((reason) => (
                                            <span
                                              key={reason}
                                              className={reviewReasonPillClass(reason)}
                                              title={collectionsUrgentLabel(reason)}
                                            >
                                              {reviewReasonPillLabel(reason, row.brokerRiskLevel)}
                                            </span>
                                          ))}
                                        </div>
                                      ) : (
                                        <span style={{ color: c.secondary }}>No</span>
                                      )}
                                    </ClientListTd>
                                  </tr>
                                )
                              })
                            : null}
                        </Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {clientGroups.length > 0 ? (
              <div
                className="client-page-footer flex items-center justify-between gap-2 px-3 py-2 border-t shrink-0"
                style={{ borderColor: c.border }}
              >
                <div className="flex items-center gap-2 text-xs" style={{ color: c.secondary }}>
                  <span>
                    {clientGroups.length} client{clientGroups.length === 1 ? '' : 's'} ·{' '}
                    {filtered.length} invoice{filtered.length === 1 ? '' : 's'}
                  </span>
                  <select
                    value={pageSize}
                    onChange={(e) => setPageSize(Number(e.target.value))}
                    className="client-input !h-7 !py-0 !text-xs"
                    style={{ backgroundColor: c.card }}
                    aria-label="Clients per page"
                  >
                    {PAGE_SIZE_OPTIONS.map((n) => (
                      <option key={n} value={n}>
                        {n} clients/page
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    className="table-page-btn"
                    disabled={currentPage <= 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  >
                    Prev
                  </button>
                  <span className="text-xs tabular-nums px-2" style={{ color: c.secondary }}>
                    {currentPage}/{totalPages}
                  </span>
                  <button
                    type="button"
                    className="table-page-btn"
                    disabled={currentPage >= totalPages}
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  >
                    Next
                  </button>
                </div>
              </div>
            ) : null}
          </div>

        </div>

      </div>

      {contextMenu &&
        createPortal(
          <div
            ref={contextMenuRef}
            className="client-ai-doc-menu admin-batch-context-menu"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            role="menu"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.preventDefault()}
          >
            <p className="client-ai-doc-menu__label">
              {contextMenu.row.invoice.invoice_number}
              {contextMenu.row.invoice.broker_name
                ? ` · ${contextMenu.row.invoice.broker_name}`
                : ''}
            </p>
            <button
              type="button"
              role="menuitem"
              className="client-ai-doc-menu__item"
              disabled={chaseBusy}
              onClick={() => void sendChaseFromMenu('paperwork', 'first')}
            >
              <Mail className="w-3.5 h-3.5 shrink-0" aria-hidden />
              Send PPW chase email
            </button>
            <button
              type="button"
              role="menuitem"
              className="client-ai-doc-menu__item"
              disabled={chaseBusy}
              onClick={() => void sendChaseFromMenu('paperwork', 'second')}
            >
              <Mail className="w-3.5 h-3.5 shrink-0" aria-hidden />
              Send PPW chase follow-up
            </button>
            <div className="client-ai-doc-menu__sep" role="separator" />
            <button
              type="button"
              role="menuitem"
              className="client-ai-doc-menu__item"
              disabled={chaseBusy}
              onClick={() => void sendChaseFromMenu('payment', 'first')}
            >
              <Mail className="w-3.5 h-3.5 shrink-0" aria-hidden />
              Send payment chase email
            </button>
            <button
              type="button"
              role="menuitem"
              className="client-ai-doc-menu__item"
              disabled={chaseBusy}
              onClick={() => void sendChaseFromMenu('payment', 'second')}
            >
              <Mail className="w-3.5 h-3.5 shrink-0" aria-hidden />
              Send payment chase follow-up
            </button>
          </div>,
          document.body
        )}
    </>
  )
}
