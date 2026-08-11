import type {
  BrokerRiskConfidence,
  BrokerRiskEvidence,
  BrokerRiskLevel,
  BrokerRiskMetrics,
  BrokerRiskProfile,
  BrokerRiskReviewStatus,
  BrokerRiskTrigger,
} from '../types/brokerRisk'
import { BROKER_RISK_MODEL_VERSION } from '../types/brokerRisk'
import type { ClientBrokerNote } from '../types/clientBroker'
import type { BrokerScoreRow } from './clientReports'
import {
  BROKER_RISK_POLICY,
  classifyDelayCauses,
  delayCauseLabel,
  extractInvoiceNotesForRisk,
  evaluateRiskFromSignals,
  isRoutineLifecycleNote,
  type BrokerTermsPaymentSignals,
} from './brokerRiskPolicy'
import type { Invoice } from '../types/invoice'

export type ComputeBrokerRiskInput = {
  clientId: string
  brokerId: string
  brokerName: string
  mcNumber: string | null
  score: BrokerScoreRow | null
  notes: ClientBrokerNote[]
  /** Admin-only brokers.notes — used in analysis, never shown to carriers. */
  adminNotes?: string | null
  /** Invoices for this broker (status notes / notes_history feed delay cause). */
  invoices?: Invoice[]
  hasWorked: boolean
  paymentTermsDays?: number | null
  /** Precomputed terms signals (preferred). */
  termsSignals?: BrokerTermsPaymentSignals | null
  /** Credyx marked broker NEW (thin history → elevated risk). */
  isNewBroker?: boolean
  /** Optional prebuilt summary; otherwise rules text is generated here. */
  summaryText?: string
  trigger?: BrokerRiskTrigger
  now?: Date
}

export type ComputeBrokerRiskResult = {
  profile: BrokerRiskProfile
  evidence: BrokerRiskEvidence[]
  computed_level: BrokerRiskLevel
  review_status: BrokerRiskReviewStatus
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

function buildBullets(
  evaluation: ReturnType<typeof evaluateRiskFromSignals>,
  score: BrokerScoreRow | null,
  notes: ClientBrokerNote[]
): string[] {
  const { signals, reasons, note_flag_count, delay_causes } = evaluation
  const bullets: string[] = []
  const net = signals.payment_terms_days

  if (evaluation.computed_level === 'low' && signals.paid_sample_size > 0) {
    bullets.push(`Pays within Net ${net} — on time`)
  }
  if (signals.late_payment_count > 0) {
    bullets.push(
      `${signals.late_payment_count} payment${signals.late_payment_count === 1 ? '' : 's'} past Net ${net}` +
        (signals.max_days_past_terms != null
          ? ` (worst ${signals.max_days_past_terms}d late)`
          : '')
    )
  }
  if (signals.open_overdue_past_terms > 0) {
    bullets.push(
      `${signals.open_overdue_past_terms} open invoice${signals.open_overdue_past_terms === 1 ? '' : 's'} past Net ${net} (${formatUsd(signals.open_overdue_amount)})`
    )
  }
  if (delay_causes && delay_causes.primary !== 'none') {
    bullets.push(`Likely cause: ${delayCauseLabel(delay_causes.primary)} — ${delay_causes.summary}`)
    const snip = delay_causes.snippets[0]
    if (snip) bullets.push(`Note: “${truncate(snip.text, 90)}”`)
  } else if (note_flag_count > 0) {
    const delayNotes = notes.filter((n) => BROKER_RISK_POLICY.note_keyword_re.test(n.text))
    if (delayNotes[0]) {
      bullets.push(`Note flag: “${truncate(delayNotes[0].text, 80)}”`)
    }
  }
  if (score && score.invoiced_in_range > 0 && bullets.length < 4) {
    bullets.push(
      `${score.collection_rate.toFixed(0)}% of your invoiced loads with this broker are paid (invoice mix)`
    )
  }
  if (bullets.length === 0) {
    bullets.push(...reasons.slice(0, 2))
  }
  return bullets.slice(0, 5)
}

function buildRecommendation(
  level: BrokerRiskLevel,
  brokerName: string,
  hasWorked: boolean,
  termsDays: number,
  evaluation?: ReturnType<typeof evaluateRiskFromSignals>
): string {
  if (!hasWorked || level === 'unrated') {
    return `Not enough history yet with ${brokerName}. Check MC details and start with smaller exposure.`
  }
  if (evaluation?.suggest_clear_as_ppw) {
    return `Notes suggest PPW / paperwork delays — confirm docs are clean before treating ${brokerName} as a slow payer.`
  }
  if (level === 'low') {
    return `Payment behavior looks stable vs Net ${termsDays}. Keep current terms; no special chase cadence required.`
  }
  if (level === 'high') {
    return `Tighten terms or reduce volume until overdue clears. Escalate status checks earlier than Net ${termsDays}.`
  }
  return `Monitor new loads until recent invoices clear. Use broker inquiry days before escalating past Net ${termsDays}.`
}

function buildSummaryText(
  brokerName: string,
  evaluation: ReturnType<typeof evaluateRiskFromSignals>,
  score: BrokerScoreRow | null,
  hasWorked: boolean
): string {
  const net = evaluation.signals.payment_terms_days
  const { computed_level, signals, delay_causes } = evaluation
  const causeLine =
    delay_causes && delay_causes.primary !== 'none'
      ? ` Likely cause from notes: ${delayCauseLabel(delay_causes.primary).toLowerCase()}.`
      : ''

  if (!hasWorked || !score) {
    return `${brokerName} does not have enough payment history with you yet. Credyx treats thin history as elevated risk — start with smaller exposure until payments clear.`
  }

  if (computed_level === 'low') {
    const avg =
      signals.avg_days_invoice_to_pay != null
        ? ` averaging ${signals.avg_days_invoice_to_pay} days from invoice`
        : ''
    return `${brokerName} pays within Net ${net}${avg}. ${score.collection_rate.toFixed(0)}% of your invoiced loads with this broker are paid. Low overdue exposure past terms.`
  }

  if (computed_level === 'medium') {
    const parts = [
      `${brokerName} shows mixed payment behavior vs Net ${net}.`,
      signals.late_payment_count > 0
        ? `${signals.late_payment_count} payment(s) arrived after terms.`
        : '',
      signals.open_overdue_past_terms > 0
        ? `${signals.open_overdue_past_terms} open invoice(s) currently past Net ${net}.`
        : 'Monitor new loads until recent invoices clear.',
      causeLine.trim(),
    ]
    return parts.filter(Boolean).join(' ')
  }

  return `${brokerName} is a higher-risk payer vs Net ${net} — ${formatUsd(signals.open_overdue_amount || score.overdue_amount)} past terms across ${signals.open_overdue_past_terms || score.overdue_count} invoice(s)${signals.max_days_past_terms != null ? ` with up to ${signals.max_days_past_terms}d past due` : ''}.${causeLine} Consider tighter terms or reduced volume.`
}

/** Map computed level → initial review status (Credyx gate). */
export function reviewStatusForComputedLevel(
  level: BrokerRiskLevel
): BrokerRiskReviewStatus {
  if (level === 'medium' || level === 'high') return 'pending_review'
  return 'auto_published'
}

/** Carrier-visible risk_level for a stored profile. */
export function carrierVisibleRiskLevel(profile: BrokerRiskProfile): BrokerRiskLevel {
  if (profile.review_status === 'cleared') return 'low'
  // Flagged Medium/High show on the carrier portal even while Credyx finishes review.
  // Full evidence / recommendation still wait for Publish (see toClientBrokerRiskView).
  if (profile.review_status === 'pending_review') {
    if (
      profile.computed_risk_level === 'medium' ||
      profile.computed_risk_level === 'high'
    ) {
      return profile.computed_risk_level
    }
    return 'unrated'
  }
  return profile.risk_level
}

/**
 * Rules-based risk analysis (rules-v2 — terms-aware, no LLM).
 * Medium/high → pending_review; low/unrated → auto_published.
 */
export function computeBrokerRiskProfile(input: ComputeBrokerRiskInput): ComputeBrokerRiskResult {
  const now = input.now ?? new Date()
  const trigger = input.trigger ?? 'backfill'

  const signals: BrokerTermsPaymentSignals =
    input.termsSignals ??
    ({
      payment_terms_days:
        input.paymentTermsDays != null && input.paymentTermsDays > 0
          ? Math.floor(input.paymentTermsDays)
          : BROKER_RISK_POLICY.fallback_terms_days,
      late_payment_count: input.score?.late_payment_count ?? 0,
      max_days_past_terms: input.score?.max_days_past_terms ?? null,
      avg_days_past_terms: null,
      open_overdue_past_terms: input.score?.open_overdue_past_terms ?? 0,
      open_overdue_amount: input.score?.overdue_amount ?? 0,
      open_urgent_past_terms: 0,
      paid_sample_size: input.score?.invoiced_in_range ?? 0,
      avg_days_invoice_to_pay: input.score?.avg_days_invoice_to_pay ?? null,
    } satisfies BrokerTermsPaymentSignals)

  const noteTexts = [...input.notes]
  const invoiceNoteTexts = extractInvoiceNotesForRisk(input.invoices ?? [])
  const delayCauses = classifyDelayCauses(noteTexts, input.adminNotes, invoiceNoteTexts)
  const noteFlagCount =
    noteTexts.filter(
      (n) =>
        !isRoutineLifecycleNote(n.text) &&
        BROKER_RISK_POLICY.note_keyword_re.test(n.text)
    ).length +
    invoiceNoteTexts.filter((n) =>
      BROKER_RISK_POLICY.note_keyword_re.test(n.text)
    ).length +
    (input.adminNotes &&
    !isRoutineLifecycleNote(input.adminNotes) &&
    BROKER_RISK_POLICY.note_keyword_re.test(input.adminNotes)
      ? 1
      : 0)

  const evaluation = evaluateRiskFromSignals({
    hasWorked: input.hasWorked,
    signals,
    noteFlagCount,
    delayCauses,
    isNewBroker: input.isNewBroker,
  })

  const computed = evaluation.computed_level
  const review_status = reviewStatusForComputedLevel(computed)
  // Carriers only see elevated risk after Credyx publishes.
  const carrierLevel: BrokerRiskLevel =
    review_status === 'pending_review' ? 'unrated' : computed

  const confidence = computeRiskConfidence(input.score, input.notes, input.hasWorked, now)
  const bullets = buildBullets(evaluation, input.score, input.notes)
  const summary =
    input.summaryText?.trim() ||
    buildSummaryText(input.brokerName, evaluation, input.score, input.hasWorked)
  const recommendation = buildRecommendation(
    computed,
    input.brokerName,
    input.hasWorked,
    signals.payment_terms_days,
    evaluation
  )

  const delayNotes = input.notes.filter((n) =>
    BROKER_RISK_POLICY.note_keyword_re.test(n.text)
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
    dispute_hint_count: delayCauses.dispute_count,
    payment_terms_days: signals.payment_terms_days,
    late_payment_count: signals.late_payment_count,
    max_days_past_terms: signals.max_days_past_terms,
    open_overdue_past_terms: signals.open_overdue_past_terms,
    delay_cause: delayCauses.primary,
    broker_pay_hint_count: delayCauses.broker_pay_count,
    ppw_hint_count: delayCauses.ppw_count,
    suggest_clear_as_ppw: Boolean(evaluation.suggest_clear_as_ppw),
  }

  const profileId = newId('brp')
  const profile: BrokerRiskProfile = {
    id: profileId,
    client_id: input.clientId,
    broker_id: input.brokerId,
    mc_number: input.mcNumber,
    risk_level: carrierLevel,
    computed_risk_level: computed,
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
    review_status,
    review_note: null,
    reviewed_at: null,
    reviewed_by: null,
  }

  const evidence: BrokerRiskEvidence[] = []
  if (input.score || signals.paid_sample_size > 0) {
    evidence.push({
      id: newId('bre'),
      profile_id: profileId,
      source_type: 'payment',
      source_id: null,
      weight: 1,
      source_dated_at: now.toISOString(),
      label: `Net ${signals.payment_terms_days}: ${signals.late_payment_count} late, ${signals.open_overdue_past_terms} open past terms`,
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

  return { profile, evidence, computed_level: computed, review_status }
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
