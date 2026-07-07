import { Payment } from '../types/payment'
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

export function getPaymentsByInvoiceId(invoiceId: string): Payment[] {
  return mockPayments.filter((p) => p.invoice_id === invoiceId)
}

export function getConfirmedPaymentTotal(invoiceId: string): number {
  return getPaymentsByInvoiceId(invoiceId)
    .filter((p) => p.status === 'confirmed')
    .reduce((sum, p) => sum + p.amount, 0)
}

/** Append a payment to the store and persist to Supabase when configured. */
export function addPayment(data: Omit<Payment, 'id'> & { id?: string }): Payment {
  const payment: Payment = {
    ...data,
    id: data.id ?? `pay-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  }
  mockPayments.unshift(payment)
  const clientId = getInvoiceById(payment.invoice_id)?.client_id
  void persistWithFeedback('Payment save', () => persistPayment(payment, clientId))
  return payment
}

export function updatePayment(
  paymentId: string,
  patch: Partial<Payment>
): Payment | undefined {
  const payment = mockPayments.find((p) => p.id === paymentId)
  if (!payment) return undefined
  Object.assign(payment, patch)
  const clientId = getInvoiceById(payment.invoice_id)?.client_id
  void persistWithFeedback('Payment save', () => persistPayment(payment, clientId))
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
  const payment = addPayment(data)
  const clientId = getInvoiceById(payment.invoice_id)?.client_id
  await persistOrThrow('payment', () => persistPayment(payment, clientId))
  return payment
}

export async function updatePaymentAsync(
  paymentId: string,
  patch: Partial<Payment>
): Promise<Payment | undefined> {
  const payment = updatePayment(paymentId, patch)
  if (!payment) return undefined
  const clientId = getInvoiceById(payment.invoice_id)?.client_id
  await persistOrThrow('payment', () => persistPayment(payment, clientId))
  return payment
}
