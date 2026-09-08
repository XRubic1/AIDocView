import { Payment, type PaymentStatus } from '../types/payment'
import { getEffectivePaymentAmount } from '../utils/paymentVariance'
import { persistPayment } from '../services/supabase/tenantPersist'
import { persistOrThrow } from '../services/persistHelper'
import { persistWithFeedback } from '../services/persistFeedback'
import { getInvoiceById } from './mockInvoices'

/** Mutable in-memory payment store (hydrated from Supabase when configured). */
export const mockPayments: Payment[] = []

export function hydratePayments(items: Payment[]): void {
  mockPayments.length = 0
  mockPayments.push(...items)
}

export function clearPayments(): void {
  mockPayments.length = 0
}

/** Merge a payment row from Supabase realtime (no persist). */
export function mergePayment(payment: Payment): void {
  const idx = mockPayments.findIndex((p) => p.id === payment.id)
  const prevStatus = idx >= 0 ? mockPayments[idx].status : undefined
  if (idx >= 0) {
    mockPayments[idx] = { ...mockPayments[idx], ...payment }
  } else {
    mockPayments.unshift(payment)
  }
  maybeRefreshBrokerRisk(payment.invoice_id, prevStatus, payment.status)
}

/** Remove a payment from the in-memory store (realtime DELETE). */
export function removePaymentFromStore(paymentId: string): void {
  const idx = mockPayments.findIndex((p) => p.id === paymentId)
  if (idx < 0) return
  const removed = mockPayments[idx]
  mockPayments.splice(idx, 1)
  maybeRefreshBrokerRisk(removed.invoice_id, removed.status, 'reversed')
}

export function getPaymentsByInvoiceId(invoiceId: string): Payment[] {
  return mockPayments.filter((p) => p.invoice_id === invoiceId)
}

export function getConfirmedPaymentTotal(invoiceId: string): number {
  return getPaymentsByInvoiceId(invoiceId).reduce(
    (sum, p) => sum + getEffectivePaymentAmount(p),
    0
  )
}

/** Statuses where money is posted but not yet applied to the invoice. */
const UNCONFIRMED_STATUSES = new Set(['pending', 'awaiting_receipt', 'disputed'])

const RISK_REFRESH_STATUSES = new Set<PaymentStatus>([
  'confirmed',
  'reversed',
  'disputed',
  'rejected',
])

/** Refresh broker risk after confirmed cash (or a reversal/dispute of that cash). */
function maybeRefreshBrokerRisk(
  invoiceId: string,
  prevStatus?: PaymentStatus,
  nextStatus?: PaymentStatus
): void {
  if (
    !RISK_REFRESH_STATUSES.has(nextStatus as PaymentStatus) &&
    !RISK_REFRESH_STATUSES.has(prevStatus as PaymentStatus)
  ) {
    return
  }
  void import('../services/refreshBrokerRiskFromPayments').then((mod) => {
    mod.scheduleBrokerRiskRefresh(invoiceId)
  })
}

/** Total posted-but-not-yet-confirmed amount (pending / awaiting receipt / disputed). */
export function getUnconfirmedPaymentTotal(invoiceId: string): number {
  return getPaymentsByInvoiceId(invoiceId)
    .filter(
      (p) => UNCONFIRMED_STATUSES.has(p.status) && p.payment_kind !== 'short'
    )
    .reduce((sum, p) => sum + p.amount, 0)
}

/** Short corrections awaiting client confirmation (reduce received once confirmed). */
export function getUnconfirmedShortPaymentTotal(invoiceId: string): number {
  return getPaymentsByInvoiceId(invoiceId)
    .filter((p) => UNCONFIRMED_STATUSES.has(p.status) && p.payment_kind === 'short')
    .reduce((sum, p) => sum + p.amount, 0)
}

/** True when an invoice has a payment awaiting confirmation or under dispute. */
export function hasUnconfirmedPayment(invoiceId: string): boolean {
  return getPaymentsByInvoiceId(invoiceId).some((p) => UNCONFIRMED_STATUSES.has(p.status))
}

/** Append a payment to the store and persist to Supabase when configured. */
export function addPayment(
  data: Omit<Payment, 'id'> & { id?: string },
  options?: { deferPersist?: boolean }
): Payment {
  const payment: Payment = {
    ...data,
    id: data.id ?? `pay-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  }
  mockPayments.unshift(payment)
  if (!options?.deferPersist) {
    const clientId = getInvoiceById(payment.invoice_id)?.client_id
    void persistWithFeedback('Payment save', () => persistPayment(payment, clientId))
  }
  maybeRefreshBrokerRisk(payment.invoice_id, undefined, payment.status)
  return payment
}

export function updatePayment(
  paymentId: string,
  patch: Partial<Payment>
): Payment | undefined {
  const payment = mockPayments.find((p) => p.id === paymentId)
  if (!payment) return undefined
  const prevStatus = payment.status
  Object.assign(payment, patch)
  const clientId = getInvoiceById(payment.invoice_id)?.client_id
  void persistWithFeedback('Payment save', () => persistPayment(payment, clientId))
  maybeRefreshBrokerRisk(payment.invoice_id, prevStatus, payment.status)
  return payment
}

export function getPaymentsForClientInvoiceIds(invoiceIds: Set<string>): Payment[] {
  return mockPayments.filter((p) => invoiceIds.has(p.invoice_id))
}

export function getPaymentById(paymentId: string): Payment | undefined {
  return mockPayments.find((p) => p.id === paymentId)
}

export async function addPaymentAsync(
  data: Omit<Payment, 'id'> & { id?: string }
): Promise<Payment> {
  const payment = addPayment(data, { deferPersist: true })
  const clientId = getInvoiceById(payment.invoice_id)?.client_id
  await persistOrThrow('payment', () => persistPayment(payment, clientId))
  return payment
}

export async function updatePaymentAsync(
  paymentId: string,
  patch: Partial<Payment>
): Promise<Payment | undefined> {
  const payment = mockPayments.find((p) => p.id === paymentId)
  if (!payment) return undefined
  Object.assign(payment, patch)
  const clientId = getInvoiceById(payment.invoice_id)?.client_id
  await persistOrThrow('payment', () => persistPayment(payment, clientId))
  return payment
}
