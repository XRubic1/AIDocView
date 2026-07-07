import { getSupabase, isSupabaseConfigured } from '../lib/supabase'
import { AR_POLICY, type AR_POLICY as ArPolicyType } from '../utils/invoiceAging'
import { persistOrThrow } from './persistHelper'

const AR_POLICY_KEY = 'ar_policy'

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
  policy: Pick<typeof AR_POLICY, 'collectionsOverdueDays' | 'clientUrgentDays' | 'criticalDays' | 'forceCloseDays' | 'agingBuckets'>
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

export type { ArPolicyType }
