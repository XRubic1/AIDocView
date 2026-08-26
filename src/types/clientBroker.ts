import type { BrokerScoreRow } from '../utils/clientReports'
import type { BrokerRiskLevel, BrokerRiskProfile } from './brokerRisk'
import type { AssistantRiskLevel, AssistantConfidence } from './assistant'
import {
  carrierVisibleRiskLevel,
} from '../utils/computeBrokerRiskProfile'
import {
  buildBrokerPaymentTiming,
  type BrokerPaymentTiming,
} from '../utils/brokerPaymentTiming'

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
  /** True when Credyx has not yet published elevated risk. */
  pending_review?: boolean
  /** Credyx review note once published (carrier-visible). */
  review_note?: string | null
  /**
   * Net terms vs actual average payment — only after Credyx publish
   * (or auto-published low), so carriers see timing Credyx pushed out.
   */
  payment_timing?: BrokerPaymentTiming | null
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
  address: string | null
  /** Credyx-marked NEW (thin / no payment history). */
  is_new: boolean
  /** Credyx notes visible to this carrier. */
  carrier_notes: string | null
  has_worked_with_client: boolean
  in_credyx_network: boolean
  /** Confirmed payments with this carrier only. */
  paid_sample_size: number
  score: BrokerScoreRow | null
  rating: BrokerPayRating
  /** Narrative from stored risk profile (rules/LLM cache). */
  ai_summary: string
  /** Structured Broker Risk cache — preferred over ad-hoc summary alone. */
  risk: ClientBrokerRiskView | null
  notes: ClientBrokerNote[]
}

/**
 * Build directory risk view from a stored profile.
 * Flagged Medium/High are visible to carriers; evidence waits for Publish.
 */
export function toClientBrokerRiskView(
  profile: BrokerRiskProfile,
  analyzedAtLabel: string,
  notesRecencyLabel: string
): ClientBrokerRiskView {
  const pending = profile.review_status === 'pending_review'
  const published =
    profile.review_status === 'published' || profile.review_status === 'auto_published'
  const level = carrierVisibleRiskLevel(profile) as AssistantRiskLevel
  const reviewNote =
    published && profile.review_note?.trim() ? profile.review_note.trim() : null

  // Push Net vs actual average only after Credyx publishes (or auto low).
  const paymentTiming =
    published && !pending
      ? buildBrokerPaymentTiming({
          paymentTermsDays: profile.metrics.payment_terms_days,
          avgDaysInvoiceToPay:
            profile.metrics.avg_days_invoice_to_pay ?? profile.metrics.avg_days_to_pay,
          paidSampleSize: profile.metrics.paid_sample_size ?? null,
        })
      : null

  return {
    risk_level: level,
    confidence: profile.confidence,
    analyzed_at: profile.analyzed_at,
    analyzed_at_label: analyzedAtLabel,
    notes_recency_label: notesRecencyLabel,
    invoice_count: profile.metrics.invoice_count,
    bullets: pending ? [] : profile.evidence_bullets,
    recommendation: pending
      ? 'Credyx flagged this broker and is finishing review — treat as elevated risk until cleared.'
      : profile.recommendation_text,
    model_version: profile.model_version,
    profile_id: profile.id,
    pending_review: pending,
    review_note: reviewNote,
    payment_timing: paymentTiming,
  }
}

/** Carrier-safe one-liner for risk (keep short — panel shows status, not essays). */
export function carrierSafeRiskSummary(
  profile: BrokerRiskProfile,
  _brokerName: string
): string {
  const level = carrierVisibleRiskLevel(profile)
  if (level === 'low' || level === 'unrated') return 'No risk'
  if (profile.review_status === 'cleared') return 'No risk'
  if (profile.review_status === 'pending_review') {
    return level === 'high' ? 'High risk · under review' : 'Medium risk · under review'
  }
  if (level === 'high') return 'High risk'
  if (level === 'medium') return 'Medium risk'
  return 'No risk'
}

export type { BrokerRiskLevel }
