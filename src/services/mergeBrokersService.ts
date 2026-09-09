import { mockBrokers, removeBrokerFromStore, updateBrokerAsync } from '../data/mockBrokers'
import { reassignBrokerRiskProfiles } from '../data/brokerRiskStore'
import { reassignEmailInboxBrokerId } from '../data/emailInboxStore'
import { mockInvoices } from '../data/mockInvoices'
import { mockPayments } from '../data/mockPayments'
import { getAllClients } from './clientRegistry'
import { deleteBrokerFromDb, persistBrokerMerge } from './supabase/tenantPersist'
import { persistOrThrow } from './persistHelper'
import { isSupabaseConfigured } from '../lib/supabase'
import { logAuditEvent } from '../utils/auditLogger'
import { mergeBrokerNotes } from '../utils/clientBrokers'
import { reassignLoadsToBroker } from '../utils/mergeBrokerLoads'

export type MergeBrokersResult = {
  invoiceCount: number
  paymentCount: number
  keepName: string
  sourceName: string
}

/**
 * Merge a duplicate broker into another catalog row.
 * All invoices on `sourceId` are reassigned to `keepId`, then the source row is removed.
 */
export async function mergeDuplicateBrokers(
  sourceId: string,
  keepId: string
): Promise<MergeBrokersResult> {
  if (sourceId === keepId) {
    throw new Error('Pick a different broker to merge into.')
  }

  const source = mockBrokers.find((b) => b.id === sourceId)
  const keep = mockBrokers.find((b) => b.id === keepId)
  if (!source || !keep) {
    throw new Error('One of the brokers is missing. Refresh and try again.')
  }

  const invoiceIds = mockInvoices
    .filter((invoice) => invoice.broker_id === sourceId)
    .map((invoice) => invoice.id)
  const invoiceCount = invoiceIds.length
  const paymentCount = mockPayments.filter(
    (payment) => invoiceIds.includes(payment.invoice_id) || payment.broker_name === source.name
  ).length

  if (isSupabaseConfigured()) {
    await persistOrThrow('Merge brokers', () =>
      persistBrokerMerge({
        sourceId,
        sourceName: source.name,
        keepId,
        keepName: keep.name,
        invoiceIds,
      })
    )
  }

  reassignLoadsToBroker(mockInvoices, mockPayments, sourceId, source.name, {
    id: keep.id,
    name: keep.name,
  })

  reassignBrokerRiskProfiles(sourceId, keepId)
  reassignEmailInboxBrokerId(sourceId, keepId)

  for (const client of getAllClients()) {
    mergeBrokerNotes(client.id, sourceId, keepId)
  }

  const mergedNotes = [keep.notes, source.notes?.trim() ? `Merged from ${source.name}:\n${source.notes}` : '']
    .filter((part) => Boolean(part?.trim()))
    .join('\n\n')
  if (mergedNotes && mergedNotes !== (keep.notes ?? '')) {
    await updateBrokerAsync(keepId, { notes: mergedNotes })
  }

  if (isSupabaseConfigured()) {
    await persistOrThrow('Delete merged broker', () => deleteBrokerFromDb(sourceId))
  }

  removeBrokerFromStore(sourceId)

  void import('./supabase/tenantDataLiveSync')
    .then(({ notifyTenantDataUpdated }) =>
      notifyTenantDataUpdated(['invoices', 'payments', 'brokers', 'broker_risk_profiles'])
    )
    .catch(() => undefined)

  logAuditEvent(
    'broker_deleted',
    'broker',
    sourceId,
    source.name,
    `Merged ${source.name} into ${keep.name} (${invoiceCount} load${invoiceCount === 1 ? '' : 's'} moved).`,
    'system',
    'System',
    'System',
    [
      { field: 'merged_into_id', old_value: sourceId, new_value: keepId },
      { field: 'invoice_count', old_value: invoiceCount, new_value: invoiceCount },
    ],
    { keep_id: keepId, keep_name: keep.name, invoice_ids: invoiceIds }
  )

  return {
    invoiceCount,
    paymentCount,
    keepName: keep.name,
    sourceName: source.name,
  }
}
