import type { BrokerScoreRow } from '../utils/clientReports'
import type { BrokerRiskProfile } from './brokerRisk'
import type { AssistantRiskLevel, AssistantConfidence } from './assistant'

export type BrokerPayRating = 'green' | 'yellow' | 'red'

export type ClientBrokerNote = {
  id: string
  broker_id: string
  text: string
  created_at: string
  updated_at: string
}

/** Carrier-facing risk snapshot attached to broker directory rows. */
export type ClientBrokerRiskView = {
  risk_level: AssistantRiskLevel
  confidence: AssistantConfidence
  analyzed_at: string
  analyzed_at_label: string
  notes_recency_label: string
  invoice_count: number
  bullets: string[]
  recommendation: string
  model_version: string
  profile_id: string
}

/** Broker profile for the client portal directory. */
export type ClientBrokerProfile = {
  broker_id: string
  broker_name: string
  mc_number: string | null
  dot_number: string | null
  payment_terms_days: number | null
  city: string | null
  state: string | null
  has_worked_with_client: boolean
  in_credyx_network: boolean
  score: BrokerScoreRow | null
  rating: BrokerPayRating
  /** Narrative from stored risk profile (rules/LLM cache). */
  ai_summary: string
  /** Structured Broker Risk cache — preferred over ad-hoc summary alone. */
  risk: ClientBrokerRiskView | null
  notes: ClientBrokerNote[]
}

/** Build directory risk view from a stored profile. */
export function toClientBrokerRiskView(
  profile: BrokerRiskProfile,
  analyzedAtLabel: string,
  notesRecencyLabel: string
): ClientBrokerRiskView {
  return {
    risk_level: profile.risk_level,
    confidence: profile.confidence,
    analyzed_at: profile.analyzed_at,
    analyzed_at_label: analyzedAtLabel,
    notes_recency_label: notesRecencyLabel,
    invoice_count: profile.metrics.invoice_count,
    bullets: profile.evidence_bullets,
    recommendation: profile.recommendation_text,
    model_version: profile.model_version,
    profile_id: profile.id,
  }
}
