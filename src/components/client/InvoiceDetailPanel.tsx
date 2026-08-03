import { useEffect, useMemo, useRef, useState, type TransitionEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useHorizontalSwipe } from '../../hooks/useHorizontalSwipe'
import {
  X,
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
  AlertTriangle,
  CircleCheck,
  Upload,
  Ban,
  DollarSign,
  Boxes,
  PanelRightOpen,
  Mail,
} from 'lucide-react'
import type { Invoice } from '../../types/invoice'
import type { Payment } from '../../types/payment'
import { formatCurrency } from '../../utils/format'
import {
  addClientInvoiceNote,
  openClientInvoiceDispute,
  markClientInvoiceAsPaid,
  postClientPaymentAndRequestWriteOff,
  closeClientInvoiceAsUncollectable,
  uploadClientInvoiceDocuments,
  getOpenDisputes,
  getDisputeReasonLabel,
  DISPUTE_REASON_OPTIONS,
  type ClientMarkPaidOptions,
} from '../../services/clientInvoiceActions'
import {
  addAdminInvoiceNote,
  postInvoiceStatusNote,
  type InvoiceStatusNoteKind,
} from '../../services/adminInvoiceNoteActions'
import { getInvoiceDocuments } from '../../services/invoiceDocumentStore'
import InvoiceDocumentUploadModal from './InvoiceDocumentUploadModal'
import { markAssistantInvoiceDocsUploaded } from '../../utils/assistantTaskStore'
import {
  buildShortPaymentRecord,
  canCloseShortPaymentAsUncollectable,
} from '../../utils/shortPayments'
import {
  buildOverpaymentRecord,
  canAcceptOverpayment,
} from '../../utils/overPayments'
import { getPaymentTimingInfo, isPaymentInFloatWindow } from '../../utils/paymentTiming'
import ShortPaymentCloseModal from './ShortPaymentCloseModal'
import OverpaymentAcceptModal from './OverpaymentAcceptModal'
import {
  enrichInvoice,
  isPostableForPayment,
} from '../../utils/invoiceAging'
import { useClientTheme } from '../../theme/ThemeContext'
import { useClientCapabilities } from '../../hooks/useClientCapabilities'
import { toClientVisibleInvoice } from '../../utils/clientInvoiceView'
import {
  getAwaitingReceiptPaymentForInvoice,
  getReceiptConfirmationDaysLeft,
} from '../../utils/paymentStatus'
import { buildClientPaymentAuditTimeline, isPaymentRelatedInvoiceNote, isRedundantPaymentLifecycleNote, isClosedUncollectableNote, getPaymentNoteCategoryTitle } from '../../utils/clientPaymentAuditTimeline'
import {
  getClientPostedPendingTotal,
  getInvoiceReceivedAmount,
  AMOUNT_EPSILON,
} from '../../utils/paymentVariance'
import {
  getUnconfirmedPaymentTotal,
  getUnconfirmedShortPaymentTotal,
} from '../../data/mockPayments'
import {
  NOTE_TYPE_LABELS,
  getInvoiceNoteEntries,
  InvoiceNoteCompose,
} from './invoiceDetailShared'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../ui/ToastProvider'
import { mockBrokers } from '../../data/mockBrokers'
import {
  resolveBrokerPaperworkEmail,
  sendBrokerPacketForInvoice,
} from '../../utils/paperworkSender'
import { getClientDocuments } from '../../services/clientDocumentService'
import { resolveInvoiceDocumentsAsync } from '../../utils/resolveInvoiceDocuments'
import {
  defaultSelectedVaultDocIds,
  formatVaultDocPickerLabel,
  selectionHasBankProof,
} from '../../utils/carrierRemittance'
import type { ClientDocument } from '../../types/clientDocument'
import MobileInvoiceOverview from './MobileInvoiceOverview'
import { InvoiceActivityNoteList, declutterActivityEntries } from './InvoiceActivityNoteList'
import { getCarrierInvoiceActionRequired } from '../../utils/invoiceMobileInsights'
import ConfirmPaymentReceiptModal from './ConfirmPaymentReceiptModal'

type TimelineFilter = 'all' | 'activity' | 'notes' | 'payments' | 'send'
type TimelineTone = 'neutral' | 'success' | 'warning' | 'error' | 'info'
type NoteSource = 'carrier' | 'credyx'

interface TimelineEntry {
  id: string
  title: string
  detail: string
  timestamp: string
  tone: TimelineTone
  /** Note/activity kind for color coding (e.g. client_note, dispute). */
  kind?: string
  /** Who authored the entry — carrier (client) or Credyx. */
  source?: NoteSource
  meta?: string
  /** Credyx-only note (admin timeline). */
  internal?: boolean
}

function noteTone(type?: string): TimelineTone {
  switch (type) {
    case 'approval':
      return 'success'
    case 'status_update':
    case 'client_note':
      return 'info'
    case 'rejection':
    case 'dispute':
      return 'error'
    case 'hold_reason':
      return 'warning'
    case 'note':
      return 'neutral'
    default:
      return 'neutral'
  }
}

/** Carrier notes use client_note; Credyx owns admin/status notes. */
function noteSource(type?: string, author?: string, noteText?: string): NoteSource {
  if (type === 'dispute') return 'carrier'
  if (type === 'client_note') {
    const by = author?.trim().toLowerCase() || ''
    if (
      noteText &&
      isPaymentRelatedInvoiceNote(noteText, type as 'client_note') &&
      (by === 'admin' || by.includes('credyx'))
    ) {
      return 'credyx'
    }
    return 'carrier'
  }
  return 'credyx'
}

function noteTitle(type?: string): string {
  switch (type) {
    case 'client_note':
      return 'Note'
    case 'note':
      return 'Note'
    case 'hold_reason':
      return 'On Hold'
    case 'approval':
      return 'Approved'
    case 'rejection':
      return 'Rejected'
    case 'dispute':
      return 'Dispute'
    case 'status_update':
      return 'Status'
    default:
      return NOTE_TYPE_LABELS[type || 'note'] || 'Update'
  }
}

export interface InvoiceDetailPanelProps {
  variant: 'sidebar' | 'mobile'
  invoice: Invoice
  clientName: string
  navigationInvoices: Invoice[]
  onClose: () => void
  onNavigateInvoice: (invoice: Invoice) => void
  onViewDocuments?: () => void
  onInvoiceUpdated?: () => void
  onAddNote?: (
    invoiceId: string,
    note: string,
    options?: { visibility?: 'client' | 'internal' }
  ) => void | Promise<void>
  onOpenDispute?: (invoiceId: string, reason: string, description: string) => void | Promise<void>
  onMarkAsPaid?: (invoiceId: string, options: ClientMarkPaidOptions) => void | Promise<void>
  onCloseAsUncollectable?: (invoiceId: string, note: string) => void | Promise<void>
  onAcceptOverpayment?: (invoiceId: string, note: string) => void | Promise<void>
  payments?: Payment[]
  enableClientActions?: boolean
  /**
   * `admin` keeps Credyx-facing status/notes and routes batch links to /batches.
   * Default `client` masks write-off pending and uses the client portal paths.
   */
  portalMode?: 'client' | 'admin'
  /** When set, overrides note compose visibility (defaults to enableClientActions). */
  enableNotes?: boolean
  /** Author name for notes / uploads (defaults to clientName). */
  noteAuthorName?: string
  /** Opens invoice detail + documents in a separate browser window. */
  onPopOut?: () => void
  /** When true, open the document upload modal once (Assistant deep-link). */
  autoOpenUpload?: boolean
  /** Called after auto-open has been applied so the parent can clear the flag. */
  onAutoOpenUploadConsumed?: () => void
}

/** Invoice detail — Payment Details layout (sidebar desktop / full page mobile). */
export default function InvoiceDetailPanel({
  variant,
  invoice,
  clientName,
  navigationInvoices,
  onClose,
  onNavigateInvoice,
  onViewDocuments,
  onInvoiceUpdated,
  onAddNote,
  onOpenDispute,
  onMarkAsPaid,
  onCloseAsUncollectable,
  onAcceptOverpayment,
  payments = [],
  enableClientActions = true,
  portalMode = 'client',
  enableNotes,
  noteAuthorName,
  onPopOut,
  autoOpenUpload = false,
  onAutoOpenUploadConsumed,
}: InvoiceDetailPanelProps) {
  const c = useClientTheme()
  const navigate = useNavigate()
  const { capabilities } = useClientCapabilities()
  const { showToast } = useToast()
  const { resolved } = useAuth()
  const isSidebar = variant === 'sidebar'
  const isMobile = variant === 'mobile'
  const isAdminPortal = portalMode === 'admin'
  const notesEnabled = enableNotes ?? enableClientActions
  const authorName = noteAuthorName?.trim() || clientName
  const [timelineFilter, setTimelineFilter] = useState<TimelineFilter>('all')
  /** Overview vs separated activity/notes surface (mobile + sidebar). */
  const [detailSurface, setDetailSurface] = useState<'overview' | 'activity'>('overview')
  /**
   * Mobile invoice pager animation:
   * - drag: follow finger
   * - exit: slide current invoice off-screen
   * - enter: slide next invoice in
   */
  const [swipeMotion, setSwipeMotion] = useState<{
    phase: 'idle' | 'drag' | 'exit' | 'enter'
    /** Pixel offset while dragging / exiting. */
    offsetX: number
    /** Navigation direction for exit/enter transitions. */
    direction: 'prev' | 'next' | null
  }>({ phase: 'idle', offsetX: 0, direction: null })
  const swipeShellRef = useRef<HTMLDivElement>(null)
  const pendingNavRef = useRef<Invoice | null>(null)
  const swipeAnimatingRef = useRef(false)
  const onNavigateInvoiceRef = useRef(onNavigateInvoice)
  onNavigateInvoiceRef.current = onNavigateInvoice

  useEffect(() => {
    if (!isMobile) return
    if (timelineFilter === 'notes' || timelineFilter === 'send') {
      setTimelineFilter('all')
    }
  }, [isMobile, timelineFilter])
  const [showSendDocsModal, setShowSendDocsModal] = useState(false)
  const [sendRecipient, setSendRecipient] = useState('')
  const [sendMessage, setSendMessage] = useState('')
  const [sendBusy, setSendBusy] = useState(false)
  const [selectedBrokerEmailIndex, setSelectedBrokerEmailIndex] = useState<number | null>(null)
  const [sendInvoiceDocOptions, setSendInvoiceDocOptions] = useState<
    Array<{ id: string; name: string }>
  >([])
  const [sendVaultDocOptions, setSendVaultDocOptions] = useState<ClientDocument[]>([])
  const [selectedInvoiceDocIds, setSelectedInvoiceDocIds] = useState<string[]>([])
  const [selectedVaultDocIds, setSelectedVaultDocIds] = useState<string[]>([])
  const [sendError, setSendError] = useState<string | null>(null)

  const visibleInvoice = useMemo(
    () => (isAdminPortal ? invoice : toClientVisibleInvoice(invoice)),
    [invoice, isAdminPortal]
  )
  const enriched = useMemo(() => enrichInvoice(visibleInvoice), [visibleInvoice])

  useEffect(() => {
    setTimelineFilter('all')
    setDetailSurface('overview')
  }, [invoice.id])

  const invoicePayments = useMemo(
    () => payments.filter((p) => p.invoice_id === invoice.id),
    [payments, invoice.id]
  )
  const showBalanceSummary = invoicePayments.length > 0

  const shortPayment =
    invoicePayments.length > 0 ? buildShortPaymentRecord(visibleInvoice, invoicePayments) : null
  const overpayment =
    invoicePayments.length > 0 ? buildOverpaymentRecord(visibleInvoice, invoicePayments) : null

  const canWriteOff =
    capabilities.canRequestWriteOff &&
    shortPayment?.resolution === 'open' &&
    canCloseShortPaymentAsUncollectable(invoice)
  const canAcceptOver =
    overpayment?.resolution === 'open' &&
    canAcceptOverpayment(invoice, payments) &&
    !!onAcceptOverpayment

  const awaitingReceiptPayment = useMemo(
    () =>
      capabilities.canConfirmPaymentReceipt
        ? getAwaitingReceiptPaymentForInvoice(invoice.id, payments)
        : undefined,
    [capabilities.canConfirmPaymentReceipt, invoice.id, payments]
  )
  const floatPayment = useMemo(() => {
    const candidates = invoicePayments.filter(
      (p) => p.status === 'awaiting_receipt' || p.status === 'confirmed' || p.status === 'pending'
    )
    return candidates.find((p) => isPaymentInFloatWindow(p))
  }, [invoicePayments])
  const receiptDaysLeft = awaitingReceiptPayment
    ? getReceiptConfirmationDaysLeft(awaitingReceiptPayment)
    : null

  const noteEntries = getInvoiceNoteEntries(visibleInvoice, {
    includeInternal: isAdminPortal,
  })
  const openDisputes = getOpenDisputes(visibleInvoice)

  const [newNote, setNewNote] = useState('')
  const [noteVisibility, setNoteVisibility] = useState<'client' | 'internal'>('client')
  const [isAddingNote, setIsAddingNote] = useState(false)
  const [statusExtraNote, setStatusExtraNote] = useState('')
  const [statusDate, setStatusDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [statusBusy, setStatusBusy] = useState<InvoiceStatusNoteKind | null>(null)
  const [statusError, setStatusError] = useState<string | null>(null)
  const [showDisputeModal, setShowDisputeModal] = useState(false)
  const [disputeReason, setDisputeReason] = useState<string>(DISPUTE_REASON_OPTIONS[0].value)
  const [disputeDescription, setDisputeDescription] = useState('')
  const [isOpeningDispute, setIsOpeningDispute] = useState(false)
  const [disputeError, setDisputeError] = useState<string | null>(null)
  const [disputeUnderstandFloat, setDisputeUnderstandFloat] = useState(false)
  const [showPaidModal, setShowPaidModal] = useState(false)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentNote, setPaymentNote] = useState('')
  const [writeOffRemaining, setWriteOffRemaining] = useState(false)
  const [writeOffNote, setWriteOffNote] = useState('')
  const [isMarkingPaid, setIsMarkingPaid] = useState(false)
  const [paidError, setPaidError] = useState<string | null>(null)
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [isUploadingDocs, setIsUploadingDocs] = useState(false)
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null)
  const [showConfirmPaymentModal, setShowConfirmPaymentModal] = useState(false)
  const [showCloseModal, setShowCloseModal] = useState(false)
  const [showAcceptOverModal, setShowAcceptOverModal] = useState(false)
  const [isClosing, setIsClosing] = useState(false)
  const [isAcceptingOver, setIsAcceptingOver] = useState(false)

  useEffect(() => {
    setNoteVisibility('client')
    setStatusExtraNote('')
    setStatusError(null)
    setStatusDate(new Date().toISOString().slice(0, 10))
  }, [invoice.id])

  // Assistant deep-link: open upload modal once for this invoice.
  useEffect(() => {
    if (!autoOpenUpload || !enableClientActions) return
    setShowUploadModal(true)
    onAutoOpenUploadConsumed?.()
  }, [autoOpenUpload, enableClientActions, invoice.id, onAutoOpenUploadConsumed])

  const invoiceDocuments = getInvoiceDocuments(invoice.id)
  const documentCount = Math.max(invoice.documents_count || 0, invoiceDocuments.length)
  const pendingClientPosted = useMemo(
    () => getClientPostedPendingTotal(visibleInvoice.id, invoicePayments),
    [visibleInvoice.id, invoicePayments]
  )
  const canPostPaymentAction =
    capabilities.canPostPayment &&
    isPostableForPayment(visibleInvoice) &&
    visibleInvoice.status !== 'paid' &&
    !awaitingReceiptPayment &&
    pendingClientPosted <= 0

  /** Paid invoices: open the settled payment instead of posting another. */
  const settledPayment = useMemo(() => {
    if (visibleInvoice.status !== 'paid' || invoicePayments.length === 0) return undefined
    const confirmed = invoicePayments.filter((p) => p.status === 'confirmed')
    const pool = confirmed.length > 0 ? confirmed : invoicePayments
    return [...pool].sort((a, b) => {
      const aDate = a.received_date || a.payment_date || ''
      const bDate = b.received_date || b.payment_date || ''
      return bDate.localeCompare(aDate)
    })[0]
  }, [visibleInvoice.status, invoicePayments])

  const canViewPaymentAction = Boolean(settledPayment) && !isAdminPortal
  const canConfirmPaymentAction =
    Boolean(awaitingReceiptPayment) && !isAdminPortal && capabilities.canConfirmPaymentReceipt
  const canViewDocuments = documentCount > 0 && !!onViewDocuments
  const broker = useMemo(
    () => mockBrokers.find((b) => b.id === invoice.broker_id),
    [invoice.broker_id]
  )
  const brokerEmails = broker?.emails ?? []
  const canSendDocuments = isAdminPortal

  const receivedAmount = useMemo(() => {
    if (!showBalanceSummary) return 0
    return getInvoiceReceivedAmount(visibleInvoice, invoicePayments)
  }, [showBalanceSummary, visibleInvoice, invoicePayments])

  const pendingConfirmation = useMemo(() => {
    if (!showBalanceSummary) return 0
    // Client-posted pending awaits Credyx approval — not client receipt confirmation.
    const unconfirmed = getUnconfirmedPaymentTotal(visibleInvoice.id)
    return Math.max(0, unconfirmed - pendingClientPosted)
  }, [showBalanceSummary, visibleInvoice.id, pendingClientPosted])

  const pendingShortCorrection = useMemo(() => {
    if (!showBalanceSummary) return 0
    return getUnconfirmedShortPaymentTotal(visibleInvoice.id)
  }, [showBalanceSummary, visibleInvoice.id])

  /** Shortfall vs face amount, treating pending confirmation as applied.
   *  Unpaid invoices (nothing applied) are not short-paid — return 0. */
  const shortfallInclPending = useMemo(() => {
    const applied = receivedAmount + pendingConfirmation - pendingShortCorrection
    if (applied < AMOUNT_EPSILON) return 0
    return Math.max(0, visibleInvoice.amount - applied)
  }, [
    receivedAmount,
    pendingConfirmation,
    pendingShortCorrection,
    visibleInvoice.amount,
  ])

  /** Overage vs face amount when remittance exceeds invoice total. */
  const overageInclPending = useMemo(() => {
    const applied = receivedAmount + pendingConfirmation - pendingShortCorrection
    if (applied < AMOUNT_EPSILON) return 0
    return Math.max(0, applied - visibleInvoice.amount)
  }, [
    receivedAmount,
    pendingConfirmation,
    pendingShortCorrection,
    visibleInvoice.amount,
  ])

  /** Carrier-facing short-pay reason from awaiting / latest payment notes. */
  const shortPayReasonText = useMemo(() => {
    const payment =
      awaitingReceiptPayment ||
      invoicePayments.find((p) => p.notes?.trim() || p.short_pay_reason) ||
      null
    if (!payment) return null

    const notes = payment.notes?.trim()
    if (notes) {
      // Prefer the structured short-pay note Credyx stored on the payment.
      if (/^short payment/i.test(notes)) return notes
    }

    if (payment.payment_kind === 'short' || payment.short_pay_reason) {
      const reason =
        payment.short_pay_reason === 'chargeback'
          ? 'chargeback'
          : payment.short_pay_reason === 'wrong_amount'
            ? 'wrong amount'
            : 'short payment'
      const base = `Short payment — ${reason} ${formatCurrency(payment.amount)}`
      return notes && !/^short payment/i.test(notes) ? `${base}. ${notes}` : base
    }

    if (notes) return notes
    return null
  }, [awaitingReceiptPayment, invoicePayments])

  /** True when the awaiting payment is a short correction (not a full remittance). */
  const awaitingShortCorrection = Boolean(
    awaitingReceiptPayment &&
      (awaitingReceiptPayment.payment_kind === 'short' ||
        awaitingReceiptPayment.short_pay_reason)
  )
  const awaitingShortAmount = awaitingShortCorrection
    ? awaitingReceiptPayment!.amount
    : 0

  const activityEntries = useMemo((): TimelineEntry[] => {
    const entries: TimelineEntry[] = []
    for (const dispute of openDisputes) {
      entries.push({
        id: `dispute-${dispute.id}`,
        title: getDisputeReasonLabel(dispute.reason),
        detail: dispute.description,
        timestamp: dispute.created_at,
        tone: 'error',
        kind: 'dispute',
        source: 'carrier',
        meta: dispute.response?.trim()
          ? `Credyx response · ${dispute.response}`
          : undefined,
      })
    }
    for (const entry of noteEntries) {
      const typeKey = entry.type || 'note'
      if (typeKey === 'note' || typeKey === 'client_note') continue
      // Payment receipt disputes are shown once under Payments via payment.dispute.
      if (isRedundantPaymentLifecycleNote(entry.note, entry.type)) continue
      const source = noteSource(typeKey)
      entries.push({
        id: `activity-note-${entry.id}`,
        title: noteTitle(typeKey),
        detail: entry.note,
        timestamp: entry.created_at,
        tone: noteTone(typeKey),
        kind: typeKey,
        source,
        internal: entry.visibility === 'internal',
      })
    }
    return entries.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    )
  }, [openDisputes, noteEntries])

  /** Payment lifecycle + payment-related free-text notes. */
  const paymentTimelineEntries = useMemo((): TimelineEntry[] => {
    const entries: TimelineEntry[] = []

    for (const entry of noteEntries) {
      const typeKey = entry.type || 'note'
      if (typeKey !== 'note' && typeKey !== 'client_note') continue
      if (!isPaymentRelatedInvoiceNote(entry.note, entry.type)) continue
      // Already shown via structured payment / dispute activity rows.
      if (isRedundantPaymentLifecycleNote(entry.note, entry.type)) continue
      // Combined close notes are expanded inside buildClientPaymentAuditTimeline.
      if (isClosedUncollectableNote(entry.note)) continue
      const source = noteSource(typeKey, entry.created_by, entry.note)
      entries.push({
        id: `payment-note-${entry.id}`,
        title: getPaymentNoteCategoryTitle(entry.note),
        detail: entry.note,
        timestamp: entry.created_at,
        tone: 'info',
        kind: 'payment',
        source,
        internal: entry.visibility === 'internal',
      })
    }

    if (invoicePayments.length > 0) {
      for (const entry of buildClientPaymentAuditTimeline(visibleInvoice, invoicePayments)) {
        if (entry.kind !== 'activity') continue
        // Exclude invoice notes/disputes/audits — payment notes already added above.
        if (
          entry.id.startsWith('invoice-dispute-') ||
          entry.id.startsWith('audit-')
        ) {
          continue
        }
        // Typed non-payment activity notes (hold/approval) belong under Activity.
        if (
          entry.id.startsWith('note-') &&
          entry.noteKind !== 'payment' &&
          entry.noteKind !== 'client_note' &&
          entry.noteKind !== 'note'
        ) {
          continue
        }
        // Free-text payment notes already mapped above — keep split close-note rows.
        if (
          entry.noteKind === 'payment' &&
          entry.id.startsWith('note-') &&
          !entry.id.endsWith('-confirm') &&
          !entry.id.endsWith('-writeoff')
        ) {
          continue
        }
        if (
          entry.noteKind === 'payment' ||
          entry.id.startsWith('payment-') ||
          entry.id.startsWith('move-') ||
          entry.id.startsWith('reversal-') ||
          entry.id.startsWith('reject-') ||
          entry.id.startsWith('dispute-open-') ||
          entry.id.startsWith('dispute-resolved-')
        ) {
          entries.push({
            id: entry.id,
            title: entry.title,
            detail: entry.detail,
            timestamp: entry.timestamp,
            tone: entry.tone,
            kind: entry.noteKind || 'payment',
            source: entry.source,
            meta: entry.meta,
          })
        }
      }
    }

    return entries
      .filter((entry, index, all) => {
        // Drop duplicate Payment Confirmation / Write-off rows (same amount).
        if (entry.title !== 'Payment Confirmation' && entry.title !== 'Write-off') {
          return true
        }
        const money = (entry.detail.match(/\$[\d,]+(?:\.\d{2})?/)?.[0] ?? entry.detail)
          .replace(/,/g, '')
        return (
          all.findIndex(
            (other) =>
              other.title === entry.title &&
              (other.detail.match(/\$[\d,]+(?:\.\d{2})?/)?.[0] ?? other.detail).replace(
                /,/g,
                ''
              ) === money
          ) === index
        )
      })
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
  }, [noteEntries, invoicePayments, visibleInvoice])

  const noteTimelineEntries = useMemo((): TimelineEntry[] => {
    return noteEntries
      .filter((entry) => {
        const typeKey = entry.type || 'note'
        if (typeKey !== 'note' && typeKey !== 'client_note') return false
        // Payment-related notes live under the Payments tab only.
        return !isPaymentRelatedInvoiceNote(entry.note, entry.type)
      })
      .map((entry) => {
        const typeKey = entry.type || 'note'
        const source = noteSource(typeKey, entry.created_by, entry.note)
        const actionMatch = entry.note.match(/^action needed:\s*(.+)$/i)
        return {
          id: `note-${entry.id}`,
          title: actionMatch ? 'Action needed' : noteTitle(typeKey),
          detail: actionMatch ? actionMatch[1] : entry.note,
          timestamp: entry.created_at,
          tone: actionMatch ? 'warning' : noteTone(typeKey),
          kind: typeKey,
          source,
          internal: entry.visibility === 'internal',
        }
      })
  }, [noteEntries])

  const sendEntries = useMemo((): TimelineEntry[] => {
    const history = invoice.document_send_history || []
    return history.map((send, idx) => {
      const sendTone: TimelineTone =
        send.status === 'delivered'
          ? 'success'
          : send.status === 'failed'
            ? 'error'
            : 'info'
      const partLabel =
        send.part_number && send.part_total && send.part_total > 1
          ? `Part ${send.part_number} of ${send.part_total}`
          : null
      const fileCount = send.documents_sent?.length ?? 0
      return {
        id: `send-${idx}-${send.sent_at}`,
        title: partLabel ? `Document sent · ${partLabel}` : 'Document sent',
        detail: send.status
          ? `${send.email_address} · ${send.status}`
          : send.email_address,
        timestamp: send.sent_at,
        tone: sendTone,
        kind: send.status === 'failed' ? 'send_failed' : 'send',
        source: 'credyx' as NoteSource,
        meta: fileCount > 0 ? `Files: ${fileCount} attached` : send.note || undefined,
      }
    })
  }, [invoice.document_send_history])

  const allTimelineEntries = useMemo((): TimelineEntry[] => {
    return [
      ...activityEntries,
      ...noteTimelineEntries,
      ...paymentTimelineEntries,
      ...sendEntries,
    ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
  }, [activityEntries, noteTimelineEntries, paymentTimelineEntries, sendEntries])

  // Counts match the decluttered feed (hidden duplicate rows don’t inflate badges).
  const timelineFilterCounts = useMemo(() => {
    const ctx = allTimelineEntries
    return {
      all: declutterActivityEntries(allTimelineEntries, ctx).length,
      activity: declutterActivityEntries(activityEntries, ctx).length,
      notes: declutterActivityEntries(noteTimelineEntries, ctx).length,
      payments: declutterActivityEntries(paymentTimelineEntries, ctx).length,
      send: declutterActivityEntries(sendEntries, ctx).length,
    }
  }, [
    allTimelineEntries,
    activityEntries,
    noteTimelineEntries,
    paymentTimelineEntries,
    sendEntries,
  ])

  const filteredTimeline =
    timelineFilter === 'all'
      ? allTimelineEntries
      : timelineFilter === 'activity'
        ? activityEntries
        : timelineFilter === 'notes'
          ? noteTimelineEntries
          : timelineFilter === 'payments'
            ? paymentTimelineEntries
            : sendEntries

  const navIndex = navigationInvoices.findIndex((inv) => inv.id === invoice.id)
  const hasPrev = navIndex > 0
  const hasNext = navIndex >= 0 && navIndex < navigationInvoices.length - 1

  /** Apply rubber-band resistance past list edges during drag. */
  const resistSwipeOffset = (raw: number) => {
    const width = swipeShellRef.current?.clientWidth || window.innerWidth || 360
    if ((raw < 0 && !hasNext) || (raw > 0 && !hasPrev)) {
      return raw * 0.22
    }
    // Soft resistance past ~55% of width so the panel never fully leaves during drag.
    const cap = width * 0.55
    if (Math.abs(raw) <= cap) return raw
    const overflow = Math.abs(raw) - cap
    const signed = Math.sign(raw)
    return signed * (cap + overflow * 0.18)
  }

  const beginExitToInvoice = (target: Invoice, direction: 'prev' | 'next', fromOffset = 0) => {
    if (swipeAnimatingRef.current) return
    swipeAnimatingRef.current = true
    pendingNavRef.current = target
    const width = swipeShellRef.current?.clientWidth || window.innerWidth || 360
    const exitX = direction === 'next' ? -width : width
    setSwipeMotion({ phase: 'exit', offsetX: fromOffset, direction })
    // Next frame: animate from current drag position to fully off-screen.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setSwipeMotion({ phase: 'exit', offsetX: exitX, direction })
      })
    })
  }

  const goToAdjacentInvoice = (direction: 'prev' | 'next', fromOffset = 0) => {
    const target =
      direction === 'prev' && hasPrev
        ? navigationInvoices[navIndex - 1]
        : direction === 'next' && hasNext
          ? navigationInvoices[navIndex + 1]
          : null
    if (!target) return
    if (isMobile) {
      beginExitToInvoice(target, direction, fromOffset)
      return
    }
    onNavigateInvoice(target)
  }

  const anyModalOpen =
    showSendDocsModal ||
    showDisputeModal ||
    showPaidModal ||
    showUploadModal ||
    showConfirmPaymentModal ||
    showCloseModal ||
    showAcceptOverModal

  const swipeGestureEnabled =
    isMobile &&
    !anyModalOpen &&
    (swipeMotion.phase === 'idle' || swipeMotion.phase === 'drag')

  const { swipeHandlers } = useHorizontalSwipe({
    enabled: swipeGestureEnabled,
    keepOffsetOnCommit: true,
    onSwipe: ({ direction, offsetX }) => {
      const navDir = direction === 'left' ? 'next' : 'prev'
      const canGo = navDir === 'next' ? hasNext : hasPrev
      if (!canGo) {
        // Bounce back at edges.
        setSwipeMotion({ phase: 'idle', offsetX: 0, direction: null })
        return
      }
      goToAdjacentInvoice(navDir, offsetX)
    },
    onDragOffsetChange: (offset) => {
      if (offset == null) {
        // Spring back when the gesture was cancelled / below threshold.
        setSwipeMotion((prev) =>
          prev.phase === 'drag' ? { phase: 'idle', offsetX: 0, direction: null } : prev
        )
        return
      }
      setSwipeMotion({
        phase: 'drag',
        offsetX: resistSwipeOffset(offset),
        direction: offset < 0 ? 'next' : 'prev',
      })
    },
  })

  /** After exit finishes, swap invoice then run enter animation. */
  const handleSwipeTransitionEnd = (event: TransitionEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return
    if (event.propertyName !== 'transform') return

    if (swipeMotion.phase === 'exit' && pendingNavRef.current) {
      const target = pendingNavRef.current
      pendingNavRef.current = null
      const direction = swipeMotion.direction
      const width = swipeShellRef.current?.clientWidth || window.innerWidth || 360
      // Place the incoming panel just off-screen on the opposite side.
      setSwipeMotion({
        phase: 'enter',
        offsetX: direction === 'next' ? width : -width,
        direction,
      })
      onNavigateInvoiceRef.current(target)
      return
    }

    if (swipeMotion.phase === 'enter') {
      swipeAnimatingRef.current = false
      setSwipeMotion({ phase: 'idle', offsetX: 0, direction: null })
    }
  }

  // Once enter content is mounted at the off-screen offset, animate it to center.
  useEffect(() => {
    if (swipeMotion.phase !== 'enter') return
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setSwipeMotion((prev) =>
          prev.phase === 'enter' ? { ...prev, offsetX: 0 } : prev
        )
      })
    })
    return () => cancelAnimationFrame(id)
  }, [swipeMotion.phase, invoice.id])

  // Failsafe if a transitionend is missed (tab blur, reduced-motion, etc.).
  useEffect(() => {
    if (swipeMotion.phase !== 'exit' && swipeMotion.phase !== 'enter') return
    const timer = window.setTimeout(() => {
      if (pendingNavRef.current) {
        const target = pendingNavRef.current
        pendingNavRef.current = null
        onNavigateInvoiceRef.current(target)
      }
      swipeAnimatingRef.current = false
      setSwipeMotion({ phase: 'idle', offsetX: 0, direction: null })
    }, 520)
    return () => window.clearTimeout(timer)
  }, [swipeMotion.phase])

  /** Latest confirmed payment date for display (Pay date). */
  const payDate = useMemo(() => {
    const confirmed = invoicePayments.filter((p) => p.status === 'confirmed')
    if (confirmed.length === 0) return null
    let latest: string | null = null
    let latestMs = -Infinity
    for (const payment of confirmed) {
      const dateStr = payment.received_date || payment.payment_date
      const ms = new Date(dateStr).getTime()
      if (Number.isFinite(ms) && ms >= latestMs) {
        latestMs = ms
        latest = dateStr
      }
    }
    return latest
  }, [invoicePayments])

  /** Posted date on awaiting-receipt payments — shown as Pay date (pending). */
  const pendingPayDate = awaitingReceiptPayment
    ? awaitingReceiptPayment.received_date || awaitingReceiptPayment.payment_date || null
    : null

  const hasFooterActions =
    canPostPaymentAction ||
    canViewPaymentAction ||
    canConfirmPaymentAction ||
    canAcceptOver ||
    canWriteOff ||
    enableClientActions ||
    notesEnabled ||
    canSendDocuments ||
    Boolean(visibleInvoice.batch_id)

  const openSendDocumentsModal = async () => {
    setSendError(null)
    const paperwork = resolveBrokerPaperworkEmail(broker)
    if (paperwork) {
      setSendRecipient(paperwork)
      const idx = brokerEmails.findIndex((e) => e.email === paperwork)
      setSelectedBrokerEmailIndex(idx >= 0 ? idx : null)
    } else if (brokerEmails.length > 0) {
      setSendRecipient(brokerEmails[0].email)
      setSelectedBrokerEmailIndex(0)
    } else {
      setSendRecipient(broker?.email?.trim() || '')
      setSelectedBrokerEmailIndex(null)
    }
    setSendMessage('')

    const invoiceDocs = await resolveInvoiceDocumentsAsync(invoice)
    setSendInvoiceDocOptions(invoiceDocs.map((d) => ({ id: d.id, name: d.name })))
    setSelectedInvoiceDocIds(invoiceDocs.map((d) => d.id))

    const vaultDocs = getClientDocuments(invoice.client_id).filter(
      (d) => d.category === 'broker' && d.approval_status === 'approved'
    )
    setSendVaultDocOptions(vaultDocs)
    setSelectedVaultDocIds(defaultSelectedVaultDocIds(invoice.client_id))

    setShowSendDocsModal(true)
  }

  const handleSendDocuments = async () => {
    if (!sendRecipient.trim()) {
      setSendError('Enter a recipient email')
      return
    }
    if (selectedInvoiceDocIds.length === 0 && selectedVaultDocIds.length === 0) {
      setSendError('Select at least one document to attach')
      return
    }
    setSendBusy(true)
    setSendError(null)
    try {
      const result = await sendBrokerPacketForInvoice(invoice, {
        recipientEmail: sendRecipient.trim(),
        sentBy: authorName || resolved.user?.email || 'Admin',
        userId: resolved.user?.id,
        automatic: false,
        message: sendMessage,
        collectMode: 'selected',
        selectedInvoiceDocIds,
        selectedVaultDocIds,
      })
      if (!result.success) {
        setSendError(result.error ?? 'Could not send documents')
        return
      }
      const parts = result.partCount && result.partCount > 1 ? ` (${result.partCount} emails)` : ''
      const changeNote = result.remittanceChanged ? ' (remittance change flagged)' : ''
      showToast(`Documents sent to ${sendRecipient.trim()}${parts}${changeNote}`, 'success')
      setShowSendDocsModal(false)
      setTimelineFilter('send')
      onInvoiceUpdated?.()
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Could not send documents')
    } finally {
      setSendBusy(false)
    }
  }

  const handleGoToBatch = () => {
    if (!visibleInvoice.batch_id) return
    const params = new URLSearchParams({
      tab: 'view',
      batch: visibleInvoice.batch_id,
    })
    navigate(
      isAdminPortal
        ? `/batches?batch=${encodeURIComponent(visibleInvoice.batch_id)}`
        : `/client/batches?${params.toString()}`
    )
  }

  const handleUploadDocuments = async (files: File[]) => {
    if (isUploadingDocs || files.length === 0) return
    setIsUploadingDocs(true)
    try {
      const wasActionRequiredUpload = Boolean(
        getCarrierInvoiceActionRequired(invoice)?.cta === 'upload'
      )
      const updated = await uploadClientInvoiceDocuments(invoice.id, files, authorName)
      if (!updated) throw new Error('Upload failed')
      // Complete Assistant "Upload POD / missing docs" tasks for this invoice.
      markAssistantInvoiceDocsUploaded(invoice.id)

      const successMessage = wasActionRequiredUpload
        ? 'Documents uploaded. Credyx is reviewing and will advise if further action is required.'
        : `${files.length} file${files.length > 1 ? 's' : ''} uploaded — Credyx has been notified.`

      // Overview banner uses a short body; toast carries the full confirmation.
      setUploadSuccess(
        wasActionRequiredUpload
          ? 'Credyx is reviewing and will advise if further action is required.'
          : successMessage
      )
      showToast(successMessage, 'success')
      // Keep confirmation visible long enough to read on mobile overview.
      window.setTimeout(() => setUploadSuccess(null), wasActionRequiredUpload ? 12000 : 5000)
      if (isMobile) setDetailSurface('overview')
      onInvoiceUpdated?.()
    } catch (error) {
      console.error('Failed to upload documents:', error)
      showToast('Upload failed. Please try again.', 'error')
    } finally {
      setIsUploadingDocs(false)
    }
  }

  const handleAddNote = async () => {
    if (!newNote.trim() || isAddingNote) return
    setIsAddingNote(true)
    try {
      if (onAddNote) {
        await onAddNote(invoice.id, newNote.trim(), {
          visibility: isAdminPortal ? noteVisibility : 'client',
        })
      } else if (isAdminPortal) {
        addAdminInvoiceNote(invoice.id, newNote.trim(), authorName, {
          visibility: noteVisibility,
        })
      } else {
        addClientInvoiceNote(invoice.id, newNote.trim(), authorName)
      }
      setNewNote('')
      onInvoiceUpdated?.()
    } catch (error) {
      console.error('Failed to add note:', error)
    } finally {
      setIsAddingNote(false)
    }
  }

  const handlePostStatus = async (kind: InvoiceStatusNoteKind) => {
    if (statusBusy) return
    setStatusError(null)
    if ((kind === 'will_pay' || kind === 'call_back') && !statusDate) {
      setStatusError('Pick a date for Will Pay / Call Back')
      return
    }
    setStatusBusy(kind)
    try {
      const updated = postInvoiceStatusNote(invoice.id, {
        kind,
        authorName,
        collectionDate: statusDate,
        extraNote: statusExtraNote,
      })
      if (!updated) {
        setStatusError('Could not post status. Check the date and try again.')
        return
      }
      setStatusExtraNote('')
      onInvoiceUpdated?.()
    } catch (error) {
      console.error('Failed to post status note:', error)
      setStatusError('Could not post status. Please try again.')
    } finally {
      setStatusBusy(null)
    }
  }

  const handleOpenDispute = async () => {
    if (!disputeDescription.trim() || isOpeningDispute) return
    if (floatPayment && !disputeUnderstandFloat) {
      setDisputeError('Confirm that you understand payment may still be in transit before submitting.')
      return
    }
    setIsOpeningDispute(true)
    setDisputeError(null)
    try {
      if (onOpenDispute) {
        await onOpenDispute(invoice.id, disputeReason, disputeDescription.trim())
      } else {
        const updated = openClientInvoiceDispute(
          invoice.id,
          disputeReason,
          disputeDescription.trim(),
          clientName
        )
        if (!updated) {
          setDisputeError('Could not open dispute. Please try again.')
          return
        }
      }
      setShowDisputeModal(false)
      setDisputeDescription('')
      setDisputeReason(DISPUTE_REASON_OPTIONS[0].value)
      setDisputeUnderstandFloat(false)
      onInvoiceUpdated?.()
    } catch (error) {
      console.error('Failed to open dispute:', error)
      setDisputeError('Could not open dispute. Please try again.')
    } finally {
      setIsOpeningDispute(false)
    }
  }

  const handleMarkAsPaid = async () => {
    if (isMarkingPaid) return

    const amountReceived = parseFloat(paymentAmount)
    if (!Number.isFinite(amountReceived) || amountReceived <= 0) {
      setPaidError('Enter a valid amount received.')
      return
    }

    const remainingOpen = Math.max(0, invoice.amount - receivedAmount)
    const shortfallAfterPost = remainingOpen - amountReceived
    const requestingWriteOff = writeOffRemaining && shortfallAfterPost >= AMOUNT_EPSILON

    if (requestingWriteOff && !writeOffNote.trim()) {
      setPaidError('Add a note explaining why the remaining balance is uncollectable.')
      return
    }

    setIsMarkingPaid(true)
    setPaidError(null)
    try {
      const options: ClientMarkPaidOptions = {
        amountReceived,
        optionalNote: paymentNote.trim() || undefined,
      }

      if (requestingWriteOff) {
        const updated = postClientPaymentAndRequestWriteOff(
          invoice.id,
          authorName,
          { ...options, writeOffNote: writeOffNote.trim() },
          {
            canPostPayment: capabilities.canPostPayment,
            canRequestWriteOff: capabilities.canRequestWriteOff,
          }
        )
        if (!updated) {
          setPaidError(
            'Could not post payment and request write-off. Check that the invoice is open and eligible.'
          )
          return
        }
        showToast('Payment posted. Remaining balance marked uncollectable for Credyx review.', 'success')
      } else if (onMarkAsPaid) {
        await onMarkAsPaid(invoice.id, options)
      } else {
        const updated = markClientInvoiceAsPaid(invoice.id, authorName, options, {
          canPostPayment: capabilities.canPostPayment,
        })
        if (!updated) {
          setPaidError(
            'Could not post payment. Check that the invoice is open and no payment is already awaiting Credyx approval.'
          )
          return
        }
      }
      setShowPaidModal(false)
      setPaymentAmount('')
      setPaymentNote('')
      setWriteOffRemaining(false)
      setWriteOffNote('')
      onInvoiceUpdated?.()
    } catch (error) {
      console.error('Failed to post payment:', error)
      setPaidError('Could not post payment. Please try again.')
    } finally {
      setIsMarkingPaid(false)
    }
  }

  const openPaidModal = () => {
    const remaining = Math.max(0, invoice.amount - receivedAmount)
    setPaymentAmount(String(remaining > 0 ? remaining : invoice.amount))
    setPaymentNote('')
    setWriteOffRemaining(false)
    setWriteOffNote('')
    setPaidError(null)
    setShowPaidModal(true)
  }

  const handleCloseUncollectable = async (note: string) => {
    if (isClosing) return
    setIsClosing(true)
    try {
      if (onCloseAsUncollectable) {
        await onCloseAsUncollectable(invoice.id, note)
      } else {
        const updated = closeClientInvoiceAsUncollectable(
          invoice.id,
          authorName,
          { note },
          payments,
          { canRequestWriteOff: capabilities.canRequestWriteOff }
        )
        if (!updated) {
          throw new Error('Could not request write-off')
        }
      }
      onInvoiceUpdated?.()
    } finally {
      setIsClosing(false)
    }
  }

  const handleAcceptOverpayment = async (note: string) => {
    if (!onAcceptOverpayment || isAcceptingOver) return
    setIsAcceptingOver(true)
    try {
      await onAcceptOverpayment(invoice.id, note)
      onInvoiceUpdated?.()
    } finally {
      setIsAcceptingOver(false)
    }
  }

  const emptyMessage =
    timelineFilter === 'all'
      ? 'No activity or notes recorded for this invoice yet.'
      : timelineFilter === 'activity'
        ? 'No activity recorded for this invoice yet.'
        : timelineFilter === 'notes'
          ? 'No notes recorded for this invoice yet.'
          : timelineFilter === 'payments'
            ? 'No payment activity on this invoice yet.'
            : 'No documents sent yet.'

  const panelBody = (
    <>
      <header
        className={`payment-confirmation-panel__header ${
          isSidebar ? 'payment-confirmation-panel__header--sidebar' : ''
        } ${isMobile ? 'payment-confirmation-panel__header--mobile-topbar' : ''}`}
      >
        {isMobile ? (
          <button
            type="button"
            onClick={() => {
              if (detailSurface === 'activity') {
                setDetailSurface('overview')
                return
              }
              onClose()
            }}
            className="payment-confirmation-panel__icon-btn"
            aria-label={detailSurface === 'activity' ? 'Back to invoice overview' : 'Back to invoices'}
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
        ) : null}

        {isMobile ? (
          <>
            <p className="payment-confirmation-panel__mobile-top-title">
              {detailSurface === 'activity' ? 'Activity' : 'Invoice details'}
            </p>
            <div
              className="payment-confirmation-panel__mobile-pager"
              aria-label="Invoice pager"
            >
              <button
                type="button"
                className="payment-confirmation-panel__icon-btn"
                disabled={!hasPrev || swipeMotion.phase === 'exit' || swipeMotion.phase === 'enter'}
                onClick={() => goToAdjacentInvoice('prev')}
                aria-label="Previous invoice"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span
                className="payment-confirmation-panel__mobile-pager-count tabular-nums"
                style={{ color: c.secondary }}
              >
                {navIndex >= 0 ? navIndex + 1 : 1}/{navigationInvoices.length || 1}
              </span>
              <button
                type="button"
                className="payment-confirmation-panel__icon-btn"
                disabled={!hasNext || swipeMotion.phase === 'exit' || swipeMotion.phase === 'enter'}
                onClick={() => goToAdjacentInvoice('next')}
                aria-label="Next invoice"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </>
        ) : (
          <>
            {detailSurface === 'activity' ? (
              <button
                type="button"
                onClick={() => setDetailSurface('overview')}
                className="payment-confirmation-panel__icon-btn shrink-0"
                aria-label="Back to invoice overview"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            ) : null}
            <div className="payment-confirmation-panel__header-main min-w-0">
              <p className="payment-confirmation-panel__eyebrow" style={{ color: c.secondary }}>
                {detailSurface === 'activity' ? 'Activity & notes' : 'Invoice details'}
              </p>
              {detailSurface === 'activity' ? (
                <p className="payment-confirmation-panel__context-line" style={{ color: c.primary }}>
                  Invoice {visibleInvoice.invoice_number}
                  {visibleInvoice.load_number ? ` · Load ${visibleInvoice.load_number}` : ''}
                </p>
              ) : null}
            </div>

            <div className="payment-confirmation-panel__header-actions">
              <div className="payment-confirmation-panel__nav">
                <button
                  type="button"
                  className="payment-confirmation-panel__icon-btn"
                  disabled={!hasPrev}
                  onClick={() => goToAdjacentInvoice('prev')}
                  aria-label="Previous invoice"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span
                  className="payment-confirmation-panel__nav-count tabular-nums"
                  style={{ color: c.secondary }}
                >
                  {navIndex >= 0 ? navIndex + 1 : 1}/{navigationInvoices.length || 1}
                </span>
                <button
                  type="button"
                  className="payment-confirmation-panel__icon-btn"
                  disabled={!hasNext}
                  onClick={() => goToAdjacentInvoice('next')}
                  aria-label="Next invoice"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
              {onPopOut && detailSurface === 'overview' ? (
                <button
                  type="button"
                  onClick={onPopOut}
                  className="payment-confirmation-panel__icon-btn"
                  aria-label="Pop out invoice and documents"
                  title="Pop out with documents"
                >
                  <PanelRightOpen className="w-4 h-4" />
                </button>
              ) : null}
              <button
                type="button"
                onClick={onClose}
                className="payment-confirmation-panel__icon-btn"
                aria-label="Close invoice details"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </>
        )}
      </header>

      <div className="payment-confirmation-panel__body">
        <div
          className="payment-confirmation-panel__mobile-surface-tabs"
          role="tablist"
          aria-label="Invoice detail views"
        >
          <button
            type="button"
            role="tab"
            aria-selected={detailSurface === 'overview'}
            className={`payment-confirmation-panel__mobile-surface-tab${
              detailSurface === 'overview'
                ? ' payment-confirmation-panel__mobile-surface-tab--active'
                : ''
            }`}
            onClick={() => setDetailSurface('overview')}
          >
            Overview
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={detailSurface === 'activity'}
            className={`payment-confirmation-panel__mobile-surface-tab${
              detailSurface === 'activity'
                ? ' payment-confirmation-panel__mobile-surface-tab--active'
                : ''
            }`}
            onClick={() => setDetailSurface('activity')}
          >
            Activity
            {allTimelineEntries.length > 0 ? (
              <span className="payment-confirmation-panel__mobile-surface-tab-count">
                {allTimelineEntries.length}
              </span>
            ) : null}
          </button>
        </div>

        {detailSurface === 'overview' ? (
          <MobileInvoiceOverview
            invoice={visibleInvoice}
            enriched={enriched}
            payDate={payDate}
            pendingPayDate={pendingPayDate}
            receiptDaysLeft={receiptDaysLeft}
            hasAwaitingReceipt={Boolean(awaitingReceiptPayment)}
            awaitingReceiptAmount={awaitingReceiptPayment?.amount ?? null}
            activityCount={allTimelineEntries.length}
            documentCount={documentCount}
            uploadConfirmation={uploadSuccess}
            shortfallAmount={shortfallInclPending}
            shortPayReason={shortPayReasonText}
            overageAmount={overageInclPending}
            awaitingShortAmount={awaitingShortAmount}
            onOpenActivity={() => setDetailSurface('activity')}
            onConfirmPayment={
              canConfirmPaymentAction
                ? () => setShowConfirmPaymentModal(true)
                : undefined
            }
            onViewDocuments={canViewDocuments ? onViewDocuments : undefined}
            onUploadDocuments={
              enableClientActions ? () => setShowUploadModal(true) : undefined
            }
          />
        ) : (
          <section
            className={`payment-confirmation-panel__notes ${
              isMobile
                ? 'payment-confirmation-panel__notes--mobile-surface'
                : 'payment-confirmation-panel__notes--sidebar-surface payment-confirmation-panel__notes--sidebar-matches-mobile'
            }`}
          >
            <div className="payment-confirmation-panel__notes-head">
              <div
                className="payment-confirmation-panel__notes-filters payment-confirmation-panel__notes-filters--segmented"
                role="group"
                aria-label="Filter timeline"
              >
                {(
                  [
                    ['all', 'All', timelineFilterCounts.all],
                    ['activity', 'Activity', timelineFilterCounts.activity],
                    ['payments', 'Payments', timelineFilterCounts.payments],
                  ] as const
                ).map(([key, label, count]) => (
                  <button
                    key={key}
                    type="button"
                    className={`payment-confirmation-panel__notes-filter ${
                      timelineFilter === key
                        ? 'payment-confirmation-panel__notes-filter--active'
                        : ''
                    }`}
                    onClick={() => setTimelineFilter(key)}
                    aria-pressed={timelineFilter === key}
                  >
                    {label}
                    {count > 0 && (
                      <span className="payment-confirmation-panel__notes-filter-count">
                        {count}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {isAdminPortal && notesEnabled && !isMobile && (
            <div
              className="invoice-admin-status-actions"
              style={{ borderColor: c.border, backgroundColor: c.card }}
            >
              <div className="invoice-admin-status-actions__head">
                <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: c.secondary }}>
                  Status notes
                </p>
                <p className="text-[10px]" style={{ color: c.mutedLight }}>
                  Carrier can see these · updates Will Pay / Call Back internally
                </p>
              </div>
              <div className="invoice-admin-status-actions__row">
                <label className="invoice-admin-status-actions__date">
                  <span>Date</span>
                  <input
                    type="date"
                    value={statusDate}
                    onChange={(e) => setStatusDate(e.target.value)}
                    className="client-input"
                  />
                </label>
                <input
                  type="text"
                  value={statusExtraNote}
                  onChange={(e) => setStatusExtraNote(e.target.value)}
                  placeholder="Optional note for carrier…"
                  className="client-input invoice-admin-status-actions__extra"
                />
              </div>
              <div className="invoice-admin-status-actions__btns">
                <button
                  type="button"
                  className="dashboard-btn-secondary !py-1 !px-2 !text-xs"
                  disabled={statusBusy !== null}
                  onClick={() => void handlePostStatus('will_pay')}
                >
                  {statusBusy === 'will_pay' ? 'Saving…' : 'Will Pay'}
                </button>
                <button
                  type="button"
                  className="dashboard-btn-secondary !py-1 !px-2 !text-xs"
                  disabled={statusBusy !== null}
                  onClick={() => void handlePostStatus('call_back')}
                >
                  {statusBusy === 'call_back' ? 'Saving…' : 'Call Back'}
                </button>
                <button
                  type="button"
                  className="dashboard-btn-secondary !py-1 !px-2 !text-xs"
                  disabled={statusBusy !== null}
                  onClick={() => void handlePostStatus('payment_confirmed')}
                >
                  {statusBusy === 'payment_confirmed' ? 'Saving…' : 'Payment confirmed'}
                </button>
              </div>
              {statusError && (
                <p className="text-[11px]" style={{ color: c.error }}>
                  {statusError}
                </p>
              )}
            </div>
          )}

            <div className="payment-confirmation-panel__notes-scroll">
              <InvoiceActivityNoteList
                entries={filteredTimeline}
                contextEntries={allTimelineEntries}
                emptyMessage={emptyMessage}
                emptyColor={c.mutedLight}
              />
            </div>

            {notesEnabled && (
              <InvoiceNoteCompose
                newNote={newNote}
                isAddingNote={isAddingNote}
                onChange={setNewNote}
                onSubmit={handleAddNote}
                compact={!isMobile}
                collapsible={!isMobile}
                mobileEasy={isMobile}
                allowInternal={isAdminPortal}
                visibility={noteVisibility}
                onVisibilityChange={setNoteVisibility}
              />
            )}
          </section>
        )}
      </div>

      {hasFooterActions ? (
        <footer
          className={`payment-confirmation-panel__footer shrink-0${
            isMobile ? ' payment-confirmation-panel__footer--mobile' : ''
          }`}
          style={{ borderColor: c.border }}
        >
          <div className="flex flex-wrap gap-2 w-full">
            {canConfirmPaymentAction && awaitingReceiptPayment && (
              <button
                type="button"
                onClick={() => setShowConfirmPaymentModal(true)}
                className="confirm-payment-receipt-modal__confirm-btn payment-confirmation-panel__footer-confirm flex-1 min-w-0 inline-flex items-center justify-center gap-1.5"
              >
                <CircleCheck className="w-3 h-3 shrink-0" />
                <span>Confirm</span>
              </button>
            )}
            {canViewPaymentAction && settledPayment && (
              <button
                type="button"
                onClick={() =>
                  navigate(
                    `/client/payments?paymentId=${encodeURIComponent(settledPayment.id)}`
                  )
                }
                className="dashboard-btn-primary flex-1 min-w-[120px] inline-flex items-center justify-center gap-1.5 payment-confirmation-panel__footer-primary"
              >
                <DollarSign className="w-4 h-4" />
                View payment
              </button>
            )}
            {canPostPaymentAction && (
              <button
                type="button"
                onClick={openPaidModal}
                className="dashboard-btn-primary flex-1 min-w-[110px] inline-flex items-center justify-center gap-1.5 payment-confirmation-panel__footer-primary"
              >
                <DollarSign className="w-4 h-4" />
                Post payment
              </button>
            )}
            {canAcceptOver && (
              <button
                type="button"
                onClick={() => setShowAcceptOverModal(true)}
                className="dashboard-btn-primary flex-1 min-w-[120px] inline-flex items-center justify-center gap-1.5"
              >
                <CircleCheck className="w-4 h-4" />
                Accept overpay
              </button>
            )}
            {canWriteOff && (
              <button
                type="button"
                onClick={() => setShowCloseModal(true)}
                className="dashboard-btn-secondary flex-1 min-w-[100px] inline-flex items-center justify-center gap-1.5"
                style={{ color: c.error, borderColor: c.error }}
              >
                <Ban className="w-4 h-4" />
                Write off
              </button>
            )}
            {enableClientActions && (
              <button
                type="button"
                onClick={() => setShowDisputeModal(true)}
                className="dashboard-btn-secondary flex-1 min-w-[90px] inline-flex items-center justify-center gap-1.5 payment-confirmation-panel__footer-dispute"
                style={{ color: c.error, borderColor: c.error }}
              >
                <AlertTriangle className="w-4 h-4" />
                Dispute
              </button>
            )}
            {enableClientActions && (
              <button
                type="button"
                onClick={() => setShowUploadModal(true)}
                className="dashboard-btn-secondary flex-1 min-w-[90px] inline-flex items-center justify-center gap-1.5"
              >
                <Upload className="w-4 h-4" />
                {isMobile ? 'Upload docs' : 'Upload'}
              </button>
            )}
            {canSendDocuments && !isMobile && (
              <button
                type="button"
                onClick={() => void openSendDocumentsModal()}
                className="dashboard-btn-primary flex-1 min-w-[110px] inline-flex items-center justify-center gap-1.5"
              >
                <Mail className="w-4 h-4" />
                Send docs
              </button>
            )}
            {visibleInvoice.batch_id && !isMobile ? (
              <button
                type="button"
                onClick={handleGoToBatch}
                className="dashboard-btn-secondary flex-1 min-w-[110px] inline-flex items-center justify-center gap-1.5"
              >
                <Boxes className="w-4 h-4" />
                Go to batch
              </button>
            ) : null}
          </div>
        </footer>
      ) : null}

      {showSendDocsModal && (
        <div
          className="invoice-dispute-modal-overlay"
          onClick={() => !sendBusy && setShowSendDocsModal(false)}
          role="presentation"
        >
          <div
            className="invoice-dispute-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-labelledby="send-docs-modal-title"
          >
            <div className="invoice-dispute-modal-header">
              <h3 id="send-docs-modal-title" className="text-base font-semibold" style={{ color: c.primary }}>
                Send documents
              </h3>
              <button
                type="button"
                onClick={() => setShowSendDocsModal(false)}
                disabled={sendBusy}
                className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
                style={{ color: c.secondary }}
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="invoice-dispute-modal-body space-y-3">
              <p className="text-sm" style={{ color: c.secondary }}>
                Invoice {visibleInvoice.invoice_number}
                {visibleInvoice.load_number ? ` · Load ${visibleInvoice.load_number}` : ''}
                {documentCount > 0 ? ` · ${documentCount} file(s)` : ''}
              </p>
              <p className="text-[11px]" style={{ color: c.mutedLight }}>
                Sends the broker packet template with invoice docs and broker vault attachments.
              </p>

              {brokerEmails.length > 0 ? (
                <label className="block">
                  <span className="client-label" style={{ color: c.secondary }}>
                    Broker email
                  </span>
                  <select
                    className="client-input w-full"
                    value={selectedBrokerEmailIndex !== null ? String(selectedBrokerEmailIndex) : ''}
                    onChange={(e) => {
                      const idx = Number(e.target.value)
                      if (Number.isNaN(idx) || !brokerEmails[idx]) return
                      setSelectedBrokerEmailIndex(idx)
                      setSendRecipient(brokerEmails[idx].email)
                    }}
                  >
                    {brokerEmails.map((entry, idx) => (
                      <option key={`${entry.email}-${idx}`} value={idx}>
                        {entry.email}
                        {entry.category ? ` (${entry.category})` : ''}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              <label className="block">
                <span className="client-label" style={{ color: c.secondary }}>
                  Recipient
                </span>
                <input
                  type="email"
                  value={sendRecipient}
                  onChange={(e) => {
                    setSendRecipient(e.target.value)
                    setSelectedBrokerEmailIndex(null)
                  }}
                  className="client-input w-full"
                  placeholder="broker@example.com"
                  autoComplete="email"
                />
              </label>

              <label className="block">
                <span className="client-label" style={{ color: c.secondary }}>
                  Extra message (optional)
                </span>
                <textarea
                  value={sendMessage}
                  onChange={(e) => setSendMessage(e.target.value)}
                  rows={3}
                  className="client-input w-full"
                  placeholder="Optional note for the broker…"
                />
              </label>

              <div className="block">
                <span className="client-label" style={{ color: c.secondary }}>
                  Invoice documents
                </span>
                <div
                  className="mt-1.5 max-h-36 overflow-y-auto rounded-lg border px-2 py-1.5 space-y-1"
                  style={{ borderColor: c.border }}
                >
                  {sendInvoiceDocOptions.length === 0 ? (
                    <p className="text-xs py-1" style={{ color: c.secondary }}>
                      No invoice documents found
                    </p>
                  ) : (
                    sendInvoiceDocOptions.map((doc) => (
                      <label
                        key={doc.id}
                        className="flex items-start gap-2 text-sm cursor-pointer py-0.5"
                        style={{ color: c.primary }}
                      >
                        <input
                          type="checkbox"
                          className="mt-0.5"
                          checked={selectedInvoiceDocIds.includes(doc.id)}
                          onChange={(e) => {
                            setSelectedInvoiceDocIds((prev) =>
                              e.target.checked
                                ? [...prev, doc.id]
                                : prev.filter((id) => id !== doc.id)
                            )
                          }}
                        />
                        <span className="leading-snug">{doc.name}</span>
                      </label>
                    ))
                  )}
                </div>
              </div>

              <div className="block">
                <span className="client-label" style={{ color: c.secondary }}>
                  Vault documents (broker)
                </span>
                <div
                  className="mt-1.5 max-h-40 overflow-y-auto rounded-lg border px-2 py-1.5 space-y-1"
                  style={{ borderColor: c.border }}
                >
                  {sendVaultDocOptions.length === 0 ? (
                    <p className="text-xs py-1" style={{ color: c.secondary }}>
                      No broker vault docs — upload a voided check or bank letter in Documents
                    </p>
                  ) : (
                    sendVaultDocOptions.map((doc) => (
                      <label
                        key={doc.id}
                        className="flex items-start gap-2 text-sm cursor-pointer py-0.5"
                        style={{ color: c.primary }}
                      >
                        <input
                          type="checkbox"
                          className="mt-0.5"
                          checked={selectedVaultDocIds.includes(doc.id)}
                          onChange={(e) => {
                            setSelectedVaultDocIds((prev) =>
                              e.target.checked
                                ? [...prev, doc.id]
                                : prev.filter((id) => id !== doc.id)
                            )
                          }}
                        />
                        <span className="leading-snug">{formatVaultDocPickerLabel(doc)}</span>
                      </label>
                    ))
                  )}
                </div>
                {!selectionHasBankProof(selectedVaultDocIds, invoice.client_id) ? (
                  <p className="text-xs mt-1.5" style={{ color: c.warning ?? '#b45309' }}>
                    No voided check or bank letter selected — broker won’t get bank verification with
                    this send.
                  </p>
                ) : null}
              </div>

              {sendError ? (
                <p className="text-sm" style={{ color: c.error }}>
                  {sendError}
                </p>
              ) : null}
            </div>
            <div className="invoice-dispute-modal-footer">
              <button
                type="button"
                onClick={() => setShowSendDocsModal(false)}
                disabled={sendBusy}
                className="dashboard-btn-secondary"
                style={{ height: 36, fontSize: 13 }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleSendDocuments()}
                disabled={sendBusy}
                className="dashboard-btn-primary inline-flex items-center gap-1.5"
                style={{ height: 36, fontSize: 13 }}
              >
                <Mail className="w-3.5 h-3.5" />
                {sendBusy ? 'Sending…' : 'Send documents'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showConfirmPaymentModal && awaitingReceiptPayment && (
        <ConfirmPaymentReceiptModal
          payment={awaitingReceiptPayment}
          clientName={authorName}
          invoiceAmount={visibleInvoice.amount}
          onClose={() => setShowConfirmPaymentModal(false)}
          onUpdated={() => {
            onInvoiceUpdated?.()
            showToast('Payment confirmed. Thank you.', 'success')
          }}
        />
      )}

      {showUploadModal && (
        <InvoiceDocumentUploadModal
          isOpen={showUploadModal}
          invoiceNumber={invoice.invoice_number}
          onClose={() => setShowUploadModal(false)}
          onUpload={handleUploadDocuments}
        />
      )}

      {showPaidModal && (
        <div
          className="invoice-dispute-modal-overlay"
          onClick={() => !isMarkingPaid && setShowPaidModal(false)}
          role="presentation"
        >
          <div
            className="invoice-dispute-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-labelledby="paid-modal-title"
          >
            <div className="invoice-dispute-modal-header">
              <h3 id="paid-modal-title" className="text-base font-semibold" style={{ color: c.primary }}>
                Post payment
              </h3>
              <button
                type="button"
                onClick={() => setShowPaidModal(false)}
                className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
                style={{ color: c.secondary }}
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="invoice-dispute-modal-body">
              {(() => {
                const remainingOpen = Math.max(0, invoice.amount - receivedAmount)
                const amountNum = parseFloat(paymentAmount)
                const hasValidAmount = Number.isFinite(amountNum) && amountNum > 0
                const shortfallAfterPost =
                  hasValidAmount && amountNum < remainingOpen - AMOUNT_EPSILON
                    ? remainingOpen - amountNum
                    : 0
                const canOfferWriteOff =
                  capabilities.canRequestWriteOff &&
                  canCloseShortPaymentAsUncollectable(invoice) &&
                  shortfallAfterPost >= AMOUNT_EPSILON

                return (
                  <>
                    <p className="text-sm mb-4" style={{ color: c.secondary }}>
                      Post payment for {invoice.invoice_number}. Invoice amount{' '}
                      <strong style={{ color: c.primary }}>{formatCurrency(invoice.amount)}</strong>
                      {remainingOpen > 0 && remainingOpen < invoice.amount - AMOUNT_EPSILON && (
                        <>
                          {' '}
                          · Open balance{' '}
                          <strong style={{ color: c.primary }}>{formatCurrency(remainingOpen)}</strong>
                        </>
                      )}
                      . Credyx will be notified and must approve before the payment is final.
                    </p>
                    <label className="client-label" htmlFor="paid-amount-received">
                      Amount received
                    </label>
                    <input
                      id="paid-amount-received"
                      type="number"
                      min="0"
                      step="0.01"
                      value={paymentAmount}
                      onChange={(e) => {
                        setPaymentAmount(e.target.value)
                        // Clear write-off if the amount no longer creates a shortfall.
                        const next = parseFloat(e.target.value)
                        if (
                          !Number.isFinite(next) ||
                          next >= remainingOpen - AMOUNT_EPSILON
                        ) {
                          setWriteOffRemaining(false)
                          setWriteOffNote('')
                        }
                      }}
                      className="client-input w-full mb-4 tabular-nums"
                    />
                    {hasValidAmount && Math.abs(amountNum - remainingOpen) >= AMOUNT_EPSILON && (
                      <p className="text-xs mb-4" style={{ color: c.secondary }}>
                        {amountNum < remainingOpen
                          ? `Short by ${formatCurrency(remainingOpen - amountNum)}`
                          : `Over by ${formatCurrency(amountNum - remainingOpen)}`}
                      </p>
                    )}
                    <label className="client-label" htmlFor="paid-note">
                      Note (optional)
                    </label>
                    <textarea
                      id="paid-note"
                      value={paymentNote}
                      onChange={(e) => setPaymentNote(e.target.value)}
                      placeholder="Why the amount differs, check number, etc."
                      rows={3}
                      className="client-input w-full"
                    />

                    {canOfferWriteOff && (
                      <div
                        className="mt-4 rounded-lg border px-3 py-3 space-y-3"
                        style={{ borderColor: c.border, backgroundColor: c.stat?.red ?? '#FEF2F2' }}
                      >
                        <label className="flex items-start gap-2.5 cursor-pointer">
                          <input
                            type="checkbox"
                            className="mt-1"
                            checked={writeOffRemaining}
                            onChange={(e) => {
                              setWriteOffRemaining(e.target.checked)
                              if (!e.target.checked) setWriteOffNote('')
                              setPaidError(null)
                            }}
                          />
                          <span className="text-sm" style={{ color: c.primary }}>
                            Write off remaining{' '}
                            <strong>{formatCurrency(shortfallAfterPost)}</strong> as uncollectable
                          </span>
                        </label>
                        {writeOffRemaining && (
                          <>
                            <p className="text-xs leading-relaxed" style={{ color: c.error }}>
                              This remaining balance will be marked as uncollectable and sent to Credyx
                              for write-off approval. You will not continue chasing this amount.
                            </p>
                            <label className="client-label" htmlFor="paid-writeoff-note">
                              Why is this uncollectable? (required)
                            </label>
                            <textarea
                              id="paid-writeoff-note"
                              value={writeOffNote}
                              onChange={(e) => setWriteOffNote(e.target.value)}
                              placeholder="e.g. Broker refused detention — accepting short pay."
                              rows={3}
                              className="client-input w-full"
                            />
                          </>
                        )}
                      </div>
                    )}

                    {paidError && (
                      <p className="text-sm mt-2" style={{ color: '#DC2626' }}>
                        {paidError}
                      </p>
                    )}
                  </>
                )
              })()}
            </div>
            <div className="invoice-dispute-modal-footer">
              <button
                type="button"
                onClick={() => setShowPaidModal(false)}
                className="dashboard-btn-secondary"
                style={{ height: 36, fontSize: 13 }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleMarkAsPaid}
                disabled={isMarkingPaid || (writeOffRemaining && !writeOffNote.trim())}
                className="dashboard-btn-primary"
                style={{ height: 36, fontSize: 13 }}
              >
                {isMarkingPaid
                  ? writeOffRemaining
                    ? 'Posting…'
                    : 'Posting...'
                  : writeOffRemaining
                    ? 'Post & write off'
                    : 'Post payment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showCloseModal && shortPayment && (
        <ShortPaymentCloseModal
          isOpen={showCloseModal}
          invoiceNumber={invoice.invoice_number}
          invoiceAmount={shortPayment.invoice_amount}
          receivedAmount={shortPayment.received_amount}
          shortfallAmount={shortPayment.shortfall_amount}
          onClose={() => setShowCloseModal(false)}
          onConfirm={handleCloseUncollectable}
        />
      )}

      {showAcceptOverModal && overpayment && onAcceptOverpayment && (
        <OverpaymentAcceptModal
          isOpen={showAcceptOverModal}
          invoiceNumber={invoice.invoice_number}
          invoiceAmount={overpayment.invoice_amount}
          receivedAmount={overpayment.received_amount}
          overageAmount={overpayment.overage_amount}
          onClose={() => setShowAcceptOverModal(false)}
          onConfirm={handleAcceptOverpayment}
        />
      )}

      {showDisputeModal && (
        <div
          className="invoice-dispute-modal-overlay"
          onClick={() => !isOpeningDispute && setShowDisputeModal(false)}
          role="presentation"
        >
          <div
            className="invoice-dispute-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-labelledby="dispute-modal-title"
          >
            <div className="invoice-dispute-modal-header">
              <h3
                id="dispute-modal-title"
                className="text-base font-semibold"
                style={{ color: c.primary }}
              >
                Open Dispute
              </h3>
              <button
                type="button"
                onClick={() => setShowDisputeModal(false)}
                className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
                style={{ color: c.secondary }}
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="invoice-dispute-modal-body">
              <p className="text-sm mb-4" style={{ color: c.secondary }}>
                Tell us what is wrong with this invoice. Credyx will review and follow up with the
                broker if needed.
              </p>
              {floatPayment && (
                <div
                  className="mb-4 p-3 rounded border text-sm"
                  style={{ borderColor: c.border, backgroundColor: c.stat?.amber ?? '#fef3c7', color: c.primary }}
                >
                  <p className="font-medium mb-1">Payment may still be in transit</p>
                  <p className="text-xs mb-2" style={{ color: c.secondary }}>
                    {getPaymentTimingInfo(floatPayment.payment_method).disputeWarning}
                  </p>
                  <label className="inline-flex items-start gap-2 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={disputeUnderstandFloat}
                      onChange={(e) => setDisputeUnderstandFloat(e.target.checked)}
                      className="mt-0.5"
                    />
                    <span>I understand and still want to submit this dispute</span>
                  </label>
                </div>
              )}
              <label className="client-label">Reason</label>
              <select
                value={disputeReason}
                onChange={(e) => setDisputeReason(e.target.value)}
                className="client-input w-full mb-4"
              >
                {DISPUTE_REASON_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <label className="client-label">Description</label>
              <textarea
                value={disputeDescription}
                onChange={(e) => setDisputeDescription(e.target.value)}
                placeholder="Describe the issue in detail..."
                rows={4}
                className="client-input w-full"
              />
              {disputeError && (
                <p className="text-sm mt-2" style={{ color: '#DC2626' }}>
                  {disputeError}
                </p>
              )}
            </div>
            <div className="invoice-dispute-modal-footer">
              <button
                type="button"
                onClick={() => setShowDisputeModal(false)}
                className="dashboard-btn-secondary"
                style={{ height: 36, fontSize: 13 }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleOpenDispute}
                disabled={
                  !disputeDescription.trim() ||
                  isOpeningDispute ||
                  (Boolean(floatPayment) && !disputeUnderstandFloat)
                }
                className="dashboard-btn-primary"
                style={{ height: 36, fontSize: 13 }}
              >
                {isOpeningDispute ? 'Submitting...' : 'Submit Dispute'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )

  if (variant === 'mobile') {
    const isDragging = swipeMotion.phase === 'drag'
    const isSliding = swipeMotion.phase === 'exit' || swipeMotion.phase === 'enter'
    const width = swipeShellRef.current?.clientWidth || 360
    const dragProgress = isDragging
      ? Math.min(1, Math.abs(swipeMotion.offsetX) / Math.max(1, width * 0.35))
      : 0
    // Skip transition while placing the incoming panel off-screen.
    const skipTransition =
      isDragging || (swipeMotion.phase === 'enter' && Math.abs(swipeMotion.offsetX) > 8)

    return (
      <div
        ref={swipeShellRef}
        className={`payment-confirmation-panel payment-confirmation-panel--mobile payment-confirmation-panel--swipeable flex flex-col min-h-0 flex-1 overflow-hidden${
          isDragging ? ' payment-confirmation-panel--swiping' : ''
        }${isSliding ? ' payment-confirmation-panel--slide-animating' : ''}`}
        {...swipeHandlers}
        role="region"
        aria-label={`Invoice details for ${visibleInvoice.invoice_number}. Swipe left or right to change invoice.`}
        data-onboard-target="invoiceDetail"
      >
        <div
          className="payment-confirmation-panel__swipe-sheet flex flex-col min-h-0 flex-1"
          onTransitionEnd={handleSwipeTransitionEnd}
          style={{
            transform: `translate3d(${swipeMotion.offsetX}px, 0, 0)`,
            opacity: isDragging ? 1 - dragProgress * 0.08 : 1,
            transition: skipTransition
              ? 'none'
              : 'transform 320ms cubic-bezier(0.22, 1, 0.36, 1), opacity 320ms cubic-bezier(0.22, 1, 0.36, 1)',
          }}
        >
          {panelBody}
        </div>
      </div>
    )
  }

  return (
    <div
      className="payment-confirmation-panel payment-confirmation-panel--sidebar flex flex-col min-h-0 h-full overflow-hidden"
      style={{ backgroundColor: c.card }}
      role="region"
      aria-label={`Invoice details for ${visibleInvoice.invoice_number}`}
      data-onboard-target="invoiceDetail"
    >
      {panelBody}
    </div>
  )
}

// Re-export shared helpers for consumers that previously imported from the workspace.
export {
  NOTE_TYPE_LABELS,
  getInvoiceNoteEntries,
  getInvoiceNotice,
  InvoiceNoteCompose,
  InvoiceNotesTimeline,
  getInvoiceStatusBadge,
  getInvoiceRowStatusBadge,
  InvoiceDisputeBadges,
} from './invoiceDetailShared'
