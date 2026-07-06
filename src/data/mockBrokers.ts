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
  void persistBroker(broker).catch(console.error)
  return broker
}
