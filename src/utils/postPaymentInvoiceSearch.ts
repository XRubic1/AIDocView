import type { Invoice } from '../types/invoice'
import { isOpenArInvoice, isPostableForPayment } from './invoiceAging'
import { AMOUNT_EPSILON } from './paymentVariance'

export type PostPaymentSearchHit = {
  invoice: Invoice
  score: number
  isPostable: boolean
}

export type InvoicePickerCategory = 'open' | 'short' | 'over' | 'closed' | 'other'

/** Classify invoice for the post-payment picker default list. */
export function getInvoicePickerCategory(
  invoice: Invoice,
  receivedAmount: number
): InvoicePickerCategory {
  if (invoice.status === 'force_closed' || invoice.status === 'written_off') return 'closed'
  if (receivedAmount > invoice.amount + AMOUNT_EPSILON) return 'over'
  if (receivedAmount > 0 && receivedAmount < invoice.amount - AMOUNT_EPSILON) return 'short'
  if (!isPostableForPayment(invoice)) return 'other'
  return 'open'
}

/** Default picker list — approved open A/R only (hides paid, short, over, closed). */
export function isDefaultPickerVisible(
  invoice: Invoice,
  receivedAmount: number
): boolean {
  if (invoice.status === 'paid') return false
  return getInvoicePickerCategory(invoice, receivedAmount) === 'open'
}

/** Build the default invoice list (no search query). */
export function listDefaultPickerInvoices(
  invoices: Invoice[],
  getReceived: (invoiceId: string) => number,
  showAll: boolean,
  limit = 200
): PostPaymentSearchHit[] {
  return invoices
    .filter((invoice) => {
      if (showAll) return true
      return isDefaultPickerVisible(invoice, getReceived(invoice.id))
    })
    .sort((a, b) => b.invoice_date.localeCompare(a.invoice_date))
    .slice(0, limit)
    .map((invoice) => ({
      invoice,
      score: 0,
      isPostable: isPostableForPayment(invoice),
    }))
}

/** Parse numeric amount from search text (e.g. "5200", "$5,200.00"). */
function parseAmountQuery(query: string): number | null {
  const cleaned = query.replace(/[$,\s]/g, '')
  if (!cleaned || !/^-?\d+(\.\d+)?$/.test(cleaned)) return null
  const value = parseFloat(cleaned)
  return Number.isFinite(value) ? value : null
}

/** Rank client invoices for the post-payment lookup combobox. */
export function searchInvoicesForPostPayment(
  invoices: Invoice[],
  query: string,
  limit = 8
): PostPaymentSearchHit[] {
  const q = query.trim().toLowerCase()
  if (!q) return []

  const amountQuery = parseAmountQuery(q)
  const numericFragment = q.replace(/[^0-9.]/g, '')

  const scored = invoices
    .map((invoice) => {
      let score = 0
      const invNum = invoice.invoice_number.toLowerCase()
      const broker = invoice.broker_name.toLowerCase()
      const load = invoice.load_number?.toLowerCase() ?? ''
      const amountStr = invoice.amount.toFixed(2)

      if (invNum === q) score += 200
      else if (invNum.includes(q)) score += 100

      if (load === q) score += 120
      else if (load.includes(q)) score += 80

      if (broker === q) score += 90
      else if (broker.includes(q)) score += 60

      if (amountQuery !== null && Math.abs(invoice.amount - amountQuery) < 0.01) {
        score += 150
      } else if (numericFragment && amountStr.includes(numericFragment)) {
        score += 50
      }

      return {
        invoice,
        score,
        isPostable: isPostableForPayment(invoice),
      }
    })
    .filter((hit) => hit.score > 0)

  scored.sort((a, b) => {
    if (a.isPostable !== b.isPostable) return a.isPostable ? -1 : 1
    return b.score - a.score
  })

  return scored.slice(0, limit)
}

/** Recent postable invoices when the search field is focused but empty. */
export function getDefaultPostPaymentSuggestions(
  invoices: Invoice[],
  limit = 6
): PostPaymentSearchHit[] {
  return invoices
    .filter((inv) => isPostableForPayment(inv))
    .sort((a, b) => b.invoice_date.localeCompare(a.invoice_date))
    .slice(0, limit)
    .map((invoice) => ({
      invoice,
      score: 0,
      isPostable: true,
    }))
}

export function getInvoicePostStatusLabel(invoice: Invoice, receivedAmount?: number): string {
  if (invoice.status === 'written_off') return 'Written off'
  if (invoice.status === 'force_closed') return 'Force closed'
  if (receivedAmount !== undefined && receivedAmount > 0) {
    if (receivedAmount < invoice.amount - 0.01) return 'Short'
    if (receivedAmount > invoice.amount + 0.01) return 'Over'
  }
  if (isOpenArInvoice(invoice)) return 'Open'
  switch (invoice.status) {
    case 'paid':
      return 'Paid'
    case 'pending':
      return 'Pending'
    case 'hold':
      return 'On hold'
    case 'force_closed':
      return 'Force closed'
    case 'written_off':
      return 'Written off'
    case 'rejected':
      return 'Rejected'
    default:
      return invoice.status
  }
}

export function getInvoicePostStatusClass(invoice: Invoice, receivedAmount?: number): string {
  if (invoice.status === 'written_off') return 'status-pill status-pill--hold'
  if (invoice.status === 'force_closed') return 'status-pill status-pill--overdue'
  if (receivedAmount !== undefined && receivedAmount > 0) {
    if (receivedAmount < invoice.amount - 0.01) return 'status-pill status-pill--pending'
    if (receivedAmount > invoice.amount + 0.01) return 'status-pill status-pill--overdue'
  }
  if (isOpenArInvoice(invoice)) return 'status-pill status-pill--approved'
  switch (invoice.status) {
    case 'paid':
      return 'status-pill status-pill--approved'
    case 'pending':
      return 'status-pill status-pill--pending'
    case 'hold':
      return 'status-pill status-pill--hold'
    case 'force_closed':
    case 'written_off':
    case 'rejected':
      return 'status-pill status-pill--overdue'
    default:
      return 'status-pill'
  }
}
