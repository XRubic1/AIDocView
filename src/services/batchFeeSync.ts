import { getAllBatches, getBatchById, updateBatch } from '../data/mockBatches'
import { getInvoicesByBatchId } from '../data/mockInvoices'
import { calculateBatchFeeCalculation } from '../utils/invoiceFees'
import {
  isBatchFeeLocked,
  snapshotFeeTermsFromClient,
} from '../utils/feeTermsLock'
import { getClientById } from './clientRegistry'

/**
 * Recompute batch fee_calculation.
 * Open batches → live client Fee Terms.
 * Processed batches → locked batch fee_terms (do not follow later client changes).
 */
export function syncBatchFees(batchId: string): void {
  const batch = getBatchById(batchId)
  if (!batch) return

  const client = getClientById(batch.client_id)
  const invoices = getInvoicesByBatchId(batchId)

  if (isBatchFeeLocked(batch)) {
    // Processed: stick to locked terms (or fee_calculation for legacy rows).
    const locked =
      batch.fee_terms ??
      (batch.fee_calculation?.fee_type
        ? {
            fee_type: batch.fee_calculation.fee_type,
            fee_percentage: batch.fee_calculation.fee_percentage,
            flat_fee_amount: batch.fee_calculation.flat_fee_amount,
            billing_mode: 'billable' as const,
            locked_at: new Date(0).toISOString(),
          }
        : undefined)
    if (!locked) return
    const feeCalculation = calculateBatchFeeCalculation(invoices, locked)
    if (feeCalculation) updateBatch(batchId, { fee_calculation: feeCalculation })
    return
  }

  const feeTerms = snapshotFeeTermsFromClient(client) ?? client?.fee_terms
  const feeCalculation = calculateBatchFeeCalculation(invoices, feeTerms)
  if (feeCalculation) {
    updateBatch(batchId, { fee_calculation: feeCalculation })
  }
}

/**
 * After Fee Terms change on a carrier, refresh open batches only.
 * Processed batches keep their locked rates.
 */
export function syncClientBatchFees(clientId: string): void {
  for (const batch of getAllBatches()) {
    if (batch.client_id !== clientId) continue
    if (isBatchFeeLocked(batch)) continue
    syncBatchFees(batch.id)
  }
}
