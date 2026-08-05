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

/** Invoice status allows a write-off request (not already closed / pending). */
export function isWriteOffStatusEligible(invoice: Invoice): boolean {
  if (
    invoice.status === 'written_off' ||
    invoice.status === 'write_off_pending' ||
    invoice.status === 'force_closed'
  ) {
    return false
  }
  return invoice.status === 'approved' || invoice.status === 'paid'
}

/** True when any remittance on the invoice still awaits carrier confirmation. */
export function hasAwaitingReceiptPayment(invoiceId: string, payments: Payment[]): boolean {
  return payments.some((p) => p.invoice_id === invoiceId && p.status === 'awaiting_receipt')
}

/**
 * Carrier may write off a shortfall only after remittance is confirmed.
 * Awaiting-receipt short pays stay in Confirm — write-off is hidden until then.
 */
export function canCloseShortPaymentAsUncollectable(
  invoice: Invoice,
  payments: Payment[] = []
): boolean {
  if (!isWriteOffStatusEligible(invoice)) return false
  if (hasAwaitingReceiptPayment(invoice.id, payments)) return false

  const confirmed = getInvoiceReceivedAmount(invoice, payments)
  if (confirmed <= AMOUNT_EPSILON) return false
  return getShortfallAmount(invoice, confirmed) >= AMOUNT_EPSILON
}

/**
 * Offer "write off remaining" while posting a short payment (payment will be confirmed
 * in the same step). Still blocked if another remittance awaits confirmation.
 */
export function canOfferWriteOffWithPostedShortfall(
  invoice: Invoice,
  payments: Payment[],
  shortfallAfterPost: number
): boolean {
  if (!isWriteOffStatusEligible(invoice)) return false
  if (hasAwaitingReceiptPayment(invoice.id, payments)) return false
  return shortfallAfterPost >= AMOUNT_EPSILON
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
