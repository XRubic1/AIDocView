import type { Payment, PaymentStatus } from '../types/payment'

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
