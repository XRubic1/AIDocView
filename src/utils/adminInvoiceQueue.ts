import type { Invoice } from '../types/invoice'
import type { Payment } from '../types/payment'
import { listPendingPayments } from '../services/clientPaymentService'
import {
  listAwaitingReceiptPayments,
  listReceiptDisputedPayments,
} from '../services/paymentReceiptConfirmationService'
import { listPendingWriteOffs } from '../services/writeOffApprovalService'
import { enrichInvoices, type EnrichedInvoice } from './invoiceAging'
import { invoiceHasOpenDisputedStatus } from './clientInvoiceDisputeStatus'
import { getInvoiceNoteStatusDisplay } from './invoiceStatusHeadline'
import { invoiceHasPendingHoldPaperworkReview } from './holdPaperworkReview'

/** Admin Invoices status / queue filters. */
export type AdminInvoiceStatusFilter =
  | 'all'
  | 'pending'
  | 'hold'
  | 'approved'
  | 'overdue'
  | 'paid'
  | 'force_closed'
  | 'written_off'
  | 'write_off_pending'
  | 'pending_payment'
  | 'awaiting_confirmation'
  | 'receipt_dispute'
  | 'disputed'
  | 'will_pay'
  | 'ppw_review'
  | 'writeoff_queue'

export type AdminInvoiceQueueFlags = {
  pendingPaymentIds: string[]
  awaitingPaymentIds: string[]
  disputePaymentIds: string[]
  writeOffPending: boolean
}

/** Map invoice id → payment-queue flags from live payment stores. */
export function buildAdminInvoiceQueueIndex(payments?: {
  pending?: Payment[]
  awaiting?: Payment[]
  disputed?: Payment[]
  writeOffs?: Invoice[]
}): {
  byInvoiceId: Map<string, AdminInvoiceQueueFlags>
  counts: Record<
    'pending_payment' | 'awaiting_confirmation' | 'receipt_dispute' | 'writeoff_queue',
    number
  >
} {
  const pending = payments?.pending ?? listPendingPayments()
  const awaiting = payments?.awaiting ?? listAwaitingReceiptPayments()
  const disputed = payments?.disputed ?? listReceiptDisputedPayments()
  const writeOffs = payments?.writeOffs ?? listPendingWriteOffs()

  const byInvoiceId = new Map<string, AdminInvoiceQueueFlags>()

  const ensure = (invoiceId: string): AdminInvoiceQueueFlags => {
    let row = byInvoiceId.get(invoiceId)
    if (!row) {
      row = {
        pendingPaymentIds: [],
        awaitingPaymentIds: [],
        disputePaymentIds: [],
        writeOffPending: false,
      }
      byInvoiceId.set(invoiceId, row)
    }
    return row
  }

  for (const payment of pending) {
    ensure(payment.invoice_id).pendingPaymentIds.push(payment.id)
  }
  for (const payment of awaiting) {
    ensure(payment.invoice_id).awaitingPaymentIds.push(payment.id)
  }
  for (const payment of disputed) {
    ensure(payment.invoice_id).disputePaymentIds.push(payment.id)
  }
  for (const invoice of writeOffs) {
    ensure(invoice.id).writeOffPending = true
  }

  return {
    byInvoiceId,
    counts: {
      pending_payment: new Set(pending.map((p) => p.invoice_id)).size,
      awaiting_confirmation: new Set(awaiting.map((p) => p.invoice_id)).size,
      receipt_dispute: new Set(disputed.map((p) => p.invoice_id)).size,
      writeoff_queue: writeOffs.length,
    },
  }
}

/** Whether an invoice matches the selected admin status / queue filter. */
export function matchesAdminInvoiceStatusFilter(
  invoice: EnrichedInvoice,
  filter: AdminInvoiceStatusFilter,
  queue?: AdminInvoiceQueueFlags
): boolean {
  if (filter === 'all') return true
  if (filter === 'overdue') return invoice.isOverdue
  if (filter === 'pending_payment') return (queue?.pendingPaymentIds.length ?? 0) > 0
  if (filter === 'awaiting_confirmation') return (queue?.awaitingPaymentIds.length ?? 0) > 0
  if (filter === 'receipt_dispute') return (queue?.disputePaymentIds.length ?? 0) > 0
  if (filter === 'disputed') return invoiceHasOpenDisputedStatus(invoice)
  if (filter === 'will_pay') return getInvoiceNoteStatusDisplay(invoice) === 'will_pay'
  if (filter === 'ppw_review') return invoiceHasPendingHoldPaperworkReview(invoice)
  if (filter === 'writeoff_queue' || filter === 'write_off_pending') {
    return queue?.writeOffPending === true || invoice.status === 'write_off_pending'
  }
  if (filter === 'written_off') {
    return invoice.status === 'written_off' || invoice.status === 'write_off_pending'
  }
  return invoice.status === filter
}

export const ADMIN_INVOICE_CHIP_FILTERS = [
  'pending_payment',
  'awaiting_confirmation',
  'receipt_dispute',
  'disputed',
  'will_pay',
  'ppw_review',
  'writeoff_queue',
  'overdue',
  'pending',
  'hold',
  'approved',
  'paid',
] as const satisfies readonly AdminInvoiceStatusFilter[]

export type AdminInvoiceChipFilter = (typeof ADMIN_INVOICE_CHIP_FILTERS)[number]

export type AdminInvoiceDisplayFlags = Record<AdminInvoiceChipFilter, boolean>

/** Every chip on or off. */
export function createAdminInvoiceDisplayFlags(on: boolean): AdminInvoiceDisplayFlags {
  return {
    pending_payment: on,
    awaiting_confirmation: on,
    receipt_dispute: on,
    disputed: on,
    will_pay: on,
    ppw_review: on,
    writeoff_queue: on,
    overdue: on,
    pending: on,
    hold: on,
    approved: on,
    // Paid is opt-in so the default list stays the open A/R queue.
    paid: false,
  }
}

/**
 * One display bucket per invoice so chips are independent on/off switches.
 * Queue states win over aging / invoice status.
 */
export function getAdminInvoiceDisplayBucket(
  invoice: EnrichedInvoice,
  queue?: AdminInvoiceQueueFlags
): AdminInvoiceChipFilter | 'other' {
  if (matchesAdminInvoiceStatusFilter(invoice, 'writeoff_queue', queue)) return 'writeoff_queue'
  if (matchesAdminInvoiceStatusFilter(invoice, 'ppw_review', queue)) return 'ppw_review'
  if (matchesAdminInvoiceStatusFilter(invoice, 'receipt_dispute', queue)) return 'receipt_dispute'
  if (matchesAdminInvoiceStatusFilter(invoice, 'disputed', queue)) return 'disputed'
  if (matchesAdminInvoiceStatusFilter(invoice, 'pending_payment', queue)) return 'pending_payment'
  if (matchesAdminInvoiceStatusFilter(invoice, 'awaiting_confirmation', queue)) {
    return 'awaiting_confirmation'
  }
  if (matchesAdminInvoiceStatusFilter(invoice, 'will_pay', queue)) return 'will_pay'
  if (invoice.status === 'pending') return 'pending'
  if (invoice.status === 'hold') return 'hold'
  if (invoice.status === 'paid') return 'paid'
  if (invoice.isOverdue) return 'overdue'
  if (invoice.status === 'approved') return 'approved'
  return 'other'
}

/** True when this invoice's bucket is switched on. */
export function invoicePassesDisplayFlags(
  invoice: EnrichedInvoice,
  flags: AdminInvoiceDisplayFlags,
  queue?: AdminInvoiceQueueFlags
): boolean {
  const bucket = getAdminInvoiceDisplayBucket(invoice, queue)
  if (bucket === 'other') {
    return ADMIN_INVOICE_CHIP_FILTERS.filter((key) => key !== 'paid').every((key) => flags[key])
  }
  return flags[bucket]
}

const CHIP_FILTER_SET = new Set<string>(ADMIN_INVOICE_CHIP_FILTERS)

/** Parse `status=overdue,hold` from the URL into active chip filters. */
export function parseAdminInvoiceStatusFilters(raw: string | null | undefined): AdminInvoiceStatusFilter[] {
  if (!raw || raw === 'all') return []
  const extra = new Set<string>(['written_off', 'write_off_pending'])
  const seen = new Set<AdminInvoiceStatusFilter>()
  for (const part of raw.split(',')) {
    const key = part.trim() as AdminInvoiceStatusFilter
    if (!key || key === 'all') continue
    if (CHIP_FILTER_SET.has(key) || extra.has(key)) {
      seen.add(key)
    }
  }
  return [...seen]
}

/** Serialize active filters for `?status=`. */
export function serializeAdminInvoiceStatusFilters(filters: AdminInvoiceStatusFilter[]): string {
  return filters.filter((key) => key !== 'all').join(',')
}

/** Invoice matches if it hits any selected filter (empty = all invoices). */
export function matchesAnyAdminInvoiceStatusFilter(
  invoice: EnrichedInvoice,
  filters: AdminInvoiceStatusFilter[],
  queue?: AdminInvoiceQueueFlags
): boolean {
  if (filters.length === 0) return true
  return filters.some((filter) => matchesAdminInvoiceStatusFilter(invoice, filter, queue))
}

export type AdminInvoiceFilterCounts = {
  all: number
  pending_payment: number
  awaiting_confirmation: number
  receipt_dispute: number
  disputed: number
  will_pay: number
  ppw_review: number
  writeoff_queue: number
  overdue: number
  pending: number
  hold: number
  approved: number
  paid: number
}

/** Counts for toggle chips — one bucket per invoice. */
export function countAdminInvoiceFilters(
  invoices: EnrichedInvoice[],
  byInvoiceId: Map<string, AdminInvoiceQueueFlags>
): AdminInvoiceFilterCounts {
  const counts: AdminInvoiceFilterCounts = {
    all: invoices.length,
    pending_payment: 0,
    awaiting_confirmation: 0,
    receipt_dispute: 0,
    disputed: 0,
    will_pay: 0,
    ppw_review: 0,
    writeoff_queue: 0,
    overdue: 0,
    pending: 0,
    hold: 0,
    approved: 0,
    paid: 0,
  }
  for (const invoice of invoices) {
    const bucket = getAdminInvoiceDisplayBucket(invoice, byInvoiceId.get(invoice.id))
    if (bucket !== 'other') counts[bucket] += 1
  }
  return counts
}

/** Enrich all admin invoices for list views. */
export function enrichAdminInvoices(invoices: Invoice[]): EnrichedInvoice[] {
  return enrichInvoices(invoices)
}

/** Human label for queue / status filter chips. */
export function adminInvoiceFilterLabel(filter: AdminInvoiceStatusFilter): string {
  switch (filter) {
    case 'all':
      return 'All'
    case 'pending':
      return 'Pending review'
    case 'hold':
      return 'On hold'
    case 'approved':
      return 'Open'
    case 'overdue':
      return 'Overdue'
    case 'paid':
      return 'Paid'
    case 'force_closed':
      return 'Force closed'
    case 'written_off':
      return 'Written off'
    case 'write_off_pending':
    case 'writeoff_queue':
      return 'Write-offs'
    case 'pending_payment':
      return 'Pending payments'
    case 'awaiting_confirmation':
      return 'Awaiting confirmation'
    case 'receipt_dispute':
      return 'Receipt disputes'
    case 'disputed':
      return 'Disputed'
    case 'will_pay':
      return 'Will Pay'
    case 'ppw_review':
      return 'PPW review'
    default:
      return filter
  }
}
