import { addBroker, mockBrokers } from '../data/mockBrokers'
import type { Broker } from '../types/broker'

export type BrokerResolveResult = {
  broker_id: string
  broker_name: string
  /** Carrier requested a broker not yet in the Credyx directory. */
  pending_new?: boolean
}

/** Fuzzy-match an existing broker by name (exact or contains either way). */
export function findBrokerByName(brokerName: string): Broker | undefined {
  const trimmed = brokerName.trim()
  if (!trimmed) return undefined
  const lower = trimmed.toLowerCase()
  return mockBrokers.find(
    (b) =>
      b.name.toLowerCase() === lower ||
      lower.includes(b.name.toLowerCase()) ||
      b.name.toLowerCase().includes(lower)
  )
}

/**
 * Match only — never creates a broker.
 * Unknown names become pending_new with empty broker_id for Credyx to link later.
 */
export function matchBrokerByName(brokerName: string): BrokerResolveResult {
  const trimmed = brokerName.trim()
  if (!trimmed) {
    return { broker_id: '', broker_name: '' }
  }
  const match = findBrokerByName(trimmed)
  if (match) {
    return { broker_id: match.id, broker_name: match.name }
  }
  return { broker_id: '', broker_name: trimmed, pending_new: true }
}

/**
 * Match or create — admin / Credyx paths only.
 * Carriers must not call this; use matchBrokerByName + Request new instead.
 */
export function resolveOrCreateBroker(brokerName: string): BrokerResolveResult {
  const trimmed = brokerName.trim()
  if (!trimmed) {
    return { broker_id: '', broker_name: 'Unknown Broker' }
  }
  const match = findBrokerByName(trimmed)
  if (match) {
    return { broker_id: match.id, broker_name: match.name }
  }
  const broker = addBroker({
    id: `broker-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: trimmed,
  })
  return { broker_id: broker.id, broker_name: broker.name }
}

/** Format a broker street address for form autofill. */
export function formatBrokerAddress(broker: Broker): string {
  if (!broker.address) return ''
  return `${broker.address}${broker.city ? `, ${broker.city}` : ''}${
    broker.state ? `, ${broker.state}` : ''
  }${broker.zip ? ` ${broker.zip}` : ''}`.trim()
}
