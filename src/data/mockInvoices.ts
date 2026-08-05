import { Invoice } from '../types/invoice'
import { deleteInvoiceFromDb, persistInvoice } from '../services/supabase/tenantPersist'
import { syncBatchFees } from '../services/batchFeeSync'
import { persistOrThrow } from '../services/persistHelper'
import { persistWithFeedback } from '../services/persistFeedback'

/** Mutable in-memory invoice store (hydrated from Supabase when configured). */
export const mockInvoices: Invoice[] = []

export const getInvoicesByBatchId = (batchId: string): Invoice[] => {
  return mockInvoices.filter((inv) => inv.batch_id === batchId)
}

export const getInvoiceById = (invoiceId: string): Invoice | undefined => {
  return mockInvoices.find((inv) => inv.id === invoiceId)
}

/** Replace invoice cache contents (used during hydration). */
export function hydrateInvoices(items: Invoice[]): void {
  mockInvoices.length = 0
  mockInvoices.push(...items)
}

export function clearInvoices(): void {
  mockInvoices.length = 0
}

/** Merge an invoice row from Supabase realtime (no persist). */
export function mergeInvoice(invoice: Invoice): void {
  const idx = mockInvoices.findIndex((i) => i.id === invoice.id)
  if (idx >= 0) {
    mockInvoices[idx] = { ...mockInvoices[idx], ...invoice }
  } else {
    mockInvoices.unshift(invoice)
  }
}

/** Remove an invoice from the in-memory store (realtime DELETE). */
export function removeInvoiceFromStore(invoiceId: string): void {
  const idx = mockInvoices.findIndex((i) => i.id === invoiceId)
  if (idx >= 0) mockInvoices.splice(idx, 1)
}

/** Add invoice to store and persist to Supabase when configured. */
export function addInvoice(
  data: Omit<Invoice, 'id' | 'created_at'> & { id?: string; created_at?: string },
  options?: { deferPersist?: boolean }
): Invoice {
  const now = new Date().toISOString()
  const invoice: Invoice = {
    ...data,
    id: data.id ?? `inv-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    created_at: data.created_at ?? now,
    // Due dates only when caller supplies them (broker Due by > 0) — never invent +30.
    due_date: data.due_date || undefined,
    expected_payment_date: data.expected_payment_date || undefined,
    status: data.status ?? 'pending',
    documents_count: data.documents_count ?? 0,
  }
  mockInvoices.unshift(invoice)
  if (!options?.deferPersist) {
    void persistWithFeedback('Invoice save', () => persistInvoice(invoice))
  }
  return invoice
}

export function updateInvoice(invoiceId: string, patch: Partial<Invoice>): Invoice | undefined {
  const inv = mockInvoices.find((i) => i.id === invoiceId)
  if (!inv) return undefined
  const batchId = inv.batch_id
  Object.assign(inv, patch, { updated_at: new Date().toISOString() })
  void persistWithFeedback('Invoice save', () => persistInvoice(inv))
  if (batchId && patch.status !== undefined) {
    syncBatchFees(batchId)
  }
  return inv
}

/** Awaited persist for money-path and auth-critical writes. */
export async function updateInvoiceAsync(
  invoiceId: string,
  patch: Partial<Invoice>
): Promise<Invoice | undefined> {
  const inv = mockInvoices.find((i) => i.id === invoiceId)
  if (!inv) return undefined
  const batchId = inv.batch_id
  Object.assign(inv, patch, { updated_at: new Date().toISOString() })
  await persistOrThrow('invoice', () => persistInvoice(inv))
  if (batchId && patch.status !== undefined) {
    syncBatchFees(batchId)
  }
  return inv
}

/** Remove an invoice from the store and Supabase. Returns the removed invoice. */
export function deleteInvoice(invoiceId: string): Invoice | undefined {
  const index = mockInvoices.findIndex((i) => i.id === invoiceId)
  if (index === -1) return undefined
  const [removed] = mockInvoices.splice(index, 1)
  void persistWithFeedback('Invoice delete', () =>
    deleteInvoiceFromDb(removed.id, removed.client_id)
  )
  return removed
}

export async function addInvoiceAsync(
  data: Omit<Invoice, 'id' | 'created_at'> & { id?: string; created_at?: string }
): Promise<Invoice> {
  const invoice = addInvoice(data, { deferPersist: true })
  await persistOrThrow('invoice', () => persistInvoice(invoice))
  return invoice
}