import { Invoice } from '../types/invoice'
import { DEMO_WORLD } from './unifiedDemo'

/** Mutable in-memory invoice store — seeded from unified demo world. */
export const mockInvoices: Invoice[] = DEMO_WORLD.invoices

export const getInvoicesByBatchId = (batchId: string): Invoice[] => {
  return mockInvoices.filter((inv) => inv.batch_id === batchId)
}

export const getInvoiceById = (invoiceId: string): Invoice | undefined => {
  return mockInvoices.find((inv) => inv.id === invoiceId)
}

/** Add invoice to in-memory store. */
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
  return invoice
}

export function updateInvoice(invoiceId: string, patch: Partial<Invoice>): Invoice | undefined {
  const inv = mockInvoices.find((i) => i.id === invoiceId)
  if (!inv) return undefined
  Object.assign(inv, patch, { updated_at: new Date().toISOString() })
  return inv
}
