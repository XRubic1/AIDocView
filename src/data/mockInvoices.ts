import { Invoice } from '../types/invoice'
import { persistInvoice } from '../services/supabase/tenantPersist'
import { syncBatchFees } from '../services/batchFeeSync'

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

/** Add invoice to store and persist to Supabase when configured. */
export function addInvoice(
  data: Omit<Invoice, 'id' | 'created_at'> & { id?: string; created_at?: string }
): Invoice {
  const now = new Date().toISOString()
  const due = new Date()
  due.setDate(due.getDate() + 30)
  const invoice: Invoice = {
    ...data,
    id: data.id ?? `inv-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    created_at: data.created_at ?? now,
    due_date: data.due_date ?? due.toISOString().split('T')[0],
    expected_payment_date: data.expected_payment_date ?? due.toISOString().split('T')[0],
    status: data.status ?? 'pending',
    documents_count: data.documents_count ?? 0,
  }
  mockInvoices.unshift(invoice)
  void persistInvoice(invoice).catch(console.error)
  return invoice
}

export function updateInvoice(invoiceId: string, patch: Partial<Invoice>): Invoice | undefined {
  const inv = mockInvoices.find((i) => i.id === invoiceId)
  if (!inv) return undefined
  const batchId = inv.batch_id
  Object.assign(inv, patch, { updated_at: new Date().toISOString() })
  void persistInvoice(inv).catch(console.error)
  if (batchId && patch.status !== undefined) {
    syncBatchFees(batchId)
  }
  return inv
}