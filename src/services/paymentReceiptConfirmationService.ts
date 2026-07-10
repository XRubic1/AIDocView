import { getInvoiceById, updateInvoice } from '../data/mockInvoices'
import {
  getConfirmedPaymentTotal,
  getPaymentById,
  mockPayments,
  updatePayment,
} from '../data/mockPayments'
import type { Invoice, InvoiceNote } from '../types/invoice'
import type { Payment, PaymentReceiptDispute } from '../types/payment'
import { formatCurrency } from '../utils/format'
import { logAuditEvent } from '../utils/auditLogger'
import { buildPaymentConfirmationNote } from './clientInvoiceActions'
import {
  notifyAdminPaymentReceiptConfirmed,
  notifyAdminPaymentReceiptDispute,
} from './adminNotificationService'
import { clearClientTenantCache } from '../data/clientDemoData'
import { notifyClientDisputeResolved } from '../data/mockNotifications'
import { recordShortPaymentFeeReimbursement } from './reimbursementAccountService'
import { isShortPayment } from '../types/payment'

export const CLIENT_RECEIPT_CONFIRMATION_DAYS = 30

const RECEIPT_DISPUTE_HOLD_REASON =
  'Payment receipt dispute — funds on hold until Credyx resolves'

/**
 * Receipt confirmation applies a Credyx-posted payment that already exists.
 * Allow hold (stale dispute hold in client memory) and paid/force_closed;
 * only block write-offs / rejected drafts.
 */
function canApplyReceiptConfirmation(invoice: Invoice): boolean {
  if (
    invoice.status === 'written_off' ||
    invoice.status === 'write_off_pending' ||
    invoice.status === 'rejected'
  ) {
    return false
  }
  return true
}

export const PAYMENT_RECEIPT_DISPUTE_REASONS = [
  { value: 'funds_not_received', label: 'Funds not received' },
  { value: 'wrong_amount', label: 'Wrong amount' },
  { value: 'wrong_invoice', label: 'Wrong invoice' },
  { value: 'other', label: 'Other' },
] as const

export function getPaymentReceiptDisputeLabel(reason: string): string {
  return PAYMENT_RECEIPT_DISPUTE_REASONS.find((r) => r.value === reason)?.label ?? reason
}

function addDaysIso(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString()
}

function applyPaymentToInvoice(
  invoice: Invoice,
  totalReceived: number,
  authorName: string,
  noteSuffix: string
): Invoice | undefined {
  const isShort = totalReceived < invoice.amount - 0.01
  const isOver = totalReceived > invoice.amount + 0.01

  const noteText = buildPaymentConfirmationNote(invoice.amount, totalReceived, noteSuffix)

  const paidNote: InvoiceNote = {
    id: `note-receipt-${Date.now()}`,
    note: noteText,
    created_by: authorName,
    created_at: new Date().toISOString(),
    type: 'client_note',
  }

  return updateInvoice(invoice.id, {
    status: isShort ? 'approved' : 'paid',
    paid_amount: totalReceived,
    hold_reason: undefined,
    notes_history: [...(invoice.notes_history || []), paidNote],
    days_since_expected: isShort ? invoice.days_since_expected : 0,
    overpayment_accepted_at: isOver ? undefined : invoice.overpayment_accepted_at,
    updated_at: new Date().toISOString(),
  })
}

/** Finalize a managed-client payment after receipt is confirmed. */
function finalizeReceiptConfirmation(
  paymentId: string,
  confirmedBy: string,
  autoConfirmed = false
): { payment: Payment; invoice: Invoice } | undefined {
  const existing = getPaymentById(paymentId)
  if (!existing || existing.status !== 'awaiting_receipt') return undefined

  const invoice = getInvoiceById(existing.invoice_id)
  if (!invoice || !canApplyReceiptConfirmation(invoice)) return undefined

  const now = new Date().toISOString()
  const payment = updatePayment(paymentId, {
    status: 'confirmed',
    client_confirmed_at: now,
    client_confirmed_by: confirmedBy,
    confirmed_by: confirmedBy,
    confirmed_at: now,
  })
  if (!payment) return undefined

  const totalReceived = getConfirmedPaymentTotal(invoice.id)
  const noteSuffix =
    payment.payment_kind === 'short'
      ? autoConfirmed
        ? `Auto-confirmed short payment correction of ${formatCurrency(payment.amount)} after ${CLIENT_RECEIPT_CONFIRMATION_DAYS}-day window`
        : `Client confirmed short payment correction of ${formatCurrency(payment.amount)}`
      : autoConfirmed
        ? `Auto-confirmed after ${CLIENT_RECEIPT_CONFIRMATION_DAYS}-day window — ${formatCurrency(payment.amount)}`
        : `Client confirmed receipt of ${formatCurrency(payment.amount)}`

  const updated = applyPaymentToInvoice(invoice, totalReceived, confirmedBy, noteSuffix)
  if (!updated) return undefined

  clearClientTenantCache(invoice.client_id)

  if (!autoConfirmed) {
    notifyAdminPaymentReceiptConfirmed({
      clientId: invoice.client_id,
      clientName: invoice.client_name,
      invoiceNumber: invoice.invoice_number,
      amount: payment.amount,
      paymentId: payment.id,
      isShortCorrection: isShortPayment(payment),
    })
  }

  logAuditEvent(
    'payment_received',
    'invoice',
    updated.id,
    updated.invoice_number,
    payment.payment_kind === 'short'
      ? `${confirmedBy} confirmed short payment correction of ${formatCurrency(payment.amount)} on ${updated.invoice_number}`
      : `${confirmedBy} confirmed receipt of ${formatCurrency(payment.amount)} on ${updated.invoice_number}`,
    autoConfirmed ? 'system' : 'client-portal',
    confirmedBy,
    autoConfirmed ? 'System' : 'Client',
    undefined,
    { payment_id: payment.id, action: 'receipt_confirmed', auto_confirmed: autoConfirmed }
  )

  if (isShortPayment(payment)) {
    void recordShortPaymentFeeReimbursement(payment)
  }

  return { payment, invoice: updated }
}

/** Managed client confirms Credyx-posted funds were received. */
export function confirmPaymentReceipt(
  paymentId: string,
  clientName: string
): { payment: Payment; invoice: Invoice } | undefined {
  return finalizeReceiptConfirmation(paymentId, clientName, false)
}

/** Client disputes receipt of a Credyx-posted payment — funds placed on hold. */
export function openPaymentReceiptDispute(
  paymentId: string,
  reason: string,
  description: string,
  clientName: string
): { payment: Payment; invoice: Invoice } | undefined {
  const existing = getPaymentById(paymentId)
  if (!existing || existing.status !== 'awaiting_receipt') return undefined
  if (!description.trim()) return undefined

  const reasonLabel = getPaymentReceiptDisputeLabel(reason)
  const dispute: PaymentReceiptDispute = {
    id: `pay-dispute-${Date.now()}`,
    reason,
    description: description.trim(),
    status: 'open',
    created_by: clientName,
    created_at: new Date().toISOString(),
  }

  const payment = updatePayment(paymentId, {
    status: 'disputed',
    dispute,
  })
  if (!payment) return undefined

  const invoice = getInvoiceById(payment.invoice_id)
  if (!invoice) return undefined

  const disputeNote: InvoiceNote = {
    id: `note-pay-dispute-${Date.now()}`,
    note: `Payment receipt dispute: ${reasonLabel} — ${description.trim()}. Funds on hold.`,
    created_by: clientName,
    created_at: new Date().toISOString(),
    type: 'dispute',
    visibility: 'client',
  }

  const updated = updateInvoice(invoice.id, {
    status: 'hold',
    hold_reason: RECEIPT_DISPUTE_HOLD_REASON,
    notes_history: [...(invoice.notes_history || []), disputeNote],
    updated_at: new Date().toISOString(),
  })
  if (!updated) return undefined

  notifyAdminPaymentReceiptDispute({
    clientId: invoice.client_id,
    clientName: invoice.client_name,
    invoiceNumber: invoice.invoice_number,
    amount: payment.amount,
    reason: reasonLabel,
    paymentId: payment.id,
  })

  clearClientTenantCache(invoice.client_id)

  logAuditEvent(
    'payment_received',
    'invoice',
    updated.id,
    updated.invoice_number,
    `${clientName} disputed receipt of ${formatCurrency(payment.amount)} on ${updated.invoice_number}`,
    'client-portal',
    clientName,
    'Client',
    undefined,
    { payment_id: payment.id, action: 'receipt_disputed', reason }
  )

  return { payment, invoice: updated }
}

export type ResolveReceiptDisputeOutcome = 'confirm' | 'reject'

export interface ResolveReceiptDisputeOptions {
  /** Optional corrected payment amount when Credyx upholds the posting. */
  adjustedAmount?: number
}

/** Credyx resolves a payment receipt dispute. */
export function resolvePaymentReceiptDispute(
  paymentId: string,
  adminName: string,
  response: string,
  outcome: ResolveReceiptDisputeOutcome,
  options?: ResolveReceiptDisputeOptions
): { payment: Payment; invoice: Invoice } | undefined {
  const existing = getPaymentById(paymentId)
  if (!existing || existing.status !== 'disputed' || !existing.dispute) return undefined
  if (!response.trim()) return undefined

  const invoice = getInvoiceById(existing.invoice_id)
  if (!invoice) return undefined

  const now = new Date().toISOString()
  const resolvedDispute: PaymentReceiptDispute = {
    ...existing.dispute,
    status: 'resolved',
    resolved_at: now,
    resolved_by: adminName,
    response: response.trim(),
  }

  if (outcome === 'confirm') {
    const priorAmount = existing.amount
    const amount =
      options?.adjustedAmount != null &&
      Number.isFinite(options.adjustedAmount) &&
      options.adjustedAmount > 0
        ? options.adjustedAmount
        : existing.amount

    const payment = updatePayment(paymentId, {
      status: 'awaiting_receipt',
      amount,
      dispute: resolvedDispute,
      client_confirmed_at: undefined,
      client_confirmed_by: undefined,
      confirmed_by: undefined,
      confirmed_at: undefined,
      client_confirmation_deadline: buildReceiptConfirmationDeadline(),
      notes:
        amount !== priorAmount
          ? [existing.notes, `Credyx adjusted posted amount from ${formatCurrency(priorAmount)} to ${formatCurrency(amount)}.`]
              .filter(Boolean)
              .join(' ')
          : existing.notes,
    })
    if (!payment) return undefined

    const amountNote =
      amount !== priorAmount
        ? `Credyx adjusted the posted amount to ${formatCurrency(amount)} and `
        : ''

    const resolveNote: InvoiceNote = {
      id: `note-dispute-requeue-${Date.now()}`,
      note: `Payment receipt dispute resolved — ${amountNote}please confirm receipt of ${formatCurrency(amount)} within ${CLIENT_RECEIPT_CONFIRMATION_DAYS} days or dispute again. ${response.trim()}`,
      created_by: adminName,
      created_at: now,
      type: 'client_note',
      visibility: 'client',
    }

    const updated = updateInvoice(invoice.id, {
      status: invoice.hold_reason === RECEIPT_DISPUTE_HOLD_REASON ? 'approved' : invoice.status,
      hold_reason:
        invoice.hold_reason === RECEIPT_DISPUTE_HOLD_REASON ? undefined : invoice.hold_reason,
      notes_history: [...(invoice.notes_history || []), resolveNote],
      updated_at: now,
    })
    if (!updated) return undefined

    clearClientTenantCache(invoice.client_id)

    notifyClientDisputeResolved({
      clientId: invoice.client_id,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoice_number,
      paymentId: payment.id,
      amount,
      outcome: 'requeued',
      response: response.trim(),
    })

    logAuditEvent(
      'payment_received',
      'invoice',
      updated.id,
      updated.invoice_number,
      `${adminName} resolved receipt dispute — ${formatCurrency(amount)} awaiting client confirmation on ${updated.invoice_number}`,
      'admin',
      adminName,
      'Admin',
      undefined,
      {
        payment_id: payment.id,
        action: 'receipt_dispute_requeued',
        prior_amount: priorAmount,
        adjusted_amount: amount,
      }
    )

    return { payment, invoice: updated }
  }

  const payment = updatePayment(paymentId, {
    status: 'rejected',
    dispute: resolvedDispute,
    rejection_reason: response.trim(),
  })
  if (!payment) return undefined

  const rejectNote: InvoiceNote = {
    id: `note-dispute-resolved-${Date.now()}`,
    note: `Payment receipt dispute resolved — payment reversed. ${response.trim()}`,
    created_by: adminName,
    created_at: now,
    type: 'client_note',
    visibility: 'client',
  }

  const updated = updateInvoice(invoice.id, {
    status: invoice.hold_reason === RECEIPT_DISPUTE_HOLD_REASON ? 'approved' : invoice.status,
    hold_reason: invoice.hold_reason === RECEIPT_DISPUTE_HOLD_REASON ? undefined : invoice.hold_reason,
    notes_history: [...(invoice.notes_history || []), rejectNote],
    updated_at: now,
  })

  clearClientTenantCache(invoice.client_id)

  if (updated) {
    notifyClientDisputeResolved({
      clientId: invoice.client_id,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoice_number,
      paymentId: payment.id,
      amount: payment.amount,
      outcome: 'rejected',
      response: response.trim(),
    })
  }

  return { payment, invoice: updated! }
}

/** Auto-confirm payments past the 30-day client confirmation window. */
export function processExpiredReceiptConfirmations(): number {
  const expired = mockPayments.filter(
    (p) =>
      p.status === 'awaiting_receipt' &&
      p.client_confirmation_deadline &&
      new Date(p.client_confirmation_deadline).getTime() < Date.now()
  )

  let count = 0
  for (const payment of expired) {
    if (finalizeReceiptConfirmation(payment.id, 'Credyx (auto)', true)) count += 1
  }
  return count
}

export function listAwaitingReceiptPayments(): Payment[] {
  return mockPayments.filter((p) => p.status === 'awaiting_receipt')
}

export function listReceiptDisputedPayments(): Payment[] {
  return mockPayments.filter((p) => p.status === 'disputed')
}

/**
 * Ensure open receipt disputes have Credyx bell notifications
 * (covers disputes opened before persist/realtime was fixed).
 */
export function syncAdminNotificationsForOpenReceiptDisputes(): void {
  for (const payment of listReceiptDisputedPayments()) {
    const invoice = getInvoiceById(payment.invoice_id)
    if (!invoice) continue
    const reasonLabel = payment.dispute?.reason
      ? getPaymentReceiptDisputeLabel(payment.dispute.reason)
      : 'Dispute'
    notifyAdminPaymentReceiptDispute({
      clientId: invoice.client_id,
      clientName: invoice.client_name,
      invoiceNumber: invoice.invoice_number,
      amount: payment.amount,
      reason: reasonLabel,
      paymentId: payment.id,
    })
  }
}

/** Build deadline ISO for a newly posted managed-client payment. */
export function buildReceiptConfirmationDeadline(): string {
  return addDaysIso(CLIENT_RECEIPT_CONFIRMATION_DAYS)
}
