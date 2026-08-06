import type { Payment, PaymentStatus } from '../types/payment'

export const CREDYX_FORCE_CONFIRM_ACTOR = 'Credyx'

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  pending: 'Pending',
  awaiting_receipt: 'Awaiting your confirmation',
  disputed: 'Disputed — funds on hold',
  confirmed: 'Confirmed',
  rejected: 'Rejected',
  reversed: 'Reversed',
}

export const PAYMENT_STATUS_PILL_CLASS: Record<PaymentStatus, string> = {
  pending: 'status-pill status-pill--pending',
  awaiting_receipt: 'status-pill status-pill--pending',
  disputed: 'status-pill status-pill--hold',
  confirmed: 'status-pill status-pill--approved',
  rejected: 'status-pill status-pill--overdue',
  reversed: 'status-pill status-pill--hold',
}

/** Statuses where funds are held pending client action or dispute resolution. */
export function isPaymentFundsOnHold(payment: Payment): boolean {
  return payment.status === 'awaiting_receipt' || payment.status === 'disputed'
}

/** Days remaining until the client confirmation deadline (0 if overdue). */
export function getReceiptConfirmationDaysLeft(payment: Payment): number | null {
  if (!payment.client_confirmation_deadline || payment.status !== 'awaiting_receipt') return null
  const deadline = new Date(payment.client_confirmation_deadline).getTime()
  const diff = deadline - Date.now()
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)))
}

export function isReceiptConfirmationOverdue(payment: Payment): boolean {
  if (!payment.client_confirmation_deadline || payment.status !== 'awaiting_receipt') return false
  return new Date(payment.client_confirmation_deadline).getTime() < Date.now()
}

/** Credyx-posted payments awaiting managed-client receipt confirmation. */
export function getAwaitingReceiptPayments(payments: Payment[]): Payment[] {
  return payments.filter((p) => p.status === 'awaiting_receipt')
}

/** First awaiting-receipt payment on an invoice, if any. */
export function getAwaitingReceiptPaymentForInvoice(
  invoiceId: string,
  payments: Payment[]
): Payment | undefined {
  return payments.find((p) => p.invoice_id === invoiceId && p.status === 'awaiting_receipt')
}

/** True when the carrier has an open payment-receipt dispute on this invoice. */
export function invoiceHasDisputedPayment(
  invoiceId: string,
  payments: Payment[]
): boolean {
  return payments.some((p) => p.invoice_id === invoiceId && p.status === 'disputed')
}
