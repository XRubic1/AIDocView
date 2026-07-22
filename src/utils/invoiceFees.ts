import type { PendingBatch } from '../types/admin'
import type { Client } from '../types/client'
import type { FeeTermsSnapshot } from '../types/feeTerms'
import type { Invoice } from '../types/invoice'

/** Invoices written off after short pay are fee-exempt; write_off_pending stays billable. */
export function isFeeBillableInvoice(invoice: Pick<Invoice, 'status'>): boolean {
  return (
    invoice.status !== 'written_off' &&
    invoice.status !== 'rejected'
  )
}

export function billableInvoices(invoices: Pick<Invoice, 'amount' | 'status'>[]): typeof invoices {
  return invoices.filter(isFeeBillableInvoice)
}

/** Compute batch fee totals from billable invoices only. */
export function calculateBatchFeeCalculation(
  invoices: Pick<Invoice, 'amount' | 'status'>[],
  feeTerms?: Client['fee_terms'] | FeeTermsSnapshot | null
): PendingBatch['fee_calculation'] | undefined {
  if (!feeTerms?.fee_type) return undefined

  const billable = billableInvoices(invoices)
  const billableAmount = billable.reduce((sum, inv) => sum + inv.amount, 0)
  const isTrial = 'billing_mode' in feeTerms && feeTerms.billing_mode === 'trial'

  let totalFee = 0
  if (!isTrial) {
    if (feeTerms.fee_type === 'percentage' && feeTerms.fee_percentage) {
      totalFee = (billableAmount * feeTerms.fee_percentage) / 100
    } else if (feeTerms.fee_type === 'flat' && feeTerms.flat_fee_amount) {
      totalFee = feeTerms.flat_fee_amount * billable.length
    }
  }

  return {
    fee_type: feeTerms.fee_type,
    fee_percentage: feeTerms.fee_percentage,
    flat_fee_amount: feeTerms.flat_fee_amount,
    total_fee: totalFee,
    net_amount: billableAmount - totalFee,
  }
}
