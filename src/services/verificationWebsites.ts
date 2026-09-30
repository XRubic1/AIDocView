/**
 * Admin list of websites used when a broker’s verification type is Web.
 * Stored in platform_settings so every broker dropdown shares the same list.
 */
import { getSupabase, isSupabaseConfigured } from '../lib/supabase'

export type VerificationWebsite = {
  id: string
  name: string
  url: string
}

const SETTINGS_KEY = 'verification_websites'

let cached: VerificationWebsite[] = []

export function listVerificationWebsites(): VerificationWebsite[] {
  return cached
}

export function verificationWebsiteById(id: string | null | undefined): VerificationWebsite | null {
  if (!id) return null
  return cached.find((site) => site.id === id) ?? null
}

export function normalizeVerificationWebsites(value: unknown): VerificationWebsite[] {
  const raw =
    value && typeof value === 'object' && Array.isArray((value as { sites?: unknown }).sites)
      ? (value as { sites: unknown[] }).sites
      : []
  const sites: VerificationWebsite[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const row = item as { id?: unknown; name?: unknown; url?: unknown }
    const name = typeof row.name === 'string' ? row.name.trim() : ''
    const url = typeof row.url === 'string' ? row.url.trim() : ''
    if (!name) continue
    const id = typeof row.id === 'string' && row.id.trim() ? row.id.trim() : `web-${sites.length + 1}`
    sites.push({ id, name, url })
  }
  return sites
}

export function websiteHref(url: string): string | null {
  const trimmed = url.trim()
  if (!trimmed) return null
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  if (/^[\w.-]+\.[a-z]{2,}([/?#].*)?$/i.test(trimmed)) return `https://${trimmed}`
  return null
}

export async function loadVerificationWebsites(): Promise<VerificationWebsite[]> {
  if (!isSupabaseConfigured()) return cached
  const supabase = getSupabase()
  if (!supabase) return cached
  const { data, error } = await supabase
    .from('platform_settings')
    .select('value')
    .eq('key', SETTINGS_KEY)
    .maybeSingle()
  if (error || !data?.value) return cached
  cached = normalizeVerificationWebsites(data.value)
  return cached
}

export async function saveVerificationWebsites(
  sites: VerificationWebsite[]
): Promise<VerificationWebsite[]> {
  const next = normalizeVerificationWebsites({ sites })
  cached = next
  if (!isSupabaseConfigured()) return next
  const supabase = getSupabase()
  if (!supabase) return next
  const { error } = await supabase.from('platform_settings').upsert({
    key: SETTINGS_KEY,
    value: { sites: next },
    updated_at: new Date().toISOString(),
  })
  if (error) throw new Error(error.message)
  return next
}

export async function addVerificationWebsite(
  name: string,
  url: string
): Promise<VerificationWebsite> {
  const label = name.trim()
  if (!label) throw new Error('Enter a website name.')
  const site: VerificationWebsite = {
    id: `web-${Date.now()}`,
    name: label,
    url: url.trim(),
  }
  await saveVerificationWebsites([...cached, site])
  return site
}
