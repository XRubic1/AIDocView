import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  X,
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
  Eye,
  AlertTriangle,
  CircleCheck,
  Upload,
  Ban,
  DollarSign,
  Boxes,
  PanelRightOpen,
} from 'lucide-react'
import type { Invoice } from '../../types/invoice'
import type { Payment } from '../../types/payment'
import { formatCurrency, formatDate } from '../../utils/format'
import {
  addClientInvoiceNote,
  openClientInvoiceDispute,
  markClientInvoiceAsPaid,
  uploadClientInvoiceDocuments,
  getOpenDisputes,
  getDisputeReasonLabel,
  DISPUTE_REASON_OPTIONS,
  type ClientMarkPaidOptions,
} from '../../services/clientInvoiceActions'
import {
  addAdminInvoiceNote,
  collectionStatusLabel,
  postInvoiceStatusNote,
  type InvoiceStatusNoteKind,
} from '../../services/adminInvoiceNoteActions'
import { getInvoiceDocuments } from '../../services/invoiceDocumentStore'
import InvoiceDocumentUploadModal from './InvoiceDocumentUploadModal'
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
  getDaysOutstandingColor,
  getDisplayInvoiceAgeDays,
  isOpenArInvoice,
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
  getClientDisplayBalanceState,
  getClientPostedPendingTotal,
  getInvoiceReceivedAmount,
} from '../../utils/paymentVariance'
import {
  getUnconfirmedPaymentTotal,
  getUnconfirmedShortPaymentTotal,
} from '../../data/mockPayments'
import InvoiceBalanceSummary from './InvoiceBalanceSummary'
import {
  NOTE_TYPE_LABELS,
  getInvoiceNoteEntries,
  getInvoiceNotice,
  getInvoiceRowStatusBadge,
  InvoiceNoteCompose,
} from './invoiceDetailShared'

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

const SUMMARY_TONE_BY_STATUS: Record<string, string> = {
  paid: 'payment-confirmation-panel__summary--confirmed',
  approved: 'payment-confirmation-panel__summary--neutral',
  hold: 'payment-confirmation-panel__summary--awaiting',
  pending: 'payment-confirmation-panel__summary--pending',
  overdue: 'payment-confirmation-panel__summary--disputed',
  rejected: 'payment-confirmation-panel__summary--rejected',
  force_closed: 'payment-confirmation-panel__summary--rejected',
  written_off: 'payment-confirmation-panel__summary--neutral',
}

function noteTone(type?: string): TimelineTone {
  switch (type) {
    case 'approval':
    case 'status_update':
      return 'success'
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

function formatNoteMeta(author?: string): string | undefined {
  const name = author?.trim()
  return name || undefined
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
  onViewPayment?: (paymentId: string) => void
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
  onViewPayment,
  enableClientActions = true,
  portalMode = 'client',
  enableNotes,
  noteAuthorName,
  onPopOut,
}: InvoiceDetailPanelProps) {
  const c = useClientTheme()
  const navigate = useNavigate()
  const { capabilities } = useClientCapabilities()
  const isSidebar = variant === 'sidebar'
  const isMobile = variant === 'mobile'
  const isAdminPortal = portalMode === 'admin'
  const notesEnabled = enableNotes ?? enableClientActions
  const authorName = noteAuthorName?.trim() || clientName
  const [timelineFilter, setTimelineFilter] = useState<TimelineFilter>('all')

  const visibleInvoice = useMemo(
    () => (isAdminPortal ? invoice : toClientVisibleInvoice(invoice)),
    [invoice, isAdminPortal]
  )
  const enriched = useMemo(() => enrichInvoice(visibleInvoice), [visibleInvoice])

  useEffect(() => {
    setTimelineFilter('all')
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
    canCloseShortPaymentAsUncollectable(invoice) &&
    !!onCloseAsUncollectable
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
  const collectionLabel = collectionStatusLabel(invoice.collection_status)

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
  const [isMarkingPaid, setIsMarkingPaid] = useState(false)
  const [paidError, setPaidError] = useState<string | null>(null)
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [isUploadingDocs, setIsUploadingDocs] = useState(false)
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null)
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

  const invoiceDocuments = getInvoiceDocuments(invoice.id)
  const documentCount = Math.max(invoice.documents_count || 0, invoiceDocuments.length)
  const pendingClientPosted = useMemo(
    () => getClientPostedPendingTotal(visibleInvoice.id, invoicePayments),
    [visibleInvoice.id, invoicePayments]
  )
  const canPostPaymentAction =
    capabilities.canPostPayment &&
    isPostableForPayment(visibleInvoice) &&
    pendingClientPosted <= 0
  const canViewDocuments = documentCount > 0 && !!onViewDocuments

  const notice = getInvoiceNotice(
    visibleInvoice,
    enriched,
    openDisputes.length,
    capabilities.hasForceClose
  )

  const receivedAmount = useMemo(() => {
    if (!showBalanceSummary) return 0
    return getInvoiceReceivedAmount(visibleInvoice, invoicePayments)
  }, [showBalanceSummary, visibleInvoice, invoicePayments])

  const balanceState = useMemo(
    () =>
      getClientDisplayBalanceState(
        visibleInvoice.amount,
        receivedAmount,
        pendingClientPosted
      ),
    [visibleInvoice.amount, receivedAmount, pendingClientPosted]
  )

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
        meta: formatNoteMeta(entry.created_by),
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
        meta: formatNoteMeta(entry.created_by),
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
        return {
          id: `note-${entry.id}`,
          title: noteTitle(typeKey),
          detail: entry.note,
          timestamp: entry.created_at,
          tone: noteTone(typeKey),
          kind: typeKey,
          source,
          meta: formatNoteMeta(entry.created_by),
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
      return {
        id: `send-${idx}-${send.sent_at}`,
        title: 'Document sent',
        detail: send.status
          ? `${send.email_address} · ${send.status}`
          : send.email_address,
        timestamp: send.sent_at,
        tone: sendTone,
        kind: send.status === 'failed' ? 'send_failed' : 'send',
        source: 'credyx' as NoteSource,
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

  const summaryToneClass =
    SUMMARY_TONE_BY_STATUS[enriched.displayStatus || invoice.status] ||
    (enriched.isOverdue
      ? 'payment-confirmation-panel__summary--disputed'
      : 'payment-confirmation-panel__summary--neutral')

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

  /**
   * Invoice calendar age — freezes on pay date once the invoice is paid
   * so age no longer increases after settlement.
   */
  const invoiceAgeLabel = useMemo(() => {
    const days = getDisplayInvoiceAgeDays(visibleInvoice, { payDate })
    return `${days}d`
  }, [visibleInvoice, payDate])

  const hasFooterActions =
    Boolean(awaitingReceiptPayment && onViewPayment) ||
    canPostPaymentAction ||
    canAcceptOver ||
    canWriteOff ||
    enableClientActions ||
    notesEnabled ||
    canViewDocuments ||
    Boolean(visibleInvoice.batch_id)

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
      const updated = await uploadClientInvoiceDocuments(invoice.id, files, authorName)
      if (!updated) throw new Error('Upload failed')
      setUploadSuccess(
        `${files.length} file${files.length > 1 ? 's' : ''} uploaded — Credyx has been notified.`
      )
      window.setTimeout(() => setUploadSuccess(null), 5000)
      onInvoiceUpdated?.()
    } catch (error) {
      console.error('Failed to upload documents:', error)
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

    setIsMarkingPaid(true)
    setPaidError(null)
    try {
      const options: ClientMarkPaidOptions = {
        amountReceived,
        optionalNote: paymentNote.trim() || undefined,
      }
      if (onMarkAsPaid) {
        await onMarkAsPaid(invoice.id, options)
      } else {
        const updated = markClientInvoiceAsPaid(invoice.id, clientName, options, {
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
    setPaidError(null)
    setShowPaidModal(true)
  }

  const handleCloseUncollectable = async (note: string) => {
    if (!onCloseAsUncollectable || isClosing) return
    setIsClosing(true)
    try {
      await onCloseAsUncollectable(invoice.id, note)
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
        className={`payment-confirmation-panel__header ${isSidebar ? 'payment-confirmation-panel__header--sidebar' : ''}`}
      >
        {isMobile ? (
          <button
            type="button"
            onClick={onClose}
            className="payment-confirmation-panel__icon-btn"
            aria-label="Back to invoices"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
        ) : null}

        <div className="payment-confirmation-panel__header-main min-w-0">
          <div className="payment-confirmation-panel__eyebrow-row">
            <p className="payment-confirmation-panel__eyebrow" style={{ color: c.secondary }}>
              Invoice details
            </p>
            {getInvoiceRowStatusBadge(enriched, {
              compact: true,
              balance: balanceState,
              pendingClientPosted,
              confirmedReceived: receivedAmount,
            })}
          </div>
          <p className="payment-confirmation-panel__context-line" style={{ color: c.primary }}>
            Invoice {visibleInvoice.invoice_number}
            {visibleInvoice.load_number ? ` · Load ${visibleInvoice.load_number}` : ''}
          </p>
          <p className="payment-confirmation-panel__context-sub" style={{ color: c.secondary }}>
            {visibleInvoice.broker_name}
          </p>
        </div>

        <div className="payment-confirmation-panel__header-actions">
          <div className="payment-confirmation-panel__nav">
            <button
              type="button"
              className="payment-confirmation-panel__icon-btn"
              disabled={!hasPrev}
              onClick={() => hasPrev && onNavigateInvoice(navigationInvoices[navIndex - 1])}
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
              onClick={() => hasNext && onNavigateInvoice(navigationInvoices[navIndex + 1])}
              aria-label="Next invoice"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          {onPopOut ? (
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
            aria-label={isMobile ? 'Back to invoices' : 'Close invoice details'}
          >
            {!isMobile ? <X className="w-4 h-4" /> : null}
          </button>
        </div>
      </header>

      <div className="payment-confirmation-panel__body">
        <section
          className={`payment-confirmation-panel__summary ${summaryToneClass}`}
          aria-label={`Invoice status: ${enriched.displayStatus || invoice.status}`}
        >
          {showBalanceSummary ? (
            <InvoiceBalanceSummary
              invoiceNumber={visibleInvoice.invoice_number}
              brokerName={visibleInvoice.broker_name}
              loadNumber={visibleInvoice.load_number}
              invoiceAmount={visibleInvoice.amount}
              receivedToDate={receivedAmount}
              pendingConfirmation={pendingConfirmation}
              pendingShortCorrection={pendingShortCorrection}
              clientView
              hideIdentity
              writtenOff={
                visibleInvoice.status === 'written_off' ||
                visibleInvoice.status === 'write_off_pending'
              }
            />
          ) : (
            <dl className="payment-confirmation-panel__summary-grid payment-confirmation-panel__summary-grid--meta mb-1">
              <div className="payment-confirmation-panel__summary-cell payment-confirmation-panel__summary-cell--primary">
                <dt>Amount</dt>
                <dd className="tabular-nums payment-confirmation-panel__summary-value">
                  {formatCurrency(
                    invoice.status === 'paid' && invoice.paid_amount != null
                      ? invoice.paid_amount
                      : invoice.amount
                  )}
                </dd>
              </div>
            </dl>
          )}

          <dl className="payment-confirmation-panel__summary-grid payment-confirmation-panel__summary-grid--meta">
            <div className="payment-confirmation-panel__summary-cell">
              <dt>Invoice date</dt>
              <dd className="tabular-nums payment-confirmation-panel__summary-value">
                {formatDate(invoice.invoice_date)}
              </dd>
            </div>
            <div className="payment-confirmation-panel__summary-cell">
              <dt>Pay date</dt>
              <dd className="tabular-nums payment-confirmation-panel__summary-value">
                {payDate ? formatDate(payDate) : '—'}
              </dd>
            </div>
            <div className="payment-confirmation-panel__summary-cell">
              <dt>Invoice age</dt>
              <dd
                className="tabular-nums payment-confirmation-panel__summary-value"
                style={{
                  color:
                    isOpenArInvoice(invoice) && enriched.isOverdue
                      ? getDaysOutstandingColor(enriched.overdueSeverity)
                      : undefined,
                }}
              >
                {invoiceAgeLabel}
              </dd>
            </div>
            <div className="payment-confirmation-panel__summary-cell">
              <dt>Due date</dt>
              <dd className="tabular-nums payment-confirmation-panel__summary-value">
                {invoice.due_date ? formatDate(invoice.due_date) : '—'}
              </dd>
            </div>
          </dl>

          {isAdminPortal && collectionLabel && (
            <p className="payment-confirmation-panel__summary-meta mt-1">
              <span
                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                style={{
                  backgroundColor:
                    invoice.collection_status === 'W/P' ? c.stat.blue : c.stat.amber,
                  color: c.primary,
                }}
              >
                {collectionLabel}
                {invoice.collection_date ? ` · ${formatDate(invoice.collection_date)}` : ''}
              </span>
            </p>
          )}

          {(notice || awaitingReceiptPayment || uploadSuccess) && (
            <p className="payment-confirmation-panel__summary-meta">
              {notice?.message}
              {awaitingReceiptPayment && (
                <>
                  {notice ? ' · ' : ''}
                  Credyx posted {formatCurrency(awaitingReceiptPayment.amount)} — confirm receipt
                  {receiptDaysLeft != null
                    ? ` within ${receiptDaysLeft} day${receiptDaysLeft !== 1 ? 's' : ''}`
                    : ''}
                  .
                </>
              )}
              {uploadSuccess && (
                <>
                  {(notice || awaitingReceiptPayment) ? ' · ' : ''}
                  {uploadSuccess}
                </>
              )}
            </p>
          )}
        </section>

        <section className="payment-confirmation-panel__notes">
          <div className="payment-confirmation-panel__notes-head">
            <h3 className="payment-confirmation-panel__notes-title" style={{ color: c.primary }}>
              Activity &amp; notes
            </h3>
            <div
              className="payment-confirmation-panel__notes-filters"
              role="group"
              aria-label="Filter timeline"
            >
              {(
                [
                  ['all', 'All', allTimelineEntries.length],
                  ['activity', 'Activity', activityEntries.length],
                  ['notes', 'Notes', noteTimelineEntries.length],
                  ['payments', 'Payments', paymentTimelineEntries.length],
                  ['send', 'Send', sendEntries.length],
                ] as const
              ).map(([key, label, count]) => (
                <button
                  key={key}
                  type="button"
                  className={`payment-confirmation-panel__notes-filter ${
                    timelineFilter === key ? 'payment-confirmation-panel__notes-filter--active' : ''
                  }`}
                  onClick={() => setTimelineFilter(key)}
                  aria-pressed={timelineFilter === key}
                >
                  {label}
                  {count > 0 && (
                    <span className="payment-confirmation-panel__notes-filter-count">{count}</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {isAdminPortal && notesEnabled && (
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

          {notesEnabled && (
            <InvoiceNoteCompose
              newNote={newNote}
              isAddingNote={isAddingNote}
              onChange={setNewNote}
              onSubmit={handleAddNote}
              compact
              collapsible
              allowInternal={isAdminPortal}
              visibility={noteVisibility}
              onVisibilityChange={setNoteVisibility}
            />
          )}

          <div className="payment-confirmation-panel__notes-scroll">
            {filteredTimeline.length === 0 ? (
              <p className="payment-confirmation-panel__notes-empty" style={{ color: c.mutedLight }}>
                {emptyMessage}
              </p>
            ) : (
              <ol className="payment-confirmation-panel__notes-list">
                {filteredTimeline.map((entry) => (
                  <li key={entry.id} className="payment-confirmation-panel__note">
                    {entry.source ? (
                      <span
                        className={`payment-confirmation-panel__note-source payment-confirmation-panel__note-source--${entry.source}`}
                        aria-label={entry.source === 'carrier' ? 'Carrier' : 'Credyx'}
                        title={entry.source === 'carrier' ? 'Carrier' : 'Credyx'}
                      >
                        <span className="payment-confirmation-panel__note-source-dot" aria-hidden />
                      </span>
                    ) : (
                      <span
                        className="payment-confirmation-panel__note-source"
                        aria-hidden
                      >
                        <span className="payment-confirmation-panel__note-source-dot" />
                      </span>
                    )}
                    <div className="payment-confirmation-panel__note-head">
                      <div className="payment-confirmation-panel__note-title-row">
                        <span className="payment-confirmation-panel__note-title">
                          {entry.title}
                        </span>
                        {entry.internal && (
                          <span
                            className="payment-confirmation-panel__note-internal"
                            title="Visible to Credyx only"
                          >
                            Internal
                          </span>
                        )}
                      </div>
                      <time
                        className="payment-confirmation-panel__note-date tabular-nums"
                        dateTime={entry.timestamp}
                      >
                        {formatDate(entry.timestamp)}
                      </time>
                    </div>
                    <p className="payment-confirmation-panel__note-detail">{entry.detail}</p>
                    {entry.meta && (
                      <p className="payment-confirmation-panel__note-meta">{entry.meta}</p>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </div>
        </section>
      </div>

      {hasFooterActions ? (
        <footer className="payment-confirmation-panel__footer shrink-0" style={{ borderColor: c.border }}>
          <div className="flex flex-wrap gap-2 w-full">
            {awaitingReceiptPayment && onViewPayment && (
              <button
                type="button"
                onClick={() => onViewPayment(awaitingReceiptPayment.id)}
                className="dashboard-btn-primary flex-1 min-w-[120px] inline-flex items-center justify-center gap-1.5"
              >
                <DollarSign className="w-4 h-4" />
                View payment
              </button>
            )}
            {canPostPaymentAction && (
              <button
                type="button"
                onClick={openPaidModal}
                className="dashboard-btn-primary flex-1 min-w-[110px] inline-flex items-center justify-center gap-1.5"
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
                className="dashboard-btn-secondary flex-1 min-w-[90px] inline-flex items-center justify-center gap-1.5"
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
                Upload
              </button>
            )}
            {canViewDocuments && (
              <button
                type="button"
                onClick={onViewDocuments}
                className="dashboard-btn-secondary flex-1 min-w-[80px] inline-flex items-center justify-center gap-1.5"
              >
                <Eye className="w-4 h-4" />
                Docs
              </button>
            )}
            {visibleInvoice.batch_id ? (
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
              <p className="text-sm mb-4" style={{ color: c.secondary }}>
                Post payment for {invoice.invoice_number}. Invoice amount{' '}
                <strong style={{ color: c.primary }}>{formatCurrency(invoice.amount)}</strong>.
                Credyx will be notified and must approve before the payment is final. The invoice
                will show as closed while approval is pending.
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
                onChange={(e) => setPaymentAmount(e.target.value)}
                className="client-input w-full mb-4 tabular-nums"
              />
              {paymentAmount &&
                parseFloat(paymentAmount) !== invoice.amount &&
                Number.isFinite(parseFloat(paymentAmount)) && (
                  <p className="text-xs mb-4" style={{ color: c.secondary }}>
                    {parseFloat(paymentAmount) < invoice.amount
                      ? `Short by ${formatCurrency(invoice.amount - parseFloat(paymentAmount))}`
                      : `Over by ${formatCurrency(parseFloat(paymentAmount) - invoice.amount)}`}
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
              {paidError && (
                <p className="text-sm mt-2" style={{ color: '#DC2626' }}>
                  {paidError}
                </p>
              )}
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
                disabled={isMarkingPaid}
                className="dashboard-btn-primary"
                style={{ height: 36, fontSize: 13 }}
              >
                {isMarkingPaid ? 'Posting...' : 'Post payment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showCloseModal && shortPayment && onCloseAsUncollectable && (
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
    return (
      <div className="payment-confirmation-panel payment-confirmation-panel--mobile flex flex-col min-h-0 flex-1 overflow-hidden">
        {panelBody}
      </div>
    )
  }

  return (
    <div
      className="payment-confirmation-panel payment-confirmation-panel--sidebar flex flex-col min-h-0 h-full overflow-hidden"
      style={{ backgroundColor: c.card }}
      role="region"
      aria-label={`Invoice details for ${visibleInvoice.invoice_number}`}
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
