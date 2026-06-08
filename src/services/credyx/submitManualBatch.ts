import { addBatch, addInvoicesForBatch, generateBatchNumber, updateBatch } from '../../data/mockBatches'
import { setBatchFiles } from '../../data/batchFileStore'
import { resolveBrokerId } from '../../integrations/docSortToCredyx'
import { mockClients } from '../../data/mockClients'

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
}

export function submitManualBatch(input: SubmitManualBatchInput) {
  const { clientId, clientName, invoices, existingBatchId } = input
  if (invoices.length === 0) {
    throw new Error('Please add at least one invoice to the batch')
  }

  const totalAmount = invoices.reduce((sum, inv) => sum + parseFloat(inv.amount || '0'), 0)
  const client = mockClients.find((c) => c.id === clientId)
  let feeCalculation: {
    fee_type?: 'percentage' | 'flat'
    fee_percentage?: number
    flat_fee_amount?: number
    total_fee?: number
    net_amount?: number
  } | undefined

  if (client?.fee_terms) {
    const { fee_type, fee_percentage, flat_fee_amount } = client.fee_terms
    let totalFee = 0
    if (fee_type === 'percentage' && fee_percentage) {
      totalFee = (totalAmount * fee_percentage) / 100
    } else if (fee_type === 'flat' && flat_fee_amount) {
      totalFee = flat_fee_amount
    }
    feeCalculation = {
      fee_type,
      fee_percentage,
      flat_fee_amount,
      total_fee: totalFee,
      net_amount: totalAmount - totalFee,
    }
  }

  const existing = existingBatchId ? updateBatch(existingBatchId, {}) : undefined
  const batchNumber = existing?.batch_number ?? generateBatchNumber()

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

  const fileMap = new Map<string, File>()
  const invoiceFields = invoices.map((inv) => {
    const broker = resolveBrokerId(inv.broker_name)
    const docIds: string[] = []
    inv.documents?.forEach((doc) => {
      docIds.push(doc.id)
      fileMap.set(doc.id, doc.file)
    })
    const due = new Date()
    due.setDate(due.getDate() + 30)
    return {
      invoice_number: inv.invoice_number,
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
    }
  })

  const created = addInvoicesForBatch(batch.id, batchNumber, invoiceFields)
  if (fileMap.size > 0) {
    setBatchFiles(batch.id, fileMap)
  }

  return { batch, invoices: created }
}
