import type { CredyxInvoiceDraft, BatchIntakeDraft } from '../types/credyxBatch'
import { emailDomainFromFingerprints } from '../products/docSort/utils/formatRate'
import { addBroker, mockBrokers } from '../data/mockBrokers'
import type { Broker } from '../types/broker'
import {
  extractEmailDomain,
  normalizeEmailDomain,
} from './emailDomain'

export type BrokerResolveResult = {
  broker_id: string
  broker_name: string
  /** Carrier requested a broker not yet in the Credyx directory. */
  pending_new?: boolean
}

/** All email domains on file for a broker (debtor). */
export function brokerEmailDomains(broker: Broker): string[] {
  const emails = [
    ...(broker.emails?.map((e) => e.email) ?? []),
    broker.email,
  ].filter((e): e is string => Boolean(e?.trim()))
  const domains = new Set<string>()
  for (const email of emails) {
    const domain = extractEmailDomain(email)
    if (domain) domains.add(domain)
  }
  return [...domains]
}

/** Primary on-file domain for a broker (first email domain). */
export function primaryBrokerEmailDomain(broker: Broker | null | undefined): string | null {
  if (!broker) return null
  return brokerEmailDomains(broker)[0] ?? null
}

/** Find a debtor whose on-file emails include this domain. */
export function findBrokerByEmailDomain(domain: string): Broker | undefined {
  const normalized = normalizeEmailDomain(domain)
  if (!normalized) return undefined
  return mockBrokers.find((b) => brokerEmailDomains(b).includes(normalized))
}

/** True when any debtor in the directory has this email domain. */
export function hasBrokerWithEmailDomain(domain: string | null | undefined): boolean {
  if (!domain?.trim()) return false
  return Boolean(findBrokerByEmailDomain(domain))
}

/** Fuzzy-match an existing broker by name (exact, contains, or unique brand token). */
export function findBrokerByName(brokerName: string): Broker | undefined {
  const trimmed = brokerName.trim()
  if (!trimmed) return undefined
  const lower = trimmed.toLowerCase()
  const exactOrContains = mockBrokers.find(
    (b) =>
      b.name.toLowerCase() === lower ||
      lower.includes(b.name.toLowerCase()) ||
      b.name.toLowerCase().includes(lower)
  )
  if (exactOrContains) return exactOrContains

  // e.g. "Werner Logistics" → sole directory hit sharing brand token "werner"
  const tokens = significantBrokerTokens(trimmed)
  if (tokens.length === 0) return undefined
  const hits = mockBrokers.filter((b) => {
    const brokerTokens = new Set(significantBrokerTokens(b.name))
    return tokens.some((t) => brokerTokens.has(t))
  })
  return hits.length === 1 ? hits[0] : undefined
}

const BROKER_NAME_STOPWORDS = new Set([
  'inc',
  'llc',
  'ltd',
  'co',
  'company',
  'corp',
  'corporation',
  'logistics',
  'enterprises',
  'enterprise',
  'freight',
  'transport',
  'transportation',
  'the',
  'of',
  'and',
  'group',
  'services',
  'solutions',
  'brokerage',
])

/** Distinctive name tokens used for loose directory matching. */
function significantBrokerTokens(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 4 && !BROKER_NAME_STOPWORDS.has(t))
}

/**
 * Match only — never creates a broker.
 * Unknown names become pending_new with empty broker_id for Credyx to link later.
 * When `emailDomain` is provided, prefer a debtor that owns that domain.
 */
export function matchBrokerByName(
  brokerName: string,
  emailDomain?: string | null
): BrokerResolveResult {
  const trimmed = brokerName.trim()
  if (!trimmed && !emailDomain?.trim()) {
    return { broker_id: '', broker_name: '' }
  }

  const byDomain = emailDomain ? findBrokerByEmailDomain(emailDomain) : undefined
  if (byDomain) {
    return { broker_id: byDomain.id, broker_name: byDomain.name }
  }

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

/** Link a pending draft broker via rate-con email domain or brand-token name match. */
export function rematchPendingDraftBroker(inv: CredyxInvoiceDraft): CredyxInvoiceDraft {
  if (inv.broker_id) return inv
  const domain = emailDomainFromFingerprints([
    ...inv.fingerprints.rateCons,
    ...inv.fingerprints.bols,
    ...(inv.fingerprints.other ?? []),
  ])
  const matched = matchBrokerByName(inv.broker_name, domain)
  if (!matched.broker_id) return inv
  return {
    ...inv,
    broker_id: matched.broker_id,
    broker_name: matched.broker_name,
  }
}

/** Rematch all pending brokers on an intake draft (domain / brand token). */
export function rematchPendingDraftBrokers(draft: BatchIntakeDraft): BatchIntakeDraft {
  return {
    ...draft,
    invoices: draft.invoices.map(rematchPendingDraftBroker),
  }
}
