import type { Invoice } from '../types/invoice'
import type { Payment } from '../types/payment'
import { listPendingPayments } from '../services/clientPaymentService'
import {
  listAwaitingReceiptPayments,
  listReceiptDisputedPayments,
} from '../services/paymentReceiptConfirmationService'
import { listPendingWriteOffs } from '../services/writeOffApprovalService'
import { enrichInvoices, type EnrichedInvoice } from './invoiceAging'

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
  if (filter === 'writeoff_queue' || filter === 'write_off_pending') {
    return queue?.writeOffPending === true || invoice.status === 'write_off_pending'
  }
  if (filter === 'written_off') {
    return invoice.status === 'written_off' || invoice.status === 'write_off_pending'
  }
  return invoice.status === filter
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
      return 'Pending payment'
    case 'awaiting_confirmation':
      return 'Awaiting confirmation'
    case 'receipt_dispute':
      return 'Receipt disputes'
    default:
      return filter
  }
}
