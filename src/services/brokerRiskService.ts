import type { AssistantRiskPayload } from '../types/assistant'
import type {
  BrokerRiskLevel,
  BrokerRiskProfile,
  BrokerRiskTrigger,
} from '../types/brokerRisk'
import { BROKER_RISK_MODEL_VERSION } from '../types/brokerRisk'
import type { ClientBrokerNote, BrokerPayRating } from '../types/clientBroker'
import type { BrokerScoreRow } from '../utils/clientReports'
import type { BrokerTermsPaymentSignals } from '../utils/brokerRiskPolicy'
import type { Invoice } from '../types/invoice'
import type { Payment } from '../types/payment'
import {
  appendBrokerRiskProfile,
  findBrokerRiskReviewDecision,
  getLatestBrokerRiskProfile,
  initBrokerRiskStoreCrossTabSync,
  listBrokerRiskProfilesForClient,
  listLatestBrokerRiskProfiles,
  updateLatestBrokerRiskProfile,
} from '../data/brokerRiskStore'
import {
  carrierVisibleRiskLevel,
  computeBrokerRiskProfile,
  formatRiskFreshness,
} from '../utils/computeBrokerRiskProfile'
import { persistBrokerRiskProfile } from './supabase/brokerRiskPersist'
import { notifyTenantDataUpdated } from './supabase/tenantDataLiveSync'
import { notifyAdminBrokerRiskUrgent } from './adminNotificationService'
import { getClientById } from './clientRegistry'
import { BROKER_RISK_POLICY } from '../utils/brokerRiskPolicy'
import { logBrokerRiskAudit } from '../utils/brokerRiskAudit'
import { mockBrokers } from '../data/mockBrokers'

initBrokerRiskStoreCrossTabSync()

/** Alert Credyx when a broker hits the urgent (21d+) review gate. */
function maybeNotifyUrgentBrokerRisk(
  profile: BrokerRiskProfile,
  brokerName: string
): void {
  if (profile.review_status !== 'pending_review') return
  if (profile.computed_risk_level !== 'high') return

  const daysPast =
    profile.metrics.max_days_past_terms ??
    BROKER_RISK_POLICY.high_single_late_days
  const net =
    profile.metrics.payment_terms_days ??
    BROKER_RISK_POLICY.fallback_terms_days
  const client = getClientById(profile.client_id)

  try {
    notifyAdminBrokerRiskUrgent({
      clientId: profile.client_id,
      clientName: client?.name ?? profile.client_id,
      brokerId: profile.broker_id,
      brokerName,
      daysPastTerms: daysPast,
      netTerms: net,
    })
  } catch (err) {
    console.error('[brokerRisk] urgent notify failed', err)
  }
}

/**
 * Carry Credyx publish/clear across re-analysis so Run analysis
 * cannot silently reset a reviewed broker back to Needs review.
 */
export function applyPreservedCredyxReview(
  prior: BrokerRiskProfile | null | undefined,
  profile: BrokerRiskProfile
): BrokerRiskProfile {
  if (!prior) return profile
  if (prior.review_status !== 'published' && prior.review_status !== 'cleared') {
    return profile
  }

  profile.review_note = prior.review_note
  profile.reviewed_at = prior.reviewed_at
  profile.reviewed_by = prior.reviewed_by

  if (prior.review_status === 'cleared') {
    profile.review_status = 'cleared'
    profile.risk_level = 'low'
    return profile
  }

  // published
  profile.review_status = 'published'
  const publishedLevel =
    prior.risk_level === 'medium' || prior.risk_level === 'high'
      ? prior.risk_level
      : profile.computed_risk_level === 'high'
        ? 'high'
        : profile.computed_risk_level === 'medium'
          ? 'medium'
          : 'medium'
  profile.risk_level = publishedLevel
  return profile
}

export type EnsureBrokerRiskArgs = {
  clientId: string
  brokerId: string
  brokerName: string
  mcNumber: string | null
  score: BrokerScoreRow | null
  notes: ClientBrokerNote[]
  adminNotes?: string | null
  /** Invoices for this broker — status notes feed delay-cause analysis. */
  invoices?: Invoice[]
  /** Payments for those invoices — receipt disputes feed structured dispute checks. */
  payments?: Payment[]
  hasWorked: boolean
  paymentTermsDays?: number | null
  termsSignals?: BrokerTermsPaymentSignals | null
  /** Credyx marked broker NEW for carriers. */
  isNewBroker?: boolean
  /** @deprecated Rating is derived from terms signals in rules-v2. */
  rating?: BrokerPayRating
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
 * Ensure a stored profile exists (rules-v2).
 * Medium/high → pending_review until Credyx publishes or clears.
 * Re-analysis keeps Credyx publish/clear so carriers/admin queues stay stable.
 */
export function ensureBrokerRiskProfile(args: EnsureBrokerRiskArgs): BrokerRiskProfile {
  const existing = getLatestBrokerRiskProfile(args.clientId, args.brokerId)
  const priorDecision =
    findBrokerRiskReviewDecision(args.clientId, args.brokerId, args.brokerName) ??
    (existing?.review_status === 'published' || existing?.review_status === 'cleared'
      ? existing
      : null)
  const maxAgeMs = (args.maxAgeHours ?? 24 * 7) * 60 * 60 * 1000
  const versionOk = existing?.model_version === BROKER_RISK_MODEL_VERSION
  const fresh =
    existing &&
    versionOk &&
    !args.force &&
    Date.now() - Date.parse(existing.analyzed_at) < maxAgeMs

  // Fresh row: never append. Patch review fields if a Credyx decision exists elsewhere.
  if (fresh && existing) {
    if (
      priorDecision &&
      (priorDecision.review_status === 'published' ||
        priorDecision.review_status === 'cleared') &&
      existing.review_status !== priorDecision.review_status
    ) {
      const patched = applyPreservedCredyxReview(priorDecision, { ...existing })
      const updated = updateLatestBrokerRiskProfile(args.clientId, args.brokerId, {
        review_status: patched.review_status,
        risk_level: patched.risk_level,
        review_note: patched.review_note,
        reviewed_at: patched.reviewed_at,
        reviewed_by: patched.reviewed_by,
      })
      if (updated) {
        void persistBrokerRiskProfile(updated).catch(console.error)
        return updated
      }
    }
    return existing
  }

  const { profile, evidence } = computeBrokerRiskProfile({
    clientId: args.clientId,
    brokerId: args.brokerId,
    brokerName: args.brokerName,
    mcNumber: args.mcNumber,
    score: args.score,
    notes: args.notes,
    adminNotes: args.adminNotes,
    invoices: args.invoices,
    payments: args.payments,
    hasWorked: args.hasWorked,
    paymentTermsDays: args.paymentTermsDays,
    termsSignals: args.termsSignals,
    isNewBroker: args.isNewBroker,
    trigger: args.trigger ?? (existing ? 'weekly' : 'backfill'),
  })

  applyPreservedCredyxReview(priorDecision, profile)

  appendBrokerRiskProfile(profile, evidence)
  void persistBrokerRiskProfile(profile, evidence).catch(console.error)
  maybeNotifyUrgentBrokerRisk(profile, args.brokerName)

  // Audit when analysis newly flags a broker for Credyx review.
  const wasPending = existing?.review_status === 'pending_review'
  if (profile.review_status === 'pending_review' && !wasPending && !priorDecision) {
    const client = getClientById(args.clientId)
    const levelLabel =
      profile.computed_risk_level === 'high'
        ? 'High'
        : profile.computed_risk_level === 'medium'
          ? 'Medium'
          : 'Elevated'
    logBrokerRiskAudit({
      action: 'broker_risk_flagged',
      brokerId: args.brokerId,
      brokerName: args.brokerName,
      clientId: args.clientId,
      clientName: client?.name,
      reviewedBy: 'System',
      description: `Flagged for review — ${levelLabel} risk (${args.brokerName})`,
      fromStatus: existing?.review_status ?? null,
      toStatus: 'pending_review',
      fromLevel: existing?.risk_level ?? null,
      toLevel: profile.computed_risk_level,
      severity: profile.computed_risk_level === 'high' ? 'warning' : 'info',
    })
  }

  return profile
}

export type PublishBrokerRiskArgs = {
  clientId: string
  brokerId: string
  /** Override published level (default: computed_risk_level). */
  riskLevel?: BrokerRiskLevel
  reviewNote?: string
  reviewedBy: string
}

/** Credyx publishes elevated risk to the carrier. */
export async function publishBrokerRisk(
  args: PublishBrokerRiskArgs
): Promise<BrokerRiskProfile | null> {
  const existing = getLatestBrokerRiskProfile(args.clientId, args.brokerId)
  if (!existing) return null
  const level =
    args.riskLevel ??
    (existing.computed_risk_level === 'unrated' ? 'medium' : existing.computed_risk_level)
  const nextLevel: BrokerRiskLevel = level === 'unrated' ? 'medium' : level
  const note = args.reviewNote?.trim() || existing.review_note
  const updated = updateLatestBrokerRiskProfile(args.clientId, args.brokerId, {
    review_status: 'published',
    risk_level: nextLevel,
    review_note: note,
    reviewed_at: new Date().toISOString(),
    reviewed_by: args.reviewedBy,
  })
  if (updated) {
    await persistBrokerRiskProfile(updated)
    // Persist sibling history rows that were aligned to the same decision.
    for (const row of listBrokerRiskProfilesForClient(args.clientId)) {
      if (row.broker_id !== args.brokerId || row.id === updated.id) continue
      if (row.review_status !== 'published' && row.review_status !== 'cleared') continue
      await persistBrokerRiskProfile(row)
    }
    notifyTenantDataUpdated(['broker_risk_profiles'], args.clientId)

    const brokerName =
      mockBrokers.find((b) => b.id === args.brokerId)?.name ?? args.brokerId
    const client = getClientById(args.clientId)
    const levelLabel = nextLevel === 'high' ? 'High' : 'Medium'
    const sameStatus = existing.review_status === 'published'
    const levelChanged = sameStatus && existing.risk_level !== nextLevel
    logBrokerRiskAudit({
      action: levelChanged ? 'broker_risk_level_changed' : 'broker_risk_published',
      brokerId: args.brokerId,
      brokerName,
      clientId: args.clientId,
      clientName: client?.name,
      reviewedBy: args.reviewedBy,
      description: levelChanged
        ? `Risk level changed to ${levelLabel} for ${brokerName}`
        : `Marked ${levelLabel} risk for ${brokerName}`,
      fromStatus: existing.review_status,
      toStatus: 'published',
      fromLevel: existing.risk_level,
      toLevel: nextLevel,
      note,
      severity: 'warning',
    })
  }
  return updated
}

/** Credyx clears risk — carrier sees low / not risky. */
export async function clearBrokerRisk(args: {
  clientId: string
  brokerId: string
  reviewNote: string
  reviewedBy: string
}): Promise<BrokerRiskProfile | null> {
  const note = args.reviewNote.trim()
  if (!note) return null
  const existing = getLatestBrokerRiskProfile(args.clientId, args.brokerId)
  const updated = updateLatestBrokerRiskProfile(args.clientId, args.brokerId, {
    review_status: 'cleared',
    risk_level: 'low',
    review_note: note,
    reviewed_at: new Date().toISOString(),
    reviewed_by: args.reviewedBy,
  })
  if (updated) {
    await persistBrokerRiskProfile(updated)
    for (const row of listBrokerRiskProfilesForClient(args.clientId)) {
      if (row.broker_id !== args.brokerId || row.id === updated.id) continue
      if (row.review_status !== 'published' && row.review_status !== 'cleared') continue
      await persistBrokerRiskProfile(row)
    }
    notifyTenantDataUpdated(['broker_risk_profiles'], args.clientId)

    const brokerName =
      mockBrokers.find((b) => b.id === args.brokerId)?.name ?? args.brokerId
    const client = getClientById(args.clientId)
    logBrokerRiskAudit({
      action: 'broker_risk_cleared',
      brokerId: args.brokerId,
      brokerName,
      clientId: args.clientId,
      clientName: client?.name,
      reviewedBy: args.reviewedBy,
      description: `Risk removed for ${brokerName}`,
      fromStatus: existing?.review_status ?? null,
      toStatus: 'cleared',
      fromLevel: existing?.risk_level ?? null,
      toLevel: 'low',
      note,
      severity: 'info',
    })
  }
  return updated
}

/** Save a review note without changing publish/clear status. */
export async function saveBrokerRiskReviewNote(args: {
  clientId: string
  brokerId: string
  reviewNote: string
  reviewedBy: string
}): Promise<BrokerRiskProfile | null> {
  const note = args.reviewNote.trim()
  if (!note) return null
  const existing = getLatestBrokerRiskProfile(args.clientId, args.brokerId)
  const updated = updateLatestBrokerRiskProfile(args.clientId, args.brokerId, {
    review_note: note,
    reviewed_at: new Date().toISOString(),
    reviewed_by: args.reviewedBy,
  })
  if (updated) {
    await persistBrokerRiskProfile(updated)
    notifyTenantDataUpdated(['broker_risk_profiles'], args.clientId)

    const brokerName =
      mockBrokers.find((b) => b.id === args.brokerId)?.name ?? args.brokerId
    const client = getClientById(args.clientId)
    logBrokerRiskAudit({
      action: 'broker_risk_note_updated',
      brokerId: args.brokerId,
      brokerName,
      clientId: args.clientId,
      clientName: client?.name,
      reviewedBy: args.reviewedBy,
      description: `Review note updated for ${brokerName}`,
      fromStatus: existing?.review_status ?? null,
      toStatus: existing?.review_status ?? null,
      fromLevel: existing?.risk_level ?? null,
      toLevel: existing?.risk_level ?? null,
      note,
      severity: 'info',
    })
  }
  return updated
}

/** Admin queue: latest profiles needing review. */
export function listBrokerRiskForAdmin(filter?: {
  reviewStatus?: BrokerRiskProfile['review_status'] | 'all'
}): BrokerRiskProfile[] {
  const rows = listLatestBrokerRiskProfiles()
  if (!filter?.reviewStatus || filter.reviewStatus === 'all') return rows
  return rows.filter((p) => p.review_status === filter.reviewStatus)
}

/** Map stored profile → Assistant risk card payload (carrier-safe level). */
export function toAssistantRiskPayload(
  profile: BrokerRiskProfile,
  brokerName: string,
  notes: ClientBrokerNote[]
): AssistantRiskPayload {
  const freshness = formatRiskFreshness(profile, notes)
  const level = carrierVisibleRiskLevel(profile)
  return {
    brokerName,
    mcNumber: profile.mc_number || 'MC not on file',
    riskLevel: level,
    confidence: profile.confidence,
    analyzedAtLabel: freshness.analyzedAtLabel,
    invoiceCount: profile.metrics.invoice_count,
    notesRecencyLabel: freshness.notesRecencyLabel,
    bullets: profile.review_status === 'pending_review' ? [] : profile.evidence_bullets,
    recommendation:
      profile.review_status === 'pending_review'
        ? level === 'medium' || level === 'high'
          ? `Credyx flagged ${brokerName} as ${level} risk — full details after review is confirmed.`
          : 'Credyx is reviewing this broker before confirming risk.'
        : profile.recommendation_text,
    ageCaveat:
      profile.confidence === 'low'
        ? 'Limited recent history — weight this as a trend hint, not a credit score.'
        : undefined,
  }
}
