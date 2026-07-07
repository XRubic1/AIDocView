import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY

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
      'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in your environment.'
    )
  }
  return sb
}

export function getSupabaseConfigError(): string | null {
  if (isSupabaseConfigured()) return null
  const missing: string[] = []
  if (!url) missing.push('VITE_SUPABASE_URL')
  if (!key) missing.push('VITE_SUPABASE_PUBLISHABLE_KEY')
  return `Missing required environment variables: ${missing.join(', ')}`
}
