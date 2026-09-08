import type {
  BrokerRiskEvidence,
  BrokerRiskLevel,
  BrokerRiskProfile,
  BrokerRiskReviewStatus,
  BrokerRiskConfidence,
  BrokerRiskTrigger,
  BrokerRiskScope,
  BrokerRiskEvidenceSource,
} from '../types/brokerRisk'
import type { OpsJobRun } from '../types/opsJob'
import { mockBrokers } from './mockBrokers'
import { normalizeBrokerNameKey } from '../utils/brokerRiskPolicy'

const PROFILE_KEY = 'credyx_broker_risk_profiles_v2'
const EVIDENCE_KEY = 'credyx_broker_risk_evidence_v2'
const JOB_KEY = 'credyx_ops_job_runs_v1'

/** Supabase row shape for broker_risk_profiles. */
export type BrokerRiskProfileRow = {
  id: string
  client_id: string
  broker_id: string
  mc_number: string | null
  risk_level: BrokerRiskLevel
  computed_risk_level?: BrokerRiskLevel | null
  confidence: BrokerRiskConfidence
  summary_text: string
  recommendation_text: string
  metrics: BrokerRiskProfile['metrics'] | null
  evidence_bullets: string[] | null
  analyzed_at: string
  trigger: BrokerRiskTrigger
  model_version: string
  scope: BrokerRiskScope
  window_end: string | null
  review_status?: BrokerRiskReviewStatus | null
  review_note?: string | null
  reviewed_at?: string | null
  reviewed_by?: string | null
}

/** Supabase row shape for broker_risk_evidence. */
export type BrokerRiskEvidenceRow = {
  id: string
  profile_id: string
  source_type: BrokerRiskEvidenceSource
  source_id: string | null
  weight: number | string | null
  source_dated_at: string | null
  label: string | null
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* ignore quota */
  }
}

/** Normalize legacy v1 rows missing review fields. */
function normalizeProfile(raw: BrokerRiskProfile): BrokerRiskProfile {
  const computed =
    raw.computed_risk_level ??
    (raw.review_status === 'pending_review' ? 'medium' : raw.risk_level)
  const review_status: BrokerRiskReviewStatus =
    raw.review_status ??
    'pending_review'
  return {
    ...raw,
    computed_risk_level: computed,
    review_status,
    review_note: raw.review_note ?? null,
    reviewed_at: raw.reviewed_at ?? null,
    reviewed_by: raw.reviewed_by ?? null,
    risk_level:
      review_status === 'pending_review'
        ? 'unrated'
        : review_status === 'cleared'
          ? 'low'
          : raw.risk_level,
    metrics: {
      avg_days_to_pay: raw.metrics?.avg_days_to_pay ?? null,
      overdue_count: raw.metrics?.overdue_count ?? 0,
      overdue_amount: raw.metrics?.overdue_amount ?? 0,
      collection_rate: raw.metrics?.collection_rate ?? null,
      open_ar: raw.metrics?.open_ar ?? 0,
      invoice_count: raw.metrics?.invoice_count ?? 0,
      follow_up_hint_count: raw.metrics?.follow_up_hint_count ?? 0,
      dispute_hint_count: raw.metrics?.dispute_hint_count ?? 0,
      payment_terms_days: raw.metrics?.payment_terms_days ?? null,
      avg_days_invoice_to_pay: raw.metrics?.avg_days_invoice_to_pay ?? null,
      paid_sample_size: raw.metrics?.paid_sample_size ?? null,
      late_payment_count: raw.metrics?.late_payment_count ?? 0,
      max_days_past_terms: raw.metrics?.max_days_past_terms ?? null,
      open_overdue_past_terms: raw.metrics?.open_overdue_past_terms ?? 0,
      delay_cause: raw.metrics?.delay_cause,
      broker_pay_hint_count: raw.metrics?.broker_pay_hint_count,
      ppw_hint_count: raw.metrics?.ppw_hint_count,
      suggest_clear_as_ppw: raw.metrics?.suggest_clear_as_ppw,
      hold_count: raw.metrics?.hold_count ?? 0,
      open_dispute_count: raw.metrics?.open_dispute_count ?? 0,
      paused_open_count: raw.metrics?.paused_open_count ?? 0,
      paused_open_amount: raw.metrics?.paused_open_amount ?? 0,
    },
  }
}

let profiles: BrokerRiskProfile[] = []
let evidence: BrokerRiskEvidence[] = []
let jobRuns: OpsJobRun[] = []
let hydrated = false

function ensureHydrated(): void {
  if (hydrated || typeof localStorage === 'undefined') return
  const v2 = readJson<BrokerRiskProfile[]>(PROFILE_KEY, [])
  if (v2.length > 0) {
    profiles = v2.map(normalizeProfile)
  } else {
    // One-time migrate from v1 key if present.
    const v1 = readJson<BrokerRiskProfile[]>('credyx_broker_risk_profiles_v1', [])
    profiles = v1.map(normalizeProfile)
  }
  const ev2 = readJson<BrokerRiskEvidence[]>(EVIDENCE_KEY, [])
  evidence =
    ev2.length > 0
      ? ev2
      : readJson<BrokerRiskEvidence[]>('credyx_broker_risk_evidence_v1', [])
  jobRuns = readJson(JOB_KEY, [])
  hydrated = true
}

function persist(): void {
  if (typeof localStorage === 'undefined') return
  writeJson(PROFILE_KEY, profiles)
  writeJson(EVIDENCE_KEY, evidence)
  writeJson(JOB_KEY, jobRuns)
}

/** Re-read profiles from localStorage (other tabs may have published/cleared). */
export function reloadBrokerRiskStoreFromStorage(): void {
  if (typeof localStorage === 'undefined') return
  hydrated = false
  ensureHydrated()
}

let crossTabSyncReady = false

/** Keep carrier/admin tabs in sync when publish/clear writes localStorage. */
export function initBrokerRiskStoreCrossTabSync(): void {
  if (typeof window === 'undefined' || crossTabSyncReady) return
  crossTabSyncReady = true
  window.addEventListener('storage', (event) => {
    if (event.key !== PROFILE_KEY && event.key !== EVIDENCE_KEY) return
    reloadBrokerRiskStoreFromStorage()
    window.dispatchEvent(
      new CustomEvent('credyx-tenant-data-updated', {
        detail: { tables: ['broker_risk_profiles'], clientId: null },
      })
    )
  })
}

/**
 * Replace local cache with Supabase rows (source of truth across devices).
 * Keeps ops job runs from localStorage.
 */
export function replaceBrokerRiskStore(
  nextProfiles: BrokerRiskProfile[],
  nextEvidence: BrokerRiskEvidence[] = []
): void {
  ensureHydrated()
  profiles = nextProfiles.map(normalizeProfile)
  evidence = [...nextEvidence]
  hydrated = true
  persist()
}

/** Append a new risk profile + evidence (never mutate prior rows). */
export function appendBrokerRiskProfile(
  profile: BrokerRiskProfile,
  rows: BrokerRiskEvidence[]
): void {
  ensureHydrated()
  profiles = [normalizeProfile(profile), ...profiles]
  evidence = [...rows, ...evidence]
  persist()
}

/** Patch the latest profile row for a carrier+broker (review actions). */
export function updateLatestBrokerRiskProfile(
  clientId: string,
  brokerId: string,
  patch: Partial<BrokerRiskProfile>
): BrokerRiskProfile | null {
  ensureHydrated()
  const latest = getLatestBrokerRiskProfile(clientId, brokerId)
  if (!latest) return null
  const idx = profiles.findIndex((p) => p.id === latest.id)
  if (idx < 0) return null
  const next = normalizeProfile({ ...profiles[idx], ...patch })
  profiles[idx] = next

  // Keep older history rows from resurrecting a prior Publish after Clear.
  if (patch.review_status === 'cleared' || patch.review_status === 'published') {
    profiles = profiles.map((p) => {
      if (p.id === next.id) return next
      if (p.client_id !== clientId || p.broker_id !== brokerId) return p
      if (!isCredyxDecisionStatus(p.review_status) && p.review_status !== 'pending_review') {
        return p
      }
      return normalizeProfile({
        ...p,
        review_status: patch.review_status!,
        risk_level:
          patch.review_status === 'cleared'
            ? 'low'
            : (patch.risk_level ?? p.risk_level),
        review_note: patch.review_note ?? p.review_note,
        reviewed_at: patch.reviewed_at ?? p.reviewed_at,
        reviewed_by: patch.reviewed_by ?? p.reviewed_by,
      })
    })
  }

  persist()
  return next
}

/** Resolve a stable client+broker-name key (collapses duplicate catalog IDs). */
function profileIdentityKey(p: BrokerRiskProfile): string {
  const catalog = mockBrokers.find((b) => b.id === p.broker_id)
  const fromSlug = p.broker_id.startsWith('broker-name-')
    ? p.broker_id.replace(/^broker-name-/, '').replace(/-/g, ' ')
    : null
  const name = catalog?.name ?? fromSlug ?? p.broker_id
  return `${p.client_id}::${normalizeBrokerNameKey(name)}`
}

const RISK_RANK: Record<string, number> = { high: 0, medium: 1, low: 2, unrated: 3 }

function isCredyxDecisionStatus(status: BrokerRiskReviewStatus | string): boolean {
  return status === 'published' || status === 'cleared'
}

function decisionTimestamp(p: BrokerRiskProfile): number {
  return Date.parse(p.reviewed_at || p.analyzed_at) || 0
}

/**
 * Prefer Credyx decisions over pending/auto.
 * Between published vs cleared, the *newest* decision wins (Clear must beat an older Publish).
 */
export function preferBrokerRiskProfile(
  a: BrokerRiskProfile,
  b: BrokerRiskProfile
): BrokerRiskProfile {
  const aDecision = isCredyxDecisionStatus(a.review_status)
  const bDecision = isCredyxDecisionStatus(b.review_status)
  if (aDecision !== bDecision) return aDecision ? a : b

  if (aDecision && bDecision) {
    const ta = decisionTimestamp(a)
    const tb = decisionTimestamp(b)
    if (ta !== tb) return ta >= tb ? a : b
    // Same timestamp: Clear wins (explicit undo of publish).
    if (a.review_status !== b.review_status) {
      if (a.review_status === 'cleared') return a
      if (b.review_status === 'cleared') return b
    }
  }

  const mcA = a.mc_number ? 1 : 0
  const mcB = b.mc_number ? 1 : 0
  if (mcA !== mcB) return mcA > mcB ? a : b
  const la = RISK_RANK[a.computed_risk_level] ?? 9
  const lb = RISK_RANK[b.computed_risk_level] ?? 9
  if (la !== lb) return la < lb ? a : b
  return Date.parse(a.analyzed_at) >= Date.parse(b.analyzed_at) ? a : b
}

/**
 * Latest profile for a carrier+broker pair.
 * Credyx publish/clear decisions win over a newer pending re-analysis row.
 */
export function getLatestBrokerRiskProfile(
  clientId: string,
  brokerId: string
): BrokerRiskProfile | null {
  ensureHydrated()
  const matches = profiles.filter(
    (p) => p.client_id === clientId && p.broker_id === brokerId
  )
  if (matches.length === 0) return null
  return matches.reduce((best, p) => preferBrokerRiskProfile(best, p))
}

/**
 * Find the newest Credyx publish/clear decision for this broker
 * (same id or same display name — covers duplicate catalog rows).
 */
export function findBrokerRiskReviewDecision(
  clientId: string,
  brokerId: string,
  brokerName?: string | null
): BrokerRiskProfile | null {
  ensureHydrated()
  const nameKey = brokerName?.trim()
    ? `${clientId}::${normalizeBrokerNameKey(brokerName)}`
    : null

  const decisions = profiles.filter((p) => {
    if (p.client_id !== clientId) return false
    if (p.review_status !== 'published' && p.review_status !== 'cleared') return false
    if (p.broker_id === brokerId) return true
    return nameKey != null && profileIdentityKey(p) === nameKey
  })
  if (decisions.length === 0) return null
  return decisions.sort(
    (a, b) =>
      Date.parse(b.reviewed_at || b.analyzed_at) -
      Date.parse(a.reviewed_at || a.analyzed_at)
  )[0]
}

export function listBrokerRiskProfilesForClient(clientId: string): BrokerRiskProfile[] {
  ensureHydrated()
  return profiles.filter((p) => p.client_id === clientId)
}

/**
 * Latest profile per carrier + broker *name* (dedupes duplicate catalog IDs).
 * Prefer Credyx decisions over newer pending rows for the same broker id/name.
 */
export function listLatestBrokerRiskProfiles(): BrokerRiskProfile[] {
  ensureHydrated()
  const byBrokerId = new Map<string, BrokerRiskProfile>()
  for (const p of profiles) {
    const idKey = `${p.client_id}::${p.broker_id}`
    const prev = byBrokerId.get(idKey)
    byBrokerId.set(idKey, prev ? preferBrokerRiskProfile(p, prev) : p)
  }

  const byName = new Map<string, BrokerRiskProfile>()
  for (const p of byBrokerId.values()) {
    const key = profileIdentityKey(p)
    const prev = byName.get(key)
    byName.set(key, prev ? preferBrokerRiskProfile(p, prev) : p)
  }
  return [...byName.values()]
}

/**
 * Drop profiles for non-winning broker IDs when the same carrier+name appears twice.
 * Returns removed profile ids (for remote cleanup).
 */
export function pruneDuplicateBrokerRiskProfiles(): string[] {
  ensureHydrated()
  const winners = listLatestBrokerRiskProfiles()
  const keepBrokerKeys = new Set(
    winners.map((p) => `${p.client_id}::${p.broker_id}`)
  )
  const removedIds = profiles
    .filter((p) => !keepBrokerKeys.has(`${p.client_id}::${p.broker_id}`))
    .map((p) => p.id)
  if (removedIds.length === 0) return []

  const removeSet = new Set(removedIds)
  profiles = profiles.filter((p) => !removeSet.has(p.id))
  evidence = evidence.filter((e) => !removeSet.has(e.profile_id))
  persist()
  return removedIds
}

export function countPendingBrokerRiskReviews(): number {
  return listLatestBrokerRiskProfiles().filter((p) => p.review_status === 'pending_review')
    .length
}

export function getEvidenceForProfile(profileId: string): BrokerRiskEvidence[] {
  ensureHydrated()
  return evidence.filter((e) => e.profile_id === profileId)
}

export function appendOpsJobRun(run: OpsJobRun): void {
  ensureHydrated()
  jobRuns = [run, ...jobRuns].slice(0, 100)
  persist()
}

export function updateOpsJobRun(id: string, patch: Partial<OpsJobRun>): OpsJobRun | null {
  ensureHydrated()
  const idx = jobRuns.findIndex((r) => r.id === id)
  if (idx < 0) return null
  jobRuns[idx] = { ...jobRuns[idx], ...patch }
  persist()
  return jobRuns[idx]
}

export function listOpsJobRuns(limit = 20): OpsJobRun[] {
  ensureHydrated()
  return jobRuns.slice(0, limit)
}

/** Clear in-memory + local cache (sign-out / principal change). */
export function clearBrokerRiskStore(): void {
  profiles = []
  evidence = []
  jobRuns = []
  hydrated = true
  persist()
}

export type { BrokerRiskLevel, BrokerRiskReviewStatus }
