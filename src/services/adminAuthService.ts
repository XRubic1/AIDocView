import { requireSupabase } from '../lib/supabase'
import { getCurrentSession } from './sessionService'

export interface AdminAuthResult {
  ok: boolean
  error?: string
}

/** Sign in admin user — requires app_metadata.role = 'admin'. */
export async function signInAdmin(email: string, password: string): Promise<AdminAuthResult> {
  const supabase = requireSupabase()
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) return { ok: false, error: error.message }

  const role = data.user?.app_metadata?.role
  if (role !== 'admin') {
    await supabase.auth.signOut()
    return {
      ok: false,
      error:
        'This account does not have admin access. In Supabase → Authentication → Users, set App Metadata to {"role":"admin"} for this email (or run npm run create-admin).',
    }
  }

  return { ok: true }
}

/** Sign out current session. */
export async function signOutAdmin(): Promise<void> {
  const supabase = requireSupabase()
  await supabase.auth.signOut()
}

/** Returns true when session belongs to an admin user. */
export async function isAdminAuthenticated(): Promise<boolean> {
  const resolved = await getCurrentSession()
  return resolved.isAdmin && resolved.session !== null
}

export { getCurrentSession, onAuthStateChange, resolveSession } from './sessionService'
export type { ResolvedSession, SessionPrincipal } from './sessionService'
