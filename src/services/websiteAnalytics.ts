import { getSupabase, isSupabaseConfigured } from '../lib/supabase'

const SESSION_KEY = 'credyx_wl_session'
const GEO_KEY = 'credyx_wl_geo'
const FLUSH_MS = 3000
const MAX_QUEUE = 40

export type WebsiteEventName =
  | 'page_view'
  | 'cta_click'
  | 'nav_click'
  | 'section_view'
  | 'form_submit'
  | 'form_success'
  | 'form_error'

interface VisitorGeo {
  ip_address: string | null
  region: string | null
}

interface QueuedEvent {
  session_id: string
  occurred_at: string
  path: string
  event_name: WebsiteEventName
  target: string | null
  meta: Record<string, string | number | boolean>
  ip_address: string | null
  region: string | null
}

let queue: QueuedEvent[] = []
let flushTimer: ReturnType<typeof setTimeout> | null = null
let listenersBound = false
let pageViewSent = false
let cachedGeo: VisitorGeo | null = null
let geoPromise: Promise<VisitorGeo> | null = null

/** Anonymous session id for this browser tab (sessionStorage). */
export function getAnalyticsSessionId(): string {
  try {
    const existing = sessionStorage.getItem(SESSION_KEY)
    if (existing) return existing
    const id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `wl_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
    sessionStorage.setItem(SESSION_KEY, id)
    return id
  } catch {
    return `wl_${Date.now()}`
  }
}

function currentPath(): string {
  try {
    return window.location.pathname || '/'
  } catch {
    return '/'
  }
}

function readCachedGeo(): VisitorGeo | null {
  if (cachedGeo) return cachedGeo
  try {
    const raw = sessionStorage.getItem(GEO_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as VisitorGeo
    if (parsed && typeof parsed === 'object') {
      cachedGeo = {
        ip_address: parsed.ip_address ?? null,
        region: parsed.region ?? null,
      }
      return cachedGeo
    }
  } catch {
    /* ignore */
  }
  return null
}

function writeCachedGeo(geo: VisitorGeo): void {
  cachedGeo = geo
  try {
    sessionStorage.setItem(GEO_KEY, JSON.stringify(geo))
  } catch {
    /* ignore */
  }
}

/**
 * Resolve public IP + region once per tab via geojs (CORS-friendly).
 * Falls back to nulls if the lookup fails.
 */
async function resolveVisitorGeo(): Promise<VisitorGeo> {
  const existing = readCachedGeo()
  if (existing) return existing
  if (geoPromise) return geoPromise

  geoPromise = (async () => {
    try {
      const controller = new AbortController()
      const timeout = window.setTimeout(() => controller.abort(), 4000)
      const res = await fetch('https://get.geojs.io/v1/ip/geo.json', {
        signal: controller.signal,
      })
      window.clearTimeout(timeout)
      if (!res.ok) throw new Error(`geo lookup ${res.status}`)
      const data = (await res.json()) as {
        ip?: string
        city?: string
        region?: string
        country?: string
        country_code?: string
      }
      const parts = [data.city, data.region, data.country || data.country_code].filter(
        (p): p is string => Boolean(p && String(p).trim())
      )
      const geo: VisitorGeo = {
        ip_address: data.ip?.trim() || null,
        region: parts.length ? parts.join(', ') : null,
      }
      writeCachedGeo(geo)
      return geo
    } catch {
      const empty: VisitorGeo = { ip_address: null, region: null }
      // Don't cache failures permanently — allow a later retry on next event batch.
      geoPromise = null
      return empty
    }
  })()

  return geoPromise
}

function bindFlushListeners() {
  if (listenersBound || typeof window === 'undefined') return
  listenersBound = true

  const flush = () => {
    void flushWebsiteEvents()
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush()
  })
  window.addEventListener('pagehide', flush)
}

function scheduleFlush() {
  if (flushTimer) return
  flushTimer = setTimeout(() => {
    flushTimer = null
    void flushWebsiteEvents()
  }, FLUSH_MS)
}

/** Flush queued events to Supabase (best-effort, silent on failure). */
export async function flushWebsiteEvents(): Promise<void> {
  if (!queue.length || !isSupabaseConfigured()) {
    queue = []
    return
  }

  // Ensure geo is attached before insert when possible.
  const geo = await resolveVisitorGeo()
  const batch = queue.splice(0, queue.length).map((event) => ({
    ...event,
    ip_address: event.ip_address ?? geo.ip_address,
    region: event.region ?? geo.region,
  }))

  const supabase = getSupabase()
  if (!supabase) return

  try {
    const { error } = await supabase.from('website_events').insert(batch)
    if (error) {
      queue = [...batch.slice(0, 10), ...queue].slice(0, MAX_QUEUE)
    }
  } catch {
    queue = [...batch.slice(0, 10), ...queue].slice(0, MAX_QUEUE)
  }
}

/**
 * Track a marketing-site interaction.
 * Events are batched and sent to `website_events` — fails silently if offline/unconfigured.
 */
export function trackWebsiteEvent(
  eventName: WebsiteEventName,
  target?: string | null,
  meta?: Record<string, string | number | boolean>
): void {
  if (typeof window === 'undefined') return
  if (!isSupabaseConfigured()) return

  bindFlushListeners()
  void resolveVisitorGeo()

  const geo = readCachedGeo()
  const event: QueuedEvent = {
    session_id: getAnalyticsSessionId(),
    occurred_at: new Date().toISOString(),
    path: currentPath(),
    event_name: eventName,
    target: target ?? null,
    meta: meta ?? {},
    ip_address: geo?.ip_address ?? null,
    region: geo?.region ?? null,
  }

  queue.push(event)
  if (queue.length >= MAX_QUEUE) {
    void flushWebsiteEvents()
  } else {
    scheduleFlush()
  }
}

/** Fire a single page_view per tab session (includes viewport + referrer once). */
export function trackPageViewOnce(): void {
  if (pageViewSent) return
  pageViewSent = true

  const meta: Record<string, string | number | boolean> = {}
  try {
    meta.viewport_w = window.innerWidth
    meta.viewport_h = window.innerHeight
    if (document.referrer) meta.referrer = document.referrer.slice(0, 300)
  } catch {
    /* ignore */
  }

  // Kick off geo early so page_view flush usually includes IP/region.
  void resolveVisitorGeo().finally(() => {
    trackWebsiteEvent('page_view', null, meta)
  })
}
