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
  ip_address: string | null
  region: string | null
  device_type: 'mobile' | 'desktop' | null
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
  device_type: 'mobile' | 'desktop' | null
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
  /** Average active time on page (ms) across sessions that reported time_on_page (7d). */
  avgTimeOnPageMs7d: number | null
  topCtas: RankedCount[]
  topSections: RankedCount[]
  funnel: {
    pageViews: number
    formSectionViews: number
    formSubmits: number
    formSuccesses: number
  }
}

/** Format milliseconds as a short human duration (e.g. 1m 24s). */
export function formatDurationMs(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return '—'
  const totalSec = Math.round(ms / 1000)
  if (totalSec < 60) return `${totalSec}s`
  const minutes = Math.floor(totalSec / 60)
  const seconds = totalSec % 60
  if (minutes < 60) return seconds ? `${minutes}m ${seconds}s` : `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const remMin = minutes % 60
  return remMin ? `${hours}h ${remMin}m` : `${hours}h`
}

/**
 * Per session, keep the highest active_ms from time_on_page snapshots, then average.
 */
function averageSessionActiveMs(
  rows: Array<{ event_name: string; session_id?: string; meta?: Record<string, unknown> }>
): number | null {
  const maxBySession = new Map<string, number>()
  for (const row of rows) {
    if (row.event_name !== 'time_on_page') continue
    const active = Number(row.meta?.active_ms)
    if (!Number.isFinite(active) || active <= 0) continue
    const key = row.session_id?.trim() || `anon_${maxBySession.size}`
    const prev = maxBySession.get(key) ?? 0
    if (active > prev) maxBySession.set(key, active)
  }
  if (!maxBySession.size) return null
  let sum = 0
  for (const value of maxBySession.values()) sum += value
  return Math.round(sum / maxBySession.size)
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
      .select('event_name, target, session_id, meta')
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
    avgTimeOnPageMs7d: averageSessionActiveMs(events),
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
      'id, company_name, contact_name, email, phone, fleet_size, hear_about, notes, status, ip_address, region, device_type, created_at'
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
  /** Dominant / summary device label for the parent row. */
  deviceLabel: string
  /** True when this IP has a waitlist signup (or form_success). */
  waitlistJoined: boolean
  /** Matching lead email(s) when known. */
  joinedEmails: string[]
  eventCount: number
  sessionCount: number
  /** Max active time on page across this visitor's time_on_page events (ms). */
  timeOnPageMs: number | null
  firstSeen: string
  lastSeen: string
  events: WebsiteEventRow[]
}

/** Summarize devices used within a visitor group. */
function summarizeDevices(rows: WebsiteEventRow[]): string {
  const counts = { mobile: 0, desktop: 0, unknown: 0 }
  for (const row of rows) {
    if (row.device_type === 'mobile') counts.mobile += 1
    else if (row.device_type === 'desktop') counts.desktop += 1
    else counts.unknown += 1
  }
  const parts: string[] = []
  if (counts.mobile) parts.push(counts.desktop || counts.unknown ? `Mobile (${counts.mobile})` : 'Mobile')
  if (counts.desktop) parts.push(counts.mobile || counts.unknown ? `Desktop (${counts.desktop})` : 'Desktop')
  if (counts.unknown && !counts.mobile && !counts.desktop) parts.push('Unknown device')
  else if (counts.unknown && (counts.mobile || counts.desktop)) parts.push(`Unknown (${counts.unknown})`)
  return parts.join(' · ') || 'Unknown device'
}

/** Build a set of IPs that already joined the waitlist. */
export function buildJoinedIpIndex(leads: WaitlistLead[]): Map<string, string[]> {
  const map = new Map<string, string[]>()
  for (const lead of leads) {
    const ip = lead.ip_address?.trim()
    if (!ip) continue
    const emails = map.get(ip) ?? []
    emails.push(lead.email)
    map.set(ip, emails)
  }
  return map
}

/**
 * Group events by IP + region (newest visitors first).
 * Marks `waitlistJoined` when the IP matches a signup lead, or the group has form_success.
 */
export function groupWebsiteEventsByVisitor(
  events: WebsiteEventRow[],
  joinedByIp: Map<string, string[]> = new Map()
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
    const joinedEmails = ip !== 'unknown' ? joinedByIp.get(ip) ?? [] : []
    const hasFormSuccess = sorted.some((e) => e.event_name === 'form_success')
    let timeOnPageMs: number | null = null
    for (const event of sorted) {
      if (event.event_name !== 'time_on_page') continue
      const active = Number(event.meta?.active_ms)
      if (!Number.isFinite(active) || active <= 0) continue
      if (timeOnPageMs == null || active > timeOnPageMs) timeOnPageMs = active
    }
    groups.push({
      key,
      ip_address: ip === 'unknown' ? null : ip,
      region: region === 'Unknown region' ? null : region,
      deviceLabel: summarizeDevices(sorted),
      waitlistJoined: joinedEmails.length > 0 || hasFormSuccess,
      joinedEmails,
      eventCount: sorted.length,
      sessionCount: sessions.size,
      timeOnPageMs,
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
    .select('id, session_id, occurred_at, path, event_name, target, ip_address, region, device_type, meta, created_at')
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
