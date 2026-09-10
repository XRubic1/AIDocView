import { useState, useEffect, useMemo, useCallback, useRef, type MouseEvent } from 'react'
import { useSearchParams, useLocation } from 'react-router-dom'
import { useClientDemoSnapshot } from '../hooks/useClientDemoSnapshot'
import { useTenantDataRevision } from '../hooks/useTenantDataRevision'
import { useClientCapabilities } from '../hooks/useClientCapabilities'
import { Invoice } from '../types/invoice'
import { formatCurrency, formatDate } from '../utils/format'
import { FileText, Search, DollarSign, ChevronLeft, ChevronRight, AlertCircle, Check, CalendarDays } from 'lucide-react'
import DocumentViewer from '../components/DocumentViewer'
import {
  getInvoiceRowStatusBadge,
  InvoiceDisputeBadges,
} from '../components/client/InvoiceDetailWorkspace'
import InvoiceDetailPanel from '../components/client/InvoiceDetailPanel'
import ClientInvoicesTabs from '../components/client/ClientInvoicesTabs'
import ClientSortableHeader from '../components/client/ClientSortableHeader'
import ClientListTd from '../components/client/ClientListTd'
import MobilePaymentDateRangeSheet from '../components/client/MobilePaymentDateRangeSheet'
import { enrichInvoices, EnrichedInvoice, getDaysOutstandingColor, getDisplayInvoiceAgeDays, invoiceHasStoppedAging, isOpenArInvoice, AR_POLICY, buildConfirmedPayDateByInvoiceId } from '../utils/invoiceAging'
import { getInvoiceDocumentsForViewer } from '../services/invoiceDocumentStore'
import { useClientTheme } from '../theme/ThemeContext'
import { useCompactDetailViewport, useIsMobileViewport } from '../hooks/useIsMobileViewport'
import { useResizableSplitPane } from '../hooks/useResizableSplitPane'
import {
  getInitialListPageSize,
  PAGE_SIZE_OPTIONS,
  type SortDir,
} from '../utils/clientListPage'
import { mapClientVisibleInvoices } from '../utils/clientInvoiceView'
import ClientReturnBanner from '../components/client/ClientReturnBanner'
import MobileInvoiceListCard from '../components/client/MobileInvoiceListCard'
import {
  clearInvoiceRestoreTarget,
  peekInvoiceRestoreTarget,
  stashInvoiceRestoreTarget,
} from '../utils/paymentRestoreTarget'
import { isTourInvoiceId } from '../utils/onboardingTourInvoice'
import {
  getClientDisplayBalanceState,
  getClientInvoiceStatusParts,
  getClientPostedPendingTotal,
  getInvoiceBalanceState,
  getInvoiceReceivedAmount,
  type InvoiceBalanceState,
} from '../utils/paymentVariance'
import { hasPpwBeenSent } from '../utils/ppwSent'
import { mockBrokers } from '../data/mockBrokers'
import { formatBrokerDueDays, getInvoiceBrokerDueDays } from '../utils/invoiceDueDate'
import BrokerRiskLevelChip from '../components/client/BrokerRiskLevelChip'
import { getCarrierVisibleBrokerRiskLevel } from '../utils/clientBrokers'
import type { BrokerRiskLevel } from '../types/brokerRisk'
import { compareInvoicesByListPriority } from '../utils/invoiceListPriority'
import { getPresetRange } from '../utils/clientReports'
import { isReceiptDisputeHold } from '../services/paymentReceiptConfirmationService'
import { invoiceHasOpenDisputedStatus } from '../utils/clientInvoiceDisputeStatus'
import { getClientVisiblePayDate } from '../utils/invoiceWillPay'

type InvoiceSortField =
  | 'invoice_number'
  | 'load_number'
  | 'broker_name'
  | 'risk_level'
  | 'batch_number'
  | 'amount'
  | 'balance'
  | 'invoice_date'
  | 'pay_date'
  | 'days_outstanding'
  | 'due_days'
  | 'ppw_sent'
  | 'status'

/** Working list — excludes paid and closed invoices. */
type InvoiceStatusFilter =
  | 'confirm'
  | 'short_paid'
  | 'approved'
  | 'hold'
  | 'overdue'
  | 'active'
  | 'pending'
  | 'paid'
  | 'closed'

/** Filter chip order — Active first, then Overdue, Confirm, and the rest. */
const INVOICE_STATUS_FILTERS: { id: InvoiceStatusFilter; label: string }[] = [
  { id: 'active', label: 'Active' },
  { id: 'overdue', label: 'Overdue' },
  { id: 'confirm', label: 'Confirm' },
  { id: 'short_paid', label: 'Short paid' },
  { id: 'approved', label: 'Open' },
  { id: 'hold', label: 'On hold' },
  { id: 'pending', label: 'Pending' },
  { id: 'paid', label: 'Paid' },
  { id: 'closed', label: 'Closed' },
]

type ClientInvoiceDisplayFlags = Record<InvoiceStatusFilter, boolean>

function emptyClientInvoiceDisplayFlags(): ClientInvoiceDisplayFlags {
  return {
    confirm: false,
    short_paid: false,
    approved: false,
    hold: false,
    overdue: false,
    active: false,
    pending: false,
    paid: false,
    closed: false,
  }
}

/** Working queue on; paid/closed opt-in — same pattern as admin invoices. */
function createClientInvoiceDisplayFlags(): ClientInvoiceDisplayFlags {
  return {
    ...emptyClientInvoiceDisplayFlags(),
    confirm: true,
    short_paid: true,
    approved: true,
    hold: true,
    overdue: true,
    active: true,
    pending: true,
  }
}

function exclusiveClientInvoiceDisplayFlags(
  id: InvoiceStatusFilter
): ClientInvoiceDisplayFlags {
  return { ...emptyClientInvoiceDisplayFlags(), [id]: true }
}

function isExclusiveDisplayFlag(
  flags: ClientInvoiceDisplayFlags,
  id: InvoiceStatusFilter
): boolean {
  return INVOICE_STATUS_FILTERS.every(({ id: key }) => flags[key] === (key === id))
}

const CLOSED_DISPLAY_STATUSES = new Set(['force_closed', 'written_off', 'rejected'])

/** Resolve client-visible status used for list filters and badges. */
function getInvoiceFilterDisplayStatus(
  invoice: EnrichedInvoice,
  balance: InvoiceBalanceState,
  pendingInfo?: { pending: number; confirmed: number }
): string {
  return getClientInvoiceStatusParts(invoice, balance, {
    pendingClientPosted: pendingInfo?.pending,
    confirmedReceived: pendingInfo?.confirmed,
    invoiceAmount: invoice.amount,
  }).status
}

/** Whether an invoice belongs in the selected status filter bucket. */
function matchesInvoiceStatusFilter(
  invoice: EnrichedInvoice,
  filter: InvoiceStatusFilter,
  displayStatus: string,
  options?: {
    awaitingReceipt?: boolean
    isShortPaid?: boolean
    paymentDisputed?: boolean
  }
): boolean {
  const awaitingReceipt = Boolean(options?.awaitingReceipt)
  const isShortPaid = Boolean(options?.isShortPaid)
  const paymentDisputed =
    Boolean(options?.paymentDisputed) || isReceiptDisputeHold(invoice)
  switch (filter) {
    case 'confirm':
      return awaitingReceipt
    case 'short_paid':
      return isShortPaid && !awaitingReceipt
    case 'active':
      // Paid invoices with a Credyx short/payment awaiting confirm stay in Active.
      if (awaitingReceipt) return true
      // Legacy receipt-dispute holds stay in Active (excluded from On hold below).
      if (isReceiptDisputeHold(invoice)) return true
      return displayStatus !== 'paid' && !CLOSED_DISPLAY_STATUSES.has(displayStatus)
    case 'overdue':
      return Boolean(invoice.isOverdue)
    case 'approved':
      // Open filter = unpaid open A/R that is not short-paid (short paid has its own chip).
      if (isShortPaid && !awaitingReceipt) return false
      // Receipt-dispute hold is still open A/R (Open Disputed).
      if (isReceiptDisputeHold(invoice)) return true
      return displayStatus === filter
    case 'paid':
      return displayStatus === filter && !isReceiptDisputeHold(invoice)
    case 'closed':
      return CLOSED_DISPLAY_STATUSES.has(displayStatus)
    case 'pending':
      return displayStatus === filter || invoice.status === filter
    case 'hold':
      // Paperwork holds only — payment receipt disputes show as Disputed, not On hold.
      if (paymentDisputed || isReceiptDisputeHold(invoice)) return false
      return displayStatus === filter || invoice.status === filter
    default:
      return true
  }
}

/** Pick the filter bucket that will show a deep-linked invoice. */
function statusFilterForInvoice(
  _invoice: EnrichedInvoice,
  displayStatus: string,
  options?: { awaitingReceipt?: boolean; isShortPaid?: boolean }
): InvoiceStatusFilter {
  if (options?.awaitingReceipt) return 'confirm'
  if (options?.isShortPaid) return 'short_paid'
  if (displayStatus === 'paid') return 'paid'
  if (CLOSED_DISPLAY_STATUSES.has(displayStatus)) return 'closed'
  return 'active'
}

/** Open A/R short-pay eligible for list sort / Short paid filter (excludes closed/hold). */
function isInvoiceListShortPaid(
  invoice: { status: string },
  balance: InvoiceBalanceState | undefined
): boolean {
  if (
    invoice.status === 'written_off' ||
    invoice.status === 'write_off_pending' ||
    invoice.status === 'force_closed' ||
    invoice.status === 'hold'
  ) {
    return false
  }
  return balance?.tone === 'short'
}

/** Open balance display — remaining due, $0 when settled, +overage when overpaid. */
function formatInvoiceOpenBalance(
  balance: InvoiceBalanceState,
  mutedColor: string,
  textColor: string
): { text: string; color: string } {
  switch (balance.tone) {
    case 'over':
      return { text: `+${formatCurrency(Math.abs(balance.signedBalance))}`, color: '#16a34a' }
    case 'zero':
      return { text: formatCurrency(0), color: mutedColor }
    case 'short':
      return { text: formatCurrency(balance.signedBalance), color: '#dc2626' }
    case 'open':
    default:
      return { text: formatCurrency(balance.signedBalance), color: textColor }
  }
}

function getSortableInvoiceAge(invoice: EnrichedInvoice): number {
  return invoice.invoiceAgeDays
}

function getSortableDueDays(invoice: EnrichedInvoice): number {
  return getInvoiceBrokerDueDays(invoice, mockBrokers) ?? -1
}

const BROKER_RISK_SORT: Record<BrokerRiskLevel, number> = {
  high: 0,
  medium: 1,
  unrated: 2,
  low: 3,
}

export default function ClientInvoices() {
  const c = useClientTheme()
  const { capabilities } = useClientCapabilities()
  const tenantRevision = useTenantDataRevision()
  const isMobileViewport = useIsMobileViewport()
  const useFullPageDetail = useCompactDetailViewport()
  const { workspaceRef, detailWidth, isResizing, resizeHandleProps } = useResizableSplitPane()
  const [searchParams, setSearchParams] = useSearchParams()
  const location = useLocation()
  const openedHighlightRef = useRef<string | null>(null)
  const [highlightedInvoiceId, setHighlightedInvoiceId] = useState<string | null>(null)
  /** Open document upload once after Assistant deep-link (`open_upload=1`). */
  const [autoOpenUpload, setAutoOpenUpload] = useState(false)

  const [invoicesRefreshKey, setInvoicesRefreshKey] = useState(0)
  const { dashboard: data, payments, invoices: rawInvoices, clientId } =
    useClientDemoSnapshot(invoicesRefreshKey)

  const invoices = useMemo(
    () => mapClientVisibleInvoices(rawInvoices),
    [rawInvoices]
  )
  const [searchTerm, setSearchTerm] = useState('')
  const [displayFlags, setDisplayFlags] = useState<ClientInvoiceDisplayFlags>(
    createClientInvoiceDisplayFlags
  )
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [mobileDateMenuOpen, setMobileDateMenuOpen] = useState(false)
  const [showInvoiceDetail, setShowInvoiceDetail] = useState(false)
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null)
  const [detailPanelClosing, setDetailPanelClosing] = useState(false)
  const [showDocumentViewer, setShowDocumentViewer] = useState(false)
  const [viewingInvoiceDocuments, setViewingInvoiceDocuments] = useState<Invoice | null>(null)
  const [pageSize, setPageSize] = useState<number>(getInitialListPageSize)
  const [currentPage, setCurrentPage] = useState(1)
  const [sortField, setSortField] = useState<InvoiceSortField>('invoice_date')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const payDateByInvoiceId = useMemo(
    () => buildConfirmedPayDateByInvoiceId(payments),
    [payments]
  )

  /** Posted date for awaiting-receipt payments — list shows Pay date (pending). */
  const pendingPayDateByInvoiceId = useMemo(() => {
    const map = new Map<string, string>()
    for (const payment of payments) {
      if (payment.status !== 'awaiting_receipt') continue
      const dateStr = payment.received_date || payment.payment_date
      if (!dateStr) continue
      const prev = map.get(payment.invoice_id)
      if (!prev || dateStr > prev) map.set(payment.invoice_id, dateStr)
    }
    return map
  }, [payments])

  /** Invoice IDs with a Credyx-posted payment awaiting carrier confirmation. */
  const awaitingReceiptInvoiceIds = useMemo(() => {
    if (!capabilities.canConfirmPaymentReceipt) return new Set<string>()
    const ids = new Set<string>()
    for (const payment of payments) {
      if (payment.status === 'awaiting_receipt') ids.add(payment.invoice_id)
    }
    return ids
  }, [payments, capabilities.canConfirmPaymentReceipt])

  /** Invoice IDs where the carrier disputed a Credyx-posted remittance. */
  const disputedPaymentInvoiceIds = useMemo(() => {
    const ids = new Set<string>()
    for (const payment of payments) {
      if (payment.status === 'disputed') ids.add(payment.invoice_id)
    }
    return ids
  }, [payments])

  const brokerRiskByInvoiceId = useMemo(() => {
    const map = new Map<string, BrokerRiskLevel>()
    for (const invoice of invoices) {
      map.set(invoice.id, getCarrierVisibleBrokerRiskLevel(clientId, invoice))
    }
    return map
  }, [invoices, clientId, tenantRevision])

  const enrichedInvoices = useMemo(() => {
    const base = enrichInvoices(invoices, new Date(), capabilities)
    // Freeze age at confirmed pay date for paid invoices (list + sort).
    return base.map((invoice) => {
      if (!invoiceHasStoppedAging(invoice)) return invoice
      return {
        ...invoice,
        invoiceAgeDays: getDisplayInvoiceAgeDays(invoice, {
          payDate: payDateByInvoiceId.get(invoice.id) ?? invoice.collection_date ?? null,
        }),
      }
    })
  }, [invoices, payDateByInvoiceId, capabilities])

  const invoiceBalanceById = useMemo(() => {
    const map = new Map<string, InvoiceBalanceState>()
    for (const invoice of enrichedInvoices) {
      const received = getInvoiceReceivedAmount(invoice, payments)
      const pendingClient = getClientPostedPendingTotal(invoice.id, payments)
      map.set(
        invoice.id,
        getClientDisplayBalanceState(invoice.amount, received, pendingClient)
      )
    }
    return map
  }, [enrichedInvoices, payments])

  const invoicePendingById = useMemo(() => {
    const map = new Map<string, { pending: number; confirmed: number }>()
    for (const invoice of enrichedInvoices) {
      map.set(invoice.id, {
        pending: getClientPostedPendingTotal(invoice.id, payments),
        confirmed: getInvoiceReceivedAmount(invoice, payments),
      })
    }
    return map
  }, [enrichedInvoices, payments])

  const filteredInvoices = enrichedInvoices.filter((invoice) => {
    const matchesSearch =
      invoice.invoice_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      invoice.broker_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      invoice.load_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      invoice.batch_number?.toLowerCase().includes(searchTerm.toLowerCase())

    const invoiceDate = invoice.invoice_date?.slice(0, 10) ?? ''
    const matchesDate =
      (!dateFrom || invoiceDate >= dateFrom) && (!dateTo || invoiceDate <= dateTo)

    const balance =
      invoiceBalanceById.get(invoice.id) ??
      getClientDisplayBalanceState(invoice.amount, 0, 0)
    const pendingInfo = invoicePendingById.get(invoice.id)
    const displayStatus = getInvoiceFilterDisplayStatus(invoice, balance, pendingInfo)

    const searchActive = searchTerm.trim().length > 0
    const matchesChips =
      searchActive ||
      INVOICE_STATUS_FILTERS.some(
        ({ id }) =>
          displayFlags[id] &&
          matchesInvoiceStatusFilter(invoice, id, displayStatus, {
            awaitingReceipt: awaitingReceiptInvoiceIds.has(invoice.id),
            isShortPaid: isInvoiceListShortPaid(invoice, balance),
            paymentDisputed: disputedPaymentInvoiceIds.has(invoice.id),
          })
      )

    return matchesSearch && matchesDate && matchesChips
  })

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

  /** Current date-range mode for the mobile sheet. */
  const mobileDateRangeValue = useMemo(() => {
    if (!dateFrom && !dateTo) return 'all' as const
    if (matchesDatePreset('30d')) return '30d' as const
    if (matchesDatePreset('90d')) return '90d' as const
    if (matchesDatePreset('ytd')) return 'ytd' as const
    return 'custom' as const
  }, [dateFrom, dateTo, matchesDatePreset])

  const mobileDateRangeLabel = useMemo(() => {
    if (mobileDateRangeValue === 'all') return 'All dates'
    if (mobileDateRangeValue === '30d') return 'Last 30d'
    if (mobileDateRangeValue === '90d') return 'Last 90d'
    if (mobileDateRangeValue === 'ytd') return 'YTD'
    if (dateFrom && dateTo) return `${formatDate(dateFrom)} – ${formatDate(dateTo)}`
    if (dateFrom) return `From ${formatDate(dateFrom)}`
    if (dateTo) return `Until ${formatDate(dateTo)}`
    return 'Custom'
  }, [mobileDateRangeValue, dateFrom, dateTo])

  /** Counts per filter bucket (from full list, not search-narrowed). */
  const statusFilterCounts = useMemo(() => {
    const counts: Record<InvoiceStatusFilter, number> = {
      confirm: 0,
      short_paid: 0,
      approved: 0,
      hold: 0,
      overdue: 0,
      active: 0,
      pending: 0,
      paid: 0,
      closed: 0,
    }

    for (const invoice of enrichedInvoices) {
      const balance =
        invoiceBalanceById.get(invoice.id) ??
        getClientDisplayBalanceState(invoice.amount, 0, 0)
      const pendingInfo = invoicePendingById.get(invoice.id)
      const displayStatus = getInvoiceFilterDisplayStatus(invoice, balance, pendingInfo)

      for (const { id } of INVOICE_STATUS_FILTERS) {
        if (
          matchesInvoiceStatusFilter(invoice, id, displayStatus, {
            awaitingReceipt: awaitingReceiptInvoiceIds.has(invoice.id),
            isShortPaid: isInvoiceListShortPaid(invoice, balance),
            paymentDisputed: disputedPaymentInvoiceIds.has(invoice.id),
          })
        ) {
          counts[id] += 1
        }
      }
    }

    return counts
  }, [
    enrichedInvoices,
    invoiceBalanceById,
    invoicePendingById,
    awaitingReceiptInvoiceIds,
    disputedPaymentInvoiceIds,
  ])

  const anyDisplayHidden = INVOICE_STATUS_FILTERS.some(({ id }) => !displayFlags[id])
  const overdueExclusive = isExclusiveDisplayFlag(displayFlags, 'overdue')
  /** Flags from before Ctrl+click solo, restored on a second Ctrl+click of the same chip. */
  const displayFlagsBeforeSoloRef = useRef<ClientInvoiceDisplayFlags | null>(null)

  const handleDisplayChipClick = useCallback(
    (id: InvoiceStatusFilter, event: MouseEvent<HTMLButtonElement>) => {
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault()
        setDisplayFlags((prev) => {
          if (isExclusiveDisplayFlag(prev, id)) {
            const restored =
              displayFlagsBeforeSoloRef.current ?? createClientInvoiceDisplayFlags()
            displayFlagsBeforeSoloRef.current = null
            return restored
          }
          const alreadySolo = INVOICE_STATUS_FILTERS.some(({ id: key }) =>
            isExclusiveDisplayFlag(prev, key)
          )
          if (!alreadySolo) {
            displayFlagsBeforeSoloRef.current = prev
          }
          return exclusiveClientInvoiceDisplayFlags(id)
        })
        return
      }
      setDisplayFlags((prev) => ({ ...prev, [id]: !prev[id] }))
    },
    []
  )

  const sortedInvoices = useMemo(() => {
    const sorted = [...filteredInvoices]

    const priorityInput = (invoice: EnrichedInvoice) => ({
      awaitingReceipt: awaitingReceiptInvoiceIds.has(invoice.id),
      isShortPaid: isInvoiceListShortPaid(invoice, invoiceBalanceById.get(invoice.id)),
      paymentDisputed:
        disputedPaymentInvoiceIds.has(invoice.id) || isReceiptDisputeHold(invoice),
      status: invoice.status,
      displayStatus: invoice.displayStatus,
      isOverdue: invoice.isOverdue,
    })

    /** Column compare only — used on desktop when not sorting by status. */
    const compareByColumn = (a: EnrichedInvoice, b: EnrichedInvoice): number => {
      let cmp = 0
      switch (sortField) {
        case 'invoice_number':
          cmp = a.invoice_number.localeCompare(b.invoice_number, undefined, { numeric: true })
          break
        case 'load_number':
          cmp = (a.load_number ?? '').localeCompare(b.load_number ?? '', undefined, {
            numeric: true,
          })
          break
        case 'broker_name':
          cmp = a.broker_name.localeCompare(b.broker_name)
          break
        case 'risk_level':
          cmp =
            (BROKER_RISK_SORT[brokerRiskByInvoiceId.get(a.id) ?? 'unrated'] ?? 9) -
            (BROKER_RISK_SORT[brokerRiskByInvoiceId.get(b.id) ?? 'unrated'] ?? 9)
          break
        case 'batch_number':
          cmp = (a.batch_number ?? '').localeCompare(b.batch_number ?? '', undefined, {
            numeric: true,
          })
          break
        case 'amount':
          cmp = a.amount - b.amount
          break
        case 'balance': {
          const aBal = invoiceBalanceById.get(a.id)?.signedBalance ?? a.amount
          const bBal = invoiceBalanceById.get(b.id)?.signedBalance ?? b.amount
          cmp = aBal - bBal
          break
        }
        case 'invoice_date':
          cmp = new Date(a.invoice_date).getTime() - new Date(b.invoice_date).getTime()
          break
        case 'pay_date': {
          const aPay =
            getClientVisiblePayDate(a, {
              confirmedPayDate: payDateByInvoiceId.get(a.id),
              pendingPayDate: pendingPayDateByInvoiceId.get(a.id),
            })?.date || ''
          const bPay =
            getClientVisiblePayDate(b, {
              confirmedPayDate: payDateByInvoiceId.get(b.id),
              pendingPayDate: pendingPayDateByInvoiceId.get(b.id),
            })?.date || ''
          cmp = aPay.localeCompare(bPay)
          break
        }
        case 'days_outstanding':
          cmp = getSortableInvoiceAge(a) - getSortableInvoiceAge(b)
          break
        case 'due_days':
          cmp = getSortableDueDays(a) - getSortableDueDays(b)
          break
        case 'ppw_sent':
          cmp = Number(hasPpwBeenSent(a)) - Number(hasPpwBeenSent(b))
          break
        case 'status':
          cmp = compareInvoicesByListPriority(priorityInput(a), priorityInput(b))
          break
        default:
          cmp = 0
      }
      return sortDir === 'asc' ? cmp : -cmp
    }

    sorted.sort((a, b) => {
      // Mobile list is always status-ordered: Confirm → Short paid → Open → Hold → Overdue.
      if (isMobileViewport) {
        const priorityCmp = compareInvoicesByListPriority(priorityInput(a), priorityInput(b))
        if (priorityCmp !== 0) return priorityCmp
        // Newest invoice date first within the same status bucket.
        return new Date(b.invoice_date).getTime() - new Date(a.invoice_date).getTime()
      }

      // Desktop: honor the clicked column (status uses the priority order above).
      return compareByColumn(a, b)
    })

    return sorted
  }, [
    filteredInvoices,
    sortField,
    sortDir,
    invoiceBalanceById,
    awaitingReceiptInvoiceIds,
    disputedPaymentInvoiceIds,
    isMobileViewport,
    brokerRiskByInvoiceId,
    payDateByInvoiceId,
    pendingPayDateByInvoiceId,
  ])

  const totalPages = Math.max(1, Math.ceil(sortedInvoices.length / pageSize))

  const paginatedInvoices = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return sortedInvoices.slice(start, start + pageSize)
  }, [sortedInvoices, currentPage, pageSize])

  const pageStart = sortedInvoices.length === 0 ? 0 : (currentPage - 1) * pageSize + 1
  const pageEnd = Math.min(currentPage * pageSize, sortedInvoices.length)

  const selectedInvoice = useMemo(
    () =>
      sortedInvoices.find((inv) => inv.id === selectedInvoiceId) ??
      enrichedInvoices.find((inv) => inv.id === selectedInvoiceId) ??
      null,
    [sortedInvoices, enrichedInvoices, selectedInvoiceId]
  )

  const detailPanelOpen = Boolean(selectedInvoice) && !detailPanelClosing

  const handleSort = useCallback(
    (field: InvoiceSortField) => {
      if (sortField === field) {
        setSortDir((dir) => (dir === 'asc' ? 'desc' : 'asc'))
      } else {
        setSortField(field)
        const defaultDesc =
          field === 'amount' ||
          field === 'balance' ||
          field === 'invoice_date' ||
          field === 'pay_date' ||
          field === 'days_outstanding' ||
          field === 'due_days'
        setSortDir(defaultDesc ? 'desc' : 'asc')
      }
    },
    [sortField]
  )

  useEffect(() => {
    const status = searchParams.get('status')
    const validStatuses: InvoiceStatusFilter[] = [
      'confirm',
      'short_paid',
      'approved',
      'hold',
      'overdue',
      'active',
      'pending',
      'paid',
      'closed',
    ]
    // Legacy deep-links for closed invoices.
    if (status === 'force_closed' || status === 'written_off') {
      setDisplayFlags(exclusiveClientInvoiceDisplayFlags('closed'))
      const next = new URLSearchParams(searchParams)
      next.delete('status')
      setSearchParams(next, { replace: true })
      return
    }
    if (status && validStatuses.includes(status as InvoiceStatusFilter)) {
      setDisplayFlags(exclusiveClientInvoiceDisplayFlags(status as InvoiceStatusFilter))
      const next = new URLSearchParams(searchParams)
      next.delete('status')
      setSearchParams(next, { replace: true })
    }
  }, [searchParams, setSearchParams])

  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm, displayFlags, dateFrom, dateTo, pageSize, sortField, sortDir])

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages)
    }
  }, [currentPage, totalPages])

  useEffect(() => {
    if (!selectedInvoiceId) return
    // Keep a deep-linked invoice selected even if filters temporarily hide it.
    if (openedHighlightRef.current === selectedInvoiceId) return
    const stillVisible = sortedInvoices.some((inv) => inv.id === selectedInvoiceId)
    if (!stillVisible) {
      if (sortedInvoices.length > 0 && (showInvoiceDetail || !useFullPageDetail)) {
        setSelectedInvoiceId(sortedInvoices[0].id)
      } else {
        setShowInvoiceDetail(false)
        setSelectedInvoiceId(null)
      }
    }
  }, [sortedInvoices, selectedInvoiceId, showInvoiceDetail, useFullPageDetail])

  const handleViewInvoiceDetail = (invoice: EnrichedInvoice) => {
    // Remember this invoice so returning from Batches / Payments reopens it.
    stashInvoiceRestoreTarget(invoice.id)
    setDetailPanelClosing(false)
    setSelectedInvoiceId(invoice.id)
    if (useFullPageDetail) setShowInvoiceDetail(true)
  }

  const handleCloseInvoiceDetail = useCallback(() => {
    openedHighlightRef.current = null
    clearInvoiceRestoreTarget()
    setAutoOpenUpload(false)

    if (searchParams.get('highlight_invoice') || searchParams.get('open_upload')) {
      const next = new URLSearchParams(searchParams)
      next.delete('highlight_invoice')
      next.delete('open_upload')
      setSearchParams(next, { replace: true })
    }

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
  }, [useFullPageDetail, selectedInvoice, searchParams, setSearchParams])

  const handleViewDocuments = (invoice: Invoice) => {
    setViewingInvoiceDocuments(invoice)
    setShowDocumentViewer(true)
  }

  const getDocumentsForInvoice = (invoice: Invoice) => {
    return getInvoiceDocumentsForViewer(invoice)
  }

  const overdueInvoices = enrichedInvoices.filter((inv) => inv.isOverdue)
  const overdueAmount = overdueInvoices.reduce((sum, inv) => sum + inv.amount, 0)
  const forceCloseEligible = enrichedInvoices.filter((inv) => inv.isForceCloseEligible)

  useEffect(() => {
    const highlightRef = searchParams.get('highlight_invoice')
    if (!highlightRef) return
    // Allow re-open when onboarding tour advances (same invoice, new tour_step).
    const tourStep = searchParams.get('tour_step')
    const rowOnly = searchParams.get('row_only') === '1'
    const openKey = tourStep
      ? `${highlightRef}:${tourStep}:${rowOnly ? 'row' : 'open'}`
      : `${highlightRef}:${rowOnly ? 'row' : 'open'}`
    if (openedHighlightRef.current === openKey) return

    // Wait until tenant invoices have loaded.
    if (enrichedInvoices.length === 0) return

    const needle = highlightRef.trim().replace(/^#/, '')
    const highlightIndex = enrichedInvoices.findIndex(
      (inv) =>
        inv.id === highlightRef ||
        String(inv.invoice_number).trim().replace(/^#/, '') === needle
    )
    // Unknown invoice — stop retrying this ref.
    if (highlightIndex < 0) {
      openedHighlightRef.current = openKey
      const next = new URLSearchParams(searchParams)
      next.delete('highlight_invoice')
      next.delete('open_upload')
      next.delete('row_only')
      next.delete('tour_step')
      setSearchParams(next, { replace: true, state: location.state })
      return
    }

    const target = enrichedInvoices[highlightIndex]
    openedHighlightRef.current = openKey
    const balance =
      invoiceBalanceById.get(target.id) ??
      getClientDisplayBalanceState(target.amount, 0, 0)
    const pendingInfo = invoicePendingById.get(target.id)
    const displayStatus = getInvoiceFilterDisplayStatus(target, balance, pendingInfo)
    setDisplayFlags(
      exclusiveClientInvoiceDisplayFlags(
        statusFilterForInvoice(target, displayStatus, {
          awaitingReceipt: awaitingReceiptInvoiceIds.has(target.id),
          isShortPaid: isInvoiceListShortPaid(target, balance),
        })
      )
    )
    setSearchTerm('')
    setHighlightedInvoiceId(target.id)
    setCurrentPage(Math.floor(highlightIndex / pageSize) + 1)

    if (rowOnly) {
      // Tour list step — flash the row only; keep detail closed.
      setSelectedInvoiceId(null)
      setShowInvoiceDetail(false)
      setDetailPanelClosing(false)
      setAutoOpenUpload(false)
    } else {
      setSelectedInvoiceId(target.id)
      stashInvoiceRestoreTarget(target.id)
      setDetailPanelClosing(false)
      // Always open detail (sidebar on desktop, full page on compact viewports).
      setShowInvoiceDetail(true)
      setAutoOpenUpload(searchParams.get('open_upload') === '1')
    }

    // Strip the highlight param but keep returnTo / other location state.
    const next = new URLSearchParams(searchParams)
    next.delete('highlight_invoice')
    next.delete('open_upload')
    next.delete('row_only')
    next.delete('tour_step')
    setSearchParams(next, { replace: true, state: location.state })

    const timer = setTimeout(() => {
      setHighlightedInvoiceId(null)
    }, rowOnly ? 12_000 : 3000)

    return () => clearTimeout(timer)
  }, [
    searchParams,
    enrichedInvoices,
    invoiceBalanceById,
    invoicePendingById,
    pageSize,
    setSearchParams,
    location.state,
  ])

  // Restore last-open invoice when returning from another tab (Batches, Payments, etc.).
  useEffect(() => {
    if (searchParams.get('highlight_invoice')) return
    const stashedId = peekInvoiceRestoreTarget()
    if (!stashedId) return
    if (openedHighlightRef.current === stashedId) return
    if (enrichedInvoices.length === 0) return

    const index = enrichedInvoices.findIndex((inv) => inv.id === stashedId)
    if (index < 0) return

    const target = enrichedInvoices[index]
    const balance =
      invoiceBalanceById.get(target.id) ??
      getClientDisplayBalanceState(target.amount, 0, 0)
    const pendingInfo = invoicePendingById.get(target.id)
    const displayStatus = getInvoiceFilterDisplayStatus(target, balance, pendingInfo)

    openedHighlightRef.current = stashedId
    setDisplayFlags(
      exclusiveClientInvoiceDisplayFlags(
        statusFilterForInvoice(target, displayStatus, {
          awaitingReceipt: awaitingReceiptInvoiceIds.has(target.id),
          isShortPaid: isInvoiceListShortPaid(target, balance),
        })
      )
    )
    setSelectedInvoiceId(stashedId)
    setDetailPanelClosing(false)
    if (useFullPageDetail) setShowInvoiceDetail(true)
    setCurrentPage(Math.floor(index / pageSize) + 1)
  }, [
    enrichedInvoices,
    invoiceBalanceById,
    invoicePendingById,
    searchParams,
    pageSize,
    useFullPageDetail,
  ])

  const inputCompactStyle = {
    backgroundColor: c.card,
    height: 34,
    paddingTop: 6,
    paddingBottom: 6,
    fontSize: 13,
  } as const

  const invoiceDetailPanelProps = selectedInvoice
    ? {
        invoice: selectedInvoice,
        clientName: data.client_name,
        navigationInvoices: sortedInvoices,
        onClose: handleCloseInvoiceDetail,
        onNavigateInvoice: (invoice: Invoice) => {
          setAutoOpenUpload(false)
          handleViewInvoiceDetail(invoice as EnrichedInvoice)
        },
        onViewDocuments: () => handleViewDocuments(selectedInvoice),
        onInvoiceUpdated: () => setInvoicesRefreshKey((key) => key + 1),
        enableClientActions: capabilities.canOpenDispute,
        payments,
        autoOpenUpload,
        onAutoOpenUploadConsumed: () => setAutoOpenUpload(false),
      }
    : null

  return (
    <>
      <div className="client-invoices-page overflow-hidden flex flex-col min-h-0">
        <ClientReturnBanner />
        {useFullPageDetail && showInvoiceDetail && selectedInvoice && invoiceDetailPanelProps ? (
          <InvoiceDetailPanel variant="mobile" {...invoiceDetailPanelProps} />
        ) : (
          <>
            <section
              className={`client-stat-strip grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 border-b shrink-0${
                isMobileViewport ? ' hidden' : ''
              }`}
              style={{ borderColor: c.border }}
            >
              <div
                className="flex items-center justify-between gap-2 px-4 py-2.5 sm:border-r border-b sm:border-b-0"
                style={{ backgroundColor: c.stat.blue, borderColor: c.border }}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <FileText className="w-3.5 h-3.5 shrink-0" style={{ color: c.info }} />
                  <span className="text-xs font-medium truncate client-stat-strip__label-full" style={{ color: c.secondary }}>
                    Total Invoices
                  </span>
                  <span className="text-xs font-medium truncate client-stat-strip__label-short" style={{ color: c.secondary }}>
                    Invoices
                  </span>
                </div>
                <span className="text-lg font-bold tabular-nums shrink-0" style={{ color: c.primary }}>
                  {enrichedInvoices.length}
                </span>
              </div>
              <div
                className="flex items-center justify-between gap-2 px-4 py-2.5 lg:border-r border-b sm:border-b-0"
                style={{ backgroundColor: c.stat.green, borderColor: c.border }}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <DollarSign className="w-3.5 h-3.5 shrink-0" style={{ color: c.success }} />
                  <span className="text-xs font-medium truncate client-stat-strip__label-full" style={{ color: c.secondary }}>
                    Total Amount
                  </span>
                  <span className="text-xs font-medium truncate client-stat-strip__label-short" style={{ color: c.secondary }}>
                    Amount
                  </span>
                </div>
                <span className="text-lg font-bold tabular-nums shrink-0" style={{ color: c.primary }}>
                  {formatCurrency(enrichedInvoices.reduce((sum, inv) => sum + inv.amount, 0))}
                </span>
              </div>
              <button
                type="button"
                onClick={() =>
                  setDisplayFlags(
                    overdueExclusive
                      ? createClientInvoiceDisplayFlags()
                      : exclusiveClientInvoiceDisplayFlags('overdue')
                  )
                }
                className="flex items-center justify-between gap-2 px-4 py-2.5 sm:border-r border-b lg:border-b-0 text-left transition-colors hover:opacity-90"
                style={{
                  backgroundColor: overdueExclusive ? c.stat.redActive : c.stat.red,
                  borderColor: c.border,
                }}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" style={{ color: c.error }} />
                  <span className="text-xs font-medium truncate client-stat-strip__label-long" style={{ color: c.secondary }}>
                    Overdue (15+ days past expected pay)
                  </span>
                  <span className="text-xs font-medium truncate client-stat-strip__label-short" style={{ color: c.secondary }}>
                    Overdue
                  </span>
                </div>
                <span className="text-lg font-bold tabular-nums shrink-0" style={{ color: c.error }}>
                  {overdueInvoices.length}
                </span>
              </button>
              <div
                className="flex flex-col justify-center gap-0.5 px-4 py-2.5"
                style={{ backgroundColor: c.stat.amber }}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <DollarSign className="w-3.5 h-3.5 shrink-0" style={{ color: c.warning }} />
                    <span className="text-xs font-medium truncate client-stat-strip__label-full" style={{ color: c.secondary }}>
                      Overdue Amount
                    </span>
                    <span className="text-xs font-medium truncate client-stat-strip__label-short" style={{ color: c.secondary }}>
                      Ovd Amt
                    </span>
                  </div>
                  <span className="text-lg font-bold tabular-nums shrink-0" style={{ color: c.primary }}>
                    {formatCurrency(overdueAmount)}
                  </span>
                </div>
                {forceCloseEligible.length > 0 && capabilities.hasForceClose && (
                  <p className="text-[11px] tabular-nums" style={{ color: '#7C3AED' }}>
                    {forceCloseEligible.length} at {AR_POLICY.forceCloseDays}+ days past expected pay
                  </p>
                )}
              </div>
            </section>

            <div
              className="client-page-toolbar px-4 py-2 border-b shrink-0 space-y-2"
              style={{ borderColor: c.border, backgroundColor: c.card }}
            >
              <div className="flex items-center gap-2 min-w-0">
                <ClientInvoicesTabs />
                <div
                  className="flex flex-wrap items-center gap-1.5 min-w-0"
                  role="group"
                  aria-label="Invoice types to display"
                >
                {INVOICE_STATUS_FILTERS.map(({ id, label }) => {
                  const showing = displayFlags[id]
                  const count = statusFilterCounts[id]
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={(event) => handleDisplayChipClick(id, event)}
                      aria-pressed={showing}
                      title={
                        isExclusiveDisplayFlag(displayFlags, id)
                          ? `Showing only ${label} — Ctrl+click to restore all filters`
                          : showing
                            ? `Showing ${label} — click to hide · Ctrl+click to show only this`
                            : `Hidden ${label} — click to show · Ctrl+click to show only this`
                      }
                      className={`page-tab !py-1 !px-2 !text-xs ${
                        showing ? 'page-tab--active' : 'opacity-50'
                      }`}
                      data-onboard-target={`invoiceFilter-${id}`}
                    >
                      {label}
                      <span className="tabular-nums"> ({count})</span>
                    </button>
                  )
                })}
                </div>
              </div>
              <div className="flex flex-col md:flex-row md:items-center gap-2">
                <div className="flex-1 relative">
                  <Search
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5"
                    style={{ color: c.secondary }}
                  />
                  <input
                    type="text"
                    placeholder="Search invoice, broker, load…"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="client-input pl-8"
                    style={inputCompactStyle}
                  />
                </div>
                <button
                  type="button"
                  className={`mobile-payments-date__trigger shrink-0${
                    mobileDateRangeValue !== 'all' ? ' is-active' : ''
                  }${mobileDateMenuOpen ? ' is-open' : ''}`}
                  aria-haspopup="dialog"
                  aria-expanded={mobileDateMenuOpen}
                  onClick={() => setMobileDateMenuOpen(true)}
                >
                  <CalendarDays size={14} strokeWidth={2.25} aria-hidden />
                  <span className="mobile-payments-date__label">{mobileDateRangeLabel}</span>
                </button>
              </div>
              {mobileDateMenuOpen ? (
                <MobilePaymentDateRangeSheet
                  eyebrow="Invoices"
                  activeValue={mobileDateRangeValue}
                  dateFrom={dateFrom}
                  dateTo={dateTo}
                  onApplyPreset={applyDatePreset}
                  onChangeFrom={setDateFrom}
                  onChangeTo={setDateTo}
                  onClose={() => setMobileDateMenuOpen(false)}
                />
              ) : null}
            </div>

            {sortedInvoices.length === 0 ? (
              <div className="payments-workspace-body flex-1 min-h-0">
                <div className="payments-list-panel flex items-center justify-center text-center py-6 px-4">
                  <div>
                    <FileText className="w-10 h-10 mx-auto mb-3" style={{ color: c.mutedLight }} />
                    <p className="text-base font-medium mb-1" style={{ color: c.primary }}>
                      No invoices found
                    </p>
                    <p className="text-sm" style={{ color: c.secondary }}>
                      {searchTerm || anyDisplayHidden
                        ? 'Try adjusting search or turn display chips back on'
                        : 'Your invoices will appear here'}
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
                  {isMobileViewport ? (
                    <div className="mobile-invoice-list flex-1 min-h-0 overflow-y-auto">
                      {paginatedInvoices.map((invoice) => {
                        const balance =
                          invoiceBalanceById.get(invoice.id) ??
                          getInvoiceBalanceState(invoice.amount, 0)
                        const shortPaid = isInvoiceListShortPaid(invoice, balance)
                        return (
                        <MobileInvoiceListCard
                          key={invoice.id}
                          invoice={invoice}
                          payDate={payDateByInvoiceId.get(invoice.id) ?? null}
                          pendingPayDate={pendingPayDateByInvoiceId.get(invoice.id) ?? null}
                          awaitingReceipt={awaitingReceiptInvoiceIds.has(invoice.id)}
                          paymentDisputed={
                            disputedPaymentInvoiceIds.has(invoice.id) ||
                            isReceiptDisputeHold(invoice)
                          }
                          isShortPaid={shortPaid}
                          openAmount={shortPaid ? balance.signedBalance : null}
                          selected={selectedInvoice?.id === invoice.id}
                          highlighted={highlightedInvoiceId === invoice.id}
                          onboardTarget={
                            isTourInvoiceId(invoice.id) ? 'tourInvoiceRow' : undefined
                          }
                          onClick={() => handleViewInvoiceDetail(invoice)}
                          riskLevel={brokerRiskByInvoiceId.get(invoice.id) ?? 'unrated'}
                        />
                        )
                      })}
                    </div>
                  ) : (
                  <div className="client-table-scroll client-table-scroll--mobile-stack flex-1 min-h-0 overflow-y-auto">
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
                            field="load_number"
                            label="Load#"
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
                            className="client-list-td--broker"
                          />
                          <ClientSortableHeader
                            field="risk_level"
                            label="Risk factor"
                            sortField={sortField}
                            sortDir={sortDir}
                            onSort={handleSort}
                          />
                          <ClientSortableHeader
                            field="batch_number"
                            label="Batch#"
                            sortField={sortField}
                            sortDir={sortDir}
                            onSort={handleSort}
                            className="client-list-td--batch"
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
                            field="balance"
                            label="Balance"
                            sortField={sortField}
                            sortDir={sortDir}
                            onSort={handleSort}
                            className="text-right"
                            align="right"
                          />
                          <ClientSortableHeader
                            field="invoice_date"
                            label="Invoice Date"
                            sortField={sortField}
                            sortDir={sortDir}
                            onSort={handleSort}
                            className="client-list-td--invoice-date"
                          />
                          <ClientSortableHeader
                            field="pay_date"
                            label="Pay date"
                            sortField={sortField}
                            sortDir={sortDir}
                            onSort={handleSort}
                            className="client-list-td--pay-date"
                          />
                          <ClientSortableHeader
                            field="days_outstanding"
                            label="Age"
                            sortField={sortField}
                            sortDir={sortDir}
                            onSort={handleSort}
                            className="text-right"
                            align="right"
                          />
                          <ClientSortableHeader
                            field="due_days"
                            label="Due Days"
                            sortField={sortField}
                            sortDir={sortDir}
                            onSort={handleSort}
                            className="text-right"
                            align="right"
                          />
                          <ClientSortableHeader
                            field="ppw_sent"
                            label="PPW sent"
                            sortField={sortField}
                            sortDir={sortDir}
                            onSort={handleSort}
                            className="text-center"
                            align="center"
                          />
                          <ClientSortableHeader
                            field="status"
                            label="Status"
                            sortField={sortField}
                            sortDir={sortDir}
                            onSort={handleSort}
                            className="client-list-td--status-col"
                          />
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedInvoices.map((invoice) => {
                          const isHighlighted = highlightedInvoiceId === invoice.id
                          const isSelected = selectedInvoice?.id === invoice.id
                          const awaitingPayment = awaitingReceiptInvoiceIds.has(invoice.id)
                          const balance =
                            invoiceBalanceById.get(invoice.id) ??
                            getInvoiceBalanceState(invoice.amount, 0)
                          const isWrittenOff =
                            invoice.status === 'written_off' || invoice.status === 'write_off_pending'
                          const writtenOffAmount =
                            invoice.write_off_request?.shortfall ??
                            (balance.signedBalance > 0 ? balance.signedBalance : invoice.amount)
                          const balanceDisplay = isWrittenOff
                            ? { text: formatCurrency(writtenOffAmount), color: c.warning }
                            : formatInvoiceOpenBalance(balance, c.mutedLight, c.primary)
                          const visiblePayDate = getClientVisiblePayDate(invoice, {
                            confirmedPayDate: payDateByInvoiceId.get(invoice.id),
                            pendingPayDate: pendingPayDateByInvoiceId.get(invoice.id),
                          })
                          return (
                            <tr
                              key={invoice.id}
                              className={`cursor-pointer ${isHighlighted ? 'batch-highlight-row' : ''} ${
                                isSelected ? 'invoice-row--selected' : ''
                              } ${
                                invoice.isForceCloseEligible
                                  ? 'invoice-row--force-close'
                                  : invoice.isOverdue
                                    ? 'invoice-row--overdue'
                                    : ''
                              }`}
                              data-onboard-target={
                                isTourInvoiceId(invoice.id) ? 'tourInvoiceRow' : undefined
                              }
                              onClick={() => handleViewInvoiceDetail(invoice)}
                            >
                              <ClientListTd
                                variant="primary"
                                className="font-semibold"
                                title={invoice.invoice_number}
                              >
                                {invoice.invoice_number}
                              </ClientListTd>
                              <ClientListTd
                                variant="desktop"
                                label="Load#"
                                style={{ color: c.secondary }}
                                title={invoice.load_number || undefined}
                              >
                                {invoice.load_number || '-'}
                              </ClientListTd>
                              <ClientListTd
                                variant="meta"
                                className="client-list-td--ellipsis client-list-td--broker"
                                title={invoice.broker_name}
                              >
                                <span className="client-list-td__clip">{invoice.broker_name}</span>
                              </ClientListTd>
                              <ClientListTd variant="status" label="Risk factor">
                                <BrokerRiskLevelChip
                                  level={brokerRiskByInvoiceId.get(invoice.id) ?? 'unrated'}
                                  size="sm"
                                />
                              </ClientListTd>
                              <ClientListTd
                                variant="desktop"
                                label="Batch#"
                                className="client-list-td--ellipsis client-list-td--batch"
                                style={{ color: c.secondary }}
                                title={invoice.batch_number || undefined}
                              >
                                <span className="client-list-td__clip">{invoice.batch_number || '-'}</span>
                              </ClientListTd>
                              <ClientListTd variant="amount" className="text-right font-medium tabular-nums">
                                {formatCurrency(invoice.amount)}
                              </ClientListTd>
                              <ClientListTd
                                variant="desktop"
                                label="Balance"
                                className="text-right font-medium tabular-nums"
                              >
                                <span style={{ color: balanceDisplay.color }}>{balanceDisplay.text}</span>
                              </ClientListTd>
                              <ClientListTd
                                variant="desktop"
                                label="Invoice Date"
                                className="client-list-td--invoice-date"
                                style={{ color: c.secondary }}
                              >
                                {formatDate(invoice.invoice_date)}
                              </ClientListTd>
                              <ClientListTd
                                variant="desktop"
                                label="Pay date"
                                className="client-list-td--pay-date"
                                style={{ color: c.secondary }}
                              >
                                {visiblePayDate?.source === 'confirmed' ? (
                                  <span className="whitespace-nowrap tabular-nums">
                                    {formatDate(visiblePayDate.date)}
                                  </span>
                                ) : visiblePayDate?.source === 'pending' ? (
                                  <span className="whitespace-nowrap" title="Payment posted — awaiting confirmation">
                                    <span className="tabular-nums">{formatDate(visiblePayDate.date)}</span>
                                    <span
                                      className="block text-[9px] font-medium"
                                      style={{ color: c.warning }}
                                    >
                                      Pending
                                    </span>
                                  </span>
                                ) : visiblePayDate?.source === 'scheduled' ? (
                                  <span className="whitespace-nowrap" title="Broker confirmed they will pay on this date">
                                    <span className="tabular-nums">{formatDate(visiblePayDate.date)}</span>
                                    <span
                                      className="block text-[9px] font-medium"
                                      style={{ color: c.primary }}
                                    >
                                      Scheduled
                                    </span>
                                  </span>
                                ) : (
                                  '—'
                                )}
                              </ClientListTd>
                              <ClientListTd variant="desktop" label="Age" className="text-right tabular-nums">
                                <span
                                  className="client-invoices-age"
                                  style={{
                                    color: invoiceHasStoppedAging(invoice)
                                      ? c.success
                                      : isOpenArInvoice(invoice) && invoice.isOverdue
                                        ? getDaysOutstandingColor(invoice.overdueSeverity)
                                        : c.secondary,
                                  }}
                                >
                                  {invoice.invoiceAgeDays}d
                                  {!invoiceHasStoppedAging(invoice) &&
                                    invoice.isForceCloseEligible &&
                                    capabilities.hasForceClose && (
                                    <span className="block text-[9px] font-medium" style={{ color: '#7C3AED' }}>
                                      FC
                                    </span>
                                  )}
                                </span>
                              </ClientListTd>
                              <ClientListTd
                                variant="desktop"
                                label="Due Days"
                                className="text-right tabular-nums"
                                style={{ color: c.secondary }}
                                title="Broker due days"
                              >
                                {formatBrokerDueDays(getInvoiceBrokerDueDays(invoice, mockBrokers))}
                              </ClientListTd>
                              <ClientListTd
                                variant="desktop"
                                label="PPW sent"
                                className="text-center"
                                data-onboard-target={
                                  invoice.id.startsWith('inv-onboard-tour')
                                    ? 'invoicePpwSent'
                                    : undefined
                                }
                              >
                                {hasPpwBeenSent(invoice) ? (
                                  <span
                                    className="inline-flex items-center justify-center"
                                    title="Paperwork sent to broker"
                                    style={{ color: '#16a34a' }}
                                    aria-label="PPW sent"
                                  >
                                    <Check className="w-4 h-4" strokeWidth={2.5} />
                                  </span>
                                ) : (
                                  <span style={{ color: c.mutedLight }} aria-label="PPW not sent">
                                    —
                                  </span>
                                )}
                              </ClientListTd>
                              <ClientListTd variant="status" className="client-list-td--status-col">
                                <div className="inline-flex items-center gap-1 flex-nowrap min-w-0">
                                  {awaitingPayment ? (
                                    <span className="status-pill status-pill--confirm-payment">
                                      Confirm payment
                                    </span>
                                  ) : (
                                    <>
                                      {getInvoiceRowStatusBadge(invoice, {
                                        balance,
                                        pendingClientPosted:
                                          invoicePendingById.get(invoice.id)?.pending,
                                        confirmedReceived:
                                          invoicePendingById.get(invoice.id)?.confirmed,
                                        paymentDisputed: disputedPaymentInvoiceIds.has(
                                          invoice.id
                                        ),
                                      })}
                                      {/* Skip companion Disputed when primary status is already Open Disputed */}
                                      {!invoiceHasOpenDisputedStatus(invoice, {
                                        paymentDisputed:
                                          disputedPaymentInvoiceIds.has(invoice.id) ||
                                          isReceiptDisputeHold(invoice),
                                      }) && <InvoiceDisputeBadges invoice={invoice} />}
                                    </>
                                  )}
                                  {invoice.isForceCloseEligible &&
                                    capabilities.hasForceClose &&
                                    !awaitingPayment && (
                                      <span className="status-pill status-pill--hold text-[10px]">
                                        Force Close
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

                  <div
                    className="client-page-footer flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-4 py-2 border-t shrink-0"
                    style={{ borderColor: c.border, backgroundColor: c.card }}
                  >
                    <p className="text-xs font-medium" style={{ color: c.secondary }}>
                      Showing {pageStart}–{pageEnd} of {sortedInvoices.length}
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
            )}
          </>
        )}
      </div>

      {showDocumentViewer && viewingInvoiceDocuments && (
        <DocumentViewer
          isOpen={showDocumentViewer}
          onClose={() => {
            setShowDocumentViewer(false)
            setViewingInvoiceDocuments(null)
          }}
          documents={getDocumentsForInvoice(viewingInvoiceDocuments)}
          invoiceNumber={viewingInvoiceDocuments.invoice_number}
          title="View Documents"
        />
      )}
    </>
  )
}
