import type { Invoice, InvoiceNote } from '../types/invoice'
import { getBatchById, type Batch } from '../data/mockBatches'

/**
 * Batch still open at Credyx — client sees Pending only (no hold / verify notes yet).
 * Reveal real status after Process (submitted / processing).
 */
const BATCH_STATUSES_PENDING_CLIENT_REVEAL = new Set<Batch['status']>([
  'draft',
  'creating',
  'needs_split',
  'ai_splitting',
  'creating_packets',
  'failed',
  'ready_to_post',
  'rework',
  'documents_uploaded',
  'verification',
  'approval',
])

/** True once the batch has been processed (submitted to collections / carrier notified). */
export function isBatchProcessedForClient(batchStatus?: Batch['status'] | null): boolean {
  if (!batchStatus) return true
  return batchStatus === 'submitted' || batchStatus === 'processing'
}

/**
 * True while the invoice's batch is still open — client should see Pending
 * and must not see verification notes / hold / reject yet.
 */
export function isInvoicePendingClientReveal(invoice: Pick<Invoice, 'batch_id'>): boolean {
  if (!invoice.batch_id) return false
  const batch = getBatchById(invoice.batch_id)
  if (!batch) return false
  if (isBatchProcessedForClient(batch.status)) return false
  return BATCH_STATUSES_PENDING_CLIENT_REVEAL.has(batch.status)
}

/** Map internal statuses to what the client portal displays (write-off + review mask). */
export function toClientVisibleStatus(status: Invoice['status']): Invoice['status'] {
  if (status === 'write_off_pending') return 'written_off'
  // Review is Credyx-only — carriers keep seeing Pending until Process / real Hold.
  if (status === 'review') return 'pending'
  return status
}

/**
 * Status shown in the client portal, including open-batch gating.
 * While the batch is still open, force Pending — holds/notes appear after Process.
 */
export function toClientVisibleInvoiceStatus(invoice: Invoice): Invoice['status'] {
  if (isInvoicePendingClientReveal(invoice)) {
    return 'pending'
  }
  return toClientVisibleStatus(invoice.status)
}

/** Notes safe to render in the client portal (excludes explicit internal). */
export function clientVisibleNotes(notes?: InvoiceNote[]): InvoiceNote[] {
  return (notes ?? []).filter((n) => n.visibility !== 'internal')
}

/**
 * Notes the client may see right now.
 * While the batch is open, only carrier-authored notes; admin/verification notes appear after Process.
 */
export function clientVisibleNotesForInvoice(
  invoice: Pick<Invoice, 'batch_id' | 'notes_history'>
): InvoiceNote[] {
  const notes = clientVisibleNotes(invoice.notes_history)
  if (!isInvoicePendingClientReveal(invoice)) return notes
  // During open batch, only carrier-authored notes — admin/verification notes wait for Process.
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
