import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

export type LookupAuth =
  | { ok: true; clientId: string | null; isPublic: boolean }
  | { ok: false; status: number; error: string }

/**
 * Signed-in admin or carrier, or the public MC Check page.
 * The public page sends the project anon or publishable key and has no user.
 */
export async function authorizeLookup(req: Request): Promise<LookupAuth> {
  const authHeader = req.headers.get('Authorization')
  const apiKey = req.headers.get('apikey')?.trim() ?? ''
  if (!authHeader && !apiKey) {
    return { ok: false, status: 401, error: 'Unauthorized' }
  }

  if (authHeader) {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )
    const { data, error } = await supabase.auth.getUser()
    if (!error && data.user) {
      const meta = data.user.app_metadata ?? {}
      const clientId = typeof meta.client_id === 'string' && meta.client_id ? meta.client_id : null
      if (meta.role !== 'admin' && !clientId) {
        return { ok: false, status: 403, error: 'Forbidden' }
      }
      return { ok: true, clientId, isPublic: false }
    }
  }

  const anon = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const publishable = Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? ''
  const bearer = authHeader?.replace(/^Bearer\s+/i, '').trim() ?? ''
  const presented = [bearer, apiKey].filter(Boolean)
  const known = [anon, publishable].filter(Boolean)
  if (known.length > 0 && presented.some((value) => known.includes(value))) {
    return { ok: true, clientId: null, isPublic: true }
  }
  if (presented.some((value) => value.startsWith('sb_publishable_'))) {
    return { ok: true, clientId: null, isPublic: true }
  }

  return { ok: false, status: 401, error: 'Unauthorized' }
}
