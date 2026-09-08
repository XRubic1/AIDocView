/** Broker risk cache types (rules-v2 — terms-aware + Credyx review gate). */

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

/** Why payment timing looks late — from notes / internal comments. */
export type BrokerDelayCause =
  | 'broker_slow_pay'
  | 'ppw_docs'
  | 'dispute'
  | 'mixed'
  | 'none'

/** Credyx review gate before carriers see elevated risk. */
export type BrokerRiskReviewStatus =
  | 'auto_published'
  | 'pending_review'
  | 'published'
  | 'cleared'

export type BrokerRiskMetrics = {
  avg_days_to_pay: number | null
  overdue_count: number
  overdue_amount: number
  collection_rate: number | null
  open_ar: number
  invoice_count: number
  follow_up_hint_count: number
  dispute_hint_count: number
  /** Broker Net terms used for this analysis. */
  payment_terms_days: number | null
  /**
   * Average confirmed days from invoice date → payment received.
   * Compared to payment_terms_days for “actual vs Net” timing.
   */
  avg_days_invoice_to_pay?: number | null
  /** Confirmed payments in the avg_days_invoice_to_pay sample. */
  paid_sample_size?: number | null
  /** Confirmed payments received after terms due date. */
  late_payment_count: number
  /** Worst days past Net terms among paid invoices. */
  max_days_past_terms: number | null
  /** Open invoices currently past Net terms. */
  open_overdue_past_terms: number
  /** Primary delay explanation from notes. */
  delay_cause?: BrokerDelayCause
  broker_pay_hint_count?: number
  ppw_hint_count?: number
  /** True when notes suggest clearing as PPW rather than publishing risk. */
  suggest_clear_as_ppw?: boolean
  /** Invoices on hold — pay clock paused. */
  hold_count?: number
  /** Invoices with an open dispute. */
  open_dispute_count?: number
  /** Open invoices excluded from overdue / avg-pay. */
  paused_open_count?: number
  paused_open_amount?: number
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
  /**
   * Carrier-visible level after review gate.
   * pending_review + elevated computed → carriers still see Medium/High (flagged);
   * evidence waits for Publish. Cleared → low.
   */
  risk_level: BrokerRiskLevel
  /** Engine output before Credyx publish/clear. */
  computed_risk_level: BrokerRiskLevel
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
  review_status: BrokerRiskReviewStatus
  review_note: string | null
  reviewed_at: string | null
  reviewed_by: string | null
}

export const BROKER_RISK_MODEL_VERSION = 'rules-v2.6'
