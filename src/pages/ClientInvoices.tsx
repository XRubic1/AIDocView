import { useState, useEffect, useMemo, useCallback, useRef, type MouseEvent } from 'react'
import { useSearchParams, useLocation } from 'react-router-dom'
import { useClientDemoSnapshot } from '../hooks/useClientDemoSnapshot'
import { useTenantDataRevision } from '../hooks/useTenantDataRevision'
import { useClientCapabilities } from '../hooks/useClientCapabilities'
import { Invoice } from '../types/invoice'
import { formatCurrency, formatDate } from '../utils/format'
import { FileText, Search, ChevronLeft, ChevronRight, Check, CalendarDays } from 'lucide-react'
import DocumentViewer from '../components/DocumentViewer'
import {
  getInvoiceRowStatusBadge,
  InvoiceDisputeBadges,
} from '../components/client/InvoiceDetailWorkspace'
import InvoiceDetailPanel from '../components/client/InvoiceDetailPanel'
import ClientInvoicesTabs from '../components/client/ClientInvoicesTabs'
import ClientSortableHeader from '../components/client/ClientSortableHeader'
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
import { getInvoiceBrokerDueDays } from '../utils/invoiceDueDate'
import BrokerRiskLevelChip from '../components/client/BrokerRiskLevelChip'
import { getCarrierVisibleBrokerRiskLevel } from '../utils/clientBrokers'
import type { BrokerRiskLevel } from '../types/brokerRisk'
import { compareInvoicesByListPriority } from '../utils/invoiceListPriority'
import { getPresetRange } from '../utils/clientReports'
import { isReceiptDisputeHold } from '../services/paymentReceiptConfirmationService'
import { invoiceHasOpenDisputedStatus } from '../utils/clientInvoiceDisputeStatus'
import { getClientVisiblePayDate } from '../utils/invoiceWillPay'
import { getOpenClientAttention } from '../utils/clientAttention'
import '../styles/clientInvoicesClean.css'

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
      return displayStatus === 'approved' || displayStatus === 'invoiced'
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

  // Compact viewports show details full-page, so never reserve the sidebar column there.
  const detailPanelOpen = Boolean(selectedInvoice) && !detailPanelClosing && !useFullPageDetail

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
              className={`inv-kpis shrink-0${isMobileViewport ? ' hidden' : ''}`}
              aria-label="Invoice totals"
            >
              <div className="inv-kpi">
                <span className="inv-kpi__label">Invoices</span>
                <span className="inv-kpi__value">{enrichedInvoices.length}</span>
              </div>
              <div className="inv-kpi">
                <span className="inv-kpi__label">Total billed</span>
                <span className="inv-kpi__value">
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
                className={`inv-kpi inv-kpi--button${overdueInvoices.length > 0 ? ' is-alert' : ''}${
                  overdueExclusive ? ' is-active' : ''
                }`}
                aria-pressed={overdueExclusive}
                title={
                  overdueExclusive
                    ? 'Showing only overdue invoices — click to show all'
                    : '15+ days past expected pay — click to show only these'
                }
              >
                <span className="inv-kpi__label">Overdue</span>
                <span className="inv-kpi__value">{overdueInvoices.length}</span>
              </button>
              <div className={`inv-kpi${overdueAmount > 0 ? ' is-alert' : ''}`}>
                <span className="inv-kpi__label">Overdue amount</span>
                <span className="inv-kpi__value">{formatCurrency(overdueAmount)}</span>
                {forceCloseEligible.length > 0 && capabilities.hasForceClose && (
                  <span className="inv-kpi__note">
                    {forceCloseEligible.length} at {AR_POLICY.forceCloseDays}+ days past expected pay
                  </span>
                )}
              </div>
            </section>

            <div className="inv-toolbar shrink-0">
              <div className="inv-toolbar__row">
                <label className="inv-search">
                  <Search className="inv-search__icon" aria-hidden />
                  <input
                    type="search"
                    placeholder="Search invoice, broker, load or batch"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    aria-label="Search invoices"
                  />
                </label>
                <button
                  type="button"
                  className={`mobile-payments-date__trigger inv-date-btn shrink-0${
                    mobileDateRangeValue !== 'all' ? ' is-active' : ''
                  }${mobileDateMenuOpen ? ' is-open' : ''}`}
                  aria-haspopup="dialog"
                  aria-expanded={mobileDateMenuOpen}
                  onClick={() => setMobileDateMenuOpen(true)}
                >
                  <CalendarDays size={15} strokeWidth={2} aria-hidden />
                  <span className="mobile-payments-date__label">{mobileDateRangeLabel}</span>
                </button>
              </div>
              <div className="inv-toolbar__row inv-toolbar__row--filters">
                <ClientInvoicesTabs />
                <div className="inv-filters" role="group" aria-label="Invoice types to display">
                  {INVOICE_STATUS_FILTERS.map(({ id, label }) => {
                    const showing = displayFlags[id]
                    const count = statusFilterCounts[id]
                    // Empty buckets add noise; keep them only when they are the solo filter.
                    if (count === 0 && !isExclusiveDisplayFlag(displayFlags, id)) return null
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
                        className={`inv-chip${showing ? ' is-on' : ''}`}
                        data-onboard-target={`invoiceFilter-${id}`}
                      >
                        {label}
                        <span className="inv-chip__count tabular-nums">{count}</span>
                      </button>
                    )
                  })}
                </div>
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
                  <div className="inv-table-scroll flex-1 min-h-0 overflow-y-auto">
                    <table className="inv-table">
                      <thead>
                        <tr>
                          <ClientSortableHeader
                            field="invoice_number"
                            label="Invoice"
                            sortField={sortField}
                            sortDir={sortDir}
                            onSort={handleSort}
                            className="inv-col-invoice"
                          />
                          <ClientSortableHeader
                            field="broker_name"
                            label="Broker"
                            sortField={sortField}
                            sortDir={sortDir}
                            onSort={handleSort}
                            className="inv-col-broker"
                          />
                          <ClientSortableHeader
                            field="invoice_date"
                            label="Date"
                            sortField={sortField}
                            sortDir={sortDir}
                            onSort={handleSort}
                            className="inv-col-date"
                          />
                          <ClientSortableHeader
                            field="amount"
                            label="Amount"
                            sortField={sortField}
                            sortDir={sortDir}
                            onSort={handleSort}
                            className="inv-col-amount"
                            align="right"
                          />
                          <ClientSortableHeader
                            field="status"
                            label="Status"
                            sortField={sortField}
                            sortDir={sortDir}
                            onSort={handleSort}
                            className="inv-col-status"
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
                          // Only call out the balance when it differs from the billed amount.
                          const balanceNote = isWrittenOff
                            ? { text: `Written off ${formatCurrency(writtenOffAmount)}`, color: c.warning }
                            : balance.tone === 'short' || balance.tone === 'over'
                              ? (() => {
                                  const shown = formatInvoiceOpenBalance(balance, c.mutedLight, c.primary)
                                  return {
                                    text: balance.tone === 'over' ? `${shown.text} over` : `${shown.text} open`,
                                    color: shown.color,
                                  }
                                })()
                              : null
                          const visiblePayDate = getClientVisiblePayDate(invoice, {
                            confirmedPayDate: payDateByInvoiceId.get(invoice.id),
                            pendingPayDate: pendingPayDateByInvoiceId.get(invoice.id),
                          })
                          const stoppedAging = invoiceHasStoppedAging(invoice)
                          const ageColor = stoppedAging
                            ? c.success
                            : isOpenArInvoice(invoice) && invoice.isOverdue
                              ? getDaysOutstandingColor(invoice.overdueSeverity)
                              : undefined
                          const dateNote =
                            visiblePayDate?.source === 'confirmed'
                              ? `Paid ${formatDate(visiblePayDate.date)}`
                              : visiblePayDate?.source === 'pending'
                                ? `Paid ${formatDate(visiblePayDate.date)} · pending`
                                : visiblePayDate?.source === 'scheduled'
                                  ? `Pays ${formatDate(visiblePayDate.date)}`
                                  : `${invoice.invoiceAgeDays} ${invoice.invoiceAgeDays === 1 ? 'day' : 'days'} old`
                          const riskLevel = brokerRiskByInvoiceId.get(invoice.id) ?? 'unrated'
                          const showRisk = riskLevel === 'medium' || riskLevel === 'high'
                          return (
                            <tr
                              key={invoice.id}
                              className={`inv-row${isHighlighted ? ' batch-highlight-row' : ''}${
                                isSelected ? ' is-selected' : ''
                              }${
                                invoice.isForceCloseEligible
                                  ? ' is-force-close'
                                  : invoice.isOverdue
                                    ? ' is-overdue'
                                    : ''
                              }`}
                              data-onboard-target={
                                isTourInvoiceId(invoice.id) ? 'tourInvoiceRow' : undefined
                              }
                              aria-selected={isSelected}
                              onClick={() => handleViewInvoiceDetail(invoice)}
                            >
                              <td className="inv-col-invoice">
                                <span className="inv-cell__main">#{invoice.invoice_number}</span>
                                <span className="inv-cell__sub">
                                  {invoice.load_number ? `Load ${invoice.load_number}` : 'No load #'}
                                </span>
                                <span className="inv-cell__sub inv-cell__sub--broker" title={invoice.broker_name}>
                                  {invoice.broker_name}
                                </span>
                              </td>
                              <td className="inv-col-broker">
                                <span className="inv-cell__main inv-cell__clip" title={invoice.broker_name}>
                                  {invoice.broker_name}
                                </span>
                                {showRisk ? (
                                  <span className="inv-cell__sub">
                                    <BrokerRiskLevelChip level={riskLevel} size="sm" />
                                  </span>
                                ) : invoice.batch_number ? (
                                  <span className="inv-cell__sub inv-cell__clip" title={invoice.batch_number}>
                                    {invoice.batch_number}
                                  </span>
                                ) : null}
                              </td>
                              <td className="inv-col-date">
                                <span className="inv-cell__main inv-cell__main--quiet tabular-nums">
                                  {formatDate(invoice.invoice_date)}
                                </span>
                                <span
                                  className="inv-cell__sub tabular-nums"
                                  style={ageColor ? { color: ageColor } : undefined}
                                >
                                  {dateNote}
                                  {!stoppedAging &&
                                    invoice.isForceCloseEligible &&
                                    capabilities.hasForceClose && <> · FC</>}
                                </span>
                              </td>
                              <td className="inv-col-amount">
                                <span className="inv-cell__main tabular-nums">
                                  {formatCurrency(invoice.amount)}
                                </span>
                                {balanceNote ? (
                                  <span className="inv-cell__sub tabular-nums" style={{ color: balanceNote.color }}>
                                    {balanceNote.text}
                                  </span>
                                ) : null}
                              </td>
                              <td className="inv-col-status">
                                <div className="inv-status">
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
                                      <span className="status-pill status-pill--hold">Force close</span>
                                    )}
                                  {getOpenClientAttention(invoice) ? (
                                    <span
                                      className="status-pill status-pill--overdue"
                                      title={getOpenClientAttention(invoice)?.message}
                                    >
                                      Needs you
                                    </span>
                                  ) : null}
                                  {hasPpwBeenSent(invoice) ? (
                                    <span
                                      className="inv-ppw"
                                      title="Paperwork sent to broker"
                                      aria-label="Paperwork sent to broker"
                                      data-onboard-target={
                                        invoice.id.startsWith('inv-onboard-tour')
                                          ? 'invoicePpwSent'
                                          : undefined
                                      }
                                    >
                                      <Check className="w-3.5 h-3.5" strokeWidth={2.75} aria-hidden />
                                      PPW
                                    </span>
                                  ) : null}
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                  )}

                  <div className="inv-footer shrink-0">
                    <p className="inv-footer__count">
                      {pageStart}–{pageEnd} of {sortedInvoices.length}
                    </p>
                    <div className="inv-footer__controls">
                      <label className="inv-footer__rows">
                        Rows
                        <select
                          value={pageSize}
                          onChange={(e) => setPageSize(Number(e.target.value))}
                          className="client-input"
                        >
                          {PAGE_SIZE_OPTIONS.map((size) => (
                            <option key={size} value={size}>
                              {size}
                            </option>
                          ))}
                        </select>
                      </label>
                      <div className="inv-footer__pager">
                        <button
                          type="button"
                          onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                          disabled={currentPage <= 1}
                          className="table-page-btn"
                          aria-label="Previous page"
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </button>
                        <span className="tabular-nums">
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
