/**
 * Credyx Collections — open A/R chase list.
 * Due dates = invoice_date + broker Net; overdue = 15+ days past due;
 * Will Pay (confirmed pay date) is separate from due date; inquiry days ≠ due.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { openCollectionsInvoiceWindow } from '../utils/openCollectionsInvoiceWindow'
import ClientListTd from '../components/client/ClientListTd'
import ClientSortableHeader from '../components/client/ClientSortableHeader'
import EmptyState from '../components/ui/EmptyState'
import { mockBrokers } from '../data/mockBrokers'
import { mockInvoices } from '../data/mockInvoices'
import { mockPayments } from '../data/mockPayments'
import { useTenantDataRevision } from '../hooks/useTenantDataRevision'
import { useClientTheme } from '../theme/ThemeContext'
import { getAllClients } from '../services/clientRegistry'
import type { Invoice } from '../types/invoice'
import {
  buildAdminCollectionsRows,
  chaseStatusLabel,
  chaseStatusPillClass,
  collectionsFocusLabel,
  formatBrokerNetDays,
  matchesCollectionsFocus,
  reviewReasonPillClass,
  reviewReasonPillLabel,
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
  | 'client_name'
  | 'broker_name'
  | 'amount'
  | 'age'
  | 'due_date'
  | 'pay_date'
  | 'ppw'
  | 'chase'
  | 'last_contact'
  | 'urgent'

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
  const openedInvoiceParam = useRef<string | null>(null)

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

  const sorted = useMemo(() => {
    const next = [...filtered]
    next.sort((a, b) => {
      let cmp = 0
      if (sortField === 'client_name') {
        cmp = compareByClientName(a.invoice.client_name, b.invoice.client_name, 'asc')
      } else if (sortField === 'broker_name') {
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
    })
    return next
  }, [filtered, sortField, sortDir])

  const queueInvoiceIds = useMemo(() => sorted.map((row) => row.invoice.id), [sorted])

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

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const pageRows = sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm, clientFilter, focus, pageSize])

  const onSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortField(field)
    setSortDir(field === 'client_name' || field === 'broker_name' || field === 'invoice_number' ? 'asc' : 'desc')
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
            </div>

            {sorted.length === 0 ? (
              <div className="flex-1 min-h-0 flex items-center justify-center p-6">
                <EmptyState
                  title="Nothing in this queue"
                  hint="Try another filter, or invoices will show here after PPW is sent."
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
                        field="client_name"
                        label="Client"
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
                        label="Contacted"
                        sortField={sortField}
                        sortDir={sortDir}
                        onSort={onSort}
                        title="Last payment-status call or inquiry — not PPW send"
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
                        label="Review"
                        sortField={sortField}
                        sortDir={sortDir}
                        onSort={onSort}
                      />
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((row) => {
                      const selected = selectedInvoice?.id === row.invoice.id
                      return (
                        <tr
                          key={row.invoice.id}
                          className={`cursor-pointer ${selected ? 'invoice-row--selected' : ''} ${
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
                        >
                          <ClientListTd variant="primary">
                            <div className="font-medium" style={{ color: c.primary }}>
                              {row.invoice.invoice_number}
                            </div>
                            <div className="text-[11px]" style={{ color: c.secondary }}>
                              {row.invoice.load_number ? `Load ${row.invoice.load_number}` : '—'}
                            </div>
                          </ClientListTd>
                          <ClientListTd>{row.invoice.client_name}</ClientListTd>
                          <ClientListTd>
                            <div>{row.broker?.name || row.invoice.broker_name}</div>
                            <div className="text-[11px]" style={{ color: c.secondary }}>
                              {formatBrokerNetDays(row.dueDays)}
                              {` · PPW check ${row.paperworkCheckDays}d`}
                            </div>
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
                                <div className="tabular-nums">{formatDate(row.confirmedPayDate)}</div>
                                <span className="status-pill status-pill--approved">Will Pay</span>
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
                                <div className="tabular-nums">{formatDate(row.ppwSentAt)}</div>
                                <div className="text-[11px]" style={{ color: c.secondary }}>
                                  {row.daysSincePpw}d ago
                                </div>
                                {row.invoice.email_lifecycle?.paperwork_status === 'good' ? (
                                  <span className="status-pill status-pill--approved">
                                    Broker confirmed
                                  </span>
                                ) : row.trackStage === 'ppw_check' ? (
                                  <span className="status-pill status-pill--pending">
                                    PPW check
                                  </span>
                                ) : (
                                  <span className="status-pill status-pill--hold">Waiting</span>
                                )}
                              </>
                            ) : (
                              <span className="status-pill status-pill--urgent-collection">
                                PPW not sent
                              </span>
                            )}
                          </ClientListTd>
                          <ClientListTd>
                            {row.lastContact ? (
                              <>
                                <div className="tabular-nums">{formatDate(row.lastContact)}</div>
                                <div className="text-[11px]" style={{ color: c.secondary }}>
                                  {formatRelativeTime(row.lastContact)}
                                </div>
                              </>
                            ) : (
                              <span style={{ color: c.secondary }}>Never</span>
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
                            {row.isUrgentCollection ? (
                              <div className="flex flex-col items-start gap-0.5">
                                <span className="status-pill status-pill--urgent-collection">
                                  Urgent collection
                                </span>
                                {row.urgentReasons.map((reason) => (
                                  <span key={reason} className={reviewReasonPillClass(reason)}>
                                    {reviewReasonPillLabel(reason)}
                                  </span>
                                ))}
                              </div>
                            ) : row.isUrgent ? (
                              <div className="flex flex-col items-start gap-0.5">
                                {row.urgentReasons.map((reason) => (
                                  <span key={reason} className={reviewReasonPillClass(reason)}>
                                    {reviewReasonPillLabel(reason)}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span style={{ color: c.secondary }}>—</span>
                            )}
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
                    {sorted.length} invoice{sorted.length === 1 ? '' : 's'}
                  </span>
                  <select
                    value={pageSize}
                    onChange={(e) => setPageSize(Number(e.target.value))}
                    className="client-input !h-7 !py-0 !text-xs"
                    style={{ backgroundColor: c.card }}
                  >
                    {PAGE_SIZE_OPTIONS.map((n) => (
                      <option key={n} value={n}>
                        {n}/page
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
    </>
  )
}
