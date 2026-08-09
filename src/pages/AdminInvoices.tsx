import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  FileText,
  Filter,
  PanelRightOpen,
  Search,
  Wallet,
} from 'lucide-react'
import AdminLayout from '../components/AdminLayout'
import InvoiceDetailPanel from '../components/client/InvoiceDetailPanel'
import ClientListTd from '../components/client/ClientListTd'
import ClientSortableHeader from '../components/client/ClientSortableHeader'
import DocumentViewer from '../components/DocumentViewer'
import EmptyState from '../components/ui/EmptyState'
import { useToast } from '../components/ui/ToastProvider'
import { mockInvoices } from '../data/mockInvoices'
import { mockPayments } from '../data/mockPayments'
import { getInvoiceDocumentsForViewer } from '../services/invoiceDocumentStore'
import { addAdminInvoiceNote, removeAdminInvoiceNote } from '../services/adminInvoiceNoteActions'
import { useClientTheme } from '../theme/ThemeContext'
import { useCompactDetailViewport } from '../hooks/useIsMobileViewport'
import { useResizableSplitPane } from '../hooks/useResizableSplitPane'
import { useTenantDataRevision } from '../hooks/useTenantDataRevision'
import {
  confirmClientPayment,
  listPendingPayments,
  rejectClientPayment,
} from '../services/clientPaymentService'
import {
  listAwaitingReceiptPayments,
  listReceiptDisputedPayments,
  resolvePaymentReceiptDispute,
  type ResolveReceiptDisputeOutcome,
} from '../services/paymentReceiptConfirmationService'
import {
  approveWriteOff,
  denyWriteOff,
  listPendingWriteOffs,
} from '../services/writeOffApprovalService'
import { useAuth } from '../context/AuthContext'
import { getAdminUserDisplayName } from '../config/adminNav'
import type { Invoice } from '../types/invoice'
import type { Payment } from '../types/payment'
import { formatCurrency, formatDate } from '../utils/format'
import {
  adminInvoiceFilterLabel,
  buildAdminInvoiceQueueIndex,
  enrichAdminInvoices,
  matchesAdminInvoiceStatusFilter,
  type AdminInvoiceQueueFlags,
  type AdminInvoiceStatusFilter,
} from '../utils/adminInvoiceQueue'
import { getDaysOutstandingColor, type EnrichedInvoice } from '../utils/invoiceAging'
import {
  getInitialListPageSize,
  PAGE_SIZE_OPTIONS,
  type SortDir,
} from '../utils/clientListPage'
import { openAdminInvoiceWorkspace } from '../utils/openAdminInvoiceWorkspace'
import { getAllClients } from '../services/clientRegistry'

type SortField =
  | 'invoice_number'
  | 'client_name'
  | 'broker_name'
  | 'amount'
  | 'invoice_date'
  | 'days_outstanding'
  | 'status'

const STATUS_FILTERS: AdminInvoiceStatusFilter[] = [
  'all',
  'pending_payment',
  'awaiting_confirmation',
  'receipt_dispute',
  'writeoff_queue',
  'pending',
  'hold',
  'approved',
  'overdue',
  'paid',
  'written_off',
]

function queueBadgeLabel(flags: AdminInvoiceQueueFlags | undefined): string | null {
  if (!flags) return null
  if (flags.disputePaymentIds.length) return 'Dispute'
  if (flags.pendingPaymentIds.length) return 'Pending pay'
  if (flags.awaitingPaymentIds.length) return 'Awaiting'
  if (flags.writeOffPending) return 'Write-off'
  return null
}

function statusPillClass(status: string): string {
  switch (status) {
    case 'approved':
      return 'status-pill status-pill--approved'
    case 'pending':
      return 'status-pill status-pill--pending'
    case 'hold':
      return 'status-pill status-pill--hold'
    case 'paid':
      return 'status-pill status-pill--approved'
    case 'written_off':
    case 'write_off_pending':
      return 'status-pill status-pill--warn'
    case 'force_closed':
      return 'status-pill status-pill--overdue'
    case 'rejected':
      return 'status-pill status-pill--overdue'
    default:
      return 'status-pill'
  }
}

/**
 * Credyx Invoices dashboard — status list + detail interactions
 * (replaces legacy Invoice Search). Includes payment-queue filters.
 */
export default function AdminInvoices() {
  const c = useClientTheme()
  const { showToast } = useToast()
  const { resolved } = useAuth()
  const adminName = getAdminUserDisplayName(resolved.user?.email ?? null)
  const tenantRevision = useTenantDataRevision()
  const useFullPageDetail = useCompactDetailViewport()
  const { workspaceRef, detailWidth, isResizing, resizeHandleProps } = useResizableSplitPane()
  const [searchParams, setSearchParams] = useSearchParams()
  const openedDeepLinkRef = useRef<string | null>(null)

  const [refreshKey, setRefreshKey] = useState(0)
  const bump = () => setRefreshKey((k) => k + 1)
  const dataRevision = refreshKey + tenantRevision

  const [searchTerm, setSearchTerm] = useState('')
  const [clientFilter, setClientFilter] = useState(() => searchParams.get('client') || '')
  const [statusFilter, setStatusFilter] = useState<AdminInvoiceStatusFilter>(() => {
    const raw = searchParams.get('status')
    if (raw && STATUS_FILTERS.includes(raw as AdminInvoiceStatusFilter)) {
      return raw as AdminInvoiceStatusFilter
    }
    return 'all'
  })
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null)
  const [showDetail, setShowDetail] = useState(false)
  const [pageSize, setPageSize] = useState(getInitialListPageSize)
  const [currentPage, setCurrentPage] = useState(1)
  const [sortField, setSortField] = useState<SortField>('invoice_date')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [showDocumentViewer, setShowDocumentViewer] = useState(false)
  const [viewingInvoice, setViewingInvoice] = useState<Invoice | null>(null)

  const invoices = useMemo(() => [...mockInvoices], [dataRevision])
  const payments = useMemo(() => [...mockPayments], [dataRevision])
  const enriched = useMemo(() => enrichAdminInvoices(invoices), [invoices])
  const clients = useMemo(
    () =>
      getAllClients()
        .map((client) => ({ id: client.id, name: client.name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [dataRevision]
  )

  const queueIndex = useMemo(
    () =>
      buildAdminInvoiceQueueIndex({
        pending: listPendingPayments(),
        awaiting: listAwaitingReceiptPayments(),
        disputed: listReceiptDisputedPayments(),
        writeOffs: listPendingWriteOffs(),
      }),
    [dataRevision]
  )

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase()
    return enriched.filter((invoice) => {
      if (clientFilter && invoice.client_id !== clientFilter) return false
      const flags = queueIndex.byInvoiceId.get(invoice.id)
      if (!matchesAdminInvoiceStatusFilter(invoice, statusFilter, flags)) return false
      if (!q) return true
      return (
        invoice.invoice_number.toLowerCase().includes(q) ||
        invoice.client_name.toLowerCase().includes(q) ||
        invoice.broker_name.toLowerCase().includes(q) ||
        (invoice.load_number ?? '').toLowerCase().includes(q) ||
        (invoice.batch_number ?? '').toLowerCase().includes(q)
      )
    })
  }, [enriched, searchTerm, statusFilter, queueIndex, clientFilter])

  const sorted = useMemo(() => {
    const rows = [...filtered]
    rows.sort((a, b) => {
      let cmp = 0
      switch (sortField) {
        case 'invoice_number':
          cmp = a.invoice_number.localeCompare(b.invoice_number, undefined, { numeric: true })
          break
        case 'client_name':
          cmp = a.client_name.localeCompare(b.client_name, undefined, { sensitivity: 'base' })
          break
        case 'broker_name':
          cmp = a.broker_name.localeCompare(b.broker_name)
          break
        case 'amount':
          cmp = a.amount - b.amount
          break
        case 'invoice_date':
          cmp = a.invoice_date.localeCompare(b.invoice_date)
          break
        case 'days_outstanding':
          cmp = a.daysOutstanding - b.daysOutstanding
          break
        case 'status':
          cmp = a.status.localeCompare(b.status)
          break
        default:
          cmp = 0
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
    return rows
  }, [filtered, sortField, sortDir])

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const pageRows = sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm, statusFilter, clientFilter, pageSize])

  const selectedInvoice = useMemo(() => {
    if (!selectedInvoiceId) return null
    return enriched.find((inv) => inv.id === selectedInvoiceId) ?? null
  }, [enriched, selectedInvoiceId])

  const selectedPayments = useMemo(() => {
    if (!selectedInvoiceId) return [] as Payment[]
    return payments.filter((p) => p.invoice_id === selectedInvoiceId)
  }, [payments, selectedInvoiceId])

  const openDetail = useCallback(
    (invoice: EnrichedInvoice | Invoice) => {
      setSelectedInvoiceId(invoice.id)
      setShowDetail(true)
      const next = new URLSearchParams(searchParams)
      next.set('invoice', invoice.id)
      setSearchParams(next, { replace: true })
    },
    [searchParams, setSearchParams]
  )

  const closeDetail = useCallback(() => {
    setShowDetail(false)
    setSelectedInvoiceId(null)
    const next = new URLSearchParams(searchParams)
    next.delete('invoice')
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams])

  // Deep-link ?invoice= / ?status= / ?client=
  useEffect(() => {
    const status = searchParams.get('status')
    if (status && STATUS_FILTERS.includes(status as AdminInvoiceStatusFilter)) {
      setStatusFilter(status as AdminInvoiceStatusFilter)
    }
    const client = searchParams.get('client') || ''
    setClientFilter(client)
    const invoiceParam = searchParams.get('invoice') || searchParams.get('highlight_invoice')
    if (!invoiceParam || openedDeepLinkRef.current === invoiceParam) return
    const hit =
      enriched.find((inv) => inv.id === invoiceParam) ||
      enriched.find((inv) => inv.invoice_number === invoiceParam)
    if (!hit) return
    openedDeepLinkRef.current = invoiceParam
    setSelectedInvoiceId(hit.id)
    setShowDetail(true)
    const index = sorted.findIndex((inv) => inv.id === hit.id)
    if (index >= 0) setCurrentPage(Math.floor(index / pageSize) + 1)
  }, [searchParams, enriched, sorted, pageSize])

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

  const onSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDir('desc')
    }
  }

  const detailOpen = Boolean(selectedInvoice && (showDetail || !useFullPageDetail))

  const handleConfirmPending = async (paymentId: string) => {
    setBusyId(paymentId)
    try {
      const payment = payments.find((p) => p.id === paymentId)
      if (!payment) return
      const result = confirmClientPayment(
        {
          paymentId,
          paymentMethod: payment.payment_method,
          paymentReference: payment.payment_reference,
          receivedDate: payment.received_date || payment.payment_date,
        },
        adminName
      )
      if (!result) {
        showToast('Could not confirm payment', 'error')
        return
      }
      showToast('Payment confirmed', 'success')
      bump()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Confirm failed', 'error')
    } finally {
      setBusyId(null)
    }
  }

  const handleRejectPending = async (paymentId: string) => {
    const reason = window.prompt('Rejection reason')
    if (!reason?.trim()) return
    setBusyId(paymentId)
    try {
      const result = rejectClientPayment(paymentId, adminName, { reason: reason.trim() })
      if (!result) {
        showToast('Could not reject payment', 'error')
        return
      }
      showToast('Payment rejected', 'success')
      bump()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Reject failed', 'error')
    } finally {
      setBusyId(null)
    }
  }

  const handleResolveDispute = async (
    paymentId: string,
    outcome: ResolveReceiptDisputeOutcome
  ) => {
    const response = window.prompt(
      outcome === 'confirm'
        ? 'Response to client (re-queue for confirmation)'
        : 'Response to client (reject payment)'
    )
    if (!response?.trim()) return
    setBusyId(paymentId)
    try {
      resolvePaymentReceiptDispute(paymentId, adminName, response.trim(), outcome)
      showToast(
        outcome === 'confirm' ? 'Dispute resolved — awaiting client' : 'Payment rejected',
        'success'
      )
      bump()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Resolve failed', 'error')
    } finally {
      setBusyId(null)
    }
  }

  const handleApproveWriteOff = async (invoiceId: string) => {
    setBusyId(invoiceId)
    try {
      await approveWriteOff(invoiceId, adminName)
      showToast('Write-off approved', 'success')
      bump()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Approve failed', 'error')
    } finally {
      setBusyId(null)
    }
  }

  const handleDenyWriteOff = async (invoiceId: string) => {
    const note = window.prompt('Internal note (required to deny)')
    if (!note?.trim()) return
    setBusyId(invoiceId)
    try {
      await denyWriteOff(invoiceId, adminName, { internalNote: note.trim() })
      showToast('Write-off denied', 'success')
      bump()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Deny failed', 'error')
    } finally {
      setBusyId(null)
    }
  }

  const inputStyle = {
    backgroundColor: c.card,
    height: 34,
    paddingTop: 6,
    paddingBottom: 6,
    fontSize: 13,
  } as const

  const queueCounts = queueIndex.counts
  const overdueCount = enriched.filter((inv) => inv.isOverdue).length

  const renderOpsBar = (invoice: Invoice) => {
    const flags = queueIndex.byInvoiceId.get(invoice.id)
    if (!flags) return null
    const hasOps =
      flags.pendingPaymentIds.length > 0 ||
      flags.awaitingPaymentIds.length > 0 ||
      flags.disputePaymentIds.length > 0 ||
      flags.writeOffPending
    if (!hasOps) return null

    return (
      <div
        className="border-b px-3 py-2 space-y-2 shrink-0"
        style={{ borderColor: c.border, backgroundColor: c.stat.amber }}
      >
        <p className="text-xs font-semibold" style={{ color: c.primary }}>
          Needs attention
        </p>
        {flags.pendingPaymentIds.map((paymentId) => {
          const payment = selectedPayments.find((p) => p.id === paymentId)
          return (
            <div key={paymentId} className="flex flex-wrap items-center gap-2 text-xs">
              <span style={{ color: c.secondary }}>
                Pending payment {payment ? formatCurrency(payment.amount) : ''}
              </span>
              <button
                type="button"
                className="dashboard-btn-primary !py-1 !px-2 !text-xs"
                disabled={busyId === paymentId}
                onClick={() => void handleConfirmPending(paymentId)}
              >
                Confirm
              </button>
              <button
                type="button"
                className="dashboard-btn-secondary !py-1 !px-2 !text-xs"
                disabled={busyId === paymentId}
                onClick={() => void handleRejectPending(paymentId)}
              >
                Reject
              </button>
            </div>
          )
        })}
        {flags.awaitingPaymentIds.length > 0 && (
          <p className="text-xs" style={{ color: c.secondary }}>
            Awaiting client confirmation (
            {flags.awaitingPaymentIds
              .map((id) => selectedPayments.find((p) => p.id === id)?.amount)
              .filter((n): n is number => n != null)
              .map(formatCurrency)
              .join(', ') || '—'}
            )
          </p>
        )}
        {flags.disputePaymentIds.map((paymentId) => (
          <div key={paymentId} className="flex flex-wrap items-center gap-2 text-xs">
            <span style={{ color: c.error }}>Receipt dispute</span>
            <button
              type="button"
              className="dashboard-btn-primary !py-1 !px-2 !text-xs"
              disabled={busyId === paymentId}
              onClick={() => void handleResolveDispute(paymentId, 'confirm')}
            >
              Uphold / re-queue
            </button>
            <button
              type="button"
              className="dashboard-btn-secondary !py-1 !px-2 !text-xs"
              disabled={busyId === paymentId}
              onClick={() => void handleResolveDispute(paymentId, 'reject')}
            >
              Reject payment
            </button>
          </div>
        ))}
        {flags.writeOffPending && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span style={{ color: c.warning }}>Write-off requested</span>
            <button
              type="button"
              className="dashboard-btn-primary !py-1 !px-2 !text-xs"
              disabled={busyId === invoice.id}
              onClick={() => void handleApproveWriteOff(invoice.id)}
            >
              Approve
            </button>
            <button
              type="button"
              className="dashboard-btn-secondary !py-1 !px-2 !text-xs"
              disabled={busyId === invoice.id}
              onClick={() => void handleDenyWriteOff(invoice.id)}
            >
              Deny
            </button>
          </div>
        )}
        <Link
          to={`/payment-posting`}
          className="inline-flex items-center gap-1 text-xs font-medium"
          style={{ color: c.info }}
        >
          <Wallet className="w-3 h-3" />
          Open Payment Posting
        </Link>
      </div>
    )
  }

  const listPanel = (
    <>
      <section
        className="client-stat-strip grid grid-cols-2 lg:grid-cols-4 border-b shrink-0"
        style={{ borderColor: c.border }}
      >
        <button
          type="button"
          onClick={() => setStatusFilter('all')}
          className="flex items-center justify-between gap-2 px-4 py-2.5 sm:border-r border-b lg:border-b-0 text-left"
          style={{
            backgroundColor: statusFilter === 'all' ? c.stat.blue : c.card,
            borderColor: c.border,
          }}
        >
          <span className="text-xs font-medium" style={{ color: c.secondary }}>
            Invoices
          </span>
          <span className="text-lg font-bold tabular-nums" style={{ color: c.primary }}>
            {enriched.length}
          </span>
        </button>
        <button
          type="button"
          onClick={() =>
            setStatusFilter(statusFilter === 'pending_payment' ? 'all' : 'pending_payment')
          }
          className="flex items-center justify-between gap-2 px-4 py-2.5 lg:border-r border-b lg:border-b-0 text-left"
          style={{
            backgroundColor:
              statusFilter === 'pending_payment' ? c.stat.amber : c.stat.amber,
            borderColor: c.border,
          }}
        >
          <span className="text-xs font-medium truncate" style={{ color: c.secondary }}>
            Pending pay
          </span>
          <span className="text-lg font-bold tabular-nums" style={{ color: c.warning }}>
            {queueCounts.pending_payment}
          </span>
        </button>
        <button
          type="button"
          onClick={() =>
            setStatusFilter(
              statusFilter === 'awaiting_confirmation' ? 'all' : 'awaiting_confirmation'
            )
          }
          className="flex items-center justify-between gap-2 px-4 py-2.5 sm:border-r border-b sm:border-b-0 text-left"
          style={{
            backgroundColor: c.stat.blue,
            borderColor: c.border,
          }}
        >
          <span className="text-xs font-medium truncate" style={{ color: c.secondary }}>
            Awaiting
          </span>
          <span className="text-lg font-bold tabular-nums" style={{ color: c.info }}>
            {queueCounts.awaiting_confirmation}
          </span>
        </button>
        <button
          type="button"
          onClick={() =>
            setStatusFilter(statusFilter === 'receipt_dispute' ? 'all' : 'receipt_dispute')
          }
          className="flex items-center justify-between gap-2 px-4 py-2.5 text-left"
          style={{
            backgroundColor: statusFilter === 'receipt_dispute' ? c.stat.redActive : c.stat.red,
            borderColor: c.border,
          }}
        >
          <span className="text-xs font-medium truncate" style={{ color: c.secondary }}>
            Disputes
          </span>
          <span className="text-lg font-bold tabular-nums" style={{ color: c.error }}>
            {queueCounts.receipt_dispute}
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
              placeholder="Search invoice, client, broker, load, batch…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="client-input pl-8"
              style={inputStyle}
            />
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Filter className="w-3.5 h-3.5" style={{ color: c.secondary }} />
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
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as AdminInvoiceStatusFilter)}
              className="client-input w-full md:w-auto min-w-[160px]"
              style={inputStyle}
            >
              {STATUS_FILTERS.map((key) => (
                <option key={key} value={key}>
                  {adminInvoiceFilterLabel(key)}
                  {key === 'pending_payment'
                    ? ` (${queueCounts.pending_payment})`
                    : key === 'awaiting_confirmation'
                      ? ` (${queueCounts.awaiting_confirmation})`
                      : key === 'receipt_dispute'
                        ? ` (${queueCounts.receipt_dispute})`
                        : key === 'writeoff_queue'
                          ? ` (${queueCounts.writeoff_queue})`
                          : key === 'overdue'
                            ? ` (${overdueCount})`
                            : ''}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="dashboard-btn-secondary !py-1.5 !px-2.5 !text-xs inline-flex items-center gap-1.5"
              title={
                selectedInvoice
                  ? 'Open selected invoice with documents in a separate window'
                  : 'Open invoice workspace in a separate window'
              }
              onClick={() => {
                const win = openAdminInvoiceWorkspace(selectedInvoiceId)
                if (!win) {
                  showToast('Pop-up blocked — allow pop-ups for this site to open the workspace', 'error')
                }
              }}
            >
              <PanelRightOpen className="w-3.5 h-3.5" />
              Pop out
            </button>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              'pending_payment',
              'awaiting_confirmation',
              'receipt_dispute',
              'writeoff_queue',
              'overdue',
              'pending',
              'hold',
              'approved',
            ] as AdminInvoiceStatusFilter[]
          ).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setStatusFilter(statusFilter === key ? 'all' : key)}
              className={`page-tab !py-1 !px-2 !text-xs ${
                statusFilter === key ? 'page-tab--active' : ''
              }`}
            >
              {adminInvoiceFilterLabel(key)}
            </button>
          ))}
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className="flex-1 min-h-0 flex items-center justify-center p-6">
          <EmptyState
            icon={FileText}
            title="No invoices found"
            hint={
              searchTerm || statusFilter !== 'all'
                ? 'Try adjusting your search or status filter'
                : 'Invoices will appear here once clients submit batches'
            }
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
                  label="Amount"
                  sortField={sortField}
                  sortDir={sortDir}
                  onSort={onSort}
                  align="right"
                />
                <ClientSortableHeader
                  field="invoice_date"
                  label="Date"
                  sortField={sortField}
                  sortDir={sortDir}
                  onSort={onSort}
                />
                <ClientSortableHeader
                  field="days_outstanding"
                  label="Age"
                  sortField={sortField}
                  sortDir={sortDir}
                  onSort={onSort}
                />
                <ClientSortableHeader
                  field="status"
                  label="Status"
                  sortField={sortField}
                  sortDir={sortDir}
                  onSort={onSort}
                />
              </tr>
            </thead>
            <tbody>
              {pageRows.map((invoice) => {
                const flags = queueIndex.byInvoiceId.get(invoice.id)
                const queueLabel = queueBadgeLabel(flags)
                const selected = invoice.id === selectedInvoiceId
                return (
                  <tr
                    key={invoice.id}
                    className={`cursor-pointer ${selected ? 'invoice-row--selected' : ''} ${
                      invoice.isOverdue ? 'invoice-row--overdue' : ''
                    }`}
                    onClick={() => openDetail(invoice)}
                  >
                    <ClientListTd>
                      <div className="font-medium" style={{ color: c.primary }}>
                        {invoice.invoice_number}
                      </div>
                      {invoice.load_number && (
                        <div className="text-[11px]" style={{ color: c.mutedLight }}>
                          Load {invoice.load_number}
                        </div>
                      )}
                    </ClientListTd>
                    <ClientListTd>
                      <span className="client-list-td__clip">{invoice.client_name}</span>
                    </ClientListTd>
                    <ClientListTd className="client-list-td--broker">
                      <span className="client-list-td__clip">{invoice.broker_name}</span>
                    </ClientListTd>
                    <ClientListTd label="Amount" variant="amount">
                      <span className="tabular-nums font-medium">
                        {formatCurrency(invoice.amount)}
                      </span>
                    </ClientListTd>
                    <ClientListTd>
                      <span className="tabular-nums text-xs">
                        {formatDate(invoice.invoice_date)}
                      </span>
                    </ClientListTd>
                    <ClientListTd>
                      <span
                        className="tabular-nums text-xs font-medium"
                        style={{ color: getDaysOutstandingColor(invoice.overdueSeverity) }}
                      >
                        {invoice.daysOutstanding}d
                      </span>
                    </ClientListTd>
                    <ClientListTd className="client-list-td--status-col">
                      <div className="flex flex-col gap-1 items-start">
                        <span className={statusPillClass(invoice.status)}>
                          {invoice.status.replace(/_/g, ' ')}
                        </span>
                        {queueLabel && (
                          <span className="status-pill status-pill--pending text-[10px]">
                            {queueLabel}
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
      )}

      {sorted.length > 0 && (
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
      )}
    </>
  )

  const handlePopOut = useCallback(() => {
    const win = openAdminInvoiceWorkspace(selectedInvoiceId)
    if (!win) {
      showToast('Pop-up blocked — allow pop-ups for this site to open the workspace', 'error')
    }
  }, [selectedInvoiceId, showToast])

  const invoiceDetailPanelProps = selectedInvoice
    ? {
        invoice: selectedInvoice,
        clientName: selectedInvoice.client_name,
        noteAuthorName: adminName,
        navigationInvoices: sorted,
        onClose: closeDetail,
        onNavigateInvoice: (invoice: Invoice) => openDetail(invoice),
        onViewDocuments: () => {
          setViewingInvoice(selectedInvoice)
          setShowDocumentViewer(true)
        },
        onPopOut: handlePopOut,
        onInvoiceUpdated: bump,
        onAddNote: (invoiceId: string, note: string, options?: { visibility?: 'client' | 'internal' }) => {
          addAdminInvoiceNote(invoiceId, note, adminName, {
            visibility: options?.visibility ?? 'client',
          })
          bump()
        },
        onRemoveNote: (invoiceId: string, noteId: string) => {
          const updated = removeAdminInvoiceNote(invoiceId, noteId)
          if (!updated) {
            showToast('Only Credyx notes can be removed', 'error')
            return false
          }
          bump()
          return true
        },
        payments,
        enableClientActions: false,
        enableNotes: true,
        portalMode: 'admin' as const,
      }
    : null

  return (
    <AdminLayout userName="Admin User" userRole="Administrator" flushMain>
      <div className="client-invoices-page overflow-hidden flex flex-col min-h-0 h-full">
        {useFullPageDetail && showDetail && selectedInvoice && invoiceDetailPanelProps ? (
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            {renderOpsBar(selectedInvoice)}
            <InvoiceDetailPanel variant="mobile" {...invoiceDetailPanelProps} />
          </div>
        ) : (
          <div
            ref={workspaceRef}
            className={`payments-workspace-body flex-1 min-h-0 ${
              detailOpen ? 'payments-workspace-body--detail-open' : ''
            } ${isResizing ? 'payments-workspace-body--resizing' : ''}`}
            style={
              detailOpen
                ? ({ '--payments-detail-width': `${detailWidth}px` } as React.CSSProperties)
                : undefined
            }
          >
            <div className="payments-list-panel flex flex-col min-h-0 overflow-hidden">
              {listPanel}
            </div>

            {detailOpen && selectedInvoice && invoiceDetailPanelProps && (
              <>
                <div className="payments-resize-handle" {...resizeHandleProps} />
                <div className="payments-detail-panel">
                  <div className="payments-detail-panel__inner flex flex-col min-h-0 h-full overflow-hidden">
                    {renderOpsBar(selectedInvoice)}
                    <div className="flex-1 min-h-0 overflow-hidden">
                      <InvoiceDetailPanel variant="sidebar" {...invoiceDetailPanelProps} />
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
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
      </div>
    </AdminLayout>
  )
}
