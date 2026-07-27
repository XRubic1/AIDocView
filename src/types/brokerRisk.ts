/** Broker risk cache types (Phase 0 — rules-based, append-only profiles). */

export type BrokerRiskLevel = 'low' | 'medium' | 'high' | 'unrated'
export type BrokerRiskConfidence = 'low' | 'medium' | 'high'
export type BrokerRiskTrigger =
  | 'weekly'
  | 'payment'
  | 'dispute'
  | 'note'
  | 'manual'
  | 'backfill'
export type BrokerRiskScope = 'carrier' | 'network'
export type BrokerRiskEvidenceSource = 'invoice' | 'note' | 'payment' | 'dispute'

export type BrokerRiskMetrics = {
  avg_days_to_pay: number | null
  overdue_count: number
  overdue_amount: number
  collection_rate: number | null
  open_ar: number
  invoice_count: number
  follow_up_hint_count: number
  dispute_hint_count: number
}

export type BrokerRiskEvidence = {
  id: string
  profile_id: string
  source_type: BrokerRiskEvidenceSource
  source_id: string | null
  weight: number
  /** Business date of the signal — drives age weighting. */
  source_dated_at: string | null
  label: string | null
}

export type BrokerRiskProfile = {
  id: string
  client_id: string
  broker_id: string
  mc_number: string | null
  risk_level: BrokerRiskLevel
  confidence: BrokerRiskConfidence
  summary_text: string
  recommendation_text: string
  metrics: BrokerRiskMetrics
  /** Short evidence lines shown in UI (also stored as evidence rows). */
  evidence_bullets: string[]
  analyzed_at: string
  trigger: BrokerRiskTrigger
  model_version: string
  scope: BrokerRiskScope
  window_end: string | null
}

export const BROKER_RISK_MODEL_VERSION = 'rules-v1'
