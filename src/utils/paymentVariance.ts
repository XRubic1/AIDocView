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

export type InvoiceBalanceTone = 'short' | 'over' | 'zero' | 'open'

/** Current invoice balance for display — short (red), over (green), zero (neutral). */
export function getInvoiceBalanceState(
  invoiceAmount: number,
  received: number
): {
  tone: InvoiceBalanceTone
  label: string
  /** Positive = amount still due; negative magnitude = overpaid amount */
  signedBalance: number
} {
  if (received <= 0) {
    return { tone: 'open', label: 'Balance due', signedBalance: invoiceAmount }
  }
  if (received < invoiceAmount - AMOUNT_EPSILON) {
    return { tone: 'short', label: 'Balance due', signedBalance: invoiceAmount - received }
  }
  if (received > invoiceAmount + AMOUNT_EPSILON) {
    return { tone: 'over', label: 'Overpaid', signedBalance: -(received - invoiceAmount) }
  }
  return { tone: 'zero', label: 'Balance', signedBalance: 0 }
}

export type PaymentVarianceKind = 'full' | 'short' | 'over'

/** Classify cumulative received vs invoice amount (±$0.01 tolerance). */
export function classifyPaymentVariance(
  invoiceAmount: number,
  projectedTotal: number
): PaymentVarianceKind | null {
  if (!Number.isFinite(projectedTotal) || projectedTotal <= 0 || invoiceAmount <= 0) {
    return null
  }
  if (projectedTotal < invoiceAmount - AMOUNT_EPSILON) return 'short'
  if (projectedTotal > invoiceAmount + AMOUNT_EPSILON) return 'over'
  return 'full'
}
