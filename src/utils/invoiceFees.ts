import type { PendingBatch } from '../types/admin'
import type { Client } from '../types/client'
import type { Invoice } from '../types/invoice'

/** Invoices written off after short pay are fee-exempt; force-closed collection failures still bill. */
export function isFeeBillableInvoice(invoice: Pick<Invoice, 'status'>): boolean {
  return invoice.status !== 'written_off' && invoice.status !== 'rejected'
}

export function billableInvoices(invoices: Pick<Invoice, 'amount' | 'status'>[]): typeof invoices {
  return invoices.filter(isFeeBillableInvoice)
}

/** Compute batch fee totals from billable invoices only. */
export function calculateBatchFeeCalculation(
  invoices: Pick<Invoice, 'amount' | 'status'>[],
  feeTerms?: Client['fee_terms']
): PendingBatch['fee_calculation'] | undefined {
  if (!feeTerms) return undefined

  const billable = billableInvoices(invoices)
  const billableAmount = billable.reduce((sum, inv) => sum + inv.amount, 0)
  const { fee_type, fee_percentage, flat_fee_amount } = feeTerms

  let totalFee = 0
  if (fee_type === 'percentage' && fee_percentage) {
    totalFee = (billableAmount * fee_percentage) / 100
  } else if (fee_type === 'flat' && flat_fee_amount) {
    totalFee = flat_fee_amount * billable.length
  }

  return {
    fee_type,
    fee_percentage,
    flat_fee_amount,
    total_fee: totalFee,
    net_amount: billableAmount - totalFee,
  }
}
