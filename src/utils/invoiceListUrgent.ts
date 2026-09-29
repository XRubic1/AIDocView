/**
 * Urgent is a flag beside the invoice status. It never replaces status.
 * A person is needed when the broker has not answered inside the configured window.
 */
import type { Broker } from '../types/broker'
import type { Invoice } from '../types/invoice'
import { COLLECTIONS_POLICY, daysPastYmd } from './collectionsPolicy'
import { getCollectionsTrackStage } from './collectionsTrack'

const CLOSED = new Set<Invoice['status']>([
  'paid',
  'force_closed',
  'written_off',
  'write_off_pending',
  'rejected',
])

export function isInvoiceListUrgent(
  invoice: Invoice,
  broker?: Pick<Broker, 'paperwork_status_check_days' | 'payment_status_inquiry_days'> | null
): boolean {
  if (CLOSED.has(invoice.status)) return false
  if (invoice.status === 'pending' || invoice.status === 'review') {
    return Boolean(invoice.collections_needs_attention)
  }
  if (invoice.collections_needs_attention) return true
  const stage = getCollectionsTrackStage({ invoice, broker })
  if (stage === 'past_due_urgent') return true
  if (invoice.collection_status === 'W/P' && invoice.collection_date) {
    return daysPastYmd(invoice.collection_date) >= COLLECTIONS_POLICY.willPayMissedDays
  }
  return false
}
