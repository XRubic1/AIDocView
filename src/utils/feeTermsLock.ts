import type { Client } from '../types/client'
import type { ClientFeeTerms, FeeBillingMode, FeeTermsSnapshot } from '../types/feeTerms'
import type { Invoice } from '../types/invoice'
import type { PendingBatch } from '../types/admin'
import { getBatchById, updateBatch } from '../data/mockBatches'
import { getInvoicesByBatchId, updateInvoice } from '../data/mockInvoices'
import { calculateBatchFeeCalculation } from './invoiceFees'
import { isBatchProcessedForClient } from './clientInvoiceView'
import { persistInvoice } from '../services/supabase/tenantPersist'
import { isSupabaseConfigured } from '../lib/supabase'

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Build fee terms from the client's live Fee Terms + subscription.
 * Used for open-batch calcs and for locking at process time.
 */
export function snapshotFeeTermsFromClient(client: Client | undefined | null): FeeTermsSnapshot | undefined {
  const terms = client?.fee_terms
  if (!terms?.fee_type) return undefined

  const billing_mode: FeeBillingMode =
    client?.billing?.subscription_status === 'trial' ? 'trial' : 'billable'

  return {
    fee_type: terms.fee_type,
    fee_percentage: terms.fee_percentage,
    flat_fee_amount: terms.flat_fee_amount,
    billing_mode,
    locked_at: new Date().toISOString(),
  }
}

/** True when the batch is processed — fee terms stay locked, not live. */
export function isBatchFeeLocked(batch: Pick<PendingBatch, 'status'> | null | undefined): boolean {
  return isBatchProcessedForClient(batch?.status)
}

/** True when locked terms waive collection fees. */
export function isTrialFeeTerms(terms: FeeTermsSnapshot | undefined | null): boolean {
  return terms?.billing_mode === 'trial'
}

/** Human label for tables / accounting UI. */
export function formatFeeTermsLabel(terms: FeeTermsSnapshot | undefined | null): string {
  if (!terms) return '—'
  if (terms.billing_mode === 'trial') return 'Trial (waived)'
  if (terms.fee_type === 'flat') {
    return `$${Number(terms.flat_fee_amount ?? 0).toFixed(2)} flat`
  }
  return `${terms.fee_percentage ?? 0}%`
}

/** Fee charged on an amount under terms (0 when trial). */
export function feeAmountForPayment(
  paymentAmount: number,
  terms: FeeTermsSnapshot | undefined | null
): number {
  if (!terms || terms.billing_mode === 'trial') return 0
  if (terms.fee_type === 'flat') {
    return roundMoney(terms.flat_fee_amount ?? 0)
  }
  const rate = terms.fee_percentage ?? 0
  return roundMoney((rate / 100) * paymentAmount)
}

/**
 * Resolve terms for an invoice: locked invoice → locked batch → live client.
 * Open batches without a lock fall through to the carrier's current Fee Terms.
 */
export function resolveInvoiceFeeTerms(
  invoice: Pick<Invoice, 'fee_terms' | 'batch_id'>,
  batch?: Pick<PendingBatch, 'fee_terms' | 'fee_calculation' | 'status'> | null,
  client?: Client | null
): FeeTermsSnapshot | undefined {
  if (invoice.fee_terms?.fee_type) return invoice.fee_terms

  if (batch?.fee_terms?.fee_type) return batch.fee_terms

  // Processed legacy batches may only have fee_calculation — treat as billable lock.
  if (batch && isBatchFeeLocked(batch)) {
    const calc = batch.fee_calculation
    if (calc?.fee_type) {
      return {
        fee_type: calc.fee_type,
        fee_percentage: calc.fee_percentage,
        flat_fee_amount: calc.flat_fee_amount,
        billing_mode: 'billable',
        locked_at: new Date(0).toISOString(),
      }
    }
  }

  return snapshotFeeTermsFromClient(client ?? undefined)
}

/** Convert terms into the shape calculateBatchFeeCalculation expects. */
export function toClientFeeTermsShape(
  terms: FeeTermsSnapshot | ClientFeeTerms | undefined | null
): ClientFeeTerms | undefined {
  if (!terms?.fee_type) return undefined
  return {
    fee_type: terms.fee_type,
    fee_percentage: terms.fee_percentage,
    flat_fee_amount: terms.flat_fee_amount,
  }
}

/**
 * Persist fee terms on a processed batch and cascade to its invoices.
 * Does not change the client's live Fee Terms.
 */
export async function applyBatchFeeTerms(
  batchId: string,
  next: Omit<FeeTermsSnapshot, 'locked_at'> & { locked_at?: string }
): Promise<{ batch: PendingBatch; invoiceCount: number }> {
  const batch = getBatchById(batchId)
  if (!batch) throw new Error('Batch not found')

  const snapshot: FeeTermsSnapshot = {
    fee_type: next.fee_type,
    fee_percentage: next.fee_percentage,
    flat_fee_amount: next.flat_fee_amount,
    billing_mode: next.billing_mode,
    locked_at: next.locked_at ?? new Date().toISOString(),
  }

  const invoices = getInvoicesByBatchId(batchId)
  const fee_calculation = calculateBatchFeeCalculation(invoices, snapshot)

  const updatedBatch = updateBatch(batchId, {
    fee_terms: snapshot,
    fee_calculation,
  })
  if (!updatedBatch) throw new Error('Failed to update batch')

  for (const inv of invoices) {
    const patched = updateInvoice(inv.id, { fee_terms: snapshot })
    if (patched && isSupabaseConfigured()) {
      try {
        await persistInvoice(patched)
      } catch (err) {
        console.warn('[applyBatchFeeTerms] invoice persist failed', inv.id, err)
      }
    }
  }

  return { batch: updatedBatch, invoiceCount: invoices.length }
}

/**
 * Lock the carrier's current Fee Terms onto a batch at process time
 * (and stamp the same snapshot on every invoice in the batch).
 */
export async function lockBatchFeeTermsFromClient(
  batchId: string,
  client: Client | undefined | null
): Promise<PendingBatch | undefined> {
  const batch = getBatchById(batchId)
  if (!batch) return undefined
  if (batch.fee_terms?.fee_type) {
    // Already locked — refresh fee_calculation only.
    const invoices = getInvoicesByBatchId(batchId)
    const fee_calculation = calculateBatchFeeCalculation(invoices, batch.fee_terms)
    return updateBatch(batchId, { fee_calculation }) ?? batch
  }

  const snapshot = snapshotFeeTermsFromClient(client)
  if (!snapshot) return batch

  const { batch: updated } = await applyBatchFeeTerms(batchId, snapshot)
  return updated
}
