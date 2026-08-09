import type { BrokerRiskEvidence, BrokerRiskProfile } from '../../types/brokerRisk'
import { isSupabaseConfigured, getSupabase } from '../../lib/supabase'
import {
  replaceBrokerRiskStore,
  type BrokerRiskProfileRow,
  type BrokerRiskEvidenceRow,
} from '../../data/brokerRiskStore'

/** Map a Supabase profile row → app profile. */
export function brokerRiskProfileRowToProfile(row: BrokerRiskProfileRow): BrokerRiskProfile {
  return {
    id: row.id,
    client_id: row.client_id,
    broker_id: row.broker_id,
    mc_number: row.mc_number ?? null,
    risk_level: row.risk_level,
    computed_risk_level: row.computed_risk_level ?? row.risk_level,
    confidence: row.confidence,
    summary_text: row.summary_text ?? '',
    recommendation_text: row.recommendation_text ?? '',
    metrics: (row.metrics ?? {}) as BrokerRiskProfile['metrics'],
    evidence_bullets: Array.isArray(row.evidence_bullets) ? row.evidence_bullets : [],
    analyzed_at: row.analyzed_at,
    trigger: row.trigger,
    model_version: row.model_version ?? 'rules-v1',
    scope: row.scope ?? 'carrier',
    window_end: row.window_end ?? null,
    review_status: row.review_status ?? 'auto_published',
    review_note: row.review_note ?? null,
    reviewed_at: row.reviewed_at ?? null,
    reviewed_by: row.reviewed_by ?? null,
  }
}

function evidenceRowToEvidence(row: BrokerRiskEvidenceRow): BrokerRiskEvidence {
  return {
    id: row.id,
    profile_id: row.profile_id,
    source_type: row.source_type,
    source_id: row.source_id ?? null,
    weight: Number(row.weight ?? 1),
    source_dated_at: row.source_dated_at ?? null,
    label: row.label ?? null,
  }
}

/** Persist a risk profile (+ optional evidence) when Supabase is configured. */
export async function persistBrokerRiskProfile(
  profile: BrokerRiskProfile,
  evidence: BrokerRiskEvidence[] = []
): Promise<void> {
  if (!isSupabaseConfigured()) return
  const supabase = getSupabase()
  if (!supabase) return

  const row = {
    id: profile.id,
    client_id: profile.client_id,
    broker_id: profile.broker_id,
    mc_number: profile.mc_number,
    risk_level: profile.risk_level,
    computed_risk_level: profile.computed_risk_level,
    confidence: profile.confidence,
    summary_text: profile.summary_text,
    recommendation_text: profile.recommendation_text,
    metrics: profile.metrics,
    evidence_bullets: profile.evidence_bullets,
    analyzed_at: profile.analyzed_at,
    trigger: profile.trigger,
    model_version: profile.model_version,
    scope: profile.scope,
    window_end: profile.window_end,
    review_status: profile.review_status,
    review_note: profile.review_note,
    reviewed_at: profile.reviewed_at,
    reviewed_by: profile.reviewed_by,
  }

  const { error } = await supabase.from('broker_risk_profiles').upsert(row)
  if (error) {
    console.warn('[brokerRiskPersist] profile upsert failed', error.message)
    throw new Error(`Could not save broker risk: ${error.message}`)
  }

  if (evidence.length === 0) return
  const evidenceRows = evidence.map((e) => ({
    id: e.id,
    profile_id: e.profile_id,
    source_type: e.source_type,
    source_id: e.source_id,
    weight: e.weight,
    source_dated_at: e.source_dated_at,
    label: e.label,
  }))
  const { error: evErr } = await supabase.from('broker_risk_evidence').upsert(evidenceRows)
  if (evErr) {
    console.warn('[brokerRiskPersist] evidence upsert failed', evErr.message)
  }
}

/** Delete stale duplicate profile rows (and cascaded evidence). */
export async function deleteBrokerRiskProfiles(profileIds: string[]): Promise<void> {
  if (profileIds.length === 0 || !isSupabaseConfigured()) return
  const supabase = getSupabase()
  if (!supabase) return

  // Chunk to stay under PostgREST URL limits.
  const chunkSize = 100
  for (let i = 0; i < profileIds.length; i += chunkSize) {
    const chunk = profileIds.slice(i, i + chunkSize)
    const { error } = await supabase.from('broker_risk_profiles').delete().in('id', chunk)
    if (error) {
      console.warn('[brokerRiskPersist] delete profiles failed', error.message)
    }
  }
}

/**
 * Load broker risk profiles (+ evidence) from Supabase into the local store.
 * Admins: all carriers. Carriers: their client_id only.
 */
export async function hydrateBrokerRiskFromSupabase(clientId?: string | null): Promise<void> {
  if (!isSupabaseConfigured()) return
  const supabase = getSupabase()
  if (!supabase) return

  let profilesQuery = supabase
    .from('broker_risk_profiles')
    .select('*')
    .order('analyzed_at', { ascending: false })
    .limit(5000)
  if (clientId) {
    profilesQuery = profilesQuery.eq('client_id', clientId)
  }

  const { data: profileRows, error: profileErr } = await profilesQuery
  if (profileErr) {
    throw new Error(`broker_risk_profiles: ${profileErr.message}`)
  }

  const profiles = ((profileRows ?? []) as BrokerRiskProfileRow[]).map(
    brokerRiskProfileRowToProfile
  )
  const profileIds = profiles.map((p) => p.id)

  let evidence: BrokerRiskEvidence[] = []
  if (profileIds.length > 0) {
    // Fetch evidence in chunks when the network is large.
    const chunkSize = 200
    for (let i = 0; i < profileIds.length; i += chunkSize) {
      const chunk = profileIds.slice(i, i + chunkSize)
      const { data: evRows, error: evErr } = await supabase
        .from('broker_risk_evidence')
        .select('*')
        .in('profile_id', chunk)
      if (evErr) {
        console.warn('[brokerRiskPersist] evidence hydrate failed', evErr.message)
        break
      }
      evidence = evidence.concat(
        ((evRows ?? []) as BrokerRiskEvidenceRow[]).map(evidenceRowToEvidence)
      )
    }
  }

  replaceBrokerRiskStore(profiles, evidence)
}
