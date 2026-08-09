import { Broker } from '../types/broker'
import { persistBroker } from '../services/supabase/tenantPersist'

/** Mutable in-memory broker directory (hydrated from Supabase when configured). */
export const mockBrokers: Broker[] = []

function emitBrokersUpdated(): void {
  // Dynamic import avoids circular deps with tenantDataLiveSync.
  void import('../services/supabase/tenantDataLiveSync')
    .then(({ notifyTenantDataUpdated }) => notifyTenantDataUpdated(['brokers']))
    .catch(() => undefined)
}

export function hydrateBrokers(items: Broker[]): void {
  mockBrokers.length = 0
  mockBrokers.push(...items)
}

/** Merge one broker row from live sync / hydrate. */
export function mergeBroker(broker: Broker): void {
  const idx = mockBrokers.findIndex((b) => b.id === broker.id)
  if (idx >= 0) {
    mockBrokers[idx] = { ...mockBrokers[idx], ...broker }
    return
  }
  mockBrokers.push(broker)
}

/** Apply patch in memory only. */
function applyBrokerPatch(brokerId: string, patch: Partial<Broker>): Broker | undefined {
  const broker = mockBrokers.find((b) => b.id === brokerId)
  if (!broker) return undefined
  Object.assign(broker, patch)
  if ('emails' in patch && !patch.emails?.length) {
    delete broker.emails
    broker.email = patch.email
  }
  if ('phones' in patch && !patch.phones?.length) {
    delete broker.phones
    broker.phone = patch.phone
  }
  if ('notes' in patch && !patch.notes?.trim()) {
    delete broker.notes
  }
  if ('carrier_notes' in patch && !patch.carrier_notes?.trim()) {
    delete broker.carrier_notes
  }
  return broker
}

/** Add broker to store and persist to Supabase when configured. */
export function addBroker(broker: Broker): Broker {
  mockBrokers.push(broker)
  void persistBroker(broker)
    .then(() => emitBrokersUpdated())
    .catch(console.error)
  return broker
}

export function updateBroker(brokerId: string, patch: Partial<Broker>): Broker | undefined {
  const broker = applyBrokerPatch(brokerId, patch)
  if (!broker) return undefined
  void persistBroker(broker)
    .then(() => emitBrokersUpdated())
    .catch(console.error)
  return broker
}

/** Awaited update — use for admin note posts that must reach carriers. */
export async function updateBrokerAsync(
  brokerId: string,
  patch: Partial<Broker>
): Promise<Broker | undefined> {
  const broker = applyBrokerPatch(brokerId, patch)
  if (!broker) return undefined
  await persistBroker(broker)
  emitBrokersUpdated()
  return broker
}
