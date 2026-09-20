import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/** First non-empty env value from Vite-exposed keys. */
function envString(...keys: string[]): string {
  const env = import.meta.env as Record<string, string | undefined>
  for (const key of keys) {
    const value = env[key]?.trim()
    if (value) return value
  }
  return ''
}

// Prefer VITE_* (local/.env); also accept plain SUPABASE_* (Vercel / hosting).
const url = envString('VITE_SUPABASE_URL', 'SUPABASE_URL')
const key = envString(
  'VITE_SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_PUBLISHABLE_KEY',
  'VITE_SUPABASE_ANON_KEY',
  'SUPABASE_ANON_KEY'
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
      'Supabase is not configured. Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY (or VITE_ equivalents) in your environment.'
    )
  }
  return sb
}

export function getSupabaseConfigError(): string | null {
  if (isSupabaseConfigured()) return null
  const missing: string[] = []
  if (!url) missing.push('SUPABASE_URL (or VITE_SUPABASE_URL)')
  if (!key) missing.push('SUPABASE_PUBLISHABLE_KEY (or VITE_SUPABASE_PUBLISHABLE_KEY)')
  return `Missing required environment variables: ${missing.join(', ')}`
}
