import type { Session, User } from '@supabase/supabase-js'
import { requireSupabase } from '../lib/supabase'

export type SessionPrincipal = 'admin' | 'client' | 'none'

export interface ResolvedSession {
  session: Session | null
  user: User | null
  principal: SessionPrincipal
  clientId: string | null
  isAdmin: boolean
}

function readClientId(user: User | null): string | null {
  if (!user) return null
  const fromMeta = user.app_metadata?.client_id
  if (typeof fromMeta === 'string' && fromMeta.length > 0) return fromMeta
  return null
}

function isAdminUser(user: User | null): boolean {
  return user?.app_metadata?.role === 'admin'
}

/** Resolve principal type and client_id from a Supabase session (JWT claims only). */
export function resolveSession(session: Session | null): ResolvedSession {
  const user = session?.user ?? null
  const isAdmin = isAdminUser(user)
  const clientId = readClientId(user)

  let principal: SessionPrincipal = 'none'
  if (isAdmin) principal = 'admin'
  else if (clientId) principal = 'client'

  return { session, user, principal, clientId, isAdmin }
}

/**
 * Resolve session, falling back to client_auth_links when JWT lacks client_id
 * (e.g. stale token after an admin linked the user).
 */
export async function resolveSessionWithLinks(
  session: Session | null
): Promise<ResolvedSession> {
  const base = resolveSession(session)
  if (base.clientId || base.isAdmin || !base.user) return base

  try {
    const supabase = requireSupabase()
    const { data, error } = await supabase
      .from('client_auth_links')
      .select('client_id')
      .eq('user_id', base.user.id)
      .limit(1)
      .maybeSingle()
    if (error || !data?.client_id) return base
    return {
      ...base,
      clientId: data.client_id as string,
      principal: 'client',
    }
  } catch {
    return base
  }
}

/** Fetch current session from Supabase. */
export async function getCurrentSession(): Promise<ResolvedSession> {
  const supabase = requireSupabase()
  const { data } = await supabase.auth.getSession()
  return resolveSession(data.session)
}

/** Subscribe to auth state changes. Returns unsubscribe function. */
export function onAuthStateChange(
  callback: (resolved: ResolvedSession) => void
): () => void {
  const supabase = requireSupabase()
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(resolveSession(session))
  })
  return () => data.subscription.unsubscribe()
}
