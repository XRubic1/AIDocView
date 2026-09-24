/**
 * Blueprint Then-do → real broker risk decisions (publish / clear / flag).
 */
import type { BrokerRiskLevel, BrokerRiskProfile } from '../types/brokerRisk'
import { BROKER_RISK_MODEL_VERSION } from '../types/brokerRisk'
import { getBrokerById } from '../data/mockBrokers'
import {
  appendBrokerRiskProfile,
  getLatestBrokerRiskProfile,
  listLatestBrokerRiskProfiles,
  updateLatestBrokerRiskProfile,
} from '../data/brokerRiskStore'
import { persistBrokerRiskProfile } from './supabase/brokerRiskPersist'
import { notifyTenantDataUpdated } from './supabase/tenantDataLiveSync'
import { logBrokerRiskAudit } from '../utils/brokerRiskAudit'
import { normalizeBrokerNameKey } from '../utils/brokerRiskPolicy'

export type BlueprintRiskMark = 'good' | 'review' | 'bad'

const EMPTY_METRICS: BrokerRiskProfile['metrics'] = {
  avg_days_to_pay: null,
  overdue_count: 0,
  overdue_amount: 0,
  collection_rate: null,
  open_ar: 0,
  invoice_count: 0,
  follow_up_hint_count: 0,
  dispute_hint_count: 0,
  payment_terms_days: null,
  late_payment_count: 0,
  max_days_past_terms: null,
  open_overdue_past_terms: 0,
}

function profilesForBroker(brokerId: string, brokerName: string): BrokerRiskProfile[] {
  const nameKey = normalizeBrokerNameKey(brokerName)
  const latest = listLatestBrokerRiskProfiles()
  const byId = latest.filter((p) => p.broker_id === brokerId)
  if (byId.length > 0) return byId
  return latest.filter((p) => {
    // Name-keyed synthetic ids from risk analysis
    if (p.broker_id.startsWith('broker-name-')) {
      const fromSlug = p.broker_id.replace(/^broker-name-/, '').replace(/-/g, ' ')
      return normalizeBrokerNameKey(fromSlug) === nameKey
    }
    return false
  })
}

function ensureStubProfile(
  brokerId: string,
  brokerName: string,
  level: BrokerRiskLevel,
  status: BrokerRiskProfile['review_status'],
  note: string,
  author: string
): BrokerRiskProfile {
  const now = new Date().toISOString()
  const profile: BrokerRiskProfile = {
    id: `brp-bp-${brokerId}-${Date.now()}`,
    client_id: 'network',
    broker_id: brokerId,
    mc_number: getBrokerById(brokerId)?.mc_number ?? null,
    risk_level: level,
    computed_risk_level: level,
    confidence: 'low',
    summary_text: note,
    recommendation_text: note,
    metrics: {
      ...EMPTY_METRICS,
      payment_terms_days: getBrokerById(brokerId)?.payment_terms_days ?? null,
    },
    evidence_bullets: [`Blueprint: ${note}`],
    analyzed_at: now,
    trigger: 'manual',
    model_version: BROKER_RISK_MODEL_VERSION,
    scope: 'network',
    window_end: null,
    review_status: status,
    review_note: note,
    reviewed_at: status === 'pending_review' ? null : now,
    reviewed_by: status === 'pending_review' ? null : author,
  }
  appendBrokerRiskProfile(profile, [])
  void persistBrokerRiskProfile(profile).catch(console.error)
  return profile
}

/**
 * Apply mark_good / mark_review / mark_bad from a blueprint Then-do.
 * Updates every carrier profile for this broker (or creates a network stub).
 */
export function applyBlueprintBrokerRiskMark(input: {
  brokerId: string
  mark: BlueprintRiskMark
  note: string
  authorName: string
  blueprintName: string
}): { ok: boolean; detail: string } {
  const broker = getBrokerById(input.brokerId)
  if (!broker) return { ok: false, detail: 'Broker not found.' }

  const note = input.note.trim() || `Blueprint (${input.blueprintName})`
  const author = input.authorName.trim() || 'Credyx Blueprint'
  let targets = profilesForBroker(input.brokerId, broker.name)

  if (targets.length === 0) {
    const level: BrokerRiskLevel =
      input.mark === 'good' ? 'low' : input.mark === 'bad' ? 'high' : 'high'
    const status =
      input.mark === 'good'
        ? ('cleared' as const)
        : input.mark === 'bad'
          ? ('published' as const)
          : ('pending_review' as const)
    ensureStubProfile(input.brokerId, broker.name, level, status, note, author)
    targets = profilesForBroker(input.brokerId, broker.name)
  }

  const now = new Date().toISOString()
  let touched = 0

  for (const row of targets) {
    const existing = getLatestBrokerRiskProfile(row.client_id, row.broker_id) ?? row
    let patch: Partial<BrokerRiskProfile>

    if (input.mark === 'good') {
      patch = {
        review_status: 'cleared',
        risk_level: 'low',
        review_note: note,
        reviewed_at: now,
        reviewed_by: author,
      }
    } else if (input.mark === 'bad') {
      patch = {
        review_status: 'published',
        risk_level: 'high',
        computed_risk_level: 'high',
        review_note: note,
        reviewed_at: now,
        reviewed_by: author,
      }
    } else {
      patch = {
        review_status: 'pending_review',
        risk_level: 'high',
        computed_risk_level: 'high',
        review_note: note,
        reviewed_at: null,
        reviewed_by: null,
      }
    }

    const updated = updateLatestBrokerRiskProfile(row.client_id, row.broker_id, patch)
    if (updated) {
      touched += 1
      void persistBrokerRiskProfile(updated).catch(console.error)
      try {
        notifyTenantDataUpdated(['broker_risk_profiles'], row.client_id)
      } catch {
        /* ignore */
      }
    } else if (existing) {
      // Name-keyed row may not match updateLatest — skip
    }
  }

  if (input.mark === 'good') {
    logBrokerRiskAudit({
      action: 'broker_risk_cleared',
      brokerId: input.brokerId,
      brokerName: broker.name,
      reviewedBy: author,
      description: `Risk removed for ${broker.name} (blueprint)`,
      toStatus: 'cleared',
      toLevel: 'low',
      note,
      severity: 'info',
    })
  } else if (input.mark === 'bad') {
    logBrokerRiskAudit({
      action: 'broker_risk_published',
      brokerId: input.brokerId,
      brokerName: broker.name,
      reviewedBy: author,
      description: `Marked High risk for ${broker.name} (blueprint)`,
      toStatus: 'published',
      toLevel: 'high',
      note,
      severity: 'warning',
    })
  } else {
    logBrokerRiskAudit({
      action: 'broker_risk_flagged',
      brokerId: input.brokerId,
      brokerName: broker.name,
      reviewedBy: author,
      description: `Flagged for review — High risk (${broker.name})`,
      toStatus: 'pending_review',
      toLevel: 'high',
      note,
      severity: 'warning',
    })
  }

  return {
    ok: touched > 0 || targets.length > 0,
    detail:
      input.mark === 'good'
        ? `Cleared risk (${touched || targets.length} profile(s)).`
        : input.mark === 'bad'
          ? `Published high risk (${touched || targets.length} profile(s)).`
          : `Flagged for review (${touched || targets.length} profile(s)).`,
  }
}
