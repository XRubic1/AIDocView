import type { Invoice } from '../types/invoice'
import type { Payment } from '../types/payment'
import {
  AMOUNT_EPSILON,
  getInvoiceReceivedAmount,
  getShortfallAmount,
} from './paymentVariance'

export type ShortPaymentResolution = 'open' | 'written_off'

export type ShortPaymentRecord = {
  invoice: Invoice
  invoice_amount: number
  received_amount: number
  shortfall_amount: number
  resolution: ShortPaymentResolution
}

export { getInvoiceReceivedAmount, getShortfallAmount }

export function isShortPaymentInvoice(invoice: Invoice, payments: Payment[]): boolean {
  const received = getInvoiceReceivedAmount(invoice, payments)
  if (received <= 0) return false
  return getShortfallAmount(invoice, received) >= AMOUNT_EPSILON
}

export function canCloseShortPaymentAsUncollectable(invoice: Invoice): boolean {
  if (
    invoice.status === 'written_off' ||
    invoice.status === 'write_off_pending' ||
    invoice.status === 'force_closed'
  ) {
    return false
  }
  return invoice.status === 'approved' || invoice.status === 'paid'
}

export function getShortPaymentResolution(invoice: Invoice): ShortPaymentResolution {
  if (invoice.status === 'written_off' || invoice.status === 'write_off_pending') {
    return 'written_off'
  }
  return 'open'
}

export function buildShortPaymentRecord(
  invoice: Invoice,
  payments: Payment[]
): ShortPaymentRecord | null {
  if (!isShortPaymentInvoice(invoice, payments)) return null

  const received_amount = getInvoiceReceivedAmount(invoice, payments)
  return {
    invoice,
    invoice_amount: invoice.amount,
    received_amount,
    shortfall_amount: getShortfallAmount(invoice, received_amount),
    resolution: getShortPaymentResolution(invoice),
  }
}

/** All short-paid invoices for a client, newest activity first. */
export function listShortPayments(
  invoices: Invoice[],
  payments: Payment[]
): ShortPaymentRecord[] {
  return invoices
    .map((invoice) => buildShortPaymentRecord(invoice, payments))
    .filter((row): row is ShortPaymentRecord => row != null)
    .sort((a, b) => {
      const aDate = a.invoice.updated_at ?? a.invoice.created_at
      const bDate = b.invoice.updated_at ?? b.invoice.created_at
      return bDate.localeCompare(aDate)
    })
}

export function filterShortPaymentsByResolution(
  rows: ShortPaymentRecord[],
  filter: 'all' | ShortPaymentResolution
): ShortPaymentRecord[] {
  if (filter === 'all') return rows
  return rows.filter((row) => row.resolution === filter)
}
