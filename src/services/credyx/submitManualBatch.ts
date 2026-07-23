import { addBatch, addInvoicesForBatch, generateBatchNumber, updateBatch } from '../../data/mockBatches'
import { updateInvoice } from '../../data/mockInvoices'
import { mergeBatchFiles } from '../../data/batchFileStore'
import { resolveBrokerId } from '../../integrations/docSortToCredyx'
import { getClientById } from '../../services/clientRegistry'
import { isSupabaseConfigured } from '../../lib/supabase'
import {
  persistInvoice,
  persistBroker,
  uploadBatchInvoiceDocuments,
} from '../../services/supabase/tenantPersist'
import { mockBrokers } from '../../data/mockBrokers'
import { clearClientTenantCache } from '../../data/clientDemoData'
import { getNextClientInvoiceNumber } from '../../utils/clientInvoiceNumbers'
import {
  assertInvoiceNumberAvailable,
  validateBatchInvoiceNumbers,
} from '../../utils/invoiceDuplicateChecks'
import { calculateBatchFeeCalculation } from '../../utils/invoiceFees'
import { snapshotFeeTermsFromClient } from '../../utils/feeTermsLock'
import { assertClientSetupComplete } from '../../utils/clientSetupDocuments'


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
    console.warn('[submitManualBatch] broker persist failed, saving invoice without broker_id', err)
    return { broker_id: '', broker_name: result.broker_name }
  }
  return result
}

export interface ManualInvoiceInput {
  invoice_number: string
  load_number: string
  broker_name: string
  amount: string
  invoice_date: string
  notes?: string
  documents?: { id: string; file: File }[]
}

export interface SubmitManualBatchInput {
  clientId: string
  clientName: string
  invoices: ManualInvoiceInput[]
  existingBatchId?: string
  /** Admin create-batch paths skip the vault setup gate. */
  skipSetupGate?: boolean
}

/** Create or finalize a manual batch with invoices and uploaded paperwork. */
export async function submitManualBatch(input: SubmitManualBatchInput) {
  const { clientId, clientName, invoices, existingBatchId, skipSetupGate } = input
  if (invoices.length === 0) {
    throw new Error('Please add at least one invoice to the batch')
  }

  const client = getClientById(clientId)
  if (!skipSetupGate) {
    assertClientSetupComplete(clientId, client)
  }

  const totalAmount = invoices.reduce((sum, inv) => sum + parseFloat(inv.amount || '0'), 0)
  const existing = existingBatchId ? updateBatch(existingBatchId, {}) : undefined
  // Fee calc pulls live from the carrier account (trial/active included).
  const feeTerms = snapshotFeeTermsFromClient(client) ?? client?.fee_terms
  const draftForCalc = invoices.map((inv) => ({
    amount: parseFloat(inv.amount || '0'),
    status: 'pending' as const,
  }))
  const feeCalculation = calculateBatchFeeCalculation(draftForCalc, feeTerms)
  const batchNumber = existing?.batch_number ?? generateBatchNumber(clientId)

  const batch = existing
    ? updateBatch(existingBatchId!, {
        total_invoices: invoices.length,
        total_amount: totalAmount,
        status: 'ready_to_post',
        submitted_at: new Date().toISOString(),
        upload_mode: 'manual',
        sort_status: 'ready',
        fee_calculation: feeCalculation,
      })!
    : addBatch({
        batch_number: batchNumber,
        client_name: clientName,
        client_id: clientId,
        total_invoices: invoices.length,
        total_amount: totalAmount,
        status: 'ready_to_post',
        submitted_at: new Date().toISOString(),
        upload_mode: 'manual',
        sort_status: 'ready',
        fee_calculation: feeCalculation,
      })

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

  const fileMap = new Map<string, File>()
  const docsByInvoiceIndex: Map<string, File>[] = invoices.map(() => new Map())
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
    const docIds: string[] = []
    inv.documents?.forEach((doc) => {
      docIds.push(doc.id)
      fileMap.set(doc.id, doc.file)
      docsByInvoiceIndex[index].set(doc.id, doc.file)
    })
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
      ai_review_status: 'not_run' as const,
    })
  }

  const created = addInvoicesForBatch(batch.id, batchNumber, invoiceFields)

  if (fileMap.size > 0) {
    mergeBatchFiles(batch.id, fileMap)
  }

  if (isSupabaseConfigured()) {
    for (let i = 0; i < created.length; i++) {
      const invoice = created[i]
      const docFiles = docsByInvoiceIndex[i]
      let storagePaths: Record<string, string> | undefined

      if (docFiles.size > 0) {
        storagePaths = await uploadBatchInvoiceDocuments(
          clientId,
          batch.id,
          invoice.id,
          docFiles
        )
        updateInvoice(invoice.id, { document_storage_paths: storagePaths })
        Object.assign(invoice, { document_storage_paths: storagePaths })
      }

      try {
        await persistInvoice(invoice)
      } catch (err) {
        console.error('[submitManualBatch] invoice persist failed:', err)
        throw err instanceof Error ? err : new Error('Could not save invoice to database')
      }
    }
  }

  clearClientTenantCache(clientId)

  return { batch, invoices: created }
}
