import {
  addInvoicesForBatch,
  getBatchById,
  updateBatch,
} from '../../data/mockBatches'
import { updateInvoice } from '../../data/mockInvoices'
import { resolveBrokerId } from '../../integrations/docSortToCredyx'
import { getClientById } from '../../services/clientRegistry'
import { isSupabaseConfigured } from '../../lib/supabase'
import { persistBroker, persistInvoice } from '../../services/supabase/tenantPersist'
import { mockBrokers } from '../../data/mockBrokers'
import { clearClientTenantCache } from '../../data/clientDemoData'
import { getNextClientInvoiceNumber } from '../../utils/clientInvoiceNumbers'
import {
  assertInvoiceNumberAvailable,
  validateBatchInvoiceNumbers,
} from '../../utils/invoiceDuplicateChecks'
import { calculateBatchFeeCalculation } from '../../utils/invoiceFees'
import { snapshotFeeTermsFromClient } from '../../utils/feeTermsLock'

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
    console.warn('[submitHandoffInvoices] broker persist failed', err)
    return { broker_id: '', broker_name: result.broker_name }
  }
  return result
}

export interface HandoffInvoiceInput {
  invoice_number?: string
  load_number: string
  broker_name: string
  amount: string
  invoice_date: string
  notes?: string
  document_doc_ids: string[]
}

export interface SubmitHandoffInvoicesInput {
  batchId: string
  clientId: string
  clientName: string
  invoices: HandoffInvoiceInput[]
  storagePathsByDocId?: Record<string, string>
}

/** Create invoice records on an existing managed handoff batch from client documents. */
export async function submitHandoffInvoices(input: SubmitHandoffInvoicesInput) {
  const { batchId, clientId, clientName, invoices, storagePathsByDocId = {} } = input
  if (invoices.length === 0) {
    throw new Error('Add at least one invoice before saving')
  }

  const existingBatch = getBatchById(batchId)
  if (!existingBatch) {
    throw new Error('Batch not found')
  }

  const totalAmount = invoices.reduce((sum, inv) => sum + parseFloat(inv.amount || '0'), 0)
  const client = getClientById(clientId)
  // Keep existing locked batch terms; otherwise snapshot from current client settings.
  const feeTerms = existingBatch.fee_terms ?? snapshotFeeTermsFromClient(client)
  const draftForCalc = invoices.map((inv) => ({
    amount: parseFloat(inv.amount || '0'),
    status: 'pending' as const,
  }))
  const feeCalculation = calculateBatchFeeCalculation(draftForCalc, feeTerms)

  const batch = updateBatch(batchId, {
    total_invoices: invoices.length,
    total_amount: totalAmount,
    status: 'ready_to_post',
    submitted_at: existingBatch.submitted_at,
    upload_mode: 'manual',
    sort_status: 'ready',
    fee_calculation: feeCalculation,
    fee_terms: feeTerms,
  })!

  // Resolve invoice numbers (auto-fill blanks), then hard-block duplicates.
  const reservedForNext: string[] = []
  const resolvedNumbers: string[] = invoices.map((inv) => {
    const preferred = inv.invoice_number?.trim()
    if (preferred) {
      reservedForNext.push(preferred)
      return preferred
    }
    const next = getNextClientInvoiceNumber(clientId, reservedForNext)
    reservedForNext.push(next)
    return next
  })
  const numberIssues = validateBatchInvoiceNumbers(clientId, resolvedNumbers)
  if (numberIssues.length > 0) {
    throw new Error(numberIssues[0].message)
  }

  const reservedNumbers: string[] = []
  const invoiceFields = []

  for (let index = 0; index < invoices.length; index++) {
    const inv = invoices[index]
    const broker = await resolveAndPersistBroker(inv.broker_name)
    const invoiceNumber = assertInvoiceNumberAvailable(
      clientId,
      resolvedNumbers[index],
      reservedNumbers
    )
    reservedNumbers.push(invoiceNumber)

    const docIds = inv.document_doc_ids
    const documentStoragePaths: Record<string, string> = {}
    for (const docId of docIds) {
      const path = storagePathsByDocId[docId]
      if (path) documentStoragePaths[docId] = path
    }

    const due = new Date()
    due.setDate(due.getDate() + 30)

    invoiceFields.push({
      invoice_number: invoiceNumber,
      client_id: clientId,
      client_name: clientName,
      broker_id: broker.broker_id,
      broker_name: broker.broker_name,
      amount: parseFloat(inv.amount || '0'),
      invoice_date: inv.invoice_date,
      due_date: due.toISOString().split('T')[0],
      expected_payment_date: due.toISOString().split('T')[0],
      status: 'pending' as const,
      load_number: inv.load_number,
      notes: inv.notes,
      documents_count: docIds.length,
      document_doc_ids: docIds,
      document_storage_paths:
        Object.keys(documentStoragePaths).length > 0 ? documentStoragePaths : undefined,
      ai_review_status: 'not_run' as const,
      fee_terms: feeTerms,
    })
  }

  const created = addInvoicesForBatch(batch.id, batch.batch_number, invoiceFields)

  if (isSupabaseConfigured()) {
    for (const invoice of created) {
      try {
        await persistInvoice(invoice)
      } catch (err) {
        console.error('[submitHandoffInvoices] invoice persist failed:', err)
        throw err instanceof Error ? err : new Error('Could not save invoice to database')
      }
    }
  } else {
    for (const invoice of created) {
      updateInvoice(invoice.id, invoice)
    }
  }

  clearClientTenantCache(clientId)
  return { batch, invoices: created }
}
