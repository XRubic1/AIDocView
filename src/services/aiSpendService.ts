/**
 * AI spend policy + usage ledger.
 * Gates DocSort / packet AI / review — never blocks document uploads.
 */

import {
  AI_POLICY,
  DEFAULT_AI_POLICY,
  normalizeAiPolicy,
  normalizeClientAiSettings,
  type AiPolicySettings,
  type ClientAiSettings,
} from '../config/aiPolicy'
import { getClientById } from './clientRegistry'
import { getSupabase, isSupabaseConfigured } from '../lib/supabase'
import { estimateCostUsd } from '../utils/reviewCost'

export type AiSpendDenyReason =
  | 'platform_disabled'
  | 'client_disabled'
  | 'org_cap_exceeded'
  | 'client_cap_exceeded'

export type AiSpendDecision = {
  allowed: boolean
  reason?: AiSpendDenyReason
  /** Human message for logs / UI (uploads still OK). */
  message: string
  spentUsdThisMonth: number
  orgSpentUsdThisMonth: number
  clientCapUsd: number | null
  orgCapUsd: number | null
}

export type AiUsageFeature =
  | 'docsort'
  | 'review'
  | 'classify'
  | 'extract'
  | 'chat'
  | 'unknown'

export type AiUsageEventInput = {
  clientId?: string | null
  feature?: AiUsageFeature | string
  model?: string | null
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
  estimatedCostUsd?: number
  invoiceId?: string | null
  documentId?: string | null
  meta?: Record<string, unknown>
}

export type CarrierAiSpendRow = {
  clientId: string
  clientName: string
  spentUsd: number
  promptTokens: number
  completionTokens: number
  totalTokens: number
  eventCount: number
  limitEnabled: boolean
  monthlyCapUsd: number | null
  aiEnabled: boolean | null
}

type AiPolicyRow = {
  id: number
  ai_enabled: boolean
  monthly_spend_cap_usd: number | null
  default_client_monthly_cap_usd: number | null
}

/** Start of current UTC calendar month. */
export function startOfUtcMonth(date = new Date()): string {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)).toISOString()
}

/** Apply loaded policy to the runtime singleton. */
export function applyAiPolicy(settings: AiPolicySettings): void {
  Object.assign(AI_POLICY, normalizeAiPolicy(settings))
}

/** Load platform AI policy from `ai_policy` (or defaults). */
export async function loadAiPolicy(): Promise<AiPolicySettings> {
  if (!isSupabaseConfigured()) return normalizeAiPolicy(AI_POLICY)

  const supabase = getSupabase()
  if (!supabase) return normalizeAiPolicy(AI_POLICY)

  const { data, error } = await supabase.from('ai_policy').select('*').eq('id', 1).maybeSingle()
  if (error || !data) return normalizeAiPolicy(DEFAULT_AI_POLICY)

  const row = data as AiPolicyRow
  return normalizeAiPolicy({
    aiEnabled: row.ai_enabled !== false,
    monthlySpendCapUsd: row.monthly_spend_cap_usd,
    defaultClientMonthlyCapUsd: row.default_client_monthly_cap_usd,
  })
}

/** Persist platform AI policy (admin Settings). */
export async function saveAiPolicy(settings: AiPolicySettings): Promise<AiPolicySettings> {
  const normalized = normalizeAiPolicy(settings)
  applyAiPolicy(normalized)

  if (!isSupabaseConfigured()) return normalized

  const supabase = getSupabase()
  if (!supabase) return normalized

  const { error } = await supabase.from('ai_policy').upsert({
    id: 1,
    ai_enabled: normalized.aiEnabled,
    monthly_spend_cap_usd: normalized.monthlySpendCapUsd,
    default_client_monthly_cap_usd: normalized.defaultClientMonthlyCapUsd,
    updated_at: new Date().toISOString(),
  })
  if (error) throw new Error(error.message)
  return normalized
}

/** Resolve effective per-client AI settings (registry first). */
export function getClientAiSettings(clientId: string | null | undefined): ClientAiSettings {
  if (!clientId) return normalizeClientAiSettings(null)
  const client = getClientById(clientId)
  return normalizeClientAiSettings(client?.ai_settings)
}

/** Sum estimated USD spend for a client this calendar month. */
export async function fetchClientSpendUsdThisMonth(clientId: string): Promise<number> {
  if (!clientId || !isSupabaseConfigured()) return 0
  const supabase = getSupabase()
  if (!supabase) return 0

  const { data, error } = await supabase
    .from('ai_usage_events')
    .select('estimated_cost_usd')
    .eq('client_id', clientId)
    .gte('created_at', startOfUtcMonth())

  if (error || !data) return 0
  return data.reduce((sum, row) => sum + Number(row.estimated_cost_usd ?? 0), 0)
}

/** Sum org-wide USD spend this calendar month. */
export async function fetchOrgSpendUsdThisMonth(): Promise<number> {
  if (!isSupabaseConfigured()) return 0
  const supabase = getSupabase()
  if (!supabase) return 0

  const { data, error } = await supabase
    .from('ai_usage_events')
    .select('estimated_cost_usd')
    .gte('created_at', startOfUtcMonth())

  if (error || !data) return 0
  return data.reduce((sum, row) => sum + Number(row.estimated_cost_usd ?? 0), 0)
}

/**
 * Decide whether AI packet/review spend is allowed for a carrier.
 * Uploads must proceed regardless of this decision.
 */
export async function evaluateAiSpendAllow(
  clientId: string | null | undefined
): Promise<AiSpendDecision> {
  const policy = normalizeAiPolicy(AI_POLICY)
  const clientSettings = getClientAiSettings(clientId)
  const orgCap = policy.monthlySpendCapUsd
  // Cap only when this carrier has the limit toggle on.
  const clientCap = clientSettings.limitEnabled
    ? clientSettings.monthlyCapUsd ?? policy.defaultClientMonthlyCapUsd
    : null

  const [spentUsdThisMonth, orgSpentUsdThisMonth] = await Promise.all([
    clientId ? fetchClientSpendUsdThisMonth(clientId) : Promise.resolve(0),
    fetchOrgSpendUsdThisMonth(),
  ])

  const base = {
    spentUsdThisMonth,
    orgSpentUsdThisMonth,
    clientCapUsd: clientCap,
    orgCapUsd: orgCap,
  }

  if (!policy.aiEnabled) {
    return {
      ...base,
      allowed: false,
      reason: 'platform_disabled',
      message:
        'AI processing is turned off platform-wide. Documents can still be uploaded; Credyx will process manually.',
    }
  }

  if (clientSettings.aiEnabled === false) {
    return {
      ...base,
      allowed: false,
      reason: 'client_disabled',
      message:
        'AI processing is disabled for this carrier. Documents can still be uploaded; Credyx will process manually.',
    }
  }

  if (orgCap != null && orgSpentUsdThisMonth >= orgCap) {
    return {
      ...base,
      allowed: false,
      reason: 'org_cap_exceeded',
      message:
        'Platform AI monthly spend cap reached. Documents can still be uploaded; Credyx will process manually.',
    }
  }

  if (clientId && clientCap != null && spentUsdThisMonth >= clientCap) {
    return {
      ...base,
      allowed: false,
      reason: 'client_cap_exceeded',
      message:
        'This carrier hit their AI monthly spend cap. Documents can still be uploaded; Credyx will process manually.',
    }
  }

  return {
    ...base,
    allowed: true,
    message: 'AI processing allowed',
  }
}

/** Convenience: true when DocSort / review may spend tokens for this client. */
export async function isAiSpendAllowedForClient(
  clientId: string | null | undefined
): Promise<boolean> {
  const decision = await evaluateAiSpendAllow(clientId)
  return decision.allowed
}

/** Persist a usage event (best-effort; never throws to callers). */
export async function recordAiUsageEvent(input: AiUsageEventInput): Promise<void> {
  if (!isSupabaseConfigured()) return
  const supabase = getSupabase()
  if (!supabase) return

  const promptTokens = Math.max(0, Math.floor(input.promptTokens ?? 0))
  const completionTokens = Math.max(0, Math.floor(input.completionTokens ?? 0))
  const totalTokens =
    input.totalTokens != null
      ? Math.max(0, Math.floor(input.totalTokens))
      : promptTokens + completionTokens
  const model = input.model ?? null
  const estimated =
    input.estimatedCostUsd != null
      ? Number(input.estimatedCostUsd)
      : estimateCostUsd(model || 'gpt-4.1', promptTokens, completionTokens)

  try {
    const { error } = await supabase.from('ai_usage_events').insert({
      client_id: input.clientId || null,
      feature: input.feature || 'unknown',
      model,
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: totalTokens,
      estimated_cost_usd: Number.isFinite(estimated) ? estimated : 0,
      invoice_id: input.invoiceId || null,
      document_id: input.documentId || null,
      meta: input.meta ?? {},
    })
    if (error) console.warn('[recordAiUsageEvent]', error.message)
  } catch (err) {
    console.warn('[recordAiUsageEvent]', err)
  }
}

/** Admin spend table: this month by carrier. */
export async function fetchCarrierAiSpendRows(): Promise<CarrierAiSpendRow[]> {
  if (!isSupabaseConfigured()) return []
  const supabase = getSupabase()
  if (!supabase) return []

  const since = startOfUtcMonth()
  const { data, error } = await supabase
    .from('ai_usage_events')
    .select('client_id, estimated_cost_usd, prompt_tokens, completion_tokens, total_tokens')
    .gte('created_at', since)

  if (error || !data) {
    if (error) console.warn('[fetchCarrierAiSpendRows]', error.message)
    return []
  }

  const byClient = new Map<
    string,
    {
      spentUsd: number
      promptTokens: number
      completionTokens: number
      totalTokens: number
      eventCount: number
    }
  >()

  for (const row of data) {
    const id = row.client_id as string | null
    if (!id) continue
    const prev = byClient.get(id) ?? {
      spentUsd: 0,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      eventCount: 0,
    }
    prev.spentUsd += Number(row.estimated_cost_usd ?? 0)
    prev.promptTokens += Number(row.prompt_tokens ?? 0)
    prev.completionTokens += Number(row.completion_tokens ?? 0)
    prev.totalTokens += Number(row.total_tokens ?? 0)
    prev.eventCount += 1
    byClient.set(id, prev)
  }

  const rows: CarrierAiSpendRow[] = []
  for (const [clientId, stats] of byClient) {
    const client = getClientById(clientId)
    const settings = normalizeClientAiSettings(client?.ai_settings)
    rows.push({
      clientId,
      clientName: client?.name ?? clientId.slice(0, 8),
      spentUsd: stats.spentUsd,
      promptTokens: stats.promptTokens,
      completionTokens: stats.completionTokens,
      totalTokens: stats.totalTokens,
      eventCount: stats.eventCount,
      limitEnabled: Boolean(settings.limitEnabled),
      monthlyCapUsd: settings.monthlyCapUsd ?? null,
      aiEnabled: settings.aiEnabled ?? null,
    })
  }

  rows.sort((a, b) => b.spentUsd - a.spentUsd)
  return rows
}

/** Format USD for admin UI. */
export function formatAiUsd(value: number): string {
  return `$${value.toFixed(value >= 10 ? 2 : 4)}`
}
