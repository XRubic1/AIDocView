import type { Invoice } from '../types/invoice'
import type { Payment } from '../types/payment'
import {
  AMOUNT_EPSILON,
  getOverageAmount,
} from './paymentVariance'
import { getInvoiceAppliedForVariance } from './shortPayments'

export type OverpaymentResolution = 'open' | 'accepted'

export type OverpaymentRecord = {
  invoice: Invoice
  invoice_amount: number
  received_amount: number
  overage_amount: number
  resolution: OverpaymentResolution
}

export function isOverpaymentInvoice(invoice: Invoice, payments: Payment[]): boolean {
  const applied = getInvoiceAppliedForVariance(invoice, payments)
  if (applied <= AMOUNT_EPSILON) return false
  return getOverageAmount(invoice, applied) >= AMOUNT_EPSILON
}

export function getOverpaymentResolution(invoice: Invoice): OverpaymentResolution {
  return invoice.overpayment_accepted_at ? 'accepted' : 'open'
}

/** Whether the client can accept and close out the excess payment. */
export function canAcceptOverpayment(invoice: Invoice, payments: Payment[]): boolean {
  if (!isOverpaymentInvoice(invoice, payments)) return false
  if (invoice.overpayment_accepted_at) return false
  return invoice.status === 'approved' || invoice.status === 'paid'
}

export function buildOverpaymentRecord(
  invoice: Invoice,
  payments: Payment[]
): OverpaymentRecord | null {
  if (!isOverpaymentInvoice(invoice, payments)) return null

  const received_amount = getInvoiceAppliedForVariance(invoice, payments)
  return {
    invoice,
    invoice_amount: invoice.amount,
    received_amount,
    overage_amount: getOverageAmount(invoice, received_amount),
    resolution: getOverpaymentResolution(invoice),
  }
}

/** All overpaid invoices for a client, newest activity first. */
export function listOverpayments(
  invoices: Invoice[],
  payments: Payment[]
): OverpaymentRecord[] {
  return invoices
    .map((invoice) => buildOverpaymentRecord(invoice, payments))
    .filter((row): row is OverpaymentRecord => row != null)
    .sort((a, b) => {
      const aDate = a.invoice.updated_at ?? a.invoice.created_at
      const bDate = b.invoice.updated_at ?? b.invoice.created_at
      return bDate.localeCompare(aDate)
    })
}

export function filterOverpaymentsByResolution(
  rows: OverpaymentRecord[],
  filter: 'all' | OverpaymentResolution
): OverpaymentRecord[] {
  if (filter === 'all') return rows
  return rows.filter((row) => row.resolution === filter)
}
