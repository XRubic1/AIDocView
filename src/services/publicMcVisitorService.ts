import { requireSupabase, isSupabaseConfigured } from '../lib/supabase'

export type PublicMcVisitorUnlock = {
  isNew: boolean
  visitorId: string
  mcDigits: string
  mcNumber: string
  companyName: string | null
}

export type PublicMcVisitorAdminRow = {
  id: string
  mc_digits: string
  mc_number: string
  company_name: string | null
  first_seen_at: string
  last_seen_at: string
  unlock_count: number
  check_count: number
}

export type PublicMcCheckAdminRow = {
  id: string
  visitor_id: string
  visitor_mc_digits: string
  search_kind: string
  searched_digits: string
  searched_label: string | null
  company_name: string | null
  created_at: string
}

type RpcVisitorPayload = {
  found?: boolean
  is_new?: boolean
  id?: string
  mc_digits?: string
  mc_number?: string
  company_name?: string | null
}

function digitsOnly(value: string): string {
  return value.replace(/\D/g, '')
}

/** True when the public MC RPCs/tables are not deployed yet (migration pending). */
function isMissingPublicMcRpc(error: { code?: string; message?: string; status?: number } | null): boolean {
  if (!error) return false
  const message = (error.message ?? '').toLowerCase()
  return (
    error.code === 'PGRST202' ||
    error.code === '42883' ||
    error.status === 404 ||
    message.includes('could not find the function') ||
    message.includes('does not exist') ||
    message.includes('404')
  )
}

function parseUnlock(payload: RpcVisitorPayload | null): PublicMcVisitorUnlock | null {
  if (!payload?.found || !payload.id || !payload.mc_digits) return null
  return {
    isNew: Boolean(payload.is_new),
    visitorId: payload.id,
    mcDigits: payload.mc_digits,
    mcNumber: payload.mc_number || `MC-${payload.mc_digits}`,
    companyName: payload.company_name?.trim() || null,
  }
}

/** Returning carrier: use stored name, no BrokerSnapshot. */
export async function findPublicMcVisitor(mcDigits: string): Promise<PublicMcVisitorUnlock | null> {
  if (!isSupabaseConfigured()) return null
  const digits = digitsOnly(mcDigits)
  if (digits.length < 4) return null

  const supabase = requireSupabase()
  const { data, error } = await supabase.rpc('public_mc_find_visitor', {
    p_mc_digits: digits,
  })
  if (error) {
    if (isMissingPublicMcRpc(error)) return null
    throw new Error(error.message || 'Failed to look up carrier MC')
  }
  const found = parseUnlock(data as RpcVisitorPayload)
  if (!found) return null
  return { ...found, isNew: false }
}

/** Bump last_seen for a returning carrier already in the database. */
export async function touchPublicMcVisitor(mcDigits: string): Promise<PublicMcVisitorUnlock | null> {
  if (!isSupabaseConfigured()) return null
  const digits = digitsOnly(mcDigits)
  if (digits.length < 4) return null

  const supabase = requireSupabase()
  const { data, error } = await supabase.rpc('public_mc_touch_visitor', {
    p_mc_digits: digits,
  })
  if (error) {
    if (isMissingPublicMcRpc(error)) return null
    throw new Error(error.message || 'Failed to update carrier visit')
  }
  return parseUnlock(data as RpcVisitorPayload)
}

/** First-time carrier: store MC + company name from BrokerSnapshot. */
export async function registerPublicMcVisitor(
  mcDigits: string,
  companyName: string | null
): Promise<PublicMcVisitorUnlock> {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured.')
  }
  const digits = digitsOnly(mcDigits)
  if (digits.length < 4) throw new Error('Enter your carrier MC number.')

  const supabase = requireSupabase()
  const { data, error } = await supabase.rpc('public_mc_register_visitor', {
    p_mc_digits: digits,
    p_company_name: companyName,
  })
  if (error) {
    if (isMissingPublicMcRpc(error)) {
      // Migration not applied yet — unlock in-session so /MC still works.
      console.warn(
        'public_mc_register_visitor missing. Apply supabase/migrations/20261010120000_public_mc_visitors.sql'
      )
      return {
        isNew: true,
        visitorId: `local-${digits}`,
        mcDigits: digits,
        mcNumber: `MC-${digits}`,
        companyName: companyName?.trim() || null,
      }
    }
    throw new Error(error.message || 'Failed to save carrier MC')
  }
  const parsed = parseUnlock(data as RpcVisitorPayload)
  if (!parsed) throw new Error('Failed to save carrier MC')
  return parsed
}

/** Attribute a broker lookup on /MC to the unlocked carrier. */
export async function recordPublicMcCheck(input: {
  visitorMcDigits: string
  searchKind: 'MC' | 'DOT' | 'FF'
  searchedDigits: string
  searchedLabel?: string | null
  companyName?: string | null
}): Promise<void> {
  if (!isSupabaseConfigured()) return
  const visitorDigits = digitsOnly(input.visitorMcDigits)
  const searchedDigits = digitsOnly(input.searchedDigits)
  if (visitorDigits.length < 4 || !searchedDigits) return

  const supabase = requireSupabase()
  const { error } = await supabase.rpc('public_mc_record_check', {
    p_visitor_mc_digits: visitorDigits,
    p_search_kind: input.searchKind,
    p_searched_digits: searchedDigits,
    p_searched_label: input.searchedLabel ?? null,
    p_company_name: input.companyName ?? null,
  })
  if (error) {
    console.warn('public_mc_record_check failed', error.message)
  }
}

/** Admin: carriers who unlocked /MC, with check counts. */
export async function fetchPublicMcVisitorsAdmin(): Promise<PublicMcVisitorAdminRow[]> {
  const supabase = requireSupabase()
  const { data: visitors, error } = await supabase
    .from('public_mc_visitors')
    .select('id, mc_digits, mc_number, company_name, first_seen_at, last_seen_at, unlock_count')
    .order('first_seen_at', { ascending: false })

  if (error) throw new Error(error.message || 'Failed to load MC visitors')

  const rows = (visitors ?? []) as Omit<PublicMcVisitorAdminRow, 'check_count'>[]
  if (rows.length === 0) return []

  const { data: checks, error: checkError } = await supabase
    .from('public_mc_checks')
    .select('visitor_id')
    .in(
      'visitor_id',
      rows.map((row) => row.id)
    )

  if (checkError) throw new Error(checkError.message || 'Failed to load MC check counts')

  const counts = new Map<string, number>()
  for (const row of checks ?? []) {
    const id = (row as { visitor_id: string }).visitor_id
    counts.set(id, (counts.get(id) ?? 0) + 1)
  }

  return rows.map((row) => ({
    ...row,
    check_count: counts.get(row.id) ?? 0,
  }))
}

/** Admin: all broker lookups for one carrier visitor. */
export async function fetchPublicMcChecksForVisitor(
  visitorId: string
): Promise<PublicMcCheckAdminRow[]> {
  const supabase = requireSupabase()
  const { data, error } = await supabase
    .from('public_mc_checks')
    .select(
      'id, visitor_id, visitor_mc_digits, search_kind, searched_digits, searched_label, company_name, created_at'
    )
    .eq('visitor_id', visitorId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message || 'Failed to load MC checks')
  return (data ?? []) as PublicMcCheckAdminRow[]
}
