import type { AssistantRiskPayload } from '../types/assistant'
import type { BrokerRiskProfile, BrokerRiskTrigger } from '../types/brokerRisk'
import type { ClientBrokerNote, BrokerPayRating } from '../types/clientBroker'
import type { BrokerScoreRow } from '../utils/clientReports'
import {
  appendBrokerRiskProfile,
  getLatestBrokerRiskProfile,
} from '../data/brokerRiskStore'
import {
  computeBrokerRiskProfile,
  formatRiskFreshness,
} from '../utils/computeBrokerRiskProfile'

export type EnsureBrokerRiskArgs = {
  clientId: string
  brokerId: string
  brokerName: string
  mcNumber: string | null
  score: BrokerScoreRow | null
  rating: BrokerPayRating
  notes: ClientBrokerNote[]
  hasWorked: boolean
  /** Force a new analysis row even if a profile exists. */
  force?: boolean
  trigger?: BrokerRiskTrigger
  /** Max age (hours) before a backfill refresh — default 7 days. */
  maxAgeHours?: number
}

/** Read latest cached profile (null if never analyzed). */
export function getBrokerRiskProfile(
  clientId: string,
  brokerId: string
): BrokerRiskProfile | null {
  return getLatestBrokerRiskProfile(clientId, brokerId)
}

/**
 * Ensure a stored profile exists (Phase 0 backfill / weekly refresh).
 * Does not call an LLM — rules-v1 only.
 */
export function ensureBrokerRiskProfile(args: EnsureBrokerRiskArgs): BrokerRiskProfile {
  const existing = getLatestBrokerRiskProfile(args.clientId, args.brokerId)
  const maxAgeMs = (args.maxAgeHours ?? 24 * 7) * 60 * 60 * 1000
  const fresh =
    existing &&
    !args.force &&
    Date.now() - Date.parse(existing.analyzed_at) < maxAgeMs

  if (fresh && existing) return existing

  const { profile, evidence } = computeBrokerRiskProfile({
    clientId: args.clientId,
    brokerId: args.brokerId,
    brokerName: args.brokerName,
    mcNumber: args.mcNumber,
    score: args.score,
    rating: args.rating,
    notes: args.notes,
    hasWorked: args.hasWorked,
    trigger: args.trigger ?? (existing ? 'weekly' : 'backfill'),
  })
  appendBrokerRiskProfile(profile, evidence)
  return profile
}

/** Map stored profile → Assistant risk card payload. */
export function toAssistantRiskPayload(
  profile: BrokerRiskProfile,
  brokerName: string,
  notes: ClientBrokerNote[]
): AssistantRiskPayload {
  const freshness = formatRiskFreshness(profile, notes)
  return {
    brokerName,
    mcNumber: profile.mc_number || 'MC not on file',
    riskLevel: profile.risk_level,
    confidence: profile.confidence,
    analyzedAtLabel: freshness.analyzedAtLabel,
    invoiceCount: profile.metrics.invoice_count,
    notesRecencyLabel: freshness.notesRecencyLabel,
    bullets: profile.evidence_bullets,
    recommendation: profile.recommendation_text,
    ageCaveat:
      profile.confidence === 'low'
        ? 'Limited recent history — weight this as a trend hint, not a credit score.'
        : undefined,
  }
}
