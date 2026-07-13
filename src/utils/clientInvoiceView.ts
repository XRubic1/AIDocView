import type { Invoice, InvoiceNote } from '../types/invoice'
import { getBatchById } from '../data/mockBatches'
import { isBatchFullyProcessed } from './batchLifecycle'

/** Map internal statuses to what the client portal displays. */
export function toClientVisibleStatus(status: Invoice['status']): Invoice['status'] {
  return status === 'write_off_pending' ? 'written_off' : status
}

/** Notes safe to render in the client portal. */
export function clientVisibleNotes(notes?: InvoiceNote[]): InvoiceNote[] {
  return (notes ?? []).filter((n) => n.visibility !== 'internal')
}

/**
 * Until Credyx fully processes the batch, clients see ops-stage invoices as pending
 * (approved / hold during verification are internal until the batch is submitted).
 */
function clientStatusForBatch(invoice: Invoice): Invoice['status'] {
  const status = toClientVisibleStatus(invoice.status)
  if (!invoice.batch_id) return status

  const batch = getBatchById(invoice.batch_id)
  if (!batch || isBatchFullyProcessed(batch.status)) return status

  // Still in workflow (or voided before processing) — keep client-facing status pending
  if (status === 'approved' || status === 'hold' || status === 'pending') {
    return 'pending'
  }
  return status
}

/** Invoice with client-masked status for portal display. */
export function toClientVisibleInvoice(invoice: Invoice): Invoice {
  const { write_off_request: _writeOffRequest, ...rest } = invoice
  return {
    ...rest,
    status: clientStatusForBatch(invoice),
    notes_history: clientVisibleNotes(invoice.notes_history),
  }
}

/** Batch-mask invoices for client portal lists and detail panes. */
export function mapClientVisibleInvoices(invoices: Invoice[]): Invoice[] {
  return invoices.map(toClientVisibleInvoice)
}
