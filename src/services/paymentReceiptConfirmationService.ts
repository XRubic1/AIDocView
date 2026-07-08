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
import { isPostableForPayment } from '../utils/invoiceAging'
import { buildPaymentConfirmationNote } from './clientInvoiceActions'
import { notifyAdminPaymentReceiptDispute } from './adminNotificationService'
import { clearClientTenantCache } from '../data/clientDemoData'

export const CLIENT_RECEIPT_CONFIRMATION_DAYS = 30

const RECEIPT_DISPUTE_HOLD_REASON =
  'Payment receipt dispute — funds on hold until Credyx resolves'

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

  const now = new Date().toISOString()
  const payment = updatePayment(paymentId, {
    status: 'confirmed',
    client_confirmed_at: now,
    client_confirmed_by: confirmedBy,
    confirmed_by: confirmedBy,
    confirmed_at: now,
  })
  if (!payment) return undefined

  const invoice = getInvoiceById(payment.invoice_id)
  if (!invoice || !isPostableForPayment(invoice)) return undefined

  const totalReceived = getConfirmedPaymentTotal(invoice.id)
  const noteSuffix = autoConfirmed
    ? `Auto-confirmed after ${CLIENT_RECEIPT_CONFIRMATION_DAYS}-day window — ${formatCurrency(payment.amount)}`
    : `Client confirmed receipt of ${formatCurrency(payment.amount)}`

  const updated = applyPaymentToInvoice(invoice, totalReceived, confirmedBy, noteSuffix)
  if (!updated) return undefined

  clearClientTenantCache(invoice.client_id)

  logAuditEvent(
    'payment_received',
    'invoice',
    updated.id,
    updated.invoice_number,
    `${confirmedBy} confirmed receipt of ${formatCurrency(payment.amount)} on ${updated.invoice_number}`,
    autoConfirmed ? 'system' : 'client-portal',
    confirmedBy,
    autoConfirmed ? 'System' : 'Client',
    undefined,
    { payment_id: payment.id, action: 'receipt_confirmed', auto_confirmed: autoConfirmed }
  )

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
    clientName: invoice.client_name,
    invoiceNumber: invoice.invoice_number,
    amount: payment.amount,
    reason: reasonLabel,
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

/** Credyx resolves a payment receipt dispute. */
export function resolvePaymentReceiptDispute(
  paymentId: string,
  adminName: string,
  response: string,
  outcome: ResolveReceiptDisputeOutcome
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
    const payment = updatePayment(paymentId, {
      status: 'confirmed',
      dispute: resolvedDispute,
      client_confirmed_at: now,
      client_confirmed_by: adminName,
      confirmed_by: adminName,
      confirmed_at: now,
    })
    if (!payment) return undefined

    const totalReceived = getConfirmedPaymentTotal(invoice.id)
    const noteSuffix = `Dispute resolved — payment confirmed. ${response.trim()}`
    const updated = applyPaymentToInvoice(invoice, totalReceived, adminName, noteSuffix)
    if (!updated) return undefined

    clearClientTenantCache(invoice.client_id)
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

/** Build deadline ISO for a newly posted managed-client payment. */
export function buildReceiptConfirmationDeadline(): string {
  return addDaysIso(CLIENT_RECEIPT_CONFIRMATION_DAYS)
}
