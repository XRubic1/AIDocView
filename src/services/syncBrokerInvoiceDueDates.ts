import { mockInvoices, updateInvoiceAsync } from '../data/mockInvoices'
import {
  buildBrokerTermsDueDatePatch,
  isInvoiceDueDateSyncable,
} from '../utils/invoiceDueDate'

/**
 * Rewrite open invoice due dates when a broker's Due by (days) changes.
 * Paid / closed invoices are left as historical snapshots.
 */
export async function syncOpenInvoiceDueDatesForBroker(opts: {
  brokerId: string
  brokerName?: string
  previousDays?: number | null
  nextDays?: number | null
}): Promise<number> {
  const { brokerId, brokerName, previousDays, nextDays } = opts
  const targets = mockInvoices.filter((inv) => {
    if (!isInvoiceDueDateSyncable(inv)) return false
    if (inv.broker_id && inv.broker_id === brokerId) return true
    if (brokerName && inv.broker_name === brokerName) return true
    return false
  })

  if (targets.length === 0) return 0

  const asOf = new Date()
  const clientIds = new Set<string>()

  for (const invoice of targets) {
    const patch = buildBrokerTermsDueDatePatch(invoice, nextDays, previousDays, asOf)
    await updateInvoiceAsync(invoice.id, patch)
    if (invoice.client_id) clientIds.add(invoice.client_id)
  }

  // Dynamic import avoids mockBrokers ↔ live-sync circular deps.
  const { notifyTenantDataUpdated } = await import('./supabase/tenantDataLiveSync')
  for (const clientId of clientIds) {
    notifyTenantDataUpdated(['invoices'], clientId)
  }

  return targets.length
}