import type { Invoice, InvoiceNote } from '../types/invoice'
import { getBatchById, type Batch } from '../data/mockBatches'

/** Batch statuses where Credyx is still verifying — hide status/notes from the client. */
const BATCH_STATUSES_PENDING_CLIENT_REVEAL = new Set<Batch['status']>([
  'verification',
  'approval',
])

/** True once the batch has been processed (submitted to collections / carrier notified). */
export function isBatchProcessedForClient(batchStatus?: Batch['status'] | null): boolean {
  if (!batchStatus) return true
  return batchStatus === 'submitted' || batchStatus === 'processing'
}

/**
 * True while Credyx is verifying the invoice's batch — client should still see Open
 * and must not see verification notes / hold / reject yet.
 */
export function isInvoicePendingClientReveal(invoice: Pick<Invoice, 'batch_id'>): boolean {
  if (!invoice.batch_id) return false
  const batch = getBatchById(invoice.batch_id)
  if (!batch) return false
  return BATCH_STATUSES_PENDING_CLIENT_REVEAL.has(batch.status)
}

/** Map internal statuses to what the client portal displays (write-off mask only). */
export function toClientVisibleStatus(status: Invoice['status']): Invoice['status'] {
  return status === 'write_off_pending' ? 'written_off' : status
}

/**
 * Status shown in the client portal, including verify-stage gating.
 * While the batch is in verification/approval, force Open (`approved`).
 */
export function toClientVisibleInvoiceStatus(invoice: Invoice): Invoice['status'] {
  if (isInvoicePendingClientReveal(invoice)) {
    return 'approved'
  }
  return toClientVisibleStatus(invoice.status)
}

/** Notes safe to render in the client portal (excludes explicit internal). */
export function clientVisibleNotes(notes?: InvoiceNote[]): InvoiceNote[] {
  return (notes ?? []).filter((n) => n.visibility !== 'internal')
}

/**
 * Notes the client may see right now.
 * During verify, only carrier-authored notes; admin/verification notes appear after process.
 */
export function clientVisibleNotesForInvoice(
  invoice: Pick<Invoice, 'batch_id' | 'notes_history'>
): InvoiceNote[] {
  const notes = clientVisibleNotes(invoice.notes_history)
  if (!isInvoicePendingClientReveal(invoice)) return notes
  // During verify, only carrier-authored notes — admin/verification notes wait for Process.
  return notes.filter((n) => n.type === 'client_note')
}

/** Invoice with client-masked status and notes for portal display. */
export function toClientVisibleInvoice(invoice: Invoice): Invoice {
  const { write_off_request: _writeOffRequest, ...rest } = invoice
  const pendingReveal = isInvoicePendingClientReveal(invoice)

  return {
    ...rest,
    status: toClientVisibleInvoiceStatus(invoice),
    notes_history: clientVisibleNotesForInvoice(invoice),
    // Hide hold reason / free-text notes until the batch is processed.
    hold_reason: pendingReveal ? undefined : rest.hold_reason,
    notes: pendingReveal ? undefined : rest.notes,
  }
}

/** Batch-mask invoices for client portal lists and detail panes. */
export function mapClientVisibleInvoices(invoices: Invoice[]): Invoice[] {
  return invoices.map(toClientVisibleInvoice)
}

/** True when the client should count this invoice as held (post-process only). */
export function isClientVisibleHold(invoice: Invoice): boolean {
  return invoice.status === 'hold' && !isInvoicePendingClientReveal(invoice)
}
