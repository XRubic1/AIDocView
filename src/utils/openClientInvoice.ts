import type { Invoice } from '../types/invoice'
import { getClientInvoices } from '../data/clientDemoData'

/**
 * Find a client invoice by id or invoice number (mock assistant refs may use either).
 */
export function resolveClientInvoice(
  clientId: string,
  clientName: string,
  ref: { invoiceId?: string; invoiceNumber?: string }
): Invoice | undefined {
  if (!clientId && !clientName) return undefined
  const invoices = getClientInvoices(clientId, clientName)
  if (invoices.length === 0) return undefined

  if (ref.invoiceId) {
    const byId = invoices.find((inv) => inv.id === ref.invoiceId)
    if (byId) return byId
  }

  if (ref.invoiceNumber) {
    const needle = String(ref.invoiceNumber).trim().replace(/^#/, '')
    const byNumber = invoices.find(
      (inv) => String(inv.invoice_number).trim().replace(/^#/, '') === needle
    )
    if (byNumber) return byNumber
  }

  return undefined
}

/** Path that opens Invoices with the detail panel for this invoice. */
export function clientInvoiceDetailPath(invoiceId: string): string {
  return `/client/invoices?highlight_invoice=${encodeURIComponent(invoiceId)}`
}

/** Path that opens invoice detail and auto-opens the document upload modal. */
export function clientInvoiceUploadPath(invoiceId: string): string {
  const params = new URLSearchParams({
    highlight_invoice: invoiceId,
    open_upload: '1',
  })
  return `/client/invoices?${params.toString()}`
}
