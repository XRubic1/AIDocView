import type {
  BrokerRiskConfidence,
  BrokerRiskEvidence,
  BrokerRiskLevel,
  BrokerRiskMetrics,
  BrokerRiskProfile,
  BrokerRiskTrigger,
} from '../types/brokerRisk'
import { BROKER_RISK_MODEL_VERSION } from '../types/brokerRisk'
import type { ClientBrokerNote, BrokerPayRating } from '../types/clientBroker'
import type { BrokerScoreRow } from './clientReports'

export type ComputeBrokerRiskInput = {
  clientId: string
  brokerId: string
  brokerName: string
  mcNumber: string | null
  score: BrokerScoreRow | null
  rating: BrokerPayRating
  notes: ClientBrokerNote[]
  hasWorked: boolean
  /** Optional prebuilt summary; otherwise rules text is generated here. */
  summaryText?: string
  trigger?: BrokerRiskTrigger
  now?: Date
}

/** Map pay rating → risk level vocabulary used by Broker Risk UI. */
export function ratingToRiskLevel(rating: BrokerPayRating, hasWorked: boolean): BrokerRiskLevel {
  if (!hasWorked) return 'unrated'
  if (rating === 'green') return 'low'
  if (rating === 'red') return 'high'
  return 'medium'
}

/** Confidence from sample size + recency of notes/score activity. */
export function computeRiskConfidence(
  score: BrokerScoreRow | null,
  notes: ClientBrokerNote[],
  hasWorked: boolean,
  now = new Date()
): BrokerRiskConfidence {
  if (!hasWorked || !score) return 'low'

  const invoiceCount = Math.max(score.invoiced_in_range, score.open_invoices)
  const newestNoteMs = notes.reduce((max, n) => {
    const t = Date.parse(n.updated_at || n.created_at)
    return Number.isFinite(t) ? Math.max(max, t) : max
  }, 0)
  const daysSinceNote =
    newestNoteMs > 0 ? (now.getTime() - newestNoteMs) / (1000 * 60 * 60 * 24) : Infinity

  // Plan default: ≥10 invoices + a signal within 60 days → High.
  if (invoiceCount >= 10 && daysSinceNote <= 60) return 'high'
  if (invoiceCount >= 5 || daysSinceNote <= 90) return 'medium'
  return 'low'
}

function formatAnalyzedDay(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

function notesRecencyLabel(notes: ClientBrokerNote[], now: Date): string {
  if (notes.length === 0) return 'no notes on file'
  const newest = notes.reduce((max, n) => {
    const t = Date.parse(n.updated_at || n.created_at)
    return Number.isFinite(t) ? Math.max(max, t) : max
  }, 0)
  if (!newest) return 'no notes on file'
  const days = Math.max(0, Math.floor((now.getTime() - newest) / (1000 * 60 * 60 * 24)))
  if (days === 0) return 'today'
  if (days === 1) return '1 day ago'
  return `${days} days ago`
}

function buildBullets(
  score: BrokerScoreRow | null,
  notes: ClientBrokerNote[],
  rating: BrokerPayRating
): string[] {
  const bullets: string[] = []
  if (score?.avg_days_to_pay != null) {
    bullets.push(`Average payment lag: ${score.avg_days_to_pay} days from expected date`)
  }
  if (score && score.overdue_count > 0) {
    bullets.push(
      `${score.overdue_count} open invoice${score.overdue_count === 1 ? '' : 's'} overdue (${formatUsd(score.overdue_amount)})`
    )
  }
  if (score && score.invoiced_in_range > 0) {
    bullets.push(`Collection rate on your loads: ${score.collection_rate.toFixed(0)}%`)
  }
  const delayNotes = notes.filter((n) =>
    /delay|slow|late|short.?pay|dispute/i.test(n.text)
  )
  if (delayNotes.length > 0) {
    bullets.push(`Note flag: “${truncate(delayNotes[0].text, 80)}”`)
  }
  if (bullets.length === 0) {
    bullets.push(
      rating === 'green'
        ? 'No overdue exposure and stable pay timing on file'
        : 'Limited payment history — treat as watch until more loads clear'
    )
  }
  return bullets.slice(0, 4)
}

function buildRecommendation(
  level: BrokerRiskLevel,
  brokerName: string,
  hasWorked: boolean
): string {
  if (!hasWorked || level === 'unrated') {
    return `Not enough history yet with ${brokerName}. Check MC details and start with smaller exposure.`
  }
  if (level === 'low') {
    return `Payment behavior looks stable. Keep current terms; no special chase cadence required.`
  }
  if (level === 'high') {
    return `Tighten terms or reduce volume until overdue clears. Escalate status checks earlier than Net terms.`
  }
  return `Monitor new loads until recent invoices clear. Use broker inquiry days before escalating.`
}

/** Narrative summary used when no caller-supplied summaryText is provided. */
function buildSummaryText(
  brokerName: string,
  score: BrokerScoreRow | null,
  rating: BrokerPayRating,
  notes: ClientBrokerNote[],
  hasWorked: boolean
): string {
  const noteHints = notes
    .slice(0, 2)
    .map((n) => n.text)
    .join(' ')
  const noteLower = noteHints.toLowerCase()

  if (noteLower.includes('delay') || noteLower.includes('slow') || noteLower.includes('late')) {
    return `${brokerName} has been flagged in your notes for payment delays. Review recent terms before booking new freight.`
  }
  if (!hasWorked || !score) {
    return `${brokerName} is in the Credyx broker network but you have no payment history yet. Check MC details and start with smaller exposure until you build a track record.`
  }
  if (rating === 'green') {
    return `${brokerName} pays consistently — average ${score.avg_days_to_pay ?? 0} days from expected date with ${score.collection_rate.toFixed(0)}% collection rate on your loads. Low overdue exposure.`
  }
  if (rating === 'yellow') {
    const parts = [
      `${brokerName} shows mixed payment behavior on your account.`,
      score.avg_days_to_pay !== null ? `Average pay lag is ${score.avg_days_to_pay} days.` : '',
      score.overdue_count > 0
        ? `${score.overdue_count} open invoice${score.overdue_count > 1 ? 's' : ''} currently overdue.`
        : 'Monitor new loads until recent invoices clear.',
    ]
    return parts.filter(Boolean).join(' ')
  }
  return `${brokerName} is a higher-risk payer for your fleet — ${formatUsd(score.overdue_amount)} overdue across ${score.overdue_count} invoice${score.overdue_count !== 1 ? 's' : ''}${score.avg_days_to_pay !== null ? ` with ${score.avg_days_to_pay}d average lag` : ''}. Consider tighter terms or reduced volume.`
}

function formatUsd(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount)
}

function truncate(text: string, max: number): string {
  const t = text.trim()
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`
}

function newId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * Rules-based risk analysis (Phase 0 — no LLM).
 * Produces an append-only profile + evidence rows.
 */
export function computeBrokerRiskProfile(input: ComputeBrokerRiskInput): {
  profile: BrokerRiskProfile
  evidence: BrokerRiskEvidence[]
} {
  const now = input.now ?? new Date()
  const trigger = input.trigger ?? 'backfill'
  const level = ratingToRiskLevel(input.rating, input.hasWorked)
  const confidence = computeRiskConfidence(input.score, input.notes, input.hasWorked, now)
  const bullets = buildBullets(input.score, input.notes, input.rating)
  const summary =
    input.summaryText?.trim() ||
    buildSummaryText(input.brokerName, input.score, input.rating, input.notes, input.hasWorked)
  const recommendation = buildRecommendation(level, input.brokerName, input.hasWorked)

  const delayNotes = input.notes.filter((n) =>
    /delay|slow|late|short.?pay|dispute/i.test(n.text)
  )
  const metrics: BrokerRiskMetrics = {
    avg_days_to_pay: input.score?.avg_days_to_pay ?? null,
    overdue_count: input.score?.overdue_count ?? 0,
    overdue_amount: input.score?.overdue_amount ?? 0,
    collection_rate: input.score ? input.score.collection_rate : null,
    open_ar: input.score?.open_ar ?? 0,
    invoice_count: input.score
      ? Math.max(input.score.invoiced_in_range, input.score.open_invoices)
      : 0,
    follow_up_hint_count: delayNotes.length,
    dispute_hint_count: input.notes.filter((n) => /dispute/i.test(n.text)).length,
  }

  const profileId = newId('brp')
  const profile: BrokerRiskProfile = {
    id: profileId,
    client_id: input.clientId,
    broker_id: input.brokerId,
    mc_number: input.mcNumber,
    risk_level: level,
    confidence,
    summary_text: summary,
    recommendation_text: recommendation,
    metrics,
    evidence_bullets: bullets,
    analyzed_at: now.toISOString(),
    trigger,
    model_version: BROKER_RISK_MODEL_VERSION,
    scope: 'carrier',
    window_end: now.toISOString().slice(0, 10),
  }

  const evidence: BrokerRiskEvidence[] = []
  if (input.score) {
    evidence.push({
      id: newId('bre'),
      profile_id: profileId,
      source_type: 'invoice',
      source_id: null,
      weight: 1,
      source_dated_at: now.toISOString(),
      label: `Scorecard: ${metrics.invoice_count} invoices, avg lag ${metrics.avg_days_to_pay ?? '—'}d`,
    })
  }
  for (const note of delayNotes.slice(0, 3)) {
    const ageDays =
      (now.getTime() - Date.parse(note.created_at)) / (1000 * 60 * 60 * 24)
    const weight = ageDays > 90 ? 0.35 : ageDays > 60 ? 0.6 : 1
    evidence.push({
      id: newId('bre'),
      profile_id: profileId,
      source_type: 'note',
      source_id: note.id,
      weight,
      source_dated_at: note.created_at,
      label: truncate(note.text, 120),
    })
  }

  // Freshness helpers live in formatRiskFreshness().

  return { profile, evidence }
}

/** Format freshness line for UI (mandatory on risk surfaces). */
export function formatRiskFreshness(
  profile: BrokerRiskProfile,
  notes: ClientBrokerNote[],
  now = new Date()
): { analyzedAtLabel: string; notesRecencyLabel: string } {
  return {
    analyzedAtLabel: formatAnalyzedDay(new Date(profile.analyzed_at)),
    notesRecencyLabel: notesRecencyLabel(notes, now),
  }
}
