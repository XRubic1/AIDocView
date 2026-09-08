/**
 * Admin reads of cached BrokerSnapshot + carrier MC Lookup history.
 */
import { getSupabase } from '../lib/supabase'
import type { BrokerSnapshotSummary } from '../types/brokerSnapshot'
import { getClientById } from './clientRegistry'

export type BrokerSnapshotCacheRow = {
  id: string
  broker_id: string | null
  mc_number: string
  mc_digits: string
  dot_number: string | null
  legal_name: string | null
  payload: BrokerSnapshotSummary
  insurance_verdict: string | null
  fetched_at: string
  next_review_at: string
  lookup_count: number
  last_lookup_at: string
}

export type BrokerSnapshotLookupEvent = {
  id: string
  snapshot_id: string | null
  mc_number: string | null
  mc_digits: string
  client_id: string | null
  clientName: string
  from_cache: boolean
  insurance_verdict: string | null
  legal_name: string | null
  created_at: string
}

function mcDigits(mc: string | null | undefined): string {
  return (mc ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .replace(/^(MC|MX|FF)/, '')
}

/** Latest cached Snapshot for an MC (no live API call). */
export async function fetchCachedBrokerSnapshot(
  mc: string | null | undefined
): Promise<BrokerSnapshotCacheRow | null> {
  const digits = mcDigits(mc)
  if (!digits) return null
  const supabase = getSupabase()
  if (!supabase) return null

  const { data, error } = await supabase
    .from('broker_external_snapshots')
    .select(
      'id, broker_id, mc_number, mc_digits, dot_number, legal_name, payload, insurance_verdict, fetched_at, next_review_at, lookup_count, last_lookup_at'
    )
    .eq('mc_digits', digits)
    .maybeSingle()

  if (error || !data) return null
  const row = data as BrokerSnapshotCacheRow
  return {
    ...row,
    payload: (row.payload ?? { found: false, riskFlags: [] }) as BrokerSnapshotSummary,
  }
}

/** Carrier MC Lookup events for this MC, newest first. */
export async function listBrokerSnapshotLookups(
  mc: string | null | undefined,
  limit = 40
): Promise<BrokerSnapshotLookupEvent[]> {
  const digits = mcDigits(mc)
  if (!digits) return []
  const supabase = getSupabase()
  if (!supabase) return []

  const { data, error } = await supabase
    .from('broker_snapshot_lookup_events')
    .select(
      'id, snapshot_id, mc_number, mc_digits, client_id, from_cache, insurance_verdict, legal_name, created_at'
    )
    .eq('mc_digits', digits)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error || !data) return []

  return (data as Omit<BrokerSnapshotLookupEvent, 'clientName'>[]).map((row) => ({
    ...row,
    clientName: row.client_id
      ? getClientById(row.client_id)?.name ?? 'Carrier'
      : 'Credyx admin',
  }))
}
