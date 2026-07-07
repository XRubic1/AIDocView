import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useClientSession } from '../hooks/useClientSession'
import { Payment } from '../types/payment'
import { formatCurrency, formatDate } from '../utils/format'
import {
  DollarSign,
  Search,
  Filter,
  X,
  Eye,
  ChevronLeft,
  ChevronRight,
  Plus,
  MoreVertical,
  ArrowRightLeft,
  Undo2,
  Info,
} from 'lucide-react'
import ClientLayout from '../components/ClientLayout'
import PaymentKpiCards from '../components/client/PaymentKpiCards'
import PostPaymentForm from '../components/client/PostPaymentForm'
import ClientSortableHeader from '../components/client/ClientSortableHeader'
import ClientListTd from '../components/client/ClientListTd'
import { useClientTheme } from '../theme/ThemeContext'
import { listPostableInvoices, type PostPaymentResult } from '../services/clientPaymentService'
import { movePaymentFunds, unprocessPayment } from '../services/paymentCorrectionService'
import { getInvoiceById } from '../data/mockInvoices'
import { getClientPayments as getClientDemoPayments } from '../data/clientDemoData'
import { useClientDemoSnapshot } from '../hooks/useClientDemoSnapshot'
import { useClientCapabilities } from '../hooks/useClientCapabilities'
import { useToast } from '../components/ui/ToastProvider'
import { mapClientVisibleInvoices } from '../utils/clientInvoiceView'
import { MoveFundsModal, UnprocessPaymentModal } from '../components/client/PaymentCorrectionModals'
import {
  getInitialListPageSize,
  PAGE_SIZE_OPTIONS,
  type SortDir,
} from '../utils/clientListPage'
import { getPresetRange } from '../utils/clientReports'

type PaymentSortField =
  | 'invoice_number'
  | 'broker_name'
  | 'amount'
  | 'payment_date'
  | 'received_date'
  | 'payment_method'
  | 'status'

const METHOD_LABELS: Record<string, string> = {
  check: 'Check',
  wire: 'Wire Transfer',
  ach: 'ACH',
  credit_card: 'Credit Card',
}

type PaymentStatusFilter = 'all' | 'pending' | 'confirmed' | 'rejected' | 'reversed'

function getPaymentStatusPill(status: string, payment?: Payment) {
  const config: Record<string, { className: string; label: string }> = {
    pending: { className: 'status-pill status-pill--pending', label: 'Pending' },
    confirmed: { className: 'status-pill status-pill--approved', label: 'Confirmed' },
    rejected: { className: 'status-pill status-pill--overdue', label: 'Rejected' },
    reversed: { className: 'status-pill status-pill--hold', label: 'Reversed' },
  }
  const entry = config[status] ?? { className: 'status-pill', label: status }
  const pill = (
    <span className={`inline-flex items-center ${entry.className}`}>{entry.label}</span>
  )
  const reason =
    status === 'reversed'
      ? payment?.reversal_reason
      : status === 'rejected'
        ? payment?.rejection_reason
        : undefined
  if (reason) {
    return (
      <span title={reason} className="inline-flex items-center">
        {pill}
      </span>
    )
  }
  return pill
}

function buildInitialPayments(clientId: string, clientName: string): Payment[] {
  return getClientDemoPayments(clientId, clientName)
}

type PaymentsViewTab = 'history' | 'post'

export default function ClientPayments() {
  const c = useClientTheme()
  const { clientId, clientName } = useClientSession()
  const { capabilities } = useClientCapabilities()
  const { showToast } = useToast()
  const authorName = clientName
  const [viewTab, setViewTab] = useState<PaymentsViewTab>('history')
  const [refreshKey, setRefreshKey] = useState(0)
  const [payments, setPayments] = useState<Payment[]>(() =>
    buildInitialPayments(clientId, clientName)
  )

  const { invoices: rawInvoices } = useClientDemoSnapshot(refreshKey)
  const clientInvoices = useMemo(() => mapClientVisibleInvoices(rawInvoices), [rawInvoices])
  const postableInvoices = useMemo(
    () => listPostableInvoices(clientInvoices),
    [clientInvoices]
  )

  const refreshPayments = useCallback(() => {
    setRefreshKey((k) => k + 1)
    setPayments(buildInitialPayments(clientId, clientName))
  }, [clientId, clientName])

  useEffect(() => {
    if (!capabilities.canPostPayment && viewTab === 'post') {
      setViewTab('history')
    }
  }, [capabilities.canPostPayment, viewTab])

  useEffect(() => {
    refreshPayments()
  }, [clientId, refreshPayments])

  const [searchTerm, setSearchTerm] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [methodFilter, setMethodFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<PaymentStatusFilter>('all')
  const [actionsMenuId, setActionsMenuId] = useState<string | null>(null)
  const [moveTarget, setMoveTarget] = useState<Payment | null>(null)
  const [unprocessTarget, setUnprocessTarget] = useState<Payment | null>(null)
  const [moveTargetInvoiceId, setMoveTargetInvoiceId] = useState<string | null>(null)
  const [moveReason, setMoveReason] = useState('')
  const [unprocessReason, setUnprocessReason] = useState('')
  const historyTableRef = useRef<HTMLDivElement>(null)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [showPaymentDetailModal, setShowPaymentDetailModal] = useState(false)
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null)
  const [pageSize, setPageSize] = useState<number>(getInitialListPageSize)
  const [currentPage, setCurrentPage] = useState(1)
  const [sortField, setSortField] = useState<PaymentSortField>('payment_date')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const activeFilterCount = useMemo(() => {
    let count = 0
    if (dateFrom || dateTo) count += 1
    if (methodFilter !== 'all') count += 1
    if (statusFilter !== 'all') count += 1
    return count
  }, [dateFrom, dateTo, methodFilter, statusFilter])

  const matchesDatePreset = useCallback(
    (preset: '30d' | '90d' | 'ytd') => {
      const range = getPresetRange(preset)
      return dateFrom === range.start_date && dateTo === range.end_date
    },
    [dateFrom, dateTo]
  )

  const applyDatePreset = useCallback((preset: '30d' | '90d' | 'ytd' | 'all') => {
    if (preset === 'all') {
      setDateFrom('')
      setDateTo('')
      return
    }
    const range = getPresetRange(preset)
    setDateFrom(range.start_date)
    setDateTo(range.end_date)
  }, [])

  const clearAllFilters = useCallback(() => {
    setDateFrom('')
    setDateTo('')
    setMethodFilter('all')
    setStatusFilter('all')
  }, [])

  const handleKpiStatusFilter = useCallback((status: 'confirmed' | 'pending') => {
    setStatusFilter(status)
    historyTableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  const filteredPayments = useMemo(() => {
    return payments.filter((payment) => {
      const matchesSearch =
        payment.invoice_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
        payment.broker_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        payment.load_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        payment.batch_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        payment.payment_reference?.toLowerCase().includes(searchTerm.toLowerCase())

      const matchesMethod = methodFilter === 'all' || payment.payment_method === methodFilter
      const matchesStatus = statusFilter === 'all' || payment.status === statusFilter
      const matchesDate =
        (!dateFrom || payment.payment_date >= dateFrom) &&
        (!dateTo || payment.payment_date <= dateTo)

      return matchesSearch && matchesMethod && matchesStatus && matchesDate
    })
  }, [payments, searchTerm, dateFrom, dateTo, methodFilter, statusFilter])

  const sortedPayments = useMemo(() => {
    const sorted = [...filteredPayments]
    sorted.sort((a, b) => {
      if (a.status !== b.status) {
        if (a.status === 'pending') return -1
        if (b.status === 'pending') return 1
      }

      let cmp = 0
      switch (sortField) {
        case 'invoice_number':
          cmp = a.invoice_number.localeCompare(b.invoice_number, undefined, { numeric: true })
          break
        case 'broker_name':
          cmp = a.broker_name.localeCompare(b.broker_name)
          break
        case 'amount':
          cmp = a.amount - b.amount
          break
        case 'payment_date':
          cmp = new Date(a.payment_date).getTime() - new Date(b.payment_date).getTime()
          break
        case 'received_date':
          cmp = new Date(a.received_date).getTime() - new Date(b.received_date).getTime()
          break
        case 'payment_method':
          cmp = a.payment_method.localeCompare(b.payment_method)
          break
        case 'status':
          cmp = a.status.localeCompare(b.status)
          break
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
    return sorted
  }, [filteredPayments, sortField, sortDir])

  const totalPages = Math.max(1, Math.ceil(sortedPayments.length / pageSize))

  const paginatedPayments = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return sortedPayments.slice(start, start + pageSize)
  }, [sortedPayments, currentPage, pageSize])

  const pageStart = sortedPayments.length === 0 ? 0 : (currentPage - 1) * pageSize + 1
  const pageEnd = Math.min(currentPage * pageSize, sortedPayments.length)

  const handleSort = useCallback(
    (field: PaymentSortField) => {
      if (sortField === field) {
        setSortDir((dir) => (dir === 'asc' ? 'desc' : 'asc'))
      } else {
        setSortField(field)
        const defaultDesc =
          field === 'amount' || field === 'payment_date' || field === 'received_date'
        setSortDir(defaultDesc ? 'desc' : 'asc')
      }
    },
    [sortField]
  )

  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm, dateFrom, dateTo, methodFilter, statusFilter, pageSize, sortField, sortDir])

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages)
    }
  }, [currentPage, totalPages])

  const handleViewPaymentDetail = (payment: Payment) => {
    setSelectedPayment(payment)
    setShowPaymentDetailModal(true)
  }

  const handlePaymentPosted = useCallback(
    (_result: PostPaymentResult) => {
      refreshPayments()
      setViewTab('history')
      requestAnimationFrame(() => {
        historyTableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
    },
    [refreshPayments]
  )

  const handleMoveSubmit = useCallback(() => {
    if (!moveTarget || !moveTargetInvoiceId || !moveReason.trim()) return
    const result = movePaymentFunds(
      moveTarget.id,
      moveTargetInvoiceId,
      authorName,
      moveReason.trim(),
      capabilities
    )
    if (result) {
      showToast('Funds moved successfully', 'success')
      setMoveTarget(null)
      setMoveTargetInvoiceId(null)
      setMoveReason('')
      refreshPayments()
    } else {
      showToast('Could not move funds — check target invoice eligibility', 'error')
    }
  }, [
    moveTarget,
    moveTargetInvoiceId,
    moveReason,
    authorName,
    capabilities,
    showToast,
    refreshPayments,
  ])

  const handleUnprocessSubmit = useCallback(() => {
    if (!unprocessTarget || !unprocessReason.trim()) return
    const payment = unprocessPayment(
      unprocessTarget.id,
      authorName,
      unprocessReason.trim(),
      capabilities
    )
    if (payment) {
      showToast('Payment unprocessed', 'success')
      setUnprocessTarget(null)
      setUnprocessReason('')
      refreshPayments()
    } else {
      showToast('Could not unprocess payment', 'error')
    }
  }, [unprocessTarget, unprocessReason, authorName, capabilities, showToast, refreshPayments])

  const openMoveModal = useCallback((payment: Payment) => {
    setActionsMenuId(null)
    setMoveTarget(payment)
    setMoveTargetInvoiceId(null)
    setMoveReason('')
  }, [])

  const openUnprocessModal = useCallback((payment: Payment) => {
    setActionsMenuId(null)
    setUnprocessTarget(payment)
    setUnprocessReason('')
  }, [])

  const inputCompactStyle = {
    backgroundColor: c.card,
    height: 34,
    paddingTop: 6,
    paddingBottom: 6,
    fontSize: 13,
  } as const

  return (
    <ClientLayout clientName={clientName} clientId={clientId} flushMain>
      <div className="client-payments-page overflow-hidden flex flex-col min-h-0">
        <div
          className="client-page-toolbar px-4 py-2 border-b shrink-0 flex flex-wrap items-center gap-2"
          style={{ borderColor: c.border, backgroundColor: c.card }}
        >
          <div className="page-tabs">
            <button
              type="button"
              onClick={() => setViewTab('history')}
              className={`page-tab ${viewTab === 'history' ? 'page-tab--active' : ''}`}
            >
              Payment history
            </button>
            {capabilities.canPostPayment && (
              <button
                type="button"
                onClick={() => setViewTab('post')}
                className={`page-tab ${viewTab === 'post' ? 'page-tab--active' : ''}`}
              >
                Post payment
              </button>
            )}
          </div>
          {viewTab === 'post' && capabilities.canPostPayment && (
            <button
              type="button"
              onClick={() => setViewTab('history')}
              className="dashboard-btn-secondary dashboard-btn-compact ml-auto"
            >
              View history
            </button>
          )}
          {viewTab === 'history' && capabilities.canPostPayment && (
            <button
              type="button"
              onClick={() => setViewTab('post')}
              className="dashboard-btn-primary dashboard-btn-compact ml-auto"
            >
              <Plus className="w-3.5 h-3.5" />
              Post payment
            </button>
          )}
        </div>

        {viewTab === 'post' && capabilities.canPostPayment ? (
          <div className="client-payments-page--post overflow-y-auto flex flex-col min-h-0 flex-1">
            <PostPaymentForm
              clientId={clientId}
              clientName={clientName}
              invoices={clientInvoices}
              payments={payments}
              authorName={authorName}
              onPosted={handlePaymentPosted}
            />
          </div>
        ) : (
          <div className="client-payments-page--history overflow-hidden flex flex-col min-h-0 flex-1">
        {!capabilities.canPostPayment && (
          <section
            className="shrink-0 px-4 py-2.5 border-b text-sm flex gap-3 items-start"
            style={{ borderColor: c.border, backgroundColor: c.stat.amber, color: c.secondary }}
          >
            <Info className="w-4 h-4 shrink-0 mt-0.5" style={{ color: c.info }} />
            <p>
              Your account is on the Managed plan. Credyx posts payments from remittances — view
              history here. Contact Credyx to correct a mis-posted payment.
            </p>
          </section>
        )}
        {!capabilities.canCorrectPayments && capabilities.canPostPayment && (
          <section
            className="shrink-0 px-4 py-2.5 border-b text-sm"
            style={{ borderColor: c.border, backgroundColor: c.stat.slate, color: c.secondary }}
          >
            Payment corrections are handled by Credyx on your plan.
          </section>
        )}
        <PaymentKpiCards
          payments={payments}
          statusFilter={
            statusFilter === 'all'
              ? 'confirmed'
              : statusFilter === 'pending' || statusFilter === 'confirmed'
                ? statusFilter
                : 'all'
          }
          onStatusFilter={handleKpiStatusFilter}
        />

        <div
          ref={historyTableRef}
          className="client-page-toolbar px-4 py-2 border-b shrink-0"
          style={{ borderColor: c.border, backgroundColor: c.card }}
        >
          <div className="flex items-center gap-2 mb-1">
            <h2 className="text-sm font-semibold" style={{ color: c.primary }}>
              Payment history
            </h2>
            <span className="text-xs" style={{ color: c.mutedLight }}>
              Pending and confirmed in one list
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1 relative min-w-0">
              <Search
                className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5"
                style={{ color: c.secondary }}
              />
              <input
                type="text"
                placeholder="Search payments…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="client-input pl-8 w-full"
                style={inputCompactStyle}
              />
            </div>
            <button
              type="button"
              onClick={() => setFiltersOpen((open) => !open)}
              className={`dashboard-btn-secondary dashboard-btn-compact inline-flex items-center gap-1.5 shrink-0 ${
                filtersOpen || activeFilterCount > 0 ? 'client-payments-filter-btn--active' : ''
              }`}
              aria-expanded={filtersOpen}
              aria-controls="payments-filters-panel"
            >
              <Filter className="w-3.5 h-3.5" aria-hidden />
              <span className="hidden sm:inline">Filters</span>
              {activeFilterCount > 0 && (
                <span className="client-payments-filter-badge">{activeFilterCount}</span>
              )}
            </button>
          </div>

          <div
            className={`client-payments-filters-wrap ${
              !filtersOpen && activeFilterCount > 0 ? 'client-payments-filters-wrap--open' : ''
            } ${filtersOpen || activeFilterCount === 0 ? 'pointer-events-none' : ''}`}
            aria-hidden={filtersOpen || activeFilterCount === 0}
          >
            <div
              className="client-payments-filters client-payments-filters--chips"
              style={{ borderColor: c.border }}
            >
              <div className="flex flex-wrap items-center gap-1">
                {statusFilter !== 'all' && (
                  <button
                    type="button"
                    onClick={() => setStatusFilter('all')}
                    className="batch-filter-pill batch-filter-pill--sm batch-filter-pill--active"
                  >
                    {statusFilter === 'pending'
                      ? 'Pending only'
                      : statusFilter === 'rejected'
                        ? 'Rejected only'
                        : statusFilter === 'reversed'
                          ? 'Reversed only'
                          : 'Confirmed only'}
                    <X className="w-3 h-3 opacity-60" aria-hidden />
                  </button>
                )}
                {(dateFrom || dateTo) && (
                  <button
                    type="button"
                    onClick={() => {
                      setDateFrom('')
                      setDateTo('')
                    }}
                    className="batch-filter-pill batch-filter-pill--sm batch-filter-pill--active"
                  >
                    {dateFrom && dateTo
                      ? `${formatDate(dateFrom)} – ${formatDate(dateTo)}`
                      : dateFrom
                        ? `From ${formatDate(dateFrom)}`
                        : `Until ${formatDate(dateTo)}`}
                    <X className="w-3 h-3 opacity-60" aria-hidden />
                  </button>
                )}
                {methodFilter !== 'all' && (
                  <button
                    type="button"
                    onClick={() => setMethodFilter('all')}
                    className="batch-filter-pill batch-filter-pill--sm batch-filter-pill--active"
                  >
                    {METHOD_LABELS[methodFilter] || methodFilter}
                    <X className="w-3 h-3 opacity-60" aria-hidden />
                  </button>
                )}
                {activeFilterCount > 0 && (
                  <button
                    type="button"
                    onClick={clearAllFilters}
                    className="text-[11px] font-medium px-1.5 py-0.5 rounded transition-colors hover:underline"
                    style={{ color: c.secondary }}
                  >
                    Clear all
                  </button>
                )}
              </div>
            </div>
          </div>

          <div
            className={`client-payments-filters-wrap ${
              filtersOpen ? 'client-payments-filters-wrap--open' : ''
            } ${!filtersOpen ? 'pointer-events-none' : ''}`}
            aria-hidden={!filtersOpen}
          >
            <div
              id="payments-filters-panel"
              className="client-payments-filters"
              style={{ borderColor: c.border }}
            >
              <div className="client-payments-filters__bar">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as PaymentStatusFilter)}
                  className="client-input client-payments-filters__select"
                  aria-label="Status"
                >
                  <option value="all">All statuses</option>
                  <option value="pending">Pending</option>
                  <option value="confirmed">Confirmed</option>
                  <option value="rejected">Rejected</option>
                  <option value="reversed">Reversed</option>
                </select>

                <span className="client-payments-filters__sep" aria-hidden />

                {(
                  [
                    { id: '30d' as const, label: '30d' },
                    { id: '90d' as const, label: '90d' },
                    { id: 'ytd' as const, label: 'YTD' },
                    { id: 'all' as const, label: 'All' },
                  ] as const
                ).map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => applyDatePreset(preset.id)}
                    className={`batch-filter-pill batch-filter-pill--xs ${
                      preset.id === 'all'
                        ? !dateFrom && !dateTo
                          ? 'batch-filter-pill--active'
                          : ''
                        : matchesDatePreset(preset.id)
                          ? 'batch-filter-pill--active'
                          : ''
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}

                <span className="client-payments-filters__sep" aria-hidden />

                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="client-input client-payments-date-input"
                  aria-label="From"
                />
                <span className="client-payments-filters__dash" style={{ color: c.mutedLight }}>
                  –
                </span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="client-input client-payments-date-input"
                  aria-label="To"
                />

                <span className="client-payments-filters__sep" aria-hidden />

                <select
                  value={methodFilter}
                  onChange={(e) => setMethodFilter(e.target.value)}
                  className="client-input client-payments-filters__select"
                  aria-label="Method"
                >
                  <option value="all">All methods</option>
                  <option value="check">Check</option>
                  <option value="wire">Wire</option>
                  <option value="ach">ACH</option>
                  <option value="credit_card">Card</option>
                </select>

                {activeFilterCount > 0 && (
                  <button
                    type="button"
                    onClick={clearAllFilters}
                    className="client-payments-filters__clear"
                    style={{ color: c.secondary }}
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {sortedPayments.length === 0 ? (
          <div className="flex items-center justify-center text-center py-8 px-4">
            <div>
              <DollarSign className="w-10 h-10 mx-auto mb-3" style={{ color: c.mutedLight }} />
              <p className="text-base font-medium mb-1" style={{ color: c.primary }}>
                No payments found
              </p>
              <p className="text-sm" style={{ color: c.secondary }}>
                {searchTerm || dateFrom || dateTo || methodFilter !== 'all' || statusFilter !== 'all'
                  ? 'Try adjusting your search or filters'
                  : 'Posted and pending payments appear here'}
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="client-table-scroll client-table-scroll--mobile-stack overflow-x-auto">
              <table className="dashboard-table dashboard-table--compact">
                <thead>
                  <tr>
                    <ClientSortableHeader
                      field="invoice_number"
                      label="Invoice#"
                      sortField={sortField}
                      sortDir={sortDir}
                      onSort={handleSort}
                    />
                    <ClientSortableHeader
                      field="broker_name"
                      label="Broker"
                      sortField={sortField}
                      sortDir={sortDir}
                      onSort={handleSort}
                    />
                    <ClientSortableHeader
                      field="amount"
                      label="Amount"
                      sortField={sortField}
                      sortDir={sortDir}
                      onSort={handleSort}
                      className="text-right"
                      align="right"
                    />
                    <ClientSortableHeader
                      field="payment_date"
                      label="Payment Date"
                      sortField={sortField}
                      sortDir={sortDir}
                      onSort={handleSort}
                    />
                    <ClientSortableHeader
                      field="received_date"
                      label="Received"
                      sortField={sortField}
                      sortDir={sortDir}
                      onSort={handleSort}
                    />
                    <ClientSortableHeader
                      field="payment_method"
                      label="Method"
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
                      className="text-center"
                      align="center"
                    />
                    <th className="text-center">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedPayments.map((payment) => (
                      <tr
                        key={payment.id}
                        className={`cursor-pointer ${payment.status === 'pending' ? 'payment-row--pending' : ''} ${
                          payment.status === 'reversed' || payment.status === 'rejected' ? 'opacity-70' : ''
                        }`}
                        onClick={() => handleViewPaymentDetail(payment)}
                      >
                        <ClientListTd
                          variant="primary"
                          className={`font-semibold ${payment.status === 'reversed' ? 'line-through' : ''}`}
                        >
                          {payment.invoice_number}
                        </ClientListTd>
                        <ClientListTd variant="meta" className="truncate">
                          <span className="client-list-meta-short">{payment.broker_name}</span>
                          <span className="client-list-meta-full">{payment.broker_name}</span>
                        </ClientListTd>
                        <ClientListTd
                          variant="amount"
                          className={`text-right font-medium tabular-nums ${
                            payment.status === 'reversed' ? 'line-through' : ''
                          }`}
                        >
                          {formatCurrency(payment.amount)}
                        </ClientListTd>
                        <ClientListTd variant="desktop" label="Payment Date" style={{ color: c.secondary }}>
                          {formatDate(payment.payment_date)}
                        </ClientListTd>
                        <ClientListTd variant="desktop" label="Received" style={{ color: c.secondary }}>
                          {formatDate(payment.received_date)}
                        </ClientListTd>
                        <ClientListTd variant="desktop" label="Method" style={{ color: c.secondary }}>
                          {METHOD_LABELS[payment.payment_method] || payment.payment_method}
                        </ClientListTd>
                        <ClientListTd variant="desktop" label="Status" className="text-center">
                          {getPaymentStatusPill(payment.status, payment)}
                        </ClientListTd>
                        <ClientListTd variant="actions" className="text-center">
                          <div className="inline-flex items-center justify-center gap-1 relative">
                            {payment.status === 'confirmed' && capabilities.canCorrectPayments && (
                              <div className="relative">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setActionsMenuId((id) => (id === payment.id ? null : payment.id))
                                  }}
                                  className="p-1.5 rounded-lg transition-colors hover:bg-slate-100"
                                  style={{ color: c.secondary }}
                                  title="Payment actions"
                                  aria-label="Payment actions"
                                >
                                  <MoreVertical className="w-4 h-4" />
                                </button>
                                {actionsMenuId === payment.id && (
                                  <div
                                    className="absolute right-0 top-full mt-1 z-20 min-w-[160px] rounded-lg border shadow-lg py-1 text-left"
                                    style={{ borderColor: c.border, backgroundColor: c.card }}
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <button
                                      type="button"
                                      className="w-full px-3 py-2 text-sm text-left hover:bg-slate-50 flex items-center gap-2"
                                      style={{ color: c.primary }}
                                      onClick={() => openMoveModal(payment)}
                                    >
                                      <ArrowRightLeft className="w-3.5 h-3.5" />
                                      Move funds
                                    </button>
                                    <button
                                      type="button"
                                      className="w-full px-3 py-2 text-sm text-left hover:bg-slate-50 flex items-center gap-2"
                                      style={{ color: c.error }}
                                      onClick={() => openUnprocessModal(payment)}
                                    >
                                      <Undo2 className="w-3.5 h-3.5" />
                                      Unprocess
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleViewPaymentDetail(payment)
                              }}
                              className="p-1.5 rounded-lg transition-colors hover:bg-slate-100"
                              style={{ color: c.info }}
                              title="View details"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
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
                Showing {pageStart}–{pageEnd} of {sortedPayments.length}
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
        )}
      </div>

      {showPaymentDetailModal && selectedPayment && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div
            className="rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            style={{ backgroundColor: c.card, boxShadow: c.shadow.cardHover }}
          >
            <div
              className="flex items-center justify-between p-6 border-b"
              style={{ borderColor: c.border }}
            >
              <h3 className="text-lg font-semibold" style={{ color: c.primary }}>
                Payment Details
              </h3>
              <button
                type="button"
                onClick={() => {
                  setShowPaymentDetailModal(false)
                  setSelectedPayment(null)
                }}
                className="p-2 rounded-lg transition-colors hover:bg-slate-100"
                style={{ color: c.primary }}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium" style={{ color: c.secondary }}>
                    Invoice Number
                  </label>
                  <p className="text-sm mt-1" style={{ color: c.primary }}>
                    {selectedPayment.invoice_number}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium" style={{ color: c.secondary }}>
                    Broker Name
                  </label>
                  <p className="text-sm mt-1" style={{ color: c.primary }}>
                    {selectedPayment.broker_name}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium" style={{ color: c.secondary }}>
                    Amount
                  </label>
                  <p className="text-sm mt-1 font-semibold tabular-nums" style={{ color: c.primary }}>
                    {formatCurrency(selectedPayment.amount)}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium" style={{ color: c.secondary }}>
                    Status
                  </label>
                  <div className="mt-1">{getPaymentStatusPill(selectedPayment.status, selectedPayment)}</div>
                </div>
                <div>
                  <label className="text-sm font-medium" style={{ color: c.secondary }}>
                    Payment Date
                  </label>
                  <p className="text-sm mt-1" style={{ color: c.primary }}>
                    {formatDate(selectedPayment.payment_date)}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium" style={{ color: c.secondary }}>
                    Received Date
                  </label>
                  <p className="text-sm mt-1" style={{ color: c.primary }}>
                    {formatDate(selectedPayment.received_date)}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium" style={{ color: c.secondary }}>
                    Payment Method
                  </label>
                  <p className="text-sm mt-1" style={{ color: c.primary }}>
                    {METHOD_LABELS[selectedPayment.payment_method] || selectedPayment.payment_method}
                  </p>
                </div>
                {selectedPayment.payment_reference && (
                  <div>
                    <label className="text-sm font-medium" style={{ color: c.secondary }}>
                      Payment Reference
                    </label>
                    <p className="text-sm mt-1" style={{ color: c.primary }}>
                      {selectedPayment.payment_reference}
                    </p>
                  </div>
                )}
                {selectedPayment.load_number && (
                  <div>
                    <label className="text-sm font-medium" style={{ color: c.secondary }}>
                      Load Number
                    </label>
                    <p className="text-sm mt-1" style={{ color: c.primary }}>
                      {selectedPayment.load_number}
                    </p>
                  </div>
                )}
                {selectedPayment.batch_number && (
                  <div>
                    <label className="text-sm font-medium" style={{ color: c.secondary }}>
                      Batch Number
                    </label>
                    <p className="text-sm mt-1" style={{ color: c.primary }}>
                      {selectedPayment.batch_number}
                    </p>
                  </div>
                )}
              </div>

              {selectedPayment.reversal_reason && (
                <div>
                  <label className="text-sm font-medium" style={{ color: c.secondary }}>
                    Reversal reason
                  </label>
                  <p
                    className="text-sm mt-1 p-3 rounded-lg"
                    style={{ color: c.primary, backgroundColor: c.surface }}
                  >
                    {selectedPayment.reversal_reason}
                  </p>
                </div>
              )}

              {selectedPayment.rejection_reason && (
                <div>
                  <label className="text-sm font-medium" style={{ color: c.secondary }}>
                    Rejection reason
                  </label>
                  <p
                    className="text-sm mt-1 p-3 rounded-lg"
                    style={{ color: c.primary, backgroundColor: c.surface }}
                  >
                    {selectedPayment.rejection_reason}
                  </p>
                </div>
              )}

              {selectedPayment.notes && (
                <div>
                  <label className="text-sm font-medium" style={{ color: c.secondary }}>
                    Notes
                  </label>
                  <p
                    className="text-sm mt-1 p-3 rounded-lg"
                    style={{ color: c.primary, backgroundColor: c.surface }}
                  >
                    {selectedPayment.notes}
                  </p>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-4 border-t" style={{ borderColor: c.border }}>
                <button
                  type="button"
                  onClick={() => {
                    setShowPaymentDetailModal(false)
                    setSelectedPayment(null)
                  }}
                  className="dashboard-btn-secondary"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {moveTarget && (
        <MoveFundsModal
          payment={moveTarget}
          sourceInvoice={getInvoiceById(moveTarget.invoice_id)}
          postableInvoices={postableInvoices}
          targetInvoiceId={moveTargetInvoiceId}
          reason={moveReason}
          onTargetChange={setMoveTargetInvoiceId}
          onReasonChange={setMoveReason}
          onClose={() => setMoveTarget(null)}
          onConfirm={handleMoveSubmit}
        />
      )}

      {unprocessTarget && (
        <UnprocessPaymentModal
          payment={unprocessTarget}
          sourceInvoice={getInvoiceById(unprocessTarget.invoice_id)}
          reason={unprocessReason}
          onReasonChange={setUnprocessReason}
          onClose={() => setUnprocessTarget(null)}
          onConfirm={handleUnprocessSubmit}
        />
      )}
    </ClientLayout>
  )
}
