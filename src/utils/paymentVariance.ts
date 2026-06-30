import type { Invoice } from '../types/invoice'
import type { Payment } from '../types/payment'

export const AMOUNT_EPSILON = 0.01

/** Total confirmed cash applied to an invoice (partial pay field or payment rows). */
export function getInvoiceReceivedAmount(invoice: Invoice, payments: Payment[]): number {
  if (invoice.paid_amount != null && invoice.paid_amount > 0) {
    return invoice.paid_amount
  }

  return payments
    .filter((p) => p.invoice_id === invoice.id && p.status === 'confirmed')
    .reduce((sum, p) => sum + p.amount, 0)
}

export function getShortfallAmount(invoice: Invoice, receivedAmount: number): number {
  return Math.max(0, invoice.amount - receivedAmount)
}

export function getOverageAmount(invoice: Invoice, receivedAmount: number): number {
  return Math.max(0, receivedAmount - invoice.amount)
}
