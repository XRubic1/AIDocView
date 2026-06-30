import type { Invoice } from '../types/invoice'
import { isOpenArInvoice } from './invoiceAging'

export type PostPaymentSearchHit = {
  invoice: Invoice
  score: number
  isPostable: boolean
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
        isPostable: isOpenArInvoice(invoice),
      }
    })
    .filter((hit) => hit.score > 0)

  scored.sort((a, b) => {
    if (a.isPostable !== b.isPostable) return a.isPostable ? -1 : 1
    return b.score - a.score
  })

  return scored.slice(0, limit)
}

/** Recent open invoices when the search field is focused but empty. */
export function getDefaultPostPaymentSuggestions(
  invoices: Invoice[],
  limit = 6
): PostPaymentSearchHit[] {
  return invoices
    .filter((inv) => isOpenArInvoice(inv))
    .sort((a, b) => b.invoice_date.localeCompare(a.invoice_date))
    .slice(0, limit)
    .map((invoice) => ({
      invoice,
      score: 0,
      isPostable: true,
    }))
}

export function getInvoicePostStatusLabel(invoice: Invoice): string {
  if (isOpenArInvoice(invoice)) return 'Open'
  switch (invoice.status) {
    case 'paid':
      return 'Paid'
    case 'pending':
      return 'Pending'
    case 'hold':
      return 'On hold'
    case 'force_closed':
      return 'Closed'
    case 'rejected':
      return 'Rejected'
    default:
      return invoice.status
  }
}

export function getInvoicePostStatusClass(invoice: Invoice): string {
  if (isOpenArInvoice(invoice)) return 'status-pill status-pill--approved'
  switch (invoice.status) {
    case 'paid':
      return 'status-pill status-pill--approved'
    case 'pending':
      return 'status-pill status-pill--pending'
    case 'hold':
      return 'status-pill status-pill--hold'
    case 'force_closed':
    case 'rejected':
      return 'status-pill status-pill--overdue'
    default:
      return 'status-pill'
  }
}
