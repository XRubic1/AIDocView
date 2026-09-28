import { getSupabase, isSupabaseConfigured } from '../lib/supabase'
import { AR_POLICY, type AR_POLICY as ArPolicyType } from '../utils/invoiceAging'
import {
  COLLECTIONS_POLICY,
  DEFAULT_COLLECTIONS_POLICY,
  type CollectionsPolicy,
} from '../utils/collectionsPolicy'
import {
  BROKER_RISK_POLICY,
  DEFAULT_BROKER_RISK_POLICY,
  type BrokerRiskPolicy,
} from '../utils/brokerRiskPolicy'
import {
  DEFAULT_SALES_LEAD_RATING_POLICY,
  normalizeSalesLeadRatingPolicy,
  SALES_LEAD_RATING_POLICY,
  type SalesLeadRatingPolicy,
} from '../utils/salesLeadRating'
import {
  DEFAULT_EMAIL_LIFECYCLE_SETTINGS,
  EMAIL_LIFECYCLE_SETTINGS,
  type EmailLifecycleSettings,
} from '../config/emailLifecycle'
import {
  DEFAULT_EMAIL_MAILBOXES,
  EMAIL_MAILBOXES,
  normalizeEmailMailboxes,
  type EmailMailboxSettings,
} from '../config/emailMailboxes'
import { persistOrThrow } from './persistHelper'

const AR_POLICY_KEY = 'ar_policy'
const COLLECTIONS_POLICY_KEY = 'collections_policy'
const BROKER_RISK_POLICY_KEY = 'broker_risk_policy'
const BROKER_SNAPSHOT_TTL_KEY = 'broker_snapshot_ttl'
const EMAIL_MAILBOXES_KEY = 'email_mailboxes'
const SALES_LEAD_RATING_KEY = 'sales_lead_rating'

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

function clampPolicyDays(value: unknown, fallback: number, min = 1): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n) || n < min) return fallback
  return Math.min(Math.floor(n), 90)
}

function boolOrDefault(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value
  return fallback
}

function normalizeCollectionsPolicy(
  value: Partial<CollectionsPolicy> | null | undefined
): CollectionsPolicy {
  const d = DEFAULT_COLLECTIONS_POLICY
  const minLevel = value?.riskyBrokerMinLevel === 'medium' ? 'medium' : 'high'
  return {
    defaultInquiryDays: clampPolicyDays(value?.defaultInquiryDays, d.defaultInquiryDays),
    defaultPaperworkCheckDays: clampPolicyDays(
      value?.defaultPaperworkCheckDays,
      d.defaultPaperworkCheckDays
    ),
    paymentVerifyUrgentDays: clampPolicyDays(
      value?.paymentVerifyUrgentDays,
      d.paymentVerifyUrgentDays
    ),
    followupAfterDays: clampPolicyDays(value?.followupAfterDays, d.followupAfterDays),
    needsAttentionAfterDays: clampPolicyDays(
      value?.needsAttentionAfterDays,
      d.needsAttentionAfterDays
    ),
    willPayUrgent: boolOrDefault(value?.willPayUrgent, d.willPayUrgent),
    willPayMissedDays: clampPolicyDays(value?.willPayMissedDays, d.willPayMissedDays),
    callbackUrgent: boolOrDefault(value?.callbackUrgent, d.callbackUrgent),
    callbackMissedDays: clampPolicyDays(value?.callbackMissedDays, d.callbackMissedDays, 0),
    riskyBrokerUrgent: boolOrDefault(value?.riskyBrokerUrgent, d.riskyBrokerUrgent),
    riskyBrokerMinLevel: minLevel,
    overdueUrgent: boolOrDefault(value?.overdueUrgent, d.overdueUrgent),
    overdueUrgentDays: clampPolicyDays(value?.overdueUrgentDays, d.overdueUrgentDays),
    noPpwUrgent: boolOrDefault(value?.noPpwUrgent, d.noPpwUrgent),
    noPpwAfterDays: clampPolicyDays(value?.noPpwAfterDays, d.noPpwAfterDays, 0),
    staleContactUrgent: boolOrDefault(value?.staleContactUrgent, d.staleContactUrgent),
    staleContactDays: clampPolicyDays(value?.staleContactDays, d.staleContactDays),
    needsCallUrgent: boolOrDefault(value?.needsCallUrgent, d.needsCallUrgent),
  }
}

/** Load collections urgency rules or return defaults. */
export async function loadCollectionsPolicy(): Promise<CollectionsPolicy> {
  if (!isSupabaseConfigured()) return { ...DEFAULT_COLLECTIONS_POLICY }

  const supabase = getSupabase()
  if (!supabase) return { ...DEFAULT_COLLECTIONS_POLICY }

  const { data, error } = await supabase
    .from('platform_settings')
    .select('value')
    .eq('key', COLLECTIONS_POLICY_KEY)
    .maybeSingle()

  if (error || !data?.value) return { ...DEFAULT_COLLECTIONS_POLICY }
  return normalizeCollectionsPolicy(data.value as Partial<CollectionsPolicy>)
}

/** Apply loaded collections policy to the runtime singleton. */
export function applyCollectionsPolicy(policy: CollectionsPolicy): void {
  Object.assign(COLLECTIONS_POLICY, normalizeCollectionsPolicy(policy))
}

/** Persist collections urgency rules from admin Settings. */
export async function saveCollectionsPolicy(policy: CollectionsPolicy): Promise<CollectionsPolicy> {
  const normalized = normalizeCollectionsPolicy(policy)
  applyCollectionsPolicy(normalized)

  if (!isSupabaseConfigured()) return normalized

  const supabase = getSupabase()
  if (!supabase) return normalized

  await persistOrThrow('collections_policy', async () => {
    const { error } = await supabase.from('platform_settings').upsert({
      key: COLLECTIONS_POLICY_KEY,
      value: normalized,
      updated_at: new Date().toISOString(),
    })
    if (error) throw new Error(error.message)
  })

  return normalized
}

function clampRiskInt(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n) || n < min) return fallback
  return Math.min(Math.floor(n), max)
}

export type BrokerRiskPolicySettings = Omit<BrokerRiskPolicy, 'note_keyword_re'>

function parseThinHistoryLevel(
  value: unknown,
  fallback: BrokerRiskPolicy['new_broker_no_history_level']
): BrokerRiskPolicy['new_broker_no_history_level'] {
  if (value === 'high' || value === 'medium' || value === 'low') return value
  return fallback
}

function normalizeBrokerRiskPolicy(
  value: Partial<BrokerRiskPolicySettings> | null | undefined
): BrokerRiskPolicy {
  const d = DEFAULT_BROKER_RISK_POLICY
  return {
    lookback_days: clampRiskInt(value?.lookback_days, d.lookback_days, 30, 730),
    medium_late_count: clampRiskInt(value?.medium_late_count, d.medium_late_count, 1, 20),
    medium_single_late_days: clampRiskInt(
      value?.medium_single_late_days,
      d.medium_single_late_days,
      1,
      90
    ),
    high_late_count: clampRiskInt(value?.high_late_count, d.high_late_count, 1, 20),
    high_single_late_days: clampRiskInt(
      value?.high_single_late_days,
      d.high_single_late_days,
      1,
      90
    ),
    high_open_overdue_count: clampRiskInt(
      value?.high_open_overdue_count,
      d.high_open_overdue_count,
      1,
      20
    ),
    medium_open_overdue_count: clampRiskInt(
      value?.medium_open_overdue_count,
      d.medium_open_overdue_count,
      1,
      20
    ),
    late_payment_min_days: clampRiskInt(
      value?.late_payment_min_days,
      d.late_payment_min_days,
      1,
      90
    ),
    open_overdue_min_days: clampRiskInt(
      value?.open_overdue_min_days,
      d.open_overdue_min_days,
      1,
      90
    ),
    fallback_terms_days: clampRiskInt(value?.fallback_terms_days, d.fallback_terms_days, 1, 90),
    min_paid_sample_for_confidence: clampRiskInt(
      value?.min_paid_sample_for_confidence,
      d.min_paid_sample_for_confidence,
      1,
      20
    ),
    min_paid_sample_for_payment_timing: clampRiskInt(
      value?.min_paid_sample_for_payment_timing,
      d.min_paid_sample_for_payment_timing,
      1,
      100
    ),
    new_broker_no_history_level: parseThinHistoryLevel(
      value?.new_broker_no_history_level,
      d.new_broker_no_history_level
    ),
    unknown_broker_no_history_level: parseThinHistoryLevel(
      value?.unknown_broker_no_history_level,
      d.unknown_broker_no_history_level
    ),
    new_broker_thin_sample_level: parseThinHistoryLevel(
      value?.new_broker_thin_sample_level,
      d.new_broker_thin_sample_level
    ),
    score_new_brokers_with_no_loads: boolOrDefault(
      value?.score_new_brokers_with_no_loads,
      d.score_new_brokers_with_no_loads
    ),
    note_keyword_re: d.note_keyword_re,
  }
}

function brokerRiskPolicyToJson(policy: BrokerRiskPolicy): BrokerRiskPolicySettings {
  const { note_keyword_re: _re, ...rest } = policy
  return rest
}

/** Load broker-risk scoring rules or return defaults. */
export async function loadBrokerRiskPolicy(): Promise<BrokerRiskPolicy> {
  if (!isSupabaseConfigured()) return { ...DEFAULT_BROKER_RISK_POLICY }

  const supabase = getSupabase()
  if (!supabase) return { ...DEFAULT_BROKER_RISK_POLICY }

  const { data, error } = await supabase
    .from('platform_settings')
    .select('value')
    .eq('key', BROKER_RISK_POLICY_KEY)
    .maybeSingle()

  if (error || !data?.value) return { ...DEFAULT_BROKER_RISK_POLICY }
  return normalizeBrokerRiskPolicy(data.value as Partial<BrokerRiskPolicySettings>)
}

/** Apply loaded broker-risk policy to the runtime singleton. */
export function applyBrokerRiskPolicy(policy: BrokerRiskPolicy): void {
  Object.assign(BROKER_RISK_POLICY, normalizeBrokerRiskPolicy(policy))
}

/** Persist broker-risk scoring rules from admin Settings. */
export async function saveBrokerRiskPolicy(
  policy: Partial<BrokerRiskPolicySettings>
): Promise<BrokerRiskPolicy> {
  const normalized = normalizeBrokerRiskPolicy(policy)
  applyBrokerRiskPolicy(normalized)

  if (!isSupabaseConfigured()) return normalized

  const supabase = getSupabase()
  if (!supabase) return normalized

  await persistOrThrow('broker_risk_policy', async () => {
    const { error } = await supabase.from('platform_settings').upsert({
      key: BROKER_RISK_POLICY_KEY,
      value: brokerRiskPolicyToJson(normalized),
      updated_at: new Date().toISOString(),
    })
    if (error) throw new Error(error.message)
  })

  return normalized
}

const EMAIL_LIFECYCLE_KEY = 'email_lifecycle'

function clampClockDays(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n) || n < 0) return fallback
  return Math.min(Math.floor(n), 90)
}

function normalizeTrackClock(
  value: Partial<EmailLifecycleSettings['paperwork']> | null | undefined,
  fallback: EmailLifecycleSettings['paperwork']
): EmailLifecycleSettings['paperwork'] {
  return {
    firstAskDays: clampClockDays(value?.firstAskDays, fallback.firstAskDays),
    actionNeededAfterFirst:
      typeof value?.actionNeededAfterFirst === 'boolean'
        ? value.actionNeededAfterFirst
        : fallback.actionNeededAfterFirst,
    actionNeededAfterFirstDays: clampClockDays(
      value?.actionNeededAfterFirstDays,
      fallback.actionNeededAfterFirstDays
    ),
    secondFollowupDays: clampClockDays(value?.secondFollowupDays, fallback.secondFollowupDays),
    needsAttentionAfterSecondDays: clampClockDays(
      value?.needsAttentionAfterSecondDays,
      fallback.needsAttentionAfterSecondDays
    ),
  }
}

function normalizeEmailLifecycleSettings(
  value: Partial<EmailLifecycleSettings> | null | undefined
): EmailLifecycleSettings {
  const d = DEFAULT_EMAIL_LIFECYCLE_SETTINGS
  const rules: EmailLifecycleSettings['rules'] = { ...d.rules }
  if (value?.rules) {
    for (const [id, row] of Object.entries(value.rules)) {
      rules[id as keyof typeof rules] = { enabled: row?.enabled !== false }
    }
  }
  return {
    rules,
    paperwork: normalizeTrackClock(value?.paperwork, d.paperwork),
    payment: normalizeTrackClock(value?.payment, d.payment),
  }
}

/** Load email workflow clocks/toggles from platform_settings. */
export async function loadEmailLifecycleSettings(): Promise<EmailLifecycleSettings> {
  if (!isSupabaseConfigured()) return normalizeEmailLifecycleSettings(EMAIL_LIFECYCLE_SETTINGS)

  const supabase = getSupabase()
  if (!supabase) return normalizeEmailLifecycleSettings(EMAIL_LIFECYCLE_SETTINGS)

  const { data, error } = await supabase
    .from('platform_settings')
    .select('value')
    .eq('key', EMAIL_LIFECYCLE_KEY)
    .maybeSingle()

  if (error || !data?.value) return normalizeEmailLifecycleSettings(null)
  return normalizeEmailLifecycleSettings(data.value as Partial<EmailLifecycleSettings>)
}

/** Apply loaded email workflow settings to the runtime singleton. */
export function applyEmailLifecycleSettings(settings: EmailLifecycleSettings): void {
  const next = normalizeEmailLifecycleSettings(settings)
  EMAIL_LIFECYCLE_SETTINGS.rules = next.rules
  Object.assign(EMAIL_LIFECYCLE_SETTINGS.paperwork, next.paperwork)
  Object.assign(EMAIL_LIFECYCLE_SETTINGS.payment, next.payment)
}

/** Persist email workflow settings from admin Settings. */
export async function saveEmailLifecycleSettings(
  settings: EmailLifecycleSettings
): Promise<EmailLifecycleSettings> {
  const normalized = normalizeEmailLifecycleSettings(settings)
  applyEmailLifecycleSettings(normalized)

  if (!isSupabaseConfigured()) return normalized

  const supabase = getSupabase()
  if (!supabase) return normalized

  await persistOrThrow('email_lifecycle', async () => {
    const { error } = await supabase.from('platform_settings').upsert({
      key: EMAIL_LIFECYCLE_KEY,
      value: normalized,
      updated_at: new Date().toISOString(),
    })
    if (error) throw new Error(error.message)
  })

  return normalized
}

/** Load mailbox addresses (ops / billing / reply-to) from platform_settings. */
export async function loadEmailMailboxes(): Promise<EmailMailboxSettings> {
  if (!isSupabaseConfigured()) return normalizeEmailMailboxes(EMAIL_MAILBOXES)

  const supabase = getSupabase()
  if (!supabase) return normalizeEmailMailboxes(EMAIL_MAILBOXES)

  const { data, error } = await supabase
    .from('platform_settings')
    .select('value')
    .eq('key', EMAIL_MAILBOXES_KEY)
    .maybeSingle()

  if (error || !data?.value) return normalizeEmailMailboxes(null)
  return normalizeEmailMailboxes(data.value as Partial<EmailMailboxSettings>)
}

/** Apply mailbox settings to the runtime singleton used by templates / contact links. */
export function applyEmailMailboxes(settings: EmailMailboxSettings): void {
  Object.assign(EMAIL_MAILBOXES, normalizeEmailMailboxes(settings))
}

/** Persist mailbox settings from admin Settings → Addresses. */
export async function saveEmailMailboxes(
  settings: EmailMailboxSettings
): Promise<EmailMailboxSettings> {
  const normalized = normalizeEmailMailboxes(settings)
  applyEmailMailboxes(normalized)

  if (!isSupabaseConfigured()) return normalized

  const supabase = getSupabase()
  if (!supabase) return normalized

  await persistOrThrow('email_mailboxes', async () => {
    const { error } = await supabase.from('platform_settings').upsert({
      key: EMAIL_MAILBOXES_KEY,
      value: normalized,
      updated_at: new Date().toISOString(),
    })
    if (error) throw new Error(error.message)
  })

  return normalized
}

/** Load sales-lead chase rating rules from platform_settings. */
export async function loadSalesLeadRatingPolicy(): Promise<SalesLeadRatingPolicy> {
  if (!isSupabaseConfigured()) return { ...DEFAULT_SALES_LEAD_RATING_POLICY }

  const supabase = getSupabase()
  if (!supabase) return { ...DEFAULT_SALES_LEAD_RATING_POLICY }

  const { data, error } = await supabase
    .from('platform_settings')
    .select('value')
    .eq('key', SALES_LEAD_RATING_KEY)
    .maybeSingle()

  if (error || !data?.value) return { ...DEFAULT_SALES_LEAD_RATING_POLICY }
  return normalizeSalesLeadRatingPolicy(data.value as Partial<SalesLeadRatingPolicy>)
}

/** Apply sales-lead rating policy to the runtime singleton. */
export function applySalesLeadRatingPolicy(policy: SalesLeadRatingPolicy): void {
  Object.assign(SALES_LEAD_RATING_POLICY, normalizeSalesLeadRatingPolicy(policy))
}

/** Persist sales-lead chase rating rules (Sales page / Settings). */
export async function saveSalesLeadRatingPolicy(
  policy: Partial<SalesLeadRatingPolicy>
): Promise<SalesLeadRatingPolicy> {
  const normalized = normalizeSalesLeadRatingPolicy(policy)
  applySalesLeadRatingPolicy(normalized)

  if (!isSupabaseConfigured()) return normalized

  const supabase = getSupabase()
  if (!supabase) return normalized

  await persistOrThrow('sales_lead_rating', async () => {
    const { error } = await supabase.from('platform_settings').upsert({
      key: SALES_LEAD_RATING_KEY,
      value: normalized,
      updated_at: new Date().toISOString(),
    })
    if (error) throw new Error(error.message)
  })

  return normalized
}

const BLUEPRINTS_RUNTIME_KEY = 'blueprints_runtime'

export type BlueprintsRuntimeSettings = {
  /** When true, Live blueprint runner is on for all admins + Edge crons. */
  enabled: boolean
}

function normalizeBlueprintsRuntime(
  value: Partial<BlueprintsRuntimeSettings> | null | undefined
): BlueprintsRuntimeSettings {
  return { enabled: value?.enabled === true }
}

/** Load Live runner flag from platform_settings (shared across admins). */
export async function loadBlueprintsRunnerEnabled(): Promise<boolean> {
  const { applyBlueprintsRunnerEnabled } = await import('../config/blueprintsRuntime')

  if (!isSupabaseConfigured()) {
    const { isBlueprintsRunnerEnabled } = await import('../config/blueprintsRuntime')
    const local = isBlueprintsRunnerEnabled()
    applyBlueprintsRunnerEnabled(local, { fromServer: true })
    return local
  }

  const supabase = getSupabase()
  if (!supabase) {
    const { isBlueprintsRunnerEnabled } = await import('../config/blueprintsRuntime')
    const local = isBlueprintsRunnerEnabled()
    applyBlueprintsRunnerEnabled(local, { fromServer: true })
    return local
  }

  const { data, error } = await supabase
    .from('platform_settings')
    .select('value')
    .eq('key', BLUEPRINTS_RUNTIME_KEY)
    .maybeSingle()

  if (error || !data?.value) {
    // First time: seed from this browser's local mirror so turning Live on once sticks.
    const { isBlueprintsRunnerEnabled } = await import('../config/blueprintsRuntime')
    const seeded = isBlueprintsRunnerEnabled()
    applyBlueprintsRunnerEnabled(seeded, { fromServer: true })
    if (seeded) {
      try {
        await saveBlueprintsRunnerEnabled(true)
      } catch {
        /* ignore seed write */
      }
    }
    return seeded
  }

  const enabled = normalizeBlueprintsRuntime(
    data.value as Partial<BlueprintsRuntimeSettings>
  ).enabled
  applyBlueprintsRunnerEnabled(enabled, { fromServer: true })
  return enabled
}

/** Persist Live runner flag for all admins and Edge crons. */
export async function saveBlueprintsRunnerEnabled(enabled: boolean): Promise<boolean> {
  const { applyBlueprintsRunnerEnabled, isBlueprintsRunnerEnabled } = await import(
    '../config/blueprintsRuntime'
  )
  const prev = isBlueprintsRunnerEnabled()
  applyBlueprintsRunnerEnabled(enabled, { fromServer: true })

  if (!isSupabaseConfigured()) return enabled

  const supabase = getSupabase()
  if (!supabase) return enabled

  const value: BlueprintsRuntimeSettings = { enabled }
  try {
    await persistOrThrow('blueprints_runtime', async () => {
      const { error } = await supabase.from('platform_settings').upsert({
        key: BLUEPRINTS_RUNTIME_KEY,
        value,
        updated_at: new Date().toISOString(),
      })
      if (error) throw new Error(error.message)
    })
  } catch (err) {
    applyBlueprintsRunnerEnabled(prev, { fromServer: true })
    throw err
  }

  return enabled
}

export {
  BROKER_SNAPSHOT_TTL_KEY,
  COLLECTIONS_POLICY_KEY,
  BROKER_RISK_POLICY_KEY,
  EMAIL_MAILBOXES_KEY,
  SALES_LEAD_RATING_KEY,
  BLUEPRINTS_RUNTIME_KEY,
  DEFAULT_EMAIL_MAILBOXES,
  DEFAULT_SALES_LEAD_RATING_POLICY,
}
export type {
  ArPolicyType,
  CollectionsPolicy,
  BrokerRiskPolicy,
  EmailMailboxSettings,
  SalesLeadRatingPolicy,
}
