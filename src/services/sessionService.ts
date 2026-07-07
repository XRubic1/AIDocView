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

/** Resolve principal type and client_id from a Supabase session. */
export function resolveSession(session: Session | null): ResolvedSession {
  const user = session?.user ?? null
  const isAdmin = isAdminUser(user)
  const clientId = readClientId(user)

  let principal: SessionPrincipal = 'none'
  if (isAdmin) principal = 'admin'
  else if (clientId) principal = 'client'

  return { session, user, principal, clientId, isAdmin }
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
