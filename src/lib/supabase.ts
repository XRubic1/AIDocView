import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY

let client: SupabaseClient | null = null

/** Browser Supabase client — null when env vars are missing. */
export function getSupabase(): SupabaseClient | null {
  if (!url || !key) return null
  if (!client) client = createClient(url, key)
  return client
}

export function isSupabaseConfigured(): boolean {
  return Boolean(url && key)
}
