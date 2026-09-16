import { getInvoiceById, mockInvoices, updateInvoice } from '../data/mockInvoices'
import { getBatchById } from '../data/mockBatches'
import { notifyClientInvoiceOnHold } from '../data/mockNotifications'
import { isInvoicePendingClientReveal } from '../utils/clientInvoiceView'
import type { Invoice, InvoiceNote } from '../types/invoice'

const DEFAULT_ADMIN = 'Admin User'

const TERMINAL_STATUS = new Set<Invoice['status']>([
  'paid',
  'rejected',
  'written_off',
  'write_off_pending',
  'force_closed',
])

/** True when Credyx can place this invoice on hold (open A/R, pending, or in review). */
export function canPlaceInvoiceOnHold(status: Invoice['status']): boolean {
  return status === 'pending' || status === 'review' || status === 'approved'
}

/**
 * Mark OK — approve the invoice and clear any hold / review reason.
 * This is the only “release hold” path in verification (no separate Clear hold).
 */
export function approveAdminInvoice(
  invoiceId: string,
  approvedBy = DEFAULT_ADMIN
): Invoice | undefined {
  const existing = getInvoiceById(invoiceId)
  if (!existing) return undefined
  if (TERMINAL_STATUS.has(existing.status)) return existing

  const updated = updateInvoice(invoiceId, {
    status: 'approved',
    approved_by: approvedBy,
    approved_at: new Date().toISOString(),
    hold_reason: undefined,
  })
  // Object.assign leaves undefined; drop the key so persist sends null and UI stays clean.
  if (updated && 'hold_reason' in updated) {
    delete updated.hold_reason
  }
  return updated
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
  if (TERMINAL_STATUS.has(existing.status)) return existing
  if (!canPlaceInvoiceOnHold(existing.status) && existing.status !== 'hold') return existing

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

const AI_AUTO_NOTE =
  /^(Carrier name mismatch|Needs additional work)\b/i

/** True when a note was auto-written by AI review (should not fill the admin Notes box). */
export function isAiAutoReviewNote(note?: string | null): boolean {
  return AI_AUTO_NOTE.test((note ?? '').trim())
}

/**
 * Flag an invoice for Credyx review (AI / paperwork issue).
 * Not a client hold — carriers still see Pending until Process + real Hold/OK.
 * Never overwrites an invoice the admin already marked OK or Hold.
 * Does not write notes — issues stay in AI review outcome only.
 */
export function flagInvoiceForReview(
  invoiceId: string,
  _reason?: string,
  _flaggedBy = DEFAULT_ADMIN
): Invoice | undefined {
  const existing = getInvoiceById(invoiceId)
  if (!existing) return undefined
  if (TERMINAL_STATUS.has(existing.status)) return existing
  // Human already decided — do not pull them back into Review.
  if (existing.status === 'approved' || existing.status === 'hold') return existing

  const patch: Partial<Invoice> = { status: 'review' }
  // Clear leftover auto-notes from older AI hold/review paths.
  if (isAiAutoReviewNote(existing.notes)) {
    patch.notes = undefined
  }
  if (isAiAutoReviewNote(existing.hold_reason)) {
    patch.hold_reason = undefined
  }

  const updated = updateInvoice(invoiceId, patch)
  if (updated && patch.notes === undefined && 'notes' in updated) delete updated.notes
  if (updated && patch.hold_reason === undefined && isAiAutoReviewNote(existing.hold_reason)) {
    delete updated.hold_reason
  }
  return updated
}

/**
 * @deprecated Prefer approveAdminInvoice (OK) — kept for older admin screens that release hold.
 */
export function releaseHoldAdminInvoice(
  invoiceId: string,
  releasedBy = DEFAULT_ADMIN
): Invoice | undefined {
  return approveAdminInvoice(invoiceId, releasedBy)
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
