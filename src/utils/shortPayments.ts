import type { Invoice } from '../types/invoice'
import type { Payment } from '../types/payment'
import { isShortPayment } from '../types/payment'
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

/**
 * Amount treated as applied for pay-variance detection:
 * confirmed received + awaiting/disputed remittances − awaiting short corrections.
 * Unpaid invoices (nothing posted) are not short-pays.
 */
export function getInvoiceAppliedForVariance(invoice: Invoice, payments: Payment[]): number {
  const confirmed = getInvoiceReceivedAmount(invoice, payments)
  // Explicit paid_amount already reflects settled received — don't double-count rows.
  if (invoice.paid_amount != null && invoice.paid_amount > 0) {
    return confirmed
  }

  const pendingRemit = payments
    .filter(
      (p) =>
        p.invoice_id === invoice.id &&
        (p.status === 'awaiting_receipt' || p.status === 'disputed') &&
        !isShortPayment(p)
    )
    .reduce((sum, p) => sum + p.amount, 0)

  const pendingShort = payments
    .filter(
      (p) =>
        p.invoice_id === invoice.id &&
        (p.status === 'awaiting_receipt' ||
          p.status === 'pending' ||
          p.status === 'disputed') &&
        isShortPayment(p)
    )
    .reduce((sum, p) => sum + p.amount, 0)

  return Math.max(0, confirmed + pendingRemit - pendingShort)
}

export function isShortPaymentInvoice(invoice: Invoice, payments: Payment[]): boolean {
  const applied = getInvoiceAppliedForVariance(invoice, payments)
  if (applied <= AMOUNT_EPSILON) return false
  return getShortfallAmount(invoice, applied) >= AMOUNT_EPSILON
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
  if (
    invoice.status === 'written_off' ||
    invoice.status === 'write_off_pending' ||
    invoice.status === 'force_closed'
  ) {
    return 'written_off'
  }
  return 'open'
}

export function buildShortPaymentRecord(
  invoice: Invoice,
  payments: Payment[]
): ShortPaymentRecord | null {
  if (!isShortPaymentInvoice(invoice, payments)) return null

  const received_amount = getInvoiceAppliedForVariance(invoice, payments)
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
