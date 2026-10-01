import { mockInvoices, updateInvoiceAsync } from '../data/mockInvoices'
import type { Broker } from '../types/broker'
import { buildBrokerTermsDueDatePatch } from '../utils/invoiceDueDate'
import {
  normalizeBrokerNameKey,
  STANDARD_NEW_BROKER_PAY_TERMS_DAYS,
} from '../utils/pendingNewBrokers'

/**
 * Attach carrier loads that named a missing broker to a directory row.
 * Due dates follow that broker's Net terms (new brokers are Net 30).
 */
export async function linkPendingInvoicesToBroker(input: {
  requestedName: string
  broker: Pick<Broker, 'id' | 'name' | 'payment_terms_days'>
}): Promise<number> {
  const key = normalizeBrokerNameKey(input.requestedName)
  if (!key || !input.broker.id) return 0

  const terms =
    input.broker.payment_terms_days != null && Number(input.broker.payment_terms_days) > 0
      ? Number(input.broker.payment_terms_days)
      : STANDARD_NEW_BROKER_PAY_TERMS_DAYS

  const targets = mockInvoices.filter((inv) => {
    if (inv.broker_id?.trim()) return false
    return normalizeBrokerNameKey(inv.broker_name || '') === key
  })

  const clientIds = new Set<string>()
  for (const invoice of targets) {
    const dates = buildBrokerTermsDueDatePatch(invoice, terms, 0)
    await updateInvoiceAsync(invoice.id, {
      broker_id: input.broker.id,
      broker_name: input.broker.name,
      due_date: dates.due_date,
      expected_payment_date: dates.expected_payment_date,
      days_since_expected: dates.days_since_expected,
    })
    if (invoice.client_id) clientIds.add(invoice.client_id)
  }

  if (targets.length > 0) {
    const { notifyTenantDataUpdated } = await import('./supabase/tenantDataLiveSync')
    notifyTenantDataUpdated(['invoices'])
    for (const clientId of clientIds) {
      notifyTenantDataUpdated(['invoices'], clientId)
    }
  }

  return targets.length
}
