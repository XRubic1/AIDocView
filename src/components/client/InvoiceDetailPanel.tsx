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
} from 'lucide-react'
import type { Invoice } from '../../types/invoice'
import type { Payment } from '../../types/payment'
import { formatCurrency, formatDate, formatDateTime } from '../../utils/format'
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
import ShortPaymentCloseModal from './ShortPaymentCloseModal'
import OverpaymentAcceptModal from './OverpaymentAcceptModal'
import {
  enrichInvoice,
  getDaysOutstandingColor,
  isOpenArInvoice,
} from '../../utils/invoiceAging'
import { useClientTheme } from '../../theme/ThemeContext'
import { useOptionalClientCapabilities } from '../../hooks/useClientCapabilities'
import { toClientVisibleInvoice } from '../../utils/clientInvoiceView'
import {
  getAwaitingReceiptPaymentForInvoice,
  getDisputedPaymentsForInvoice,
  getReceiptConfirmationDaysLeft,
} from '../../utils/paymentStatus'
import {
  resolvePaymentReceiptDispute,
  getPaymentReceiptDisputeLabel,
  type ResolveReceiptDisputeOutcome,
} from '../../services/paymentReceiptConfirmationService'
import { resolveAdminInvoiceDispute } from '../../services/adminInvoiceActions'
import { useAuth } from '../../context/AuthContext'
import { getAdminUserDisplayName } from '../../config/adminNav'
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
  InvoiceDisputeBadges,
  InvoiceNoteCompose,
} from './invoiceDetailShared'

type TimelineFilter = 'activity' | 'notes' | 'payments' | 'send'
type TimelineTone = 'neutral' | 'success' | 'warning' | 'error' | 'info'

interface TimelineEntry {
  id: string
  title: string
  detail: string
  timestamp: string
  tone: TimelineTone
  meta?: string
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
      return 'success'
    case 'rejection':
    case 'dispute':
      return 'error'
    case 'hold_reason':
      return 'warning'
    default:
      return 'neutral'
  }
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  check: 'Check',
  wire: 'Wire',
  ach: 'ACH',
  credit_card: 'Card',
}

/** Notes that describe payment / remittance activity. */
function isPaymentRelatedNote(note: string, type?: string): boolean {
  if (type === 'dispute') return false
  const text = note.toLowerCase()
  return (
    /payment|received|remittance|short pay|shortfall|overpay|overpayment|chargeback|wire|ach\b|check #|force.?confirm|receipt dispute|posted amount|confirmed receiving|paid in full/.test(
      text
    )
  )
}

/** Actual pay date from confirmed payments (latest received date). */
function getInvoicePayDate(payments: Payment[]): string | null {
  const confirmed = payments.filter((p) => p.status === 'confirmed')
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
  onAddNote?: (invoiceId: string, note: string) => void | Promise<void>
  onOpenDispute?: (invoiceId: string, reason: string, description: string) => void | Promise<void>
  onMarkAsPaid?: (invoiceId: string, options: ClientMarkPaidOptions) => void | Promise<void>
  onCloseAsUncollectable?: (invoiceId: string, note: string) => void | Promise<void>
  onAcceptOverpayment?: (invoiceId: string, note: string) => void | Promise<void>
  payments?: Payment[]
  onViewPayment?: (paymentId: string) => void
  enableClientActions?: boolean
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
}: InvoiceDetailPanelProps) {
  const c = useClientTheme()
  const navigate = useNavigate()
  const { resolved } = useAuth()
  // Safe outside ClientPortalProvider (Credyx Invoice Search, etc.)
  const { capabilities } = useOptionalClientCapabilities()
  const isSidebar = variant === 'sidebar'
  const isMobile = variant === 'mobile'
  const [timelineFilter, setTimelineFilter] = useState<TimelineFilter>('activity')
  /** Credyx admin can resolve; client portal only views. */
  const canResolveDisputes = !enableClientActions
  const resolverName = canResolveDisputes
    ? getAdminUserDisplayName(resolved.user?.email ?? null)
    : clientName

  const visibleInvoice = useMemo(() => toClientVisibleInvoice(invoice), [invoice])
  const enriched = useMemo(() => enrichInvoice(visibleInvoice), [visibleInvoice])

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
  const disputedPayments = useMemo(
    () => getDisputedPaymentsForInvoice(invoice.id, payments),
    [invoice.id, payments]
  )
  const receiptDaysLeft = awaitingReceiptPayment
    ? getReceiptConfirmationDaysLeft(awaitingReceiptPayment)
    : null

  const noteEntries = getInvoiceNoteEntries(visibleInvoice)
  const openDisputes = getOpenDisputes(visibleInvoice)
  const hasOpenDispute = openDisputes.length > 0 || disputedPayments.length > 0

  /** All open disputes (invoice + receipt), oldest first. */
  const disputeQueue = useMemo(() => {
    const items: Array<
      | { kind: 'invoice'; id: string; createdAt: string; dispute: (typeof openDisputes)[number] }
      | { kind: 'receipt'; id: string; createdAt: string; payment: Payment }
    > = [
      ...openDisputes.map((dispute) => ({
        kind: 'invoice' as const,
        id: dispute.id,
        createdAt: dispute.created_at,
        dispute,
      })),
      ...disputedPayments.map((payment) => ({
        kind: 'receipt' as const,
        id: payment.id,
        createdAt: payment.dispute?.created_at || payment.received_date,
        payment,
      })),
    ]
    return items.sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    )
  }, [openDisputes, disputedPayments])

  const [newNote, setNewNote] = useState('')
  const [isAddingNote, setIsAddingNote] = useState(false)
  const [showDisputeModal, setShowDisputeModal] = useState(false)
  const [showViewDisputeModal, setShowViewDisputeModal] = useState(false)
  const [disputeBrowseIndex, setDisputeBrowseIndex] = useState(0)
  const [invoiceDisputeResponse, setInvoiceDisputeResponse] = useState('')
  const [resolvingDisputeId, setResolvingDisputeId] = useState<string | null>(null)
  const [receiptResolveOutcome, setReceiptResolveOutcome] =
    useState<ResolveReceiptDisputeOutcome>('confirm')
  const [receiptResolveResponse, setReceiptResolveResponse] = useState('')
  const [receiptResolveAmount, setReceiptResolveAmount] = useState('')
  const [isResolvingReceipt, setIsResolvingReceipt] = useState(false)
  const [resolveError, setResolveError] = useState<string | null>(null)
  const [disputeReason, setDisputeReason] = useState<string>(DISPUTE_REASON_OPTIONS[0].value)
  const [disputeDescription, setDisputeDescription] = useState('')
  const [isOpeningDispute, setIsOpeningDispute] = useState(false)
  const [disputeError, setDisputeError] = useState<string | null>(null)
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
    setTimelineFilter('activity')
    setShowViewDisputeModal(false)
    setDisputeBrowseIndex(0)
    setInvoiceDisputeResponse('')
    setResolvingDisputeId(null)
    setReceiptResolveResponse('')
    setReceiptResolveOutcome('confirm')
    setResolveError(null)
  }, [invoice.id])

  useEffect(() => {
    if (disputeBrowseIndex >= disputeQueue.length) {
      setDisputeBrowseIndex(Math.max(0, disputeQueue.length - 1))
    }
  }, [disputeQueue.length, disputeBrowseIndex])

  useEffect(() => {
    if (showViewDisputeModal && disputeQueue.length === 0) {
      setShowViewDisputeModal(false)
      setDisputeBrowseIndex(0)
    }
  }, [showViewDisputeModal, disputeQueue.length])

  const currentDisputeItem = disputeQueue[disputeBrowseIndex] ?? null
  const currentDisputeKey = currentDisputeItem?.id ?? ''

  useEffect(() => {
    if (!currentDisputeKey) return
    const current = disputeQueue.find((item) => item.id === currentDisputeKey)
    if (current?.kind === 'receipt') {
      setReceiptResolveAmount(current.payment.amount.toFixed(2))
      setReceiptResolveResponse('')
      setReceiptResolveOutcome('confirm')
    } else {
      setInvoiceDisputeResponse('')
    }
    setResolveError(null)
    // Only reset form when navigating to a different dispute item.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: key-driven reset
  }, [currentDisputeKey])

  const canBrowsePrevDispute = disputeBrowseIndex > 0
  const canBrowseNextDispute = disputeBrowseIndex < disputeQueue.length - 1
  const disputeBusy = Boolean(resolvingDisputeId) || isResolvingReceipt

  const invoiceDocuments = getInvoiceDocuments(invoice.id)
  const documentCount = Math.max(invoice.documents_count || 0, invoiceDocuments.length)
  const pendingClientPosted = useMemo(
    () => getClientPostedPendingTotal(visibleInvoice.id, invoicePayments),
    [visibleInvoice.id, invoicePayments]
  )
  const canPostPaymentAction =
    capabilities.canPostPayment &&
    isOpenArInvoice(visibleInvoice) &&
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
        meta: dispute.response?.trim()
          ? `Credyx: ${dispute.response}`
          : undefined,
      })
    }
    for (const entry of noteEntries) {
      const typeKey = entry.type || 'note'
      if (typeKey === 'note' || typeKey === 'client_note') continue
      entries.push({
        id: `activity-note-${entry.id}`,
        title: NOTE_TYPE_LABELS[typeKey] || 'Update',
        detail: entry.note,
        timestamp: entry.created_at,
        tone: noteTone(typeKey),
        meta: entry.created_by,
      })
    }
    return entries.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    )
  }, [openDisputes, noteEntries])

  const noteTimelineEntries = useMemo((): TimelineEntry[] => {
    return noteEntries
      .filter((entry) => {
        const typeKey = entry.type || 'note'
        if (typeKey !== 'note' && typeKey !== 'client_note') return false
        // Payment-related notes live under the Payments tab only.
        return !isPaymentRelatedNote(entry.note, entry.type)
      })
      .map((entry) => ({
        id: `note-${entry.id}`,
        title: NOTE_TYPE_LABELS[entry.type || 'note'] || 'Note',
        detail: entry.note,
        timestamp: entry.created_at,
        tone: 'neutral' as TimelineTone,
        meta: entry.created_by,
      }))
  }, [noteEntries])

  const paymentTimelineEntries = useMemo((): TimelineEntry[] => {
    const entries: TimelineEntry[] = []

    for (const payment of invoicePayments) {
      const method =
        PAYMENT_METHOD_LABELS[payment.payment_method] ?? payment.payment_method
      const kindLabel =
        payment.payment_kind === 'short'
          ? 'Short / correction'
          : payment.payment_kind === 'over'
            ? 'Overpayment'
            : 'Payment'
      let detail = `${formatCurrency(payment.amount)} · ${method}`
      if (payment.payment_reference) detail += ` · Ref ${payment.payment_reference}`
      if (payment.notes) detail += ` — ${payment.notes}`

      entries.push({
        id: `payment-${payment.id}`,
        title: `${kindLabel} · ${payment.status.replace(/_/g, ' ')}`,
        detail,
        timestamp: payment.received_date || payment.payment_date,
        tone:
          payment.status === 'confirmed'
            ? 'success'
            : payment.status === 'rejected' || payment.status === 'reversed'
              ? 'error'
              : payment.status === 'disputed' ||
                  payment.status === 'pending' ||
                  payment.status === 'awaiting_receipt'
                ? 'warning'
                : 'info',
        meta: payment.posted_by || payment.confirmed_by,
      })

      if (payment.dispute) {
        entries.push({
          id: `payment-dispute-${payment.id}`,
          title: 'Payment receipt dispute',
          detail: payment.dispute.description,
          timestamp: payment.dispute.created_at,
          tone: 'error',
          meta: payment.dispute.created_by,
        })
        if (payment.dispute.response?.trim()) {
          entries.push({
            id: `payment-dispute-resolved-${payment.id}`,
            title: 'Payment dispute resolved',
            detail: payment.dispute.response,
            timestamp: payment.dispute.resolved_at || payment.dispute.created_at,
            tone: 'info',
            meta: payment.dispute.resolved_by,
          })
        }
      }

      if (payment.rejection_reason) {
        entries.push({
          id: `payment-reject-${payment.id}`,
          title: 'Payment rejected',
          detail: payment.rejection_reason,
          timestamp: payment.confirmed_at || payment.received_date || payment.payment_date,
          tone: 'error',
          meta: payment.confirmed_by,
        })
      }
    }

    for (const entry of noteEntries) {
      if (!isPaymentRelatedNote(entry.note, entry.type)) continue
      entries.push({
        id: `payment-note-${entry.id}`,
        title: NOTE_TYPE_LABELS[entry.type || 'note'] || 'Payment note',
        detail: entry.note,
        timestamp: entry.created_at,
        tone: noteTone(entry.type),
        meta: entry.created_by,
      })
    }

    return entries.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    )
  }, [invoicePayments, noteEntries])

  const sendEntries = useMemo((): TimelineEntry[] => {
    const history = invoice.document_send_history || []
    return history.map((send, idx) => ({
      id: `send-${idx}-${send.sent_at}`,
      title: send.email_address,
      detail: send.status ? `Status: ${send.status}` : 'Document sent',
      timestamp: send.sent_at,
      tone:
        send.status === 'delivered'
          ? 'success'
          : send.status === 'failed'
            ? 'error'
            : ('neutral' as TimelineTone),
    }))
  }, [invoice.document_send_history])

  const filteredTimeline =
    timelineFilter === 'activity'
      ? activityEntries
      : timelineFilter === 'notes'
        ? noteTimelineEntries
        : timelineFilter === 'payments'
          ? paymentTimelineEntries
          : sendEntries

  const payDate = useMemo(() => getInvoicePayDate(invoicePayments), [invoicePayments])

  const navIndex = navigationInvoices.findIndex((inv) => inv.id === invoice.id)
  const hasPrev = navIndex > 0
  const hasNext = navIndex >= 0 && navIndex < navigationInvoices.length - 1

  const summaryToneClass =
    SUMMARY_TONE_BY_STATUS[enriched.displayStatus || invoice.status] ||
    (enriched.isOverdue
      ? 'payment-confirmation-panel__summary--disputed'
      : 'payment-confirmation-panel__summary--neutral')

  const daysOutLabel =
    !isOpenArInvoice(invoice) ||
    invoice.status === 'force_closed' ||
    invoice.status === 'written_off'
      ? '—'
      : `${enriched.daysOutstanding}d`

  const hasFooterActions =
    Boolean(awaitingReceiptPayment && onViewPayment) ||
    hasOpenDispute ||
    canPostPaymentAction ||
    canAcceptOver ||
    canWriteOff ||
    enableClientActions ||
    canViewDocuments ||
    Boolean(visibleInvoice.batch_id)

  const handleGoToBatch = () => {
    if (!visibleInvoice.batch_id) return
    const params = new URLSearchParams({
      tab: 'view',
      batch: visibleInvoice.batch_id,
    })
    navigate(`/client/batches?${params.toString()}`)
  }

  const handleUploadDocuments = async (files: File[]) => {
    if (isUploadingDocs || files.length === 0) return
    setIsUploadingDocs(true)
    try {
      const updated = await uploadClientInvoiceDocuments(invoice.id, files, clientName)
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
        await onAddNote(invoice.id, newNote.trim())
      } else {
        addClientInvoiceNote(invoice.id, newNote.trim(), clientName)
      }
      setNewNote('')
      onInvoiceUpdated?.()
    } catch (error) {
      console.error('Failed to add note:', error)
    } finally {
      setIsAddingNote(false)
    }
  }

  const handleOpenDispute = async () => {
    if (!disputeDescription.trim() || isOpeningDispute) return
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
      onInvoiceUpdated?.()
    } catch (error) {
      console.error('Failed to open dispute:', error)
      setDisputeError('Could not open dispute. Please try again.')
    } finally {
      setIsOpeningDispute(false)
    }
  }

  const handleResolveInvoiceDispute = async (disputeId: string) => {
    if (!canResolveDisputes || !invoiceDisputeResponse.trim() || resolvingDisputeId) return
    setResolvingDisputeId(disputeId)
    setResolveError(null)
    try {
      const updated = resolveAdminInvoiceDispute(
        invoice.id,
        disputeId,
        invoiceDisputeResponse.trim(),
        resolverName
      )
      if (!updated) {
        setResolveError('Could not resolve dispute. Please try again.')
        return
      }
      setInvoiceDisputeResponse('')
      onInvoiceUpdated?.()
    } catch (error) {
      console.error('Failed to resolve invoice dispute:', error)
      setResolveError('Could not resolve dispute. Please try again.')
    } finally {
      setResolvingDisputeId(null)
    }
  }

  const handleResolveReceiptDispute = async (paymentId: string) => {
    if (!canResolveDisputes || !receiptResolveResponse.trim() || isResolvingReceipt) {
      return
    }
    setIsResolvingReceipt(true)
    setResolveError(null)
    try {
      const amountNum = parseFloat(receiptResolveAmount)
      const result = resolvePaymentReceiptDispute(
        paymentId,
        resolverName,
        receiptResolveResponse.trim(),
        receiptResolveOutcome,
        receiptResolveOutcome === 'confirm' && Number.isFinite(amountNum) && amountNum > 0
          ? { adjustedAmount: amountNum }
          : undefined
      )
      if (!result) {
        setResolveError('Could not resolve payment dispute. Check response and amount.')
        return
      }
      setReceiptResolveResponse('')
      onInvoiceUpdated?.()
    } catch (error) {
      console.error('Failed to resolve receipt dispute:', error)
      setResolveError('Could not resolve payment dispute. Please try again.')
    } finally {
      setIsResolvingReceipt(false)
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
    timelineFilter === 'activity'
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
          <div className="payment-confirmation-panel__eyebrow-row flex items-center gap-1.5 flex-wrap min-w-0">
            <p className="payment-confirmation-panel__eyebrow" style={{ color: c.secondary }}>
              Invoice details
            </p>
            <div className="inline-flex items-center gap-1 flex-nowrap min-w-0">
              {getInvoiceRowStatusBadge(enriched, {
                compact: true,
                balance: balanceState,
                pendingClientPosted,
                confirmedReceived: receivedAmount,
              })}
              <InvoiceDisputeBadges invoice={visibleInvoice} />
            </div>
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
              <dt>Days out</dt>
              <dd
                className="tabular-nums payment-confirmation-panel__summary-value"
                style={{
                  color:
                    isOpenArInvoice(invoice) && enriched.isOverdue
                      ? getDaysOutstandingColor(enriched.overdueSeverity)
                      : undefined,
                }}
              >
                {daysOutLabel}
              </dd>
            </div>
            <div className="payment-confirmation-panel__summary-cell">
              <dt>Documents</dt>
              <dd className="payment-confirmation-panel__summary-value">
                <span className="inline-flex items-center gap-1.5 flex-wrap">
                  <span className="tabular-nums">{documentCount}</span>
                  {canViewDocuments && (
                    <button
                      type="button"
                      onClick={onViewDocuments}
                      className="text-[11px] font-semibold underline-offset-2 hover:underline"
                      style={{ color: c.info }}
                    >
                      View
                    </button>
                  )}
                  {enableClientActions && (
                    <button
                      type="button"
                      onClick={() => setShowUploadModal(true)}
                      className="text-[11px] font-semibold underline-offset-2 hover:underline"
                      style={{ color: c.info }}
                    >
                      Add
                    </button>
                  )}
                </span>
              </dd>
            </div>
          </dl>

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

          {enableClientActions && (
            <InvoiceNoteCompose
              newNote={newNote}
              isAddingNote={isAddingNote}
              onChange={setNewNote}
              onSubmit={handleAddNote}
              compact
              collapsible
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
                  <li
                    key={entry.id}
                    className={`payment-confirmation-panel__note payment-confirmation-panel__note--${entry.tone}`}
                  >
                    <div className="payment-confirmation-panel__note-head">
                      <span
                        className="payment-confirmation-panel__note-title"
                        style={{ color: c.primary }}
                      >
                        {entry.title}
                      </span>
                      <time
                        className="payment-confirmation-panel__note-date tabular-nums"
                        style={{ color: c.mutedLight }}
                        dateTime={entry.timestamp}
                      >
                        {formatDate(entry.timestamp)}
                      </time>
                    </div>
                    <p
                      className="payment-confirmation-panel__note-detail"
                      style={{ color: c.secondary }}
                    >
                      {entry.detail}
                    </p>
                    {entry.meta && (
                      <p
                        className="payment-confirmation-panel__note-detail mt-0.5"
                        style={{ color: c.mutedLight }}
                      >
                        {entry.meta}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </div>
        </section>
      </div>

      {hasFooterActions ? (
        <footer className="payment-confirmation-panel__footer" style={{ borderColor: c.border }}>
          <div className="flex flex-wrap gap-2 w-full">
            {hasOpenDispute && (
              <button
                type="button"
                onClick={() => {
                  setResolveError(null)
                  setDisputeBrowseIndex(0)
                  setShowViewDisputeModal(true)
                }}
                className="dashboard-btn-primary flex-1 min-w-[120px] inline-flex items-center justify-center gap-1.5"
              >
                <AlertTriangle className="w-4 h-4" />
                {canResolveDisputes ? 'Resolve dispute' : 'View dispute'}
              </button>
            )}
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

      {showViewDisputeModal && (
        <div
          className="invoice-dispute-modal-overlay"
          onClick={() => !resolvingDisputeId && !isResolvingReceipt && setShowViewDisputeModal(false)}
          role="presentation"
        >
          <div
            className="invoice-dispute-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-labelledby="view-dispute-modal-title"
          >
            <div className="invoice-dispute-modal-header">
              <div className="min-w-0">
                <h3
                  id="view-dispute-modal-title"
                  className="text-base font-semibold"
                  style={{ color: c.primary }}
                >
                  {canResolveDisputes ? 'Resolve dispute' : 'Open dispute'}
                </h3>
                {disputeQueue.length > 1 && (
                  <p className="text-[11px] mt-0.5" style={{ color: c.secondary }}>
                    Dispute {disputeBrowseIndex + 1} of {disputeQueue.length} (oldest first)
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {disputeQueue.length > 1 && (
                  <>
                    <button
                      type="button"
                      className="payment-confirmation-panel__icon-btn"
                      disabled={!canBrowsePrevDispute || disputeBusy}
                      onClick={() => setDisputeBrowseIndex((i) => Math.max(0, i - 1))}
                      aria-label="Previous dispute"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      className="payment-confirmation-panel__icon-btn"
                      disabled={!canBrowseNextDispute || disputeBusy}
                      onClick={() =>
                        setDisputeBrowseIndex((i) => Math.min(disputeQueue.length - 1, i + 1))
                      }
                      aria-label="Next dispute"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => setShowViewDisputeModal(false)}
                  className="p-1 rounded-lg transition-colors hover:bg-slate-100"
                  style={{ color: c.muted }}
                  aria-label="Close"
                  disabled={disputeBusy}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="invoice-dispute-modal-body space-y-3">
              {currentDisputeItem?.kind === 'invoice' && (
                <div
                  className="rounded-lg border p-3"
                  style={{ borderColor: c.border, backgroundColor: c.stat.red }}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-xs font-semibold" style={{ color: c.error }}>
                      {getDisputeReasonLabel(currentDisputeItem.dispute.reason)}
                    </span>
                    <span className="text-[11px]" style={{ color: c.secondary }}>
                      {formatDateTime(currentDisputeItem.dispute.created_at)}
                    </span>
                  </div>
                  <p className="text-sm" style={{ color: c.primary }}>
                    {currentDisputeItem.dispute.description}
                  </p>
                  <p className="text-[11px] mt-1" style={{ color: c.secondary }}>
                    Status:{' '}
                    {currentDisputeItem.dispute.status === 'under_review'
                      ? 'Under review'
                      : 'Open'}
                    {currentDisputeItem.dispute.created_by
                      ? ` · ${currentDisputeItem.dispute.created_by}`
                      : ''}
                  </p>
                  {currentDisputeItem.dispute.response?.trim() ? (
                    <div className="mt-2 pt-2 border-t" style={{ borderColor: c.border }}>
                      <p className="text-[11px] font-semibold mb-0.5" style={{ color: c.secondary }}>
                        Credyx response
                      </p>
                      <p className="text-sm" style={{ color: c.primary }}>
                        {currentDisputeItem.dispute.response}
                      </p>
                    </div>
                  ) : canResolveDisputes ? (
                    <div className="mt-3 space-y-2">
                      <label
                        className="client-label"
                        htmlFor={`resolve-invoice-dispute-${currentDisputeItem.dispute.id}`}
                      >
                        Response to client <span className="text-red-600">*</span>
                      </label>
                      <textarea
                        id={`resolve-invoice-dispute-${currentDisputeItem.dispute.id}`}
                        value={invoiceDisputeResponse}
                        onChange={(e) => setInvoiceDisputeResponse(e.target.value)}
                        rows={3}
                        className="client-input w-full"
                        placeholder="Explain the resolution to the client..."
                        disabled={Boolean(resolvingDisputeId)}
                      />
                      <button
                        type="button"
                        className="dashboard-btn-primary inline-flex items-center gap-1.5"
                        disabled={!invoiceDisputeResponse.trim() || Boolean(resolvingDisputeId)}
                        onClick={() =>
                          void handleResolveInvoiceDispute(currentDisputeItem.dispute.id)
                        }
                      >
                        <CircleCheck className="w-4 h-4" />
                        {resolvingDisputeId === currentDisputeItem.dispute.id
                          ? 'Resolving...'
                          : 'Resolve dispute'}
                      </button>
                    </div>
                  ) : null}
                </div>
              )}

              {currentDisputeItem?.kind === 'receipt' && (
                <div
                  className="rounded-lg border p-3 space-y-2"
                  style={{ borderColor: c.border, backgroundColor: c.stat.amber }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold" style={{ color: c.warning }}>
                      Payment receipt dispute
                    </span>
                    <span className="text-[11px] tabular-nums" style={{ color: c.secondary }}>
                      {formatCurrency(currentDisputeItem.payment.amount)}
                    </span>
                  </div>
                  <p className="text-sm font-medium" style={{ color: c.primary }}>
                    {currentDisputeItem.payment.dispute
                      ? getPaymentReceiptDisputeLabel(currentDisputeItem.payment.dispute.reason)
                      : 'Client disputed this payment'}
                  </p>
                  {currentDisputeItem.payment.dispute?.description && (
                    <p className="text-sm" style={{ color: c.primary }}>
                      {currentDisputeItem.payment.dispute.description}
                    </p>
                  )}
                  <p className="text-[11px]" style={{ color: c.secondary }}>
                    Posted {formatDate(currentDisputeItem.payment.received_date)}
                    {currentDisputeItem.payment.dispute?.created_at
                      ? ` · Disputed ${formatDateTime(currentDisputeItem.payment.dispute.created_at)}`
                      : ''}
                  </p>

                  {canResolveDisputes && (
                    <div className="mt-2 pt-2 border-t space-y-2" style={{ borderColor: c.border }}>
                      <div>
                        <label className="client-label">Resolution</label>
                        <div className="flex flex-col gap-1.5 mt-1">
                          <label className="inline-flex items-center gap-1.5 text-sm">
                            <input
                              type="radio"
                              checked={receiptResolveOutcome === 'confirm'}
                              onChange={() => setReceiptResolveOutcome('confirm')}
                              disabled={isResolvingReceipt}
                            />
                            Uphold posting - client must confirm again
                          </label>
                          <label className="inline-flex items-center gap-1.5 text-sm">
                            <input
                              type="radio"
                              checked={receiptResolveOutcome === 'reject'}
                              onChange={() => setReceiptResolveOutcome('reject')}
                              disabled={isResolvingReceipt}
                            />
                            Reject payment (client was correct)
                          </label>
                        </div>
                      </div>
                      {receiptResolveOutcome === 'confirm' && (
                        <div>
                          <label className="client-label" htmlFor="receipt-resolve-amount">
                            Posted amount <span className="text-red-600">*</span>
                          </label>
                          <input
                            id="receipt-resolve-amount"
                            type="number"
                            min="0.01"
                            step="0.01"
                            inputMode="decimal"
                            value={receiptResolveAmount}
                            onChange={(e) => setReceiptResolveAmount(e.target.value)}
                            className="client-input w-full financial-nums"
                            disabled={isResolvingReceipt}
                          />
                        </div>
                      )}
                      <div>
                        <label className="client-label" htmlFor="receipt-resolve-response">
                          Response to client <span className="text-red-600">*</span>
                        </label>
                        <textarea
                          id="receipt-resolve-response"
                          value={receiptResolveResponse}
                          onChange={(e) => setReceiptResolveResponse(e.target.value)}
                          rows={3}
                          className="client-input w-full"
                          placeholder="Explain the resolution..."
                          disabled={isResolvingReceipt}
                        />
                      </div>
                      <button
                        type="button"
                        className="dashboard-btn-primary inline-flex items-center gap-1.5"
                        disabled={!receiptResolveResponse.trim() || isResolvingReceipt}
                        onClick={() =>
                          void handleResolveReceiptDispute(currentDisputeItem.payment.id)
                        }
                      >
                        <CircleCheck className="w-4 h-4" />
                        {isResolvingReceipt ? 'Resolving...' : 'Resolve payment dispute'}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {!currentDisputeItem && (
                <p className="text-sm" style={{ color: c.secondary }}>
                  No open disputes on this invoice.
                </p>
              )}

              {resolveError && (
                <p className="text-sm" style={{ color: c.error }}>
                  {resolveError}
                </p>
              )}
            </div>
            <div className="invoice-dispute-modal-footer">
              <button
                type="button"
                className="dashboard-btn-secondary"
                onClick={() => setShowViewDisputeModal(false)}
                disabled={disputeBusy}
              >
                Close
              </button>
            </div>
          </div>
        </div>
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
                disabled={!disputeDescription.trim() || isOpeningDispute}
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
