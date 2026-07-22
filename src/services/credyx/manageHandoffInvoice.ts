import { getBatchById, updateBatchTotals } from '../../data/mockBatches'
import { deleteInvoice, getInvoiceById, updateInvoice } from '../../data/mockInvoices'
import { resolveBrokerId } from '../../integrations/docSortToCredyx'
import { isSupabaseConfigured } from '../../lib/supabase'
import { persistBroker, persistInvoice } from '../../services/supabase/tenantPersist'
import { mockBrokers } from '../../data/mockBrokers'
import { clearClientTenantCache } from '../../data/clientDemoData'
import type { Invoice } from '../../types/invoice'
import { assertInvoiceNumberAvailable } from '../../utils/invoiceDuplicateChecks'

/** Resolve a broker by name and persist it when Supabase is configured. */
async function resolveAndPersistBroker(
  brokerName: string
): Promise<{ broker_id: string; broker_name: string }> {
  const result = resolveBrokerId(brokerName)
  if (!result.broker_id || !isSupabaseConfigured()) return result
  const broker = mockBrokers.find((b) => b.id === result.broker_id)
  if (!broker) return result
  try {
    await persistBroker(broker)
  } catch (err) {
    console.warn('[manageHandoffInvoice] broker persist failed', err)
    return { broker_id: '', broker_name: result.broker_name }
  }
  return result
}

export interface EditHandoffInvoiceInput {
  invoiceId: string
  invoice_number: string
  load_number: string
  broker_name: string
  amount: string
  invoice_date: string
  notes?: string
  document_doc_ids: string[]
  /** Storage paths for documents (from handoff or existing invoices). */
  storagePathsByDocId?: Record<string, string>
}

/** Apply edits to an existing invoice and keep batch totals in sync. */
export async function updateHandoffInvoice(
  input: EditHandoffInvoiceInput
): Promise<Invoice> {
  const existing = getInvoiceById(input.invoiceId)
  if (!existing) throw new Error('Invoice not found')

  // Block invoice # collisions with other invoices for this carrier (allow keeping own #).
  const invoiceNumber = assertInvoiceNumberAvailable(
    existing.client_id,
    input.invoice_number,
    [],
    [existing.id]
  )

  const broker = await resolveAndPersistBroker(input.broker_name)

  // Keep storage paths only for the documents still attached to this invoice.
  const mergedPaths: Record<string, string> = {}
  const sourcePaths = { ...(existing.document_storage_paths ?? {}), ...(input.storagePathsByDocId ?? {}) }
  for (const docId of input.document_doc_ids) {
    if (sourcePaths[docId]) mergedPaths[docId] = sourcePaths[docId]
  }

  const updated = updateInvoice(input.invoiceId, {
    invoice_number: invoiceNumber,
    broker_id: broker.broker_id,
    broker_name: broker.broker_name,
    amount: parseFloat(input.amount || '0'),
    invoice_date: input.invoice_date,
    load_number: input.load_number,
    notes: input.notes,
    documents_count: input.document_doc_ids.length,
    document_doc_ids: input.document_doc_ids,
    document_storage_paths:
      Object.keys(mergedPaths).length > 0 ? mergedPaths : undefined,
  })

  if (!updated) throw new Error('Could not update invoice')

  if (existing.batch_id) updateBatchTotals(existing.batch_id)

  if (isSupabaseConfigured()) {
    try {
      await persistInvoice(updated)
    } catch (err) {
      console.error('[manageHandoffInvoice] persist failed:', err)
      throw err instanceof Error ? err : new Error('Could not save invoice to database')
    }
  }

  clearClientTenantCache(existing.client_id)
  return updated
}

/** Delete an invoice from a batch and refresh batch totals. */
export async function deleteHandoffInvoice(invoiceId: string): Promise<void> {
  const existing = getInvoiceById(invoiceId)
  if (!existing) return

  const batchId = existing.batch_id
  const clientId = existing.client_id

  deleteInvoice(invoiceId)

  if (batchId && getBatchById(batchId)) updateBatchTotals(batchId)
  clearClientTenantCache(clientId)
}
