import { getSupabase, requireSupabase } from '../lib/supabase'
import type {
  BrokerSnapshotLookupLogRow,
  BrokerSnapshotSummary,
} from '../types/brokerSnapshot'

const cache = new Map<string, { at: number; data: BrokerSnapshotSummary }>()
const CACHE_TTL_MS = 60 * 1000 // short client memo; shared 30d/5d cache lives server-side

function cacheKey(mc: string): string {
  return mc.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
}

/** Clear in-memory Snapshot lookups (tests / logout). */
export function clearBrokerSnapshotCache(): void {
  cache.clear()
}

/**
 * Look up a broker/carrier by MC via BrokerSnapshot (Edge proxy).
 * Used when the MC is not in the Credyx broker catalog.
 */
export async function lookupBrokerSnapshotByMc(
  mc: string
): Promise<BrokerSnapshotSummary> {
  const key = cacheKey(mc)
  if (!key) {
    return { found: false, riskFlags: [], mcNumber: null }
  }

  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return hit.data
  }

  const supabase = requireSupabase()
  const { data, error } = await supabase.functions.invoke('brokersnapshot-proxy', {
    body: { action: 'lookupByMc', mc },
  })

  if (error) {
    throw new Error(error.message || 'BrokerSnapshot lookup failed')
  }

  const payload = data as {
    Success?: boolean
    Data?: BrokerSnapshotSummary
    error?: string
  }

  if (payload?.error) {
    throw new Error(payload.error)
  }

  const summary: BrokerSnapshotSummary = payload?.Data ?? {
    found: false,
    riskFlags: [],
  }

  cache.set(key, { at: Date.now(), data: summary })
  return summary
}

/**
 * Look up a carrier by USDOT via BrokerSnapshot (Edge proxy).
 * Same summary shape as MC lookup (fleet, add date, authority, insurance).
 */
export async function lookupBrokerSnapshotByDot(
  dot: string
): Promise<BrokerSnapshotSummary> {
  const key = `DOT:${dot.trim().replace(/\D/g, '')}`
  if (key === 'DOT:') {
    return { found: false, riskFlags: [], dotNumber: null }
  }

  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return hit.data
  }

  const supabase = requireSupabase()
  const { data, error } = await supabase.functions.invoke('brokersnapshot-proxy', {
    body: { action: 'lookupByDot', dot },
  })

  if (error) {
    throw new Error(error.message || 'BrokerSnapshot DOT lookup failed')
  }

  const payload = data as {
    Success?: boolean
    Data?: BrokerSnapshotSummary
    error?: string
  }

  if (payload?.error) {
    throw new Error(payload.error)
  }

  const summary: BrokerSnapshotSummary = payload?.Data ?? {
    found: false,
    riskFlags: [],
  }

  cache.set(key, { at: Date.now(), data: summary })
  return summary
}

const LOOKUP_LOG_SELECT =
  'id, mc_number, mc_digits, legal_name, insurance_verdict, found, operating_status, broker_authority, status_label, created_at'

/**
 * This carrier's MC Lookup history, newest first.
 * Requires client_id so an admin session cannot pull every tenant's log.
 */
export async function listMyBrokerSnapshotLookups(
  clientId: string,
  limit = 50
): Promise<BrokerSnapshotLookupLogRow[]> {
  if (!clientId.trim()) return []
  const supabase = getSupabase()
  if (!supabase) return []

  const { data, error } = await supabase
    .from('broker_snapshot_lookup_events')
    .select(LOOKUP_LOG_SELECT)
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    const fallback = await supabase
      .from('broker_snapshot_lookup_events')
      .select('id, mc_number, mc_digits, legal_name, insurance_verdict, created_at')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(limit)
    if (fallback.error || !fallback.data) return []
    return fallback.data.map((row) => ({
      ...row,
      found: null,
      operating_status: null,
      broker_authority: null,
      status_label: null,
    })) as BrokerSnapshotLookupLogRow[]
  }

  return (data ?? []) as BrokerSnapshotLookupLogRow[]
}
