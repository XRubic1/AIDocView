import type { Broker } from '../types/broker'
import type { BrokerRiskLevel } from '../types/brokerRisk'
import type { Invoice } from '../types/invoice'
import type { Payment } from '../types/payment'
import { getLatestBrokerRiskProfile } from '../data/brokerRiskStore'
import { hasBrokerConfirmedPayDate } from './clientCashWindows'
import { getChaseStatus, type ChaseQueueStatus } from './collectionsChase'
import {
  collectionsUrgentLabel,
  getCollectionsUrgentReasons,
  type CollectionsUrgentReason,
} from './collectionsPolicy'
import { getInvoiceBrokerDueDays } from './invoiceDueDate'
import {
  getDaysOutstanding,
  getEffectiveInvoiceDueDate,
  getInvoiceAgeDays,
  isInvoiceOverdue,
} from './invoiceAging'
import { AMOUNT_EPSILON, getInvoiceOpenArBalance } from './paymentVariance'
import { isRoutineLifecycleNote } from './brokerRiskPolicy'
import { getDaysSincePpwSent, getPpwSentAt, hasPpwBeenSent } from './ppwSent'
import {
  getCollectionsTrackStage,
  isUrgentCollectionStage,
  resolvePaperworkCheckDays,
  resolvePaymentInquiryDays,
  type CollectionsTrackStage,
} from './collectionsTrack'
import { isInvoicePendingClientReveal } from './clientInvoiceView'
import {
  getNextBrokerFollowup,
  type NextBrokerFollowup,
} from './nextBrokerFollowup'

export type CollectionsFocus =
  | 'all'
  | 'chase'
  | 'overdue'
  | 'will_pay'
  | 'callback'
  | 'no_ppw'
  | 'ppw_check'
  | 'payment_verify'
  | 'urgent'

export type AdminCollectionsRow = {
  invoice: Invoice
  broker: Broker | undefined
  amount: number
  ageDays: number
  dueDate: string | undefined
  dueDays: number | null
  daysPastDue: number
  isOverdue: boolean
  confirmedPayDate: string | null
  collectionStatus: Invoice['collection_status']
  ppwSentAt: string | null
  daysSincePpw: number | null
  paperworkCheckDays: number
  inquiryDays: number
  trackStage: CollectionsTrackStage
  chaseStatus: ChaseQueueStatus
  lastContact: string | null
  brokerRiskLevel: BrokerRiskLevel
  isUrgent: boolean
  /** Past-due verify window or PPW never sent — distinct queue styling. */
  isUrgentCollection: boolean
  urgentReasons: CollectionsUrgentReason[]
  /** Call Back date is today or in the past. */
  isCallbackDue: boolean
  /** Next scheduled broker follow-up (paperwork check, payment check, callback). */
  nextFollowup: NextBrokerFollowup | null
}

const CLOSED: ReadonlySet<Invoice['status']> = new Set([
  'paid',
  'pending',
  'hold',
  'rejected',
  'force_closed',
  'written_off',
  'write_off_pending',
])

/**
 * Open collections work queue — approved A/R after the batch is processed
 * (or PPW already sent / no batch). Verification invoices stay out until Process.
 */
export function isCollectionsWorkInvoice(invoice: Invoice): boolean {
  if (CLOSED.has(invoice.status) || invoice.status !== 'approved') return false
  if (hasPpwBeenSent(invoice)) return true
  return !isInvoicePendingClientReveal(invoice)
}

function inquiryDaysFor(broker: Broker | undefined): number {
  return resolvePaymentInquiryDays(broker)
}

/**
 * Notes that mean Credyx actually chased the broker (call, inquiry email, Will Pay).
 * PPW / paperwork send is not contact — that already has its own column.
 */
const BROKER_CONTACT_NOTE_RE =
  /payment.?status inquiry|payment.?status follow-up|paperwork.?status|follow-up emailed|called (?:the )?broker|spoke (?:with|to)|contacted (?:the )?broker|left (?:a )?voicemail|broker contacted|broker confirmed paperwork|expected payment updated from broker|^status:\s*(will pay|call back|payment status confirmed|broker confirmed paperwork)/i

/** True when a timeline note is a real collections contact, not PPW/lifecycle. */
export function isBrokerContactActivityNote(text: string | undefined): boolean {
  const t = text?.trim() ?? ''
  if (!t || isRoutineLifecycleNote(t)) return false
  return BROKER_CONTACT_NOTE_RE.test(t)
}

/**
 * Last time Credyx chased the broker about payment.
 * Ignores silent `last_broker_contact` stamps and PPW send times.
 */
export function resolveLastBrokerContact(invoice: Invoice): string | null {
  const candidates: string[] = []
  if (invoice.collections_last_inquiry_at) candidates.push(invoice.collections_last_inquiry_at)
  if (invoice.collections_followup_at) candidates.push(invoice.collections_followup_at)
  for (const note of invoice.notes_history ?? []) {
    if (isBrokerContactActivityNote(note.note) && note.created_at) {
      candidates.push(note.created_at)
    }
  }
  if (candidates.length === 0) return null
  return candidates.reduce((latest, iso) => (iso > latest ? iso : latest))
}

function resolveBrokerRisk(invoice: Invoice): {
  level: BrokerRiskLevel
  cleared: boolean
} {
  const profile = getLatestBrokerRiskProfile(invoice.client_id, invoice.broker_id)
  if (!profile) return { level: 'unrated', cleared: false }
  return {
    level: profile.risk_level ?? profile.computed_risk_level ?? 'unrated',
    cleared: profile.review_status === 'cleared',
  }
}

/** Build one collections row using live due dates (not stale days_since_expected). */
export function buildAdminCollectionsRow(
  invoice: Invoice,
  payments: Payment[],
  brokers: Broker[]
): AdminCollectionsRow {
  const broker =
    brokers.find((b) => b.id === invoice.broker_id) ??
    brokers.find((b) => b.name === invoice.broker_name)
  const confirmedPayDate = hasBrokerConfirmedPayDate(invoice)
    ? invoice.collection_date ?? null
    : null
  const amount = getInvoiceOpenArBalance(invoice, payments)
  const risk = resolveBrokerRisk(invoice)
  const lastContact = resolveLastBrokerContact(invoice)
  const ppwSentAt = getPpwSentAt(invoice)
  const trackStage = getCollectionsTrackStage({ invoice, broker })
  const chaseStatus = getChaseStatus(invoice, broker)
  const callbackDate =
    invoice.collection_status === 'C/B' ? invoice.collection_date ?? null : null
  const urgentReasons = getCollectionsUrgentReasons({
    stillOpen: amount > AMOUNT_EPSILON,
    willPayDate: confirmedPayDate,
    callbackDate,
    isCallback: invoice.collection_status === 'C/B',
    brokerRiskLevel: risk.level,
    brokerReviewCleared: risk.cleared,
    daysPastDue: getDaysOutstanding(invoice),
    invoiceAgeDays: getInvoiceAgeDays(invoice),
    ppwSent: Boolean(ppwSentAt),
    daysSincePpw: getDaysSincePpwSent(invoice),
    lastContact,
    needsCall: chaseStatus === 'needs_attention',
    ppwCheckDue: trackStage === 'ppw_check',
    paymentVerifyDue: trackStage === 'payment_verify',
    pastDueUrgent: trackStage === 'past_due_urgent',
  })

  return {
    invoice,
    broker,
    amount,
    ageDays: getInvoiceAgeDays(invoice),
    dueDate: getEffectiveInvoiceDueDate(invoice),
    dueDays: getInvoiceBrokerDueDays(invoice, brokers),
    daysPastDue: getDaysOutstanding(invoice),
    isOverdue: isInvoiceOverdue(invoice),
    confirmedPayDate,
    collectionStatus: invoice.collection_status,
    ppwSentAt,
    daysSincePpw: getDaysSincePpwSent(invoice),
    paperworkCheckDays: resolvePaperworkCheckDays(broker),
    inquiryDays: inquiryDaysFor(broker),
    trackStage,
    chaseStatus,
    lastContact,
    brokerRiskLevel: risk.level,
    isUrgent: urgentReasons.length > 0,
    isUrgentCollection: isUrgentCollectionStage(trackStage) || urgentReasons.includes('no_ppw'),
    urgentReasons,
    isCallbackDue: urgentReasons.includes('callback_missed'),
    nextFollowup: getNextBrokerFollowup({ invoice, broker }),
  }
}

export function buildAdminCollectionsRows(
  invoices: Invoice[],
  payments: Payment[],
  brokers: Broker[],
  clientId = ''
): AdminCollectionsRow[] {
  const rows: AdminCollectionsRow[] = []
  for (const invoice of invoices) {
    if (!isCollectionsWorkInvoice(invoice)) continue
    if (clientId && invoice.client_id !== clientId) continue
    const row = buildAdminCollectionsRow(invoice, payments, brokers)
    if (row.amount <= AMOUNT_EPSILON) continue
    rows.push(row)
  }
  return rows
}

export function matchesCollectionsFocus(
  row: AdminCollectionsRow,
  focus: CollectionsFocus
): boolean {
  if (focus === 'all') return true
  if (focus === 'overdue') return row.isOverdue
  if (focus === 'will_pay') return row.collectionStatus === 'W/P'
  if (focus === 'callback') return row.collectionStatus === 'C/B'
  if (focus === 'no_ppw') return row.trackStage === 'no_ppw'
  if (focus === 'ppw_check') return row.trackStage === 'ppw_check' || row.trackStage === 'ppw_waiting'
  if (focus === 'payment_verify') {
    return row.trackStage === 'payment_verify' || row.trackStage === 'payment_waiting'
  }
  if (focus === 'urgent') return row.isUrgentCollection
  if (focus === 'chase') {
    return (
      row.chaseStatus === 'ppw_check_due' ||
      row.chaseStatus === 'payment_verify' ||
      row.chaseStatus === 'past_due_urgent' ||
      row.chaseStatus === 'due_for_inquiry' ||
      row.chaseStatus === 'due_for_followup' ||
      row.chaseStatus === 'needs_attention' ||
      row.chaseStatus === 'awaiting_response'
    )
  }
  return row.chaseStatus !== 'not_due'
}

export function collectionsFocusLabel(focus: CollectionsFocus): string {
  switch (focus) {
    case 'chase':
      return 'Chase'
    case 'overdue':
      return 'Overdue'
    case 'will_pay':
      return 'Will Pay'
    case 'callback':
      return 'Call back'
    case 'no_ppw':
      return 'PPW not sent'
    case 'ppw_check':
      return 'PPW status check'
    case 'payment_verify':
      return 'Payment verify'
    case 'urgent':
      return 'Urgent collection'
    default:
      return 'Open'
  }
}

export { collectionsUrgentLabel }

export function formatUrgentReasons(reasons: CollectionsUrgentReason[]): string {
  return reasons.map(collectionsUrgentLabel).join(' · ')
}

/** Review-column pill colors: Call back due red, risky broker amber, 15d+ yellow. */
export function reviewReasonPillClass(reason: CollectionsUrgentReason): string {
  if (reason === 'callback_missed') return 'status-pill status-pill--overdue'
  if (reason === 'risky_broker') return 'status-pill status-pill--dark-red'
  if (reason === 'overdue' || reason === 'no_ppw') return 'status-pill status-pill--urgent-collection'
  if (reason === 'ppw_check_due') return 'status-pill status-pill--pending'
  if (reason === 'payment_verify') return 'status-pill status-pill--warn'
  return 'status-pill status-pill--overdue'
}

/** Short Review pill text. */
export function reviewReasonPillLabel(reason: CollectionsUrgentReason): string {
  if (reason === 'callback_missed') return 'Call back due'
  if (reason === 'risky_broker') return 'Risky broker'
  if (reason === 'overdue') return 'Urgent collection'
  if (reason === 'no_ppw') return 'PPW not sent'
  if (reason === 'ppw_check_due') return 'PPW check'
  if (reason === 'payment_verify') return 'Verify pay'
  return collectionsUrgentLabel(reason)
}

export function chaseStatusLabel(status: ChaseQueueStatus): string {
  switch (status) {
    case 'needs_attention':
      return 'Call broker'
    case 'due_for_followup':
      return 'Follow-up'
    case 'due_for_inquiry':
      return 'Inquiry due'
    case 'awaiting_response':
      return 'Awaiting'
    case 'ppw_check_due':
      return 'PPW status check'
    case 'payment_waiting':
      return 'Payment waiting'
    case 'payment_verify':
      return 'Call — payment'
    case 'past_due_urgent':
      return 'Urgent collection'
    default:
      return 'On track'
  }
}

/** Carrier-facing chase labels (Credyx works the queue — not “Call broker”). */
export function carrierChaseStatusLabel(status: ChaseQueueStatus): string {
  switch (status) {
    case 'needs_attention':
      return 'Being worked'
    case 'due_for_followup':
      return 'Follow-up'
    case 'due_for_inquiry':
      return 'Inquiry due'
    case 'awaiting_response':
      return 'Awaiting reply'
    case 'ppw_check_due':
      return 'Paperwork check'
    case 'payment_waiting':
      return 'Waiting on Net terms'
    case 'payment_verify':
      return 'Payment status check'
    case 'past_due_urgent':
      return 'Past due'
    default:
      return 'On track'
  }
}

export function chaseStatusPillClass(status: ChaseQueueStatus): string {
  switch (status) {
    case 'needs_attention':
      return 'status-pill status-pill--overdue'
    case 'due_for_followup':
      return 'status-pill status-pill--warn'
    case 'due_for_inquiry':
      return 'status-pill status-pill--pending'
    case 'awaiting_response':
      return 'status-pill status-pill--hold'
    case 'ppw_check_due':
      return 'status-pill status-pill--pending'
    case 'payment_waiting':
      return 'status-pill status-pill--hold'
    case 'payment_verify':
      return 'status-pill status-pill--warn'
    case 'past_due_urgent':
      return 'status-pill status-pill--urgent-collection'
    default:
      return 'status-pill'
  }
}

export function formatBrokerNetDays(days: number | null): string {
  if (days == null || days <= 0) return '—'
  return `Net ${days}`
}
