import { getSupabase, isSupabaseConfigured } from '../lib/supabase'
import { AR_POLICY, type AR_POLICY as ArPolicyType } from '../utils/invoiceAging'
import { persistOrThrow } from './persistHelper'

const AR_POLICY_KEY = 'ar_policy'
const BROKER_SNAPSHOT_TTL_KEY = 'broker_snapshot_ttl'

/** Defaults for MC Lookup Snapshot cache windows (days). */
export const DEFAULT_BROKER_SNAPSHOT_TTL = {
  cacheTtlDays: 30,
  insuranceWatchTtlDays: 5,
} as const

export type BrokerSnapshotTtlSettings = {
  cacheTtlDays: number
  insuranceWatchTtlDays: number
}

function clampDays(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n) || n < 1) return fallback
  return Math.min(Math.floor(n), 365)
}

function normalizeBrokerSnapshotTtl(
  value: Partial<BrokerSnapshotTtlSettings> | null | undefined
): BrokerSnapshotTtlSettings {
  return {
    cacheTtlDays: clampDays(value?.cacheTtlDays, DEFAULT_BROKER_SNAPSHOT_TTL.cacheTtlDays),
    insuranceWatchTtlDays: clampDays(
      value?.insuranceWatchTtlDays,
      DEFAULT_BROKER_SNAPSHOT_TTL.insuranceWatchTtlDays
    ),
  }
}

/** Load AR policy from platform_settings or return defaults. */
export async function loadArPolicy(): Promise<typeof AR_POLICY> {
  if (!isSupabaseConfigured()) return AR_POLICY

  const supabase = getSupabase()
  if (!supabase) return AR_POLICY

  const { data, error } = await supabase
    .from('platform_settings')
    .select('value')
    .eq('key', AR_POLICY_KEY)
    .maybeSingle()

  if (error || !data?.value) return AR_POLICY

  const value = data.value as Partial<typeof AR_POLICY>
  return {
    ...AR_POLICY,
    ...value,
    agingBuckets: (value.agingBuckets as typeof AR_POLICY.agingBuckets) ?? AR_POLICY.agingBuckets,
  }
}

/** Apply loaded policy to the mutable AR_POLICY singleton used at runtime. */
export function applyArPolicy(policy: typeof AR_POLICY): void {
  Object.assign(AR_POLICY, policy)
}

/** Persist AR policy settings from admin Settings page. */
export async function saveArPolicy(
  policy: Pick<
    typeof AR_POLICY,
    | 'collectionsOverdueDays'
    | 'clientUrgentDays'
    | 'criticalDays'
    | 'forceCloseDays'
    | 'agingBuckets'
  >
): Promise<void> {
  if (!isSupabaseConfigured()) {
    applyArPolicy({ ...AR_POLICY, ...policy })
    return
  }

  const supabase = getSupabase()
  if (!supabase) return

  await persistOrThrow('ar_policy', async () => {
    const { error } = await supabase.from('platform_settings').upsert({
      key: AR_POLICY_KEY,
      value: policy,
      updated_at: new Date().toISOString(),
    })
    if (error) throw new Error(error.message)
    applyArPolicy({ ...AR_POLICY, ...policy })
  })
}

/** Load Broker Snapshot cache TTL settings (MC Lookup). */
export async function loadBrokerSnapshotTtl(): Promise<BrokerSnapshotTtlSettings> {
  if (!isSupabaseConfigured()) return { ...DEFAULT_BROKER_SNAPSHOT_TTL }

  const supabase = getSupabase()
  if (!supabase) return { ...DEFAULT_BROKER_SNAPSHOT_TTL }

  const { data, error } = await supabase
    .from('platform_settings')
    .select('value')
    .eq('key', BROKER_SNAPSHOT_TTL_KEY)
    .maybeSingle()

  if (error || !data?.value) return { ...DEFAULT_BROKER_SNAPSHOT_TTL }
  return normalizeBrokerSnapshotTtl(data.value as Partial<BrokerSnapshotTtlSettings>)
}

/** Persist Broker Snapshot cache TTL settings from admin Settings. */
export async function saveBrokerSnapshotTtl(
  settings: BrokerSnapshotTtlSettings
): Promise<BrokerSnapshotTtlSettings> {
  const normalized = normalizeBrokerSnapshotTtl(settings)

  if (!isSupabaseConfigured()) return normalized

  const supabase = getSupabase()
  if (!supabase) return normalized

  await persistOrThrow('broker_snapshot_ttl', async () => {
    const { error } = await supabase.from('platform_settings').upsert({
      key: BROKER_SNAPSHOT_TTL_KEY,
      value: normalized,
      updated_at: new Date().toISOString(),
    })
    if (error) throw new Error(error.message)
  })

  return normalized
}

export { BROKER_SNAPSHOT_TTL_KEY }
export type { ArPolicyType }
