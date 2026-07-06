import { getBatchById, updateBatch } from '../data/mockBatches'
import { getInvoicesByBatchId } from '../data/mockInvoices'
import { calculateBatchFeeCalculation } from '../utils/invoiceFees'
import { getClientById } from './clientRegistry'

/** Recompute batch fee_calculation (write-offs excluded from billable totals). */
export function syncBatchFees(batchId: string): void {
  const batch = getBatchById(batchId)
  if (!batch) return

  const invoices = getInvoicesByBatchId(batchId)
  const feeCalculation = calculateBatchFeeCalculation(invoices, getClientById(batch.client_id)?.fee_terms)

  if (feeCalculation) {
    updateBatch(batchId, { fee_calculation: feeCalculation })
  }
}
