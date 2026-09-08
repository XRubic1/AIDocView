import { getInvoiceById, mockInvoices, updateInvoice } from '../data/mockInvoices'
import { getBatchById } from '../data/mockBatches'
import { notifyClientInvoiceOnHold } from '../data/mockNotifications'
import { isInvoicePendingClientReveal } from '../utils/clientInvoiceView'
import type { Invoice, InvoiceNote } from '../types/invoice'

const DEFAULT_ADMIN = 'Admin User'

const TERMINAL_HOLD_BLOCKED = new Set<Invoice['status']>([
  'paid',
  'rejected',
  'written_off',
  'write_off_pending',
  'force_closed',
])

/** True when Credyx can place this invoice on hold (open A/R or still pending). */
export function canPlaceInvoiceOnHold(status: Invoice['status']): boolean {
  return status === 'pending' || status === 'approved'
}

/** Approve an invoice from the admin ops workflow and persist to Supabase. */
export function approveAdminInvoice(
  invoiceId: string,
  approvedBy = DEFAULT_ADMIN
): Invoice | undefined {
  return updateInvoice(invoiceId, {
    status: 'approved',
    approved_by: approvedBy,
    approved_at: new Date().toISOString(),
  })
}

/**
 * Place an invoice on hold from the admin ops workflow.
 * When holdReason is provided it is stored on the invoice and as a client-visible note.
 */
export function holdAdminInvoice(
  invoiceId: string,
  holdReason?: string,
  heldBy = DEFAULT_ADMIN
): Invoice | undefined {
  const existing = getInvoiceById(invoiceId)
  if (!existing) return undefined
  if (TERMINAL_HOLD_BLOCKED.has(existing.status)) return existing

  const alreadyHeld = existing.status === 'hold'
  const reason = holdReason?.trim()
  const now = new Date().toISOString()
  const patch: Partial<Invoice> = { status: 'hold' }

  if (reason) {
    patch.hold_reason = reason
    const note: InvoiceNote = {
      id: `note-hold-${Date.now()}`,
      note: reason,
      created_by: heldBy,
      created_at: now,
      type: 'hold_reason',
      visibility: 'client',
    }
    const notes_history = [...(existing.notes_history || []), note]
    patch.notes_history = notes_history
    patch.notes = existing.notes ? `${existing.notes}\n${reason}` : reason
  }

  const updated = updateInvoice(invoiceId, patch)
  if (!updated || alreadyHeld) return updated

  // While the batch is still in verification, defer the client bell until Process.
  if (!isInvoicePendingClientReveal(updated)) {
    notifyClientInvoiceOnHold({
      clientId: updated.client_id,
      invoiceId: updated.id,
      invoiceNumber: updated.invoice_number,
      holdReason: updated.hold_reason,
      batchId: updated.batch_id,
      batchNumber: updated.batch_number,
    })
  }

  return updated
}

/** Release hold — return to open A/R and clear the hold reason the carrier sees. */
export function releaseHoldAdminInvoice(
  invoiceId: string,
  releasedBy = DEFAULT_ADMIN
): Invoice | undefined {
  const inv = getInvoiceById(invoiceId)
  if (!inv || inv.status !== 'hold') return inv

  const now = new Date().toISOString()
  const note: InvoiceNote = {
    id: `note-hold-release-${Date.now()}`,
    note: 'Hold released — invoice returned to open A/R.',
    created_by: releasedBy,
    created_at: now,
    type: 'status_update',
    visibility: 'client',
  }
  const notes_history = [...(inv.notes_history || []), note]
  const notes = inv.notes
    ? `${inv.notes}\n${note.note}`
    : note.note

  return updateInvoice(invoiceId, {
    status: 'approved',
    approved_by: releasedBy,
    approved_at: now,
    hold_reason: undefined,
    notes_history,
    notes,
  })
}

/** Reject an invoice from the admin ops workflow. */
export function rejectAdminInvoice(invoiceId: string): Invoice | undefined {
  return updateInvoice(invoiceId, { status: 'rejected' })
}

/**
 * After a batch is processed, notify the client about invoices that were held
 * during verification (notifications were deferred).
 */
export function notifyClientHoldsAfterBatchProcess(batchId: string): void {
  const batch = getBatchById(batchId)
  if (!batch) return

  const held = mockInvoices.filter(
    (inv) => inv.batch_id === batchId && inv.status === 'hold'
  )
  for (const inv of held) {
    notifyClientInvoiceOnHold({
      clientId: inv.client_id,
      invoiceId: inv.id,
      invoiceNumber: inv.invoice_number,
      holdReason: inv.hold_reason,
      batchId: inv.batch_id,
      batchNumber: inv.batch_number ?? batch.batch_number,
    })
  }
}
