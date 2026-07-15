import { getInvoiceById, updateInvoice } from '../data/mockInvoices'
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
