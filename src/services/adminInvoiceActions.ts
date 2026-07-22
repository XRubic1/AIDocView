import { getInvoiceById, mockInvoices, updateInvoice } from '../data/mockInvoices'
import { getBatchById } from '../data/mockBatches'
import { notifyClientInvoiceOnHold } from '../data/mockNotifications'
import { isInvoicePendingClientReveal } from '../utils/clientInvoiceView'
import type { Invoice } from '../types/invoice'

const DEFAULT_ADMIN = 'Admin User'

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

/** Place an invoice on hold from the admin ops workflow. */
export function holdAdminInvoice(invoiceId: string, holdReason?: string): Invoice | undefined {
  const existing = getInvoiceById(invoiceId)
  if (!existing) return undefined

  // Avoid duplicate hold notifications if already on hold.
  const alreadyHeld = existing.status === 'hold'

  const patch: Partial<Invoice> = { status: 'hold' }
  if (holdReason?.trim()) {
    patch.hold_reason = holdReason.trim()
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

/** Release hold by re-approving the invoice. */
export function releaseHoldAdminInvoice(invoiceId: string): Invoice | undefined {
  const inv = getInvoiceById(invoiceId)
  if (!inv || inv.status !== 'hold') return inv
  return approveAdminInvoice(invoiceId)
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
