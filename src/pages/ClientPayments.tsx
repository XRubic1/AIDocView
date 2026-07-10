import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
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
  MoreVertical,
  ArrowRightLeft,
  Undo2,
  AlertTriangle,
  Loader2,
  ArrowUp,
  ArrowDown,
} from 'lucide-react'
import PaymentKpiCards from '../components/client/PaymentKpiCards'
import ClientSortableHeader from '../components/client/ClientSortableHeader'
import ClientListTd from '../components/client/ClientListTd'
import { useClientTheme } from '../theme/ThemeContext'
import { listPostableInvoices } from '../services/clientPaymentService'
import { movePaymentFunds, unprocessPayment } from '../services/paymentCorrectionService'
import { getInvoiceById } from '../data/mockInvoices'
import { getClientPayments as getClientDemoPayments } from '../data/clientDemoData'
import { useClientDemoSnapshot } from '../hooks/useClientDemoSnapshot'
import { useClientCapabilities } from '../hooks/useClientCapabilities'
import { useToast } from '../components/ui/ToastProvider'
import { mapClientVisibleInvoices } from '../utils/clientInvoiceView'
import { MoveFundsModal, UnprocessPaymentModal } from '../components/client/PaymentCorrectionModals'
import PaymentConfirmationPanel from '../components/client/PaymentConfirmationPanel'
import { useCompactDetailViewport } from '../hooks/useIsMobileViewport'
import { useResizableSplitPane } from '../hooks/useResizableSplitPane'
import {
  getInitialListPageSize,
  PAGE_SIZE_OPTIONS,
  type SortDir,
} from '../utils/clientListPage'
import { getPresetRange } from '../utils/clientReports'
import {
  PAYMENT_STATUS_LABELS,
  PAYMENT_STATUS_PILL_CLASS,
} from '../utils/paymentStatus'
import {
  confirmPaymentReceipt,
  openPaymentReceiptDispute,
  PAYMENT_RECEIPT_DISPUTE_REASONS,
  processExpiredReceiptConfirmations,
} from '../services/paymentReceiptConfirmationService'
import { AMOUNT_EPSILON, getInvoiceReceivedAmount } from '../utils/paymentVariance'
import { buildPaymentTableGroups, isShortPaymentChild, isOverpaymentChild } from '../utils/paymentTableGrouping'

/** Parent-row Additional payment: invoice overage when overpaid, else supplemental children total. */
function getParentAdditionalAmount(
  invoiceAmount: number | undefined,
  confirmedReceived: number | undefined,
  siblingChildren: Payment[]
): { amount: number; isOverpayment: boolean } {
  const overage = Math.max(0, (confirmedReceived ?? 0) - (invoiceAmount ?? 0))
  const childAdditional = siblingChildren
    .filter((child) => !isShortPaymentChild(child))
    .reduce((sum, child) => sum + child.amount, 0)

  if (overage > AMOUNT_EPSILON) {
    return { amount: overage, isOverpayment: true }
  }
  if (childAdditional > AMOUNT_EPSILON) {
    return { amount: childAdditional, isOverpayment: false }
  }
  return { amount: 0, isOverpayment: false }
}

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

type PaymentStatusFilter =
  | 'all'
  | 'pending'
  | 'awaiting_receipt'
  | 'disputed'
  | 'confirmed'
  | 'rejected'
  | 'reversed'

function getPaymentStatusPill(status: string, payment?: Payment) {
  const label = PAYMENT_STATUS_LABELS[status as keyof typeof PAYMENT_STATUS_LABELS] ?? status
  const className =
    PAYMENT_STATUS_PILL_CLASS[status as keyof typeof PAYMENT_STATUS_PILL_CLASS] ?? 'status-pill'
  const pill = <span className={`inline-flex items-center ${className}`}>{label}</span>
  const reason =
    status === 'reversed'
      ? payment?.reversal_reason
      : status === 'rejected'
        ? payment?.rejection_reason
        : status === 'disputed'
          ? payment?.dispute?.description
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

export default function ClientPayments() {
  const c = useClientTheme()
  const { clientId, clientName } = useClientSession()
  const { capabilities } = useClientCapabilities()
  const { showToast } = useToast()
  const useFullPageDetail = useCompactDetailViewport()
  const { workspaceRef, detailWidth, isResizing, resizeHandleProps } = useResizableSplitPane()
  const [searchParams, setSearchParams] = useSearchParams()
  const authorName = clientName
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

  const invoiceConfirmedById = useMemo(() => {
    const map = new Map<string, number>()
    const invoiceIds = new Set(payments.map((p) => p.invoice_id))

    for (const invoiceId of invoiceIds) {
      const invoice = clientInvoices.find((inv) => inv.id === invoiceId) ?? getInvoiceById(invoiceId)
      if (!invoice) continue
      map.set(invoiceId, getInvoiceReceivedAmount(invoice, payments))
    }

    return map
  }, [clientInvoices, payments])

  const refreshPayments = useCallback(() => {
    setRefreshKey((k) => k + 1)
    setPayments(buildInitialPayments(clientId, clientName))
  }, [clientId, clientName])

  useEffect(() => {
    refreshPayments()
  }, [clientId, refreshPayments])

  useEffect(() => {
    if (!capabilities.canConfirmPaymentReceipt) return
    const autoConfirmed = processExpiredReceiptConfirmations()
    if (autoConfirmed > 0) refreshPayments()
  }, [capabilities.canConfirmPaymentReceipt, clientId, refreshPayments])

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
  const [receiptActionLoading, setReceiptActionLoading] = useState(false)
  const [showReceiptDisputeModal, setShowReceiptDisputeModal] = useState(false)
  const [receiptDisputeReason, setReceiptDisputeReason] = useState<string>(
    PAYMENT_RECEIPT_DISPUTE_REASONS[0].value
  )
  const [receiptDisputeDescription, setReceiptDisputeDescription] = useState('')
  const historyTableRef = useRef<HTMLDivElement>(null)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [showPaymentDetail, setShowPaymentDetail] = useState(false)
  const [detailPanelClosing, setDetailPanelClosing] = useState(false)
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

  const handleKpiStatusFilter = useCallback(
    (status: 'confirmed' | 'pending' | 'awaiting_receipt') => {
      setStatusFilter(status)
      historyTableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    },
    []
  )

  const filteredPayments = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()

    const matchesSearch = (payment: Payment) => {
      if (!term) return true
      return (
        payment.invoice_number.toLowerCase().includes(term) ||
        payment.broker_name.toLowerCase().includes(term) ||
        payment.load_number?.toLowerCase().includes(term) ||
        payment.batch_number?.toLowerCase().includes(term) ||
        payment.payment_reference?.toLowerCase().includes(term)
      )
    }

    const matchesMethod = (payment: Payment) =>
      methodFilter === 'all' || payment.payment_method === methodFilter

    const matchesDate = (payment: Payment) =>
      (!dateFrom || payment.payment_date >= dateFrom) &&
      (!dateTo || payment.payment_date <= dateTo)

    const matchesStatus = (payment: Payment) =>
      statusFilter === 'all' || payment.status === statusFilter

    const base = payments.filter(
      (payment) =>
        matchesSearch(payment) &&
        matchesMethod(payment) &&
        matchesDate(payment) &&
        matchesStatus(payment)
    )

    // Searching an invoice should still surface awaiting/pending siblings even if
    // a status chip like "Confirmed only" is active.
    if (!term) return base

    const matchedInvoiceIds = new Set(
      payments
        .filter((payment) => matchesSearch(payment) && matchesMethod(payment) && matchesDate(payment))
        .map((payment) => payment.invoice_id)
    )
    const baseIds = new Set(base.map((payment) => payment.id))
    const actionNeeded = payments.filter(
      (payment) =>
        matchedInvoiceIds.has(payment.invoice_id) &&
        !baseIds.has(payment.id) &&
        matchesMethod(payment) &&
        matchesDate(payment) &&
        (payment.status === 'awaiting_receipt' || payment.status === 'pending')
    )

    return actionNeeded.length > 0 ? [...base, ...actionNeeded] : base
  }, [payments, searchTerm, dateFrom, dateTo, methodFilter, statusFilter])

  const sortedPayments = useMemo(() => {
    const sorted = [...filteredPayments]
    sorted.sort((a, b) => {
      if (a.status !== b.status) {
        const priority: Record<string, number> = {
          awaiting_receipt: 0,
          disputed: 1,
          pending: 2,
        }
        const aPri = priority[a.status] ?? 10
        const bPri = priority[b.status] ?? 10
        if (aPri !== bPri) return aPri - bPri
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

  const invoiceAmountById = useMemo(() => {
    const map = new Map<string, number>()
    for (const invoice of clientInvoices) {
      map.set(invoice.id, invoice.amount)
    }
    for (const payment of payments) {
      if (map.has(payment.invoice_id)) continue
      const invoice = getInvoiceById(payment.invoice_id)
      if (invoice) map.set(payment.invoice_id, invoice.amount)
    }
    return map
  }, [clientInvoices, payments])

  const paymentTableGroups = useMemo(
    () => buildPaymentTableGroups(sortedPayments, payments, invoiceAmountById),
    [sortedPayments, payments, invoiceAmountById]
  )

  const paginatedGroups = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return paymentTableGroups.slice(start, start + pageSize)
  }, [paymentTableGroups, currentPage, pageSize])

  /** Column totals for filtered payment groups (unique invoices + overages / supplementals). */
  const amountTotals = useMemo(() => {
    let invoiced = 0
    let received = 0
    let additional = 0

    for (const group of paymentTableGroups) {
      if (group.orphanChild) {
        if (!isShortPaymentChild(group.payment)) {
          additional += group.payment.amount
        }
        continue
      }

      const invoiceId = group.payment.invoice_id
      const invoiceAmount = invoiceAmountById.get(invoiceId)
      const confirmedReceived = invoiceConfirmedById.get(invoiceId) ?? 0
      invoiced += invoiceAmount ?? 0
      received += confirmedReceived
      additional += getParentAdditionalAmount(invoiceAmount, confirmedReceived, group.children).amount
    }

    return { invoiced, received, additional }
  }, [paymentTableGroups, invoiceAmountById, invoiceConfirmedById])

  const totalPages = Math.max(1, Math.ceil(paymentTableGroups.length / pageSize))

  const pageStart = paymentTableGroups.length === 0 ? 0 : (currentPage - 1) * pageSize + 1
  const pageEnd = Math.min(currentPage * pageSize, paymentTableGroups.length)

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

  useEffect(() => {
    const statusParam = searchParams.get('status')
    if (
      statusParam === 'awaiting_receipt' ||
      statusParam === 'pending' ||
      statusParam === 'confirmed' ||
      statusParam === 'disputed'
    ) {
      setStatusFilter(statusParam as PaymentStatusFilter)
    }

    const paymentId = searchParams.get('paymentId')
    if (!paymentId) return

    const payment = payments.find((p) => p.id === paymentId)
    if (payment) {
      setSelectedPayment(payment)
      if (useFullPageDetail) setShowPaymentDetail(true)
      const next = new URLSearchParams(searchParams)
      next.delete('paymentId')
      setSearchParams(next, { replace: true })
    }
  }, [searchParams, payments, setSearchParams, useFullPageDetail])

  useEffect(() => {
    if (!selectedPayment) return
    const updated = payments.find((p) => p.id === selectedPayment.id)
    if (updated) setSelectedPayment(updated)
    else {
      setSelectedPayment(null)
      setShowPaymentDetail(false)
    }
  }, [payments, selectedPayment?.id])

  const handleViewPaymentDetail = (payment: Payment) => {
    setDetailPanelClosing(false)
    setSelectedPayment(payment)
    if (useFullPageDetail) setShowPaymentDetail(true)
  }

  const handleClosePaymentDetail = useCallback(() => {
    if (useFullPageDetail) {
      setShowPaymentDetail(false)
      setSelectedPayment(null)
      setDetailPanelClosing(false)
      return
    }

    if (!selectedPayment) return

    setDetailPanelClosing(true)
    window.setTimeout(() => {
      setSelectedPayment(null)
      setDetailPanelClosing(false)
      setShowPaymentDetail(false)
    }, 400)
  }, [useFullPageDetail, selectedPayment])

  const detailPanelOpen = Boolean(selectedPayment) && !detailPanelClosing

  const selectedInvoice = useMemo(
    () => (selectedPayment ? getInvoiceById(selectedPayment.invoice_id) : undefined),
    [selectedPayment]
  )

  const selectedInvoicePayments = useMemo(() => {
    if (!selectedPayment) return []
    return payments.filter((p) => p.invoice_id === selectedPayment.invoice_id)
  }, [selectedPayment, payments])

  const handleConfirmReceipt = useCallback(async () => {
    if (!selectedPayment || !capabilities.canConfirmPaymentReceipt) return

    const targets =
      selectedPayment.status === 'awaiting_receipt'
        ? [selectedPayment]
        : payments.filter(
            (p) =>
              p.invoice_id === selectedPayment.invoice_id && p.status === 'awaiting_receipt'
          )

    if (targets.length === 0) return

    setReceiptActionLoading(true)
    try {
      let confirmed = 0
      for (const target of targets) {
        const result = confirmPaymentReceipt(target.id, authorName)
        if (result) confirmed += 1
      }
      if (confirmed > 0) {
        showToast(
          confirmed === 1
            ? 'Payment confirmed — funds released'
            : `${confirmed} payments confirmed — funds released`,
          'success'
        )
        if (useFullPageDetail) handleClosePaymentDetail()
        refreshPayments()
      } else {
        showToast(
          'Could not confirm payment. Refresh the page and try again, or contact Credyx if it keeps failing.',
          'error'
        )
      }
    } catch (err) {
      console.error('[ClientPayments] confirm receipt failed', err)
      showToast('Could not confirm payment', 'error')
    } finally {
      setReceiptActionLoading(false)
    }
  }, [
    selectedPayment,
    payments,
    capabilities.canConfirmPaymentReceipt,
    authorName,
    showToast,
    refreshPayments,
    handleClosePaymentDetail,
    useFullPageDetail,
  ])

  const handleSubmitReceiptDispute = useCallback(async () => {
    if (!selectedPayment || !receiptDisputeDescription.trim() || receiptActionLoading) return

    const disputeTarget =
      selectedPayment.status === 'awaiting_receipt'
        ? selectedPayment
        : payments.find(
            (p) =>
              p.invoice_id === selectedPayment.invoice_id && p.status === 'awaiting_receipt'
          )

    if (!disputeTarget) {
      showToast('No payment awaiting confirmation to dispute', 'error')
      return
    }

    setReceiptActionLoading(true)
    try {
      const result = openPaymentReceiptDispute(
        disputeTarget.id,
        receiptDisputeReason,
        receiptDisputeDescription,
        authorName
      )
      if (result) {
        showToast('Dispute submitted — funds on hold', 'success')
        setShowReceiptDisputeModal(false)
        if (useFullPageDetail) handleClosePaymentDetail()
        setReceiptDisputeDescription('')
        refreshPayments()
      } else {
        showToast('Could not submit dispute', 'error')
      }
    } finally {
      setReceiptActionLoading(false)
    }
  }, [
    selectedPayment,
    payments,
    receiptDisputeReason,
    receiptDisputeDescription,
    receiptActionLoading,
    authorName,
    showToast,
    refreshPayments,
    handleClosePaymentDetail,
    useFullPageDetail,
  ])

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

  const renderPaymentRow = (
    payment: Payment,
    isChild = false,
    isOrphanChild = false,
    siblingChildren: Payment[] = []
  ) => {
    const isSelected = selectedPayment?.id === payment.id
    const invoiceAmount = invoiceAmountById.get(payment.invoice_id)
    const confirmedReceived = invoiceConfirmedById.get(payment.invoice_id)
    const invoiceHasAwaiting =
      !isChild &&
      payments.some(
        (p) => p.invoice_id === payment.invoice_id && p.status === 'awaiting_receipt'
      )
    const shortChild = isChild && isShortPaymentChild(payment)
    const overChild =
      isChild && !shortChild && invoiceAmount != null && isOverpaymentChild(payment, payments, invoiceAmount)
    const childLabel = shortChild ? 'Short payment' : overChild ? 'Overpayment' : 'Additional payment'
    const childMeta = shortChild
      ? payment.short_pay_reason === 'chargeback'
        ? 'Chargeback'
        : 'Amount correction'
      : overChild
        ? 'Supplemental payment'
        : 'Toward same invoice'
    const invoicedDisplay =
      !isChild || isOrphanChild
        ? invoiceAmount != null
          ? formatCurrency(invoiceAmount)
          : '—'
        : '—'
    const receivedDisplay =
      !isChild || isOrphanChild
        ? formatCurrency(confirmedReceived ?? 0)
        : '—'
    // Parent: invoice overage when overpaid (003 → $200.02), else supplemental children (007 → $250).
    const parentAdditional = getParentAdditionalAmount(
      invoiceAmount,
      confirmedReceived,
      siblingChildren
    )
    const additionalDisplay = (() => {
      if (shortChild) {
        return (
          <span className="inline-flex items-center justify-end gap-0.5 payment-amount--short">
            <ArrowDown className="w-3 h-3 shrink-0" aria-hidden />
            <span>−{formatCurrency(payment.amount)}</span>
          </span>
        )
      }
      if (overChild) {
        return (
          <span className="inline-flex items-center justify-end gap-0.5 payment-amount--over">
            <ArrowUp className="w-3 h-3 shrink-0" aria-hidden />
            <span>{formatCurrency(payment.amount)}</span>
          </span>
        )
      }
      if (isChild) {
        return (
          <span className="inline-flex items-center justify-end gap-0.5">
            <ArrowUp className="w-3 h-3 shrink-0 payment-amount--over" aria-hidden />
            <span>{formatCurrency(payment.amount)}</span>
          </span>
        )
      }
      if (parentAdditional.amount <= AMOUNT_EPSILON) return '—'
      if (parentAdditional.isOverpayment) {
        return (
          <span className="inline-flex items-center justify-end gap-0.5 payment-amount--over">
            <ArrowUp className="w-3 h-3 shrink-0" aria-hidden />
            <span>{formatCurrency(parentAdditional.amount)}</span>
          </span>
        )
      }
      return formatCurrency(parentAdditional.amount)
    })()
    const rowClass = [
      'cursor-pointer',
      !isChild &&
      (payment.status === 'pending' ||
        payment.status === 'awaiting_receipt' ||
        invoiceHasAwaiting)
        ? 'payment-row--pending'
        : '',
      payment.status === 'reversed' || payment.status === 'rejected' ? 'opacity-70' : '',
      payment.status === 'disputed' ? 'opacity-90' : '',
      isSelected ? 'payment-row--selected' : '',
      isChild ? 'payment-row--child' : '',
      shortChild ? 'payment-row--short-child' : '',
      isOrphanChild ? 'payment-row--orphan-child' : '',
    ]
      .filter(Boolean)
      .join(' ')

    return (
      <tr key={payment.id} className={rowClass} onClick={() => handleViewPaymentDetail(payment)}>
        <ClientListTd
          variant="primary"
          className={`${isChild && !isOrphanChild ? 'payment-row__invoice-child' : 'font-semibold'} ${
            payment.status === 'reversed' ? 'line-through' : ''
          }`}
        >
          {isChild && !isOrphanChild ? (
            <span className={`payment-row__child-label ${shortChild ? 'payment-row__child-label--short' : ''}`}>
              {childLabel}
            </span>
          ) : isOrphanChild ? (
            <span className="payment-row__orphan-invoice">
              <span>{payment.invoice_number}</span>
              <span
                className={`payment-row__child-label payment-row__child-label--orphan ${
                  shortChild ? 'payment-row__child-label--short' : ''
                }`}
              >
                {childLabel}
              </span>
            </span>
          ) : (
            payment.invoice_number
          )}
        </ClientListTd>
        <ClientListTd variant="meta" className="truncate">
          {isChild && !isOrphanChild ? (
            <span className="payment-row__child-meta">{childMeta}</span>
          ) : isOrphanChild ? (
            <span className="client-list-meta-full">{payment.broker_name}</span>
          ) : (
            <>
              <span className="client-list-meta-short">{payment.broker_name}</span>
              <span className="client-list-meta-full">{payment.broker_name}</span>
            </>
          )}
        </ClientListTd>
        <ClientListTd
          label="Invoiced Amount"
          className="text-right font-medium tabular-nums"
          style={{ color: c.secondary }}
        >
          {invoicedDisplay}
        </ClientListTd>
        <ClientListTd
          label="Received Amount"
          className={`text-right font-medium tabular-nums ${
            payment.status === 'reversed' ? 'line-through' : ''
          }`}
        >
          {receivedDisplay}
        </ClientListTd>
        <ClientListTd
          variant="amount"
          className={`text-right font-medium tabular-nums ${
            payment.status === 'reversed' ? 'line-through' : ''
          }`}
        >
          {additionalDisplay}
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
          <div className="inline-flex items-center justify-center gap-1 flex-nowrap min-w-0">
            {getPaymentStatusPill(payment.status, payment)}
            {invoiceHasAwaiting && payment.status !== 'awaiting_receipt' && (
              <span className="status-pill status-pill--pending status-pill--compact">
                Awaiting confirmation
              </span>
            )}
          </div>
        </ClientListTd>
        <ClientListTd variant="actions" className="text-center">
          <div className="inline-flex items-center justify-center gap-1 relative">
            {!isChild && payment.status === 'confirmed' && capabilities.canCorrectPayments && (
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
    )
  }

  const inputCompactStyle = {
    backgroundColor: c.card,
    height: 34,
    paddingTop: 6,
    paddingBottom: 6,
    fontSize: 13,
  } as const

  return (
    <>
      <div className="client-payments-page overflow-hidden flex flex-col min-h-0">
        <div className="client-payments-page--history overflow-hidden flex flex-col min-h-0 flex-1">
        {useFullPageDetail && showPaymentDetail && selectedPayment ? (
          <PaymentConfirmationPanel
            variant="mobile"
            payment={selectedPayment}
            invoice={selectedInvoice}
            invoicePayments={selectedInvoicePayments}
            navigationPayments={sortedPayments}
            onClose={handleClosePaymentDetail}
            onNavigatePayment={handleViewPaymentDetail}
            canConfirmReceipt={capabilities.canConfirmPaymentReceipt}
            receiptActionLoading={receiptActionLoading}
            onConfirmReceipt={() => void handleConfirmReceipt()}
            onOpenDispute={() => {
              setReceiptDisputeReason(PAYMENT_RECEIPT_DISPUTE_REASONS[0].value)
              setReceiptDisputeDescription('')
              setShowReceiptDisputeModal(true)
            }}
          />
        ) : (
          <>
        <PaymentKpiCards
          payments={payments}
          statusFilter={
            statusFilter === 'all'
              ? 'confirmed'
              : statusFilter === 'pending' ||
                  statusFilter === 'confirmed' ||
                  statusFilter === 'awaiting_receipt'
                ? statusFilter
                : 'all'
          }
          onStatusFilter={handleKpiStatusFilter}
          showAwaitingConfirmation={capabilities.canConfirmPaymentReceipt}
        />

        <div
          ref={historyTableRef}
          className="client-page-toolbar px-4 py-2 border-b shrink-0"
          style={{ borderColor: c.border, backgroundColor: c.card }}
        >
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
                      : statusFilter === 'awaiting_receipt'
                        ? 'Awaiting confirmation'
                        : statusFilter === 'disputed'
                          ? 'Disputed only'
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
                  <option value="awaiting_receipt">Awaiting confirmation</option>
                  <option value="disputed">Disputed</option>
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
          <div className="payments-workspace-body flex-1 min-h-0">
            <div className="payments-list-panel flex items-center justify-center text-center py-8 px-4">
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
          </div>
        ) : (
          <div
            ref={workspaceRef}
            className={`payments-workspace-body flex-1 min-h-0 ${
              detailPanelOpen ? 'payments-workspace-body--detail-open' : ''
            } ${isResizing ? 'payments-workspace-body--resizing' : ''}`}
            style={
              detailPanelOpen
                ? ({ '--payments-detail-width': `${detailWidth}px` } as React.CSSProperties)
                : undefined
            }
          >
            <div className="payments-list-panel">
            <div className="client-table-scroll client-table-scroll--mobile-stack overflow-x-auto flex-1 min-h-0">
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
                    <th className="text-right">Invoiced Amount</th>
                    <th className="text-right">Received Amount</th>
                    <ClientSortableHeader
                      field="amount"
                      label="Additional payment"
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
                  {paginatedGroups.flatMap(({ payment, children, orphanChild }) => {
                    if (orphanChild) {
                      return [renderPaymentRow(payment, true, true)]
                    }
                    return [
                      renderPaymentRow(payment, false, false, children),
                      ...children.map((child) => renderPaymentRow(child, true)),
                    ]
                  })}
                </tbody>
                <tfoot>
                  <tr className="payments-table-totals">
                    <td colSpan={2} className="font-semibold" style={{ color: c.primary }}>
                      Totals
                    </td>
                    <td className="text-right font-semibold tabular-nums" style={{ color: c.primary }}>
                      {formatCurrency(amountTotals.invoiced)}
                    </td>
                    <td className="text-right font-semibold tabular-nums" style={{ color: c.primary }}>
                      {formatCurrency(amountTotals.received)}
                    </td>
                    <td className="text-right font-semibold tabular-nums" style={{ color: c.primary }}>
                      {amountTotals.additional > 0 ? formatCurrency(amountTotals.additional) : '—'}
                    </td>
                    <td colSpan={5} />
                  </tr>
                </tfoot>
              </table>
            </div>

            <div
              className="client-page-footer flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-4 py-2 border-t shrink-0"
              style={{ borderColor: c.border, backgroundColor: c.card }}
            >
              <p className="text-xs font-medium" style={{ color: c.secondary }}>
                Showing {pageStart}–{pageEnd} of {paymentTableGroups.length}
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
            </div>

            {!useFullPageDetail && (
              <aside className="payments-detail-panel" aria-hidden={!selectedPayment}>
                {detailPanelOpen && (
                  <div
                    className="payments-resize-handle"
                    role="separator"
                    aria-orientation="vertical"
                    aria-label="Resize payment details panel"
                    aria-valuemin={320}
                    aria-valuemax={720}
                    aria-valuenow={detailWidth}
                    {...resizeHandleProps}
                  />
                )}
                {selectedPayment ? (
                  <div className="payments-detail-panel__inner">
                    <PaymentConfirmationPanel
                      variant="sidebar"
                      payment={selectedPayment}
                      invoice={selectedInvoice}
                      invoicePayments={selectedInvoicePayments}
                      navigationPayments={sortedPayments}
                      onClose={handleClosePaymentDetail}
                      onNavigatePayment={handleViewPaymentDetail}
                      canConfirmReceipt={capabilities.canConfirmPaymentReceipt}
                      receiptActionLoading={receiptActionLoading}
                      onConfirmReceipt={() => void handleConfirmReceipt()}
                      onOpenDispute={() => {
                        setReceiptDisputeReason(PAYMENT_RECEIPT_DISPUTE_REASONS[0].value)
                        setReceiptDisputeDescription('')
                        setShowReceiptDisputeModal(true)
                      }}
                    />
                  </div>
                ) : null}
              </aside>
            )}
          </div>
        )}
          </>
        )}
          </div>
      </div>

      {showReceiptDisputeModal && selectedPayment && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div
            className="rounded-lg shadow-xl max-w-md w-full"
            style={{ backgroundColor: c.card, boxShadow: c.shadow.cardHover }}
          >
            <div className="p-5 border-b" style={{ borderColor: c.border }}>
              <h3 className="text-base font-semibold" style={{ color: c.primary }}>
                Dispute payment receipt
              </h3>
              <p className="text-xs mt-1" style={{ color: c.secondary }}>
                Funds will be placed on hold until Credyx resolves this dispute.
              </p>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: c.secondary }}>
                  Reason
                </label>
                <select
                  value={receiptDisputeReason}
                  onChange={(e) => setReceiptDisputeReason(e.target.value)}
                  className="client-input w-full"
                >
                  {PAYMENT_RECEIPT_DISPUTE_REASONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: c.secondary }}>
                  Description
                </label>
                <textarea
                  value={receiptDisputeDescription}
                  onChange={(e) => setReceiptDisputeDescription(e.target.value)}
                  rows={3}
                  className="client-input w-full resize-none"
                  placeholder="Explain why funds were not received…"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 p-5 border-t" style={{ borderColor: c.border }}>
              <button
                type="button"
                onClick={() => setShowReceiptDisputeModal(false)}
                className="dashboard-btn-secondary"
                disabled={receiptActionLoading}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmitReceiptDispute}
                disabled={!receiptDisputeDescription.trim() || receiptActionLoading}
                className="dashboard-btn-primary inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                {receiptActionLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <AlertTriangle className="w-4 h-4" />
                )}
                Submit dispute
              </button>
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
    </>
  )
}
