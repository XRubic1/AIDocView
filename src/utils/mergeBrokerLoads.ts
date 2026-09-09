import type { Invoice } from '../types/invoice'
import type { Payment } from '../types/payment'

export type BrokerMergeTarget = {
  id: string
  name: string
}

/**
 * Move invoices (and matching payments) from a duplicate broker onto the keeper.
 * Mutates the given arrays in place. Returns how many rows were reassigned.
 */
export function reassignLoadsToBroker(
  invoices: Invoice[],
  payments: Payment[],
  sourceId: string,
  sourceName: string,
  keep: BrokerMergeTarget
): { invoiceCount: number; paymentCount: number } {
  if (sourceId === keep.id) {
    return { invoiceCount: 0, paymentCount: 0 }
  }

  const now = new Date().toISOString()
  const movedInvoiceIds = new Set<string>()
  let invoiceCount = 0

  for (const invoice of invoices) {
    if (invoice.broker_id !== sourceId) continue
    invoice.broker_id = keep.id
    invoice.broker_name = keep.name
    invoice.updated_at = now
    movedInvoiceIds.add(invoice.id)
    invoiceCount += 1
  }

  let paymentCount = 0
  for (const payment of payments) {
    const onMovedInvoice = movedInvoiceIds.has(payment.invoice_id)
    const namedAsSource = payment.broker_name === sourceName
    if (!onMovedInvoice && !namedAsSource) continue
    payment.broker_name = keep.name
    paymentCount += 1
  }

  return { invoiceCount, paymentCount }
}
