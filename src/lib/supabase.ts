import { createClient, type SupabaseClient } from '@supabase/supabase-js'

declare const __CREDYX_SUPABASE_URL__: string
declare const __CREDYX_SUPABASE_KEY__: string

/** First non-empty string from build define + Vite env fallbacks. */
function envString(...values: Array<string | undefined>): string {
  for (const value of values) {
    const trimmed = value?.trim()
    if (trimmed) return trimmed
  }
  return ''
}

// Injected at build time from SUPABASE_* or VITE_* (see vite.config.ts).
const url = envString(
  typeof __CREDYX_SUPABASE_URL__ !== 'undefined' ? __CREDYX_SUPABASE_URL__ : undefined,
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.SUPABASE_URL
)
const key = envString(
  typeof __CREDYX_SUPABASE_KEY__ !== 'undefined' ? __CREDYX_SUPABASE_KEY__ : undefined,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  import.meta.env.SUPABASE_PUBLISHABLE_KEY,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  import.meta.env.SUPABASE_ANON_KEY
)

let client: SupabaseClient | null = null

export class SupabaseConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SupabaseConfigError'
  }
}

/** Whether required Supabase env vars are present. */
export function isSupabaseConfigured(): boolean {
  return Boolean(url && key)
}

/** Browser Supabase client — null when env vars are missing. */
export function getSupabase(): SupabaseClient | null {
  if (!url || !key) return null
  if (!client) client = createClient(url, key)
  return client
}

/** Supabase client or throw — use for production auth/data paths. */
export function requireSupabase(): SupabaseClient {
  const sb = getSupabase()
  if (!sb) {
    throw new SupabaseConfigError(
      'Supabase is not configured. Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY (or VITE_ equivalents) in your environment, then redeploy.'
    )
  }
  return sb
}

export function getSupabaseConfigError(): string | null {
  if (isSupabaseConfigured()) return null
  const missing: string[] = []
  if (!url) missing.push('SUPABASE_URL (or VITE_SUPABASE_URL)')
  if (!key) missing.push('SUPABASE_PUBLISHABLE_KEY (or VITE_SUPABASE_PUBLISHABLE_KEY / SUPABASE_ANON_KEY)')
  return `Missing required environment variables: ${missing.join(', ')}. After setting them on Vercel, trigger a new deploy (values are baked in at build time).`
}
