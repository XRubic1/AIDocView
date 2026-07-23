import { Broker } from '../types/broker'
import { persistBroker } from '../services/supabase/tenantPersist'

/** Mutable in-memory broker directory (hydrated from Supabase when configured). */
export const mockBrokers: Broker[] = []

export function hydrateBrokers(items: Broker[]): void {
  mockBrokers.length = 0
  mockBrokers.push(...items)
}

/** Add broker to store and persist to Supabase when configured. */
export function addBroker(broker: Broker): Broker {
  mockBrokers.push(broker)
  void persistBroker(broker).catch(console.error)
  return broker
}

export function updateBroker(brokerId: string, patch: Partial<Broker>): Broker | undefined {
  const broker = mockBrokers.find((b) => b.id === brokerId)
  if (!broker) return undefined
  Object.assign(broker, patch)
  // Explicitly clear contact arrays when the patch omits them.
  if (!('emails' in patch)) {
    /* keep existing */
  } else if (!patch.emails?.length) {
    delete broker.emails
    broker.email = patch.email
  }
  if (!('phones' in patch)) {
    /* keep existing */
  } else if (!patch.phones?.length) {
    delete broker.phones
    broker.phone = patch.phone
  }
  void persistBroker(broker).catch(console.error)
  return broker
}
