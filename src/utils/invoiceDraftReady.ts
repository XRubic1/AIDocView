import type { CredyxInvoiceDraft } from '../types/credyxBatch'

export type InvoiceDraftFieldFeedback = {
  invoiceError?: string
  loadWarning?: string
}

/** True when the invoice has a directory broker or a pending-new name. */
export function draftHasBroker(inv: Pick<CredyxInvoiceDraft, 'broker_id' | 'broker_name'>): boolean {
  return Boolean(inv.broker_id?.trim()) || Boolean(inv.broker_name?.trim())
}

/**
 * Why this draft cannot be submitted yet.
 * Load-number warnings are informational and do not block.
 */
export function invoiceDraftBlocker(
  inv: CredyxInvoiceDraft,
  feedback?: InvoiceDraftFieldFeedback
): string | null {
  if (feedback?.invoiceError) return feedback.invoiceError
  if (!inv.invoice_number?.trim()) return 'Invoice number is required'
  if (!inv.load_number?.trim()) return 'Load # is missing'
  if (!draftHasBroker(inv)) return 'Broker is missing'
  if (!(inv.amount > 0)) return 'Rate is missing'
  return null
}

export function isInvoiceDraftReady(
  inv: CredyxInvoiceDraft,
  feedback?: InvoiceDraftFieldFeedback
): boolean {
  return invoiceDraftBlocker(inv, feedback) == null
}
