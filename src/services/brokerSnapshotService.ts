import { requireSupabase } from '../lib/supabase'
import type { BrokerSnapshotSummary } from '../types/brokerSnapshot'

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
