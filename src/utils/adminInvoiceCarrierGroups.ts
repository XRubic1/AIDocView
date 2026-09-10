import type { EnrichedInvoice } from './invoiceAging'
import type { Payment } from '../types/payment'
import { invoiceHasOpenDisputedStatus } from './clientInvoiceDisputeStatus'
import { getInvoiceOpenArBalance } from './paymentVariance'

/** Carrier parent row on the admin Invoices list. */
export type CarrierInvoiceGroup = {
  clientId: string
  clientName: string
  totalAmount: number
  invoiceCount: number
  willPayCount: number
  overdueCount: number
  holdCount: number
  disputeCount: number
  invoices: EnrichedInvoice[]
}

/** Counts and remaining open A/R for a set of invoices. */
export function summarizeCarrierInvoices(
  invoices: EnrichedInvoice[],
  payments: Payment[] = []
): Omit<CarrierInvoiceGroup, 'clientId' | 'clientName' | 'invoices'> {
  let totalAmount = 0
  let willPayCount = 0
  let overdueCount = 0
  let holdCount = 0
  let disputeCount = 0
  for (const invoice of invoices) {
    totalAmount += getInvoiceOpenArBalance(invoice, payments)
    if (invoice.collection_status === 'W/P') willPayCount += 1
    if (invoice.isOverdue) overdueCount += 1
    if (invoice.status === 'hold') holdCount += 1
    if (invoiceHasOpenDisputedStatus(invoice)) disputeCount += 1
  }
  return {
    totalAmount,
    invoiceCount: invoices.length,
    willPayCount,
    overdueCount,
    holdCount,
    disputeCount,
  }
}

/** Group invoices under their carrier (client), preserving invoice order. */
export function buildCarrierInvoiceGroups(
  invoices: EnrichedInvoice[],
  payments: Payment[] = []
): CarrierInvoiceGroup[] {
  const byClient = new Map<string, EnrichedInvoice[]>()
  for (const invoice of invoices) {
    const clientId = invoice.client_id || `name:${invoice.client_name}`
    const list = byClient.get(clientId)
    if (list) list.push(invoice)
    else byClient.set(clientId, [invoice])
  }

  const groups: CarrierInvoiceGroup[] = []
  for (const [clientId, list] of byClient) {
    const stats = summarizeCarrierInvoices(list, payments)
    groups.push({
      clientId: list[0]?.client_id || clientId,
      clientName: list[0]?.client_name || 'Carrier',
      invoices: list,
      ...stats,
    })
  }
  return groups
}
