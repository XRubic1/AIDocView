import { getInvoiceById, updateInvoice } from '../data/mockInvoices'
import type { Invoice, InvoiceDispute, InvoiceNote } from '../types/invoice'
import { logAuditEvent } from '../utils/auditLogger'

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
export function holdAdminInvoice(invoiceId: string): Invoice | undefined {
  return updateInvoice(invoiceId, {
    status: 'hold',
  })
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
 * Credyx responds to / resolves an open client invoice dispute.
 * Marks the dispute resolved and stores a client-visible response.
 */
export function resolveAdminInvoiceDispute(
  invoiceId: string,
  disputeId: string,
  response: string,
  adminName = DEFAULT_ADMIN
): Invoice | undefined {
  const invoice = getInvoiceById(invoiceId)
  if (!invoice || !response.trim()) return undefined

  const disputes = invoice.disputes ?? []
  const target = disputes.find(
    (d) => d.id === disputeId && (d.status === 'open' || d.status === 'under_review')
  )
  if (!target) return undefined

  const now = new Date().toISOString()
  const updatedDispute: InvoiceDispute = {
    ...target,
    status: 'resolved',
    resolved_at: now,
    response: response.trim(),
    responded_at: now,
    responded_by: adminName,
  }

  const resolveNote: InvoiceNote = {
    id: `note-dispute-resolve-${Date.now()}`,
    note: `Credyx resolved dispute (${target.reason}): ${response.trim()}`,
    created_by: adminName,
    created_at: now,
    type: 'dispute',
    visibility: 'client',
  }

  const updated = updateInvoice(invoiceId, {
    disputes: disputes.map((d) => (d.id === disputeId ? updatedDispute : d)),
    notes_history: [...(invoice.notes_history || []), resolveNote],
    updated_at: now,
  })

  if (updated) {
    logAuditEvent(
      'invoice_updated',
      'invoice',
      invoice.id,
      invoice.invoice_number,
      `${adminName} resolved dispute on ${invoice.invoice_number}`,
      'system',
      adminName,
      'admin',
      undefined,
      { dispute_id: disputeId }
    )
  }

  return updated
}
