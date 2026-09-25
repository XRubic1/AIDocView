import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  ChevronDown,
  ChevronRight,
  Check,
  FileText,
  Filter,
  Search,
  Wallet,
} from 'lucide-react'
import InvoiceDetailPanel from '../components/client/InvoiceDetailPanel'
import ClientListTd from '../components/client/ClientListTd'
import ClientSortableHeader from '../components/client/ClientSortableHeader'
import DocumentViewer from '../components/DocumentViewer'
import EmptyState from '../components/ui/EmptyState'
import InUseBubble from '../components/ui/InUseBubble'
import { useToast } from '../components/ui/ToastProvider'
import {
  INVOICE_BLUEPRINT_CHANGED_EVENT,
  isInvoiceBlueprintAssigned,
} from '../components/blueprints/invoiceBlueprintAssignment'
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
  ADMIN_INVOICE_CHIP_FILTERS,
  buildAdminInvoiceQueueIndex,
  countAdminInvoiceFilters,
  createAdminInvoiceDisplayFlags,
  enrichAdminInvoices,
  invoicePassesDisplayFlags,
  type AdminInvoiceChipFilter,
  type AdminInvoiceDisplayFlags,
  type AdminInvoiceQueueFlags,
} from '../utils/adminInvoiceQueue'
import {
  buildConfirmedPayDateByInvoiceId,
  getDaysOutstandingColor,
  getDisplayInvoiceAgeDays,
  invoiceHasStoppedAging,
  type EnrichedInvoice,
} from '../utils/invoiceAging'
import {
  buildCarrierInvoiceGroups,
  type CarrierInvoiceGroup,
} from '../utils/adminInvoiceCarrierGroups'
import {
  getOpenDisputedStatusLabel,
} from '../utils/clientInvoiceDisputeStatus'
import { getInvoiceNoteStatusDisplay } from '../utils/invoiceStatusHeadline'
import { getInvoiceOpenArBalance } from '../utils/paymentVariance'
import {
  getInitialListPageSize,
  PAGE_SIZE_OPTIONS,
  type SortDir,
} from '../utils/clientListPage'
import { getAllClients } from '../services/clientRegistry'

type SortField =
  | 'carrier_name'
  | 'total'
  | 'invoice_count'
  | 'will_pay'
  | 'overdue'
  | 'hold'
  | 'disputes'
  | 'invoice_number'
  | 'broker_name'
  | 'amount'
  | 'invoice_date'
  | 'days_outstanding'
  | 'status'

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
      return 'status-pill status-pill--open'
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

function countCell(value: number): string {
  return value === 0 ? '—' : String(value)
}

function compareInvoices(
  a: EnrichedInvoice,
  b: EnrichedInvoice,
  sortField: SortField,
  openArById: Map<string, number>
): number {
  switch (sortField) {
    case 'invoice_number':
      return a.invoice_number.localeCompare(b.invoice_number, undefined, { numeric: true })
    case 'broker_name':
      return a.broker_name.localeCompare(b.broker_name)
    case 'amount':
    case 'total':
      return (openArById.get(a.id) ?? a.amount) - (openArById.get(b.id) ?? b.amount)
    case 'invoice_date':
      return a.invoice_date.localeCompare(b.invoice_date)
    case 'days_outstanding':
      return a.invoiceAgeDays - b.invoiceAgeDays
    case 'status':
      return a.status.localeCompare(b.status)
    case 'carrier_name':
      return a.client_name.localeCompare(b.client_name, undefined, { sensitivity: 'base' })
    default:
      return a.invoice_date.localeCompare(b.invoice_date)
  }
}

function compareCarrierGroups(a: CarrierInvoiceGroup, b: CarrierInvoiceGroup, sortField: SortField): number {
  switch (sortField) {
    case 'carrier_name':
      return a.clientName.localeCompare(b.clientName, undefined, { sensitivity: 'base' })
    case 'total':
    case 'amount':
      return a.totalAmount - b.totalAmount
    case 'invoice_count':
      return a.invoiceCount - b.invoiceCount
    case 'will_pay':
      return a.willPayCount - b.willPayCount
    case 'overdue':
      return a.overdueCount - b.overdueCount
    case 'hold':
      return a.holdCount - b.holdCount
    case 'disputes':
      return a.disputeCount - b.disputeCount
    default:
      return a.totalAmount - b.totalAmount
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
  const [blueprintRevision, setBlueprintRevision] = useState(0)

  useEffect(() => {
    const onBlueprintChange = () => setBlueprintRevision((k) => k + 1)
    window.addEventListener(INVOICE_BLUEPRINT_CHANGED_EVENT, onBlueprintChange)
    return () =>
      window.removeEventListener(INVOICE_BLUEPRINT_CHANGED_EVENT, onBlueprintChange)
  }, [])

  const [searchTerm, setSearchTerm] = useState('')
  const [clientFilter, setClientFilter] = useState(() => searchParams.get('client') || '')
  const [displayFlags, setDisplayFlags] = useState<AdminInvoiceDisplayFlags>(() =>
    createAdminInvoiceDisplayFlags(true)
  )
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null)
  const [showDetail, setShowDetail] = useState(false)
  const [pageSize, setPageSize] = useState(getInitialListPageSize)
  const [currentPage, setCurrentPage] = useState(1)
  const [sortField, setSortField] = useState<SortField>('total')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [busyId, setBusyId] = useState<string | null>(null)
  const [showDocumentViewer, setShowDocumentViewer] = useState(false)
  const [viewingInvoice, setViewingInvoice] = useState<Invoice | null>(null)

  const invoices = useMemo(() => [...mockInvoices], [dataRevision])
  const payments = useMemo(() => [...mockPayments], [dataRevision])
  const payDateByInvoiceId = useMemo(
    () => buildConfirmedPayDateByInvoiceId(payments),
    [payments]
  )
  const openArById = useMemo(() => {
    const map = new Map<string, number>()
    for (const invoice of invoices) {
      map.set(invoice.id, getInvoiceOpenArBalance(invoice, payments))
    }
    return map
  }, [invoices, payments])
  const enriched = useMemo(() => {
    const base = enrichAdminInvoices(invoices)
    return base.map((invoice) => {
      if (!invoiceHasStoppedAging(invoice)) return invoice
      return {
        ...invoice,
        invoiceAgeDays: getDisplayInvoiceAgeDays(invoice, {
          payDate: payDateByInvoiceId.get(invoice.id) ?? invoice.collection_date ?? null,
        }),
      }
    })
  }, [invoices, payDateByInvoiceId])
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

  const scopedInvoices = useMemo(() => {
    const q = searchTerm.trim().toLowerCase()
    return enriched.filter((invoice) => {
      if (clientFilter && invoice.client_id !== clientFilter) return false
      if (!q) return true
      return (
        invoice.invoice_number.toLowerCase().includes(q) ||
        invoice.client_name.toLowerCase().includes(q) ||
        invoice.broker_name.toLowerCase().includes(q) ||
        (invoice.load_number ?? '').toLowerCase().includes(q) ||
        (invoice.batch_number ?? '').toLowerCase().includes(q)
      )
    })
  }, [enriched, searchTerm, clientFilter])

  const filterCounts = useMemo(
    () => countAdminInvoiceFilters(scopedInvoices, queueIndex.byInvoiceId),
    [scopedInvoices, queueIndex]
  )

  const filtered = useMemo(() => {
    // Search looks across the full client-scoped list; display chips only apply when idle.
    if (searchTerm.trim()) return scopedInvoices
    return scopedInvoices.filter((invoice) =>
      invoicePassesDisplayFlags(invoice, displayFlags, queueIndex.byInvoiceId.get(invoice.id))
    )
  }, [scopedInvoices, displayFlags, queueIndex, searchTerm])

  const sorted = useMemo(() => {
    const rows = [...filtered]
    rows.sort((a, b) => {
      const cmp = compareInvoices(a, b, sortField, openArById)
      return sortDir === 'asc' ? cmp : -cmp
    })
    return rows
  }, [filtered, sortField, sortDir, openArById])

  const carrierGroups = useMemo(() => {
    const groups = buildCarrierInvoiceGroups(sorted, payments)
    groups.sort((a, b) => {
      const cmp = compareCarrierGroups(a, b, sortField)
      return sortDir === 'asc' ? cmp : -cmp
    })
    return groups
  }, [sorted, sortField, sortDir, payments])

  const totalPages = Math.max(1, Math.ceil(carrierGroups.length / pageSize))
  const pageGroups = carrierGroups.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  const toggleCarrier = (clientId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(clientId)) next.delete(clientId)
      else next.add(clientId)
      return next
    })
  }

  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm, displayFlags, clientFilter, pageSize, sortField, sortDir])

  useEffect(() => {
    if (!clientFilter) return
    setExpandedIds((prev) => new Set(prev).add(clientFilter))
  }, [clientFilter])

  useEffect(() => {
    const q = searchTerm.trim().toLowerCase()
    if (!q) return
    setExpandedIds((prev) => {
      const next = new Set(prev)
      for (const group of carrierGroups) {
        const matchesInvoice = group.invoices.some(
          (invoice) =>
            invoice.invoice_number.toLowerCase().includes(q) ||
            (invoice.load_number ?? '').toLowerCase().includes(q) ||
            invoice.broker_name.toLowerCase().includes(q)
        )
        if (matchesInvoice) next.add(group.clientId)
      }
      return next
    })
  }, [searchTerm, carrierGroups])

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

  // Deep-link ?invoice= / ?client=
  useEffect(() => {
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
    setExpandedIds((prev) => new Set(prev).add(hit.client_id))
    const groupIndex = carrierGroups.findIndex((group) =>
      group.invoices.some((invoice) => invoice.id === hit.id)
    )
    if (groupIndex >= 0) setCurrentPage(Math.floor(groupIndex / pageSize) + 1)
  }, [searchParams, enriched, carrierGroups, pageSize])

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

  const toggleDisplayFlag = (key: AdminInvoiceChipFilter) => {
    setDisplayFlags((prev) => ({
      ...prev,
      [key]: !prev[key],
    }))
  }

  const anyDisplayHidden = ADMIN_INVOICE_CHIP_FILTERS.some((key) => !displayFlags[key])

  const onSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDir(field === 'carrier_name' ? 'asc' : 'desc')
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
      <div
        className="client-page-toolbar px-4 py-2 border-b shrink-0 space-y-2"
        style={{ borderColor: c.border, backgroundColor: c.card }}
      >
        <div
          className="flex flex-wrap gap-1.5"
          role="group"
          aria-label="Invoice types to display"
        >
          {ADMIN_INVOICE_CHIP_FILTERS.map((key) => {
            const showing = displayFlags[key]
            return (
              <button
                key={key}
                type="button"
                onClick={() => toggleDisplayFlag(key)}
                aria-pressed={showing}
                title={
                  showing
                    ? `Showing ${adminInvoiceFilterLabel(key)} — click to hide`
                    : `Hidden ${adminInvoiceFilterLabel(key)} — click to show`
                }
                className={`page-tab !py-1 !px-2 !text-xs ${
                  showing ? 'page-tab--active' : 'opacity-50'
                }`}
              >
                {adminInvoiceFilterLabel(key)}
                <span className="tabular-nums"> ({filterCounts[key]})</span>
              </button>
            )
          })}
        </div>
        <div className="flex flex-col md:flex-row md:items-center gap-2">
          <div className="flex-1 relative">
            <Search
              className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5"
              style={{ color: c.secondary }}
            />
            <input
              type="text"
              placeholder="Search invoice, carrier, broker, load…"
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
          </div>
        </div>
      </div>

      {carrierGroups.length === 0 ? (
        <div className="flex-1 min-h-0 flex items-center justify-center p-6">
          <EmptyState
            icon={FileText}
            title="No invoices found"
            hint={
              searchTerm || anyDisplayHidden
                ? 'Try adjusting search or turn display chips back on'
                : 'Invoices will appear here once clients submit batches'
            }
          />
        </div>
      ) : (
        <div className="client-table-scroll flex-1 min-h-0 overflow-y-auto">
          <table className="dashboard-table dashboard-table--compact admin-invoices-table">
            <thead>
              <tr>
                <ClientSortableHeader
                  field="carrier_name"
                  label="Carrier"
                  sortField={sortField}
                  sortDir={sortDir}
                  onSort={onSort}
                />
                <ClientSortableHeader
                  field="total"
                  label="Total $"
                  sortField={sortField}
                  sortDir={sortDir}
                  onSort={onSort}
                  align="right"
                />
                <ClientSortableHeader
                  field="invoice_count"
                  label="Inv #"
                  sortField={sortField}
                  sortDir={sortDir}
                  onSort={onSort}
                  align="right"
                />
                <ClientSortableHeader
                  field="will_pay"
                  label="Will pay"
                  sortField={sortField}
                  sortDir={sortDir}
                  onSort={onSort}
                  align="right"
                />
                <ClientSortableHeader
                  field="overdue"
                  label="Overdue"
                  sortField={sortField}
                  sortDir={sortDir}
                  onSort={onSort}
                  align="right"
                />
                <ClientSortableHeader
                  field="hold"
                  label="Hold"
                  sortField={sortField}
                  sortDir={sortDir}
                  onSort={onSort}
                  align="right"
                />
                <ClientSortableHeader
                  field="disputes"
                  label="Disputes"
                  sortField={sortField}
                  sortDir={sortDir}
                  onSort={onSort}
                  align="right"
                />
              </tr>
            </thead>
            <tbody>
              {pageGroups.map((group) => {
                const expanded = expandedIds.has(group.clientId)
                return (
                  <AdminInvoiceCarrierBlock
                    key={group.clientId}
                    group={group}
                    expanded={expanded}
                    selectedInvoiceId={selectedInvoiceId}
                    queueIndexById={queueIndex.byInvoiceId}
                    openArById={openArById}
                    blueprintRevision={blueprintRevision}
                    onToggle={() => toggleCarrier(group.clientId)}
                    onOpenInvoice={openDetail}
                    secondaryColor={c.secondary}
                    primaryColor={c.primary}
                    mutedColor={c.muted}
                    mutedLightColor={c.mutedLight}
                    cardColor={c.card}
                    errorColor={c.error}
                    warningColor={c.warning}
                  />
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {carrierGroups.length > 0 && (
        <div
          className="client-page-footer flex items-center justify-between gap-2 px-3 py-2 border-t shrink-0"
          style={{ borderColor: c.border }}
        >
          <div className="flex items-center gap-2 text-xs" style={{ color: c.secondary }}>
            <span>
              {carrierGroups.length} carrier{carrierGroups.length === 1 ? '' : 's'} · {sorted.length}{' '}
              invoice{sorted.length === 1 ? '' : 's'}
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
    <>
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
    </>
  )
}

type AdminInvoiceCarrierBlockProps = {
  group: CarrierInvoiceGroup
  expanded: boolean
  selectedInvoiceId: string | null
  queueIndexById: Map<string, AdminInvoiceQueueFlags>
  openArById: Map<string, number>
  /** Bumps when blueprint assignments change so checkmarks refresh. */
  blueprintRevision: number
  onToggle: () => void
  onOpenInvoice: (invoice: EnrichedInvoice) => void
  secondaryColor: string
  primaryColor: string
  mutedColor: string
  mutedLightColor: string
  cardColor: string
  errorColor: string
  warningColor: string
}

/** Carrier summary row with invoices nested underneath. */
function AdminInvoiceCarrierBlock({
  group,
  expanded,
  selectedInvoiceId,
  queueIndexById,
  openArById,
  blueprintRevision,
  onToggle,
  onOpenInvoice,
  secondaryColor,
  primaryColor,
  mutedColor,
  mutedLightColor,
  cardColor,
  errorColor,
  warningColor,
}: AdminInvoiceCarrierBlockProps) {
  void blueprintRevision
  const pendingPayCount = group.invoices.filter(
    (invoice) => (queueIndexById.get(invoice.id)?.pendingPaymentIds.length ?? 0) > 0
  ).length
  const awaitingCount = group.invoices.filter(
    (invoice) => (queueIndexById.get(invoice.id)?.awaitingPaymentIds.length ?? 0) > 0
  ).length

  return (
    <>
      <tr
        className={`dashboard-table-row--clickable cursor-pointer admin-invoices-carrier ${
          expanded ? 'admin-invoices-carrier--open' : ''
        }`}
        onClick={onToggle}
        aria-expanded={expanded}
      >
        <ClientListTd variant="primary">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className={`admin-invoices-expand ${expanded ? 'admin-invoices-expand--open' : ''}`}
              aria-hidden
            >
              {expanded ? (
                <ChevronDown className="w-3.5 h-3.5" strokeWidth={1.5} />
              ) : (
                <ChevronRight className="w-3.5 h-3.5" strokeWidth={1.5} />
              )}
            </span>
            <div className="min-w-0">
              <span className="font-semibold truncate block">{group.clientName}</span>
              {pendingPayCount > 0 || awaitingCount > 0 ? (
                <p className="text-[11px] mt-0.5 truncate" style={{ color: secondaryColor }}>
                  {pendingPayCount > 0
                    ? `${pendingPayCount} pending payment${pendingPayCount === 1 ? '' : 's'}`
                    : ''}
                  {pendingPayCount > 0 && awaitingCount > 0 ? ' · ' : ''}
                  {awaitingCount > 0 ? `${awaitingCount} awaiting confirmation` : ''}
                </p>
              ) : null}
            </div>
          </div>
        </ClientListTd>
        <ClientListTd variant="amount" className="tabular-nums font-semibold">
          {formatCurrency(group.totalAmount)}
        </ClientListTd>
        <ClientListTd variant="amount" className="tabular-nums">
          {group.invoiceCount}
        </ClientListTd>
        <ClientListTd
          variant="amount"
          className="tabular-nums"
          style={{ color: group.willPayCount ? primaryColor : mutedColor }}
        >
          {countCell(group.willPayCount)}
        </ClientListTd>
        <ClientListTd
          variant="amount"
          className="tabular-nums"
          style={{ color: group.overdueCount ? errorColor : mutedColor }}
        >
          {countCell(group.overdueCount)}
        </ClientListTd>
        <ClientListTd
          variant="amount"
          className="tabular-nums"
          style={{ color: group.holdCount ? warningColor : mutedColor }}
        >
          {countCell(group.holdCount)}
        </ClientListTd>
        <ClientListTd
          variant="amount"
          className="tabular-nums"
          style={{ color: group.disputeCount ? errorColor : mutedColor }}
        >
          {countCell(group.disputeCount)}
        </ClientListTd>
      </tr>
      {expanded ? (
        <>
          <tr className="admin-invoices-subhead">
            <td
              className="!py-1 !px-3 text-[10px] font-semibold uppercase tracking-wide"
              style={{ color: secondaryColor }}
            >
              Invoices
            </td>
            <td
              className="!py-1 !px-3 text-[10px] font-semibold uppercase tracking-wide"
              style={{ color: secondaryColor }}
            >
              Broker
            </td>
            <td
              className="!py-1 !px-3 text-right text-[10px] font-semibold uppercase tracking-wide"
              style={{ color: secondaryColor }}
            >
              Amount
            </td>
            <td
              className="!py-1 !px-3 text-[10px] font-semibold uppercase tracking-wide"
              style={{ color: secondaryColor }}
            >
              Date
            </td>
            <td
              className="!py-1 !px-3 text-right text-[10px] font-semibold uppercase tracking-wide"
              style={{ color: secondaryColor }}
            >
              Age
            </td>
            <td
              className="!py-1 !px-3 text-center text-[10px] font-semibold uppercase tracking-wide"
              style={{ color: secondaryColor }}
              title="Blueprint assigned"
            >
              BP
            </td>
            <td
              className="!py-1 !px-3 text-[10px] font-semibold uppercase tracking-wide"
              style={{ color: secondaryColor }}
            >
              Status
            </td>
          </tr>
          {group.invoices.map((invoice) => {
            const flags = queueIndexById.get(invoice.id)
            const queueLabel = queueBadgeLabel(flags)
            const selected = invoice.id === selectedInvoiceId
            const noteStatus = getInvoiceNoteStatusDisplay(invoice)
            const agingStopped = invoiceHasStoppedAging(invoice)
            const hasBlueprint = isInvoiceBlueprintAssigned(invoice.id)
            return (
              <tr
                key={invoice.id}
                className={`cursor-pointer ${selected ? 'invoice-row--selected' : ''} ${
                  !agingStopped && invoice.isOverdue ? 'invoice-row--overdue' : ''
                }`}
                style={{ backgroundColor: cardColor }}
                onClick={() => onOpenInvoice(invoice)}
              >
                <ClientListTd>
                  <div>
                    <div className="font-medium" style={{ color: primaryColor }}>
                      {invoice.invoice_number}
                    </div>
                    {invoice.load_number ? (
                      <div className="text-[11px] tabular-nums whitespace-nowrap" style={{ color: mutedLightColor }}>
                        {invoice.load_number}
                      </div>
                    ) : null}
                  </div>
                </ClientListTd>
                <ClientListTd className="admin-invoices-broker-cell" title={invoice.broker_name}>
                  {invoice.broker_name}
                </ClientListTd>
                <ClientListTd label="Amount" variant="amount" className="admin-invoices-amount-cell">
                  <span className="tabular-nums font-medium whitespace-nowrap">
                    {formatCurrency(openArById.get(invoice.id) ?? invoice.amount)}
                  </span>
                </ClientListTd>
                <ClientListTd>
                  <span className="tabular-nums text-xs">{formatDate(invoice.invoice_date)}</span>
                </ClientListTd>
                <ClientListTd variant="amount">
                  <span
                    className="tabular-nums text-xs font-medium"
                    style={{
                      color: agingStopped
                        ? 'var(--cp-success)'
                        : getDaysOutstandingColor(invoice.overdueSeverity),
                    }}
                  >
                    {invoice.invoiceAgeDays}d
                  </span>
                </ClientListTd>
                <ClientListTd className="text-center">
                  {hasBlueprint ? (
                    <span
                      className="inline-flex items-center justify-center w-5 h-5 rounded-full"
                      style={{
                        backgroundColor: 'color-mix(in srgb, #16a34a 16%, transparent)',
                        color: '#15803d',
                      }}
                      title="Blueprint assigned"
                      aria-label="Blueprint assigned"
                    >
                      <Check className="w-3.5 h-3.5" strokeWidth={2.5} aria-hidden />
                    </span>
                  ) : (
                    <span className="text-[11px]" style={{ color: mutedColor }} aria-label="No blueprint">
                      —
                    </span>
                  )}
                </ClientListTd>
                <ClientListTd className="client-list-td--status-col">
                  <div className="flex flex-col gap-1 items-start">
                    <span
                      className={
                        noteStatus === 'on_hold'
                          ? 'status-pill status-pill--hold'
                          : noteStatus === 'open_disputed'
                          ? 'status-pill status-pill--overdue'
                          : noteStatus === 'will_pay'
                            ? 'status-pill status-pill--approved'
                            : noteStatus === 'call_back'
                              ? 'status-pill status-pill--pending'
                            : statusPillClass(invoice.status)
                      }
                    >
                      {noteStatus === 'on_hold'
                        ? 'On Hold'
                        : noteStatus === 'open_disputed'
                        ? getOpenDisputedStatusLabel()
                        : noteStatus === 'will_pay'
                          ? 'Will Pay'
                          : noteStatus === 'call_back'
                            ? 'Call Back'
                          : invoice.status === 'approved'
                            ? 'Open'
                            : invoice.status.replace(/_/g, ' ')}
                    </span>
                    {queueLabel ? (
                      <span className="status-pill status-pill--pending text-[10px]">{queueLabel}</span>
                    ) : null}
                    {invoice.in_use ? (
                      <InUseBubble name={invoice.in_use_by} />
                    ) : null}
                  </div>
                </ClientListTd>
              </tr>
            )
          })}
        </>
      ) : null}
    </>
  )
}
