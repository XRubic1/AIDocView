import { requireSupabase } from '../lib/supabase'

export interface WaitlistLead {
  id: string
  company_name: string
  contact_name: string
  email: string
  phone: string | null
  fleet_size: string
  hear_about: string | null
  notes: string | null
  status: string
  created_at: string
}

export interface WebsiteEventRow {
  id: string
  session_id: string
  occurred_at: string
  path: string
  event_name: string
  target: string | null
  ip_address: string | null
  region: string | null
  meta: Record<string, unknown>
  created_at: string
}

export interface RankedCount {
  key: string
  count: number
}

export interface WaitlistAdminSummary {
  signupsAll: number
  signups7d: number
  pageViews7d: number
  topCtas: RankedCount[]
  topSections: RankedCount[]
  funnel: {
    pageViews: number
    formSectionViews: number
    formSubmits: number
    formSuccesses: number
  }
}

function daysAgoIso(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString()
}

function rankTargets(
  rows: Array<{ target: string | null }>,
  limit = 8
): RankedCount[] {
  const counts = new Map<string, number>()
  for (const row of rows) {
    const key = row.target?.trim() || '(none)'
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
}

/** Dashboard summary for /admin/waitlist. */
export async function fetchWaitlistAdminSummary(): Promise<WaitlistAdminSummary> {
  const supabase = requireSupabase()
  const since7d = daysAgoIso(7)

  const [
    signupsAllRes,
    signups7dRes,
    events7dRes,
  ] = await Promise.all([
    supabase.from('waitlist_signups').select('id', { count: 'exact', head: true }),
    supabase
      .from('waitlist_signups')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', since7d),
    supabase
      .from('website_events')
      .select('event_name, target')
      .gte('occurred_at', since7d)
      .limit(5000),
  ])

  if (signupsAllRes.error) throw new Error(signupsAllRes.error.message)
  if (signups7dRes.error) throw new Error(signups7dRes.error.message)
  if (events7dRes.error) throw new Error(events7dRes.error.message)

  const events = events7dRes.data ?? []
  const pageViews = events.filter((e) => e.event_name === 'page_view').length
  const ctaClicks = events.filter((e) => e.event_name === 'cta_click' || e.event_name === 'nav_click')
  const sectionViews = events.filter((e) => e.event_name === 'section_view')
  const formSectionViews = events.filter(
    (e) => e.event_name === 'section_view' && e.target === 'section:waitlist-form'
  ).length
  const formSubmits = events.filter((e) => e.event_name === 'form_submit').length
  const formSuccesses = events.filter((e) => e.event_name === 'form_success').length

  return {
    signupsAll: signupsAllRes.count ?? 0,
    signups7d: signups7dRes.count ?? 0,
    pageViews7d: pageViews,
    topCtas: rankTargets(ctaClicks),
    topSections: rankTargets(sectionViews),
    funnel: {
      pageViews,
      formSectionViews,
      formSubmits,
      formSuccesses,
    },
  }
}

/** Recent waitlist leads (newest first). */
export async function fetchWaitlistLeads(limit = 100): Promise<WaitlistLead[]> {
  const supabase = requireSupabase()
  const { data, error } = await supabase
    .from('waitlist_signups')
    .select(
      'id, company_name, contact_name, email, phone, fleet_size, hear_about, notes, status, created_at'
    )
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw new Error(error.message)
  return (data ?? []) as WaitlistLead[]
}

export type EventRange = '24h' | '7d' | '30d' | 'all'

export interface VisitorInteractionGroup {
  key: string
  ip_address: string | null
  region: string | null
  eventCount: number
  sessionCount: number
  firstSeen: string
  lastSeen: string
  events: WebsiteEventRow[]
}

/** Group events by IP + region (newest visitors first). */
export function groupWebsiteEventsByVisitor(
  events: WebsiteEventRow[]
): VisitorInteractionGroup[] {
  const map = new Map<string, WebsiteEventRow[]>()

  for (const event of events) {
    const ip = event.ip_address?.trim() || 'unknown'
    const region = event.region?.trim() || 'Unknown region'
    const key = `${ip}||${region}`
    const list = map.get(key)
    if (list) list.push(event)
    else map.set(key, [event])
  }

  const groups: VisitorInteractionGroup[] = []
  for (const [key, rows] of map) {
    const sorted = [...rows].sort(
      (a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime()
    )
    const sessions = new Set(sorted.map((e) => e.session_id))
    const times = sorted.map((e) => new Date(e.occurred_at).getTime())
    const [ip, region] = key.split('||')
    groups.push({
      key,
      ip_address: ip === 'unknown' ? null : ip,
      region: region === 'Unknown region' ? null : region,
      eventCount: sorted.length,
      sessionCount: sessions.size,
      firstSeen: new Date(Math.min(...times)).toISOString(),
      lastSeen: new Date(Math.max(...times)).toISOString(),
      events: sorted,
    })
  }

  return groups.sort(
    (a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime()
  )
}

/** Interaction audit history with optional filters. */
export async function fetchWebsiteEvents(options: {
  range: EventRange
  eventName?: string
  limit?: number
}): Promise<WebsiteEventRow[]> {
  const supabase = requireSupabase()
  const limit = options.limit ?? 200

  let query = supabase
    .from('website_events')
    .select('id, session_id, occurred_at, path, event_name, target, ip_address, region, meta, created_at')
    .order('occurred_at', { ascending: false })
    .limit(limit)

  if (options.range === '24h') {
    query = query.gte('occurred_at', daysAgoIso(1))
  } else if (options.range === '7d') {
    query = query.gte('occurred_at', daysAgoIso(7))
  } else if (options.range === '30d') {
    query = query.gte('occurred_at', daysAgoIso(30))
  }

  if (options.eventName) {
    query = query.eq('event_name', options.eventName)
  }

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data ?? []) as WebsiteEventRow[]
}
