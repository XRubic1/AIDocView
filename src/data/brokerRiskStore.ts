import type { BrokerRiskEvidence, BrokerRiskProfile } from '../types/brokerRisk'
import type { OpsJobRun } from '../types/opsJob'

const PROFILE_KEY = 'credyx_broker_risk_profiles_v1'
const EVIDENCE_KEY = 'credyx_broker_risk_evidence_v1'
const JOB_KEY = 'credyx_ops_job_runs_v1'

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

let profiles: BrokerRiskProfile[] = []
let evidence: BrokerRiskEvidence[] = []
let jobRuns: OpsJobRun[] = []
let hydrated = false

function ensureHydrated(): void {
  if (hydrated || typeof localStorage === 'undefined') return
  profiles = readJson(PROFILE_KEY, [])
  evidence = readJson(EVIDENCE_KEY, [])
  jobRuns = readJson(JOB_KEY, [])
  hydrated = true
}

function persist(): void {
  if (typeof localStorage === 'undefined') return
  writeJson(PROFILE_KEY, profiles)
  writeJson(EVIDENCE_KEY, evidence)
  writeJson(JOB_KEY, jobRuns)
}

/** Append a new risk profile + evidence (never mutate prior rows). */
export function appendBrokerRiskProfile(
  profile: BrokerRiskProfile,
  rows: BrokerRiskEvidence[]
): void {
  ensureHydrated()
  profiles = [profile, ...profiles]
  evidence = [...rows, ...evidence]
  persist()
}

/** Latest profile for a carrier+broker pair. */
export function getLatestBrokerRiskProfile(
  clientId: string,
  brokerId: string
): BrokerRiskProfile | null {
  ensureHydrated()
  const matches = profiles.filter(
    (p) => p.client_id === clientId && p.broker_id === brokerId
  )
  if (matches.length === 0) return null
  return matches.sort(
    (a, b) => Date.parse(b.analyzed_at) - Date.parse(a.analyzed_at)
  )[0]
}

export function listBrokerRiskProfilesForClient(clientId: string): BrokerRiskProfile[] {
  ensureHydrated()
  return profiles.filter((p) => p.client_id === clientId)
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

/** Test helper — clear local cache. */
export function clearBrokerRiskStore(): void {
  profiles = []
  evidence = []
  jobRuns = []
  hydrated = true
  persist()
}
