import type { Invoice, InvoiceNote } from '../types/invoice'

/** Map internal statuses to what the client portal displays. */
export function toClientVisibleStatus(status: Invoice['status']): Invoice['status'] {
  return status === 'write_off_pending' ? 'written_off' : status
}

/** Notes safe to render in the client portal. */
export function clientVisibleNotes(notes?: InvoiceNote[]): InvoiceNote[] {
  return (notes ?? []).filter((n) => n.visibility !== 'internal')
}

/** Invoice with client-masked status for portal display. */
export function toClientVisibleInvoice(invoice: Invoice): Invoice {
  const { write_off_request: _writeOffRequest, ...rest } = invoice
  return {
    ...rest,
    status: toClientVisibleStatus(invoice.status),
    notes_history: clientVisibleNotes(invoice.notes_history),
  }
}

/** Batch-mask invoices for client portal lists and detail panes. */
export function mapClientVisibleInvoices(invoices: Invoice[]): Invoice[] {
  return invoices.map(toClientVisibleInvoice)
}
