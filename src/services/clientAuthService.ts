import { requireSupabase } from '../lib/supabase'
import { getCurrentSession } from './sessionService'

export interface ClientAuthResult {
  ok: boolean
  error?: string
  clientId?: string
}

/** Create Supabase Auth user and link to Credyx client (enrollment). */
export async function enrollClientAuth(
  email: string,
  password: string,
  clientId: string
): Promise<ClientAuthResult> {
  const supabase = requireSupabase()

  const { data, error } = await supabase.auth.signUp({ email, password })
  if (error) return { ok: false, error: error.message }

  const userId = data.user?.id
  if (!userId) return { ok: false, error: 'Account created but user id missing.' }

  const { error: linkError } = await supabase.rpc('credyx_complete_enrollment', {
    p_client_id: clientId,
    p_user_id: userId,
  })
  if (linkError) return { ok: false, error: linkError.message }

  if (!data.session) {
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
    if (signInError) {
      return {
        ok: false,
        error:
          'Account created but sign-in failed. Confirm your email if required, then use Client Login.',
      }
    }
  }

  return { ok: true, clientId }
}

/** Sign in with Supabase Auth; returns client_id on success. */
export async function signInClientAuth(
  email: string,
  password: string
): Promise<ClientAuthResult> {
  const supabase = requireSupabase()

  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) return { ok: false, error: error.message }

  const resolved = await getCurrentSession()
  if (resolved.isAdmin) {
    await supabase.auth.signOut()
    return { ok: false, error: 'Use the admin login for this account.' }
  }
  if (!resolved.clientId) {
    await supabase.auth.signOut()
    return { ok: false, error: 'No client account linked to this user.' }
  }

  return { ok: true, clientId: resolved.clientId }
}

/** Sign out Supabase session. */
export async function signOutClientAuth(): Promise<void> {
  const supabase = requireSupabase()
  await supabase.auth.signOut()
}

/** Resolve client_id from current session. */
export async function getClientIdFromSession(): Promise<string | null> {
  const resolved = await getCurrentSession()
  return resolved.clientId
}

/** Send password reset email. */
export async function requestClientPasswordReset(email: string): Promise<ClientAuthResult> {
  const supabase = requireSupabase()
  const redirectTo = `${window.location.origin}/client/login`
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

/** Update password for authenticated user. */
export async function updateClientPassword(newPassword: string): Promise<ClientAuthResult> {
  const supabase = requireSupabase()
  const { error } = await supabase.auth.updateUser({ password: newPassword })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

/** Admin-side: create auth user and link (invite-on-approval). Uses Edge Function. */
export async function provisionClientAuthAccount(
  clientId: string,
  email: string
): Promise<ClientAuthResult> {
  const supabase = requireSupabase()
  const { data, error } = await supabase.functions.invoke('provision-client-auth', {
    body: { clientId, email },
  })
  if (error) return { ok: false, error: error.message }
  const result = data as { ok?: boolean; error?: string }
  if (!result?.ok) return { ok: false, error: result?.error ?? 'Provisioning failed' }
  return { ok: true, clientId }
}

export { getCurrentSession, onAuthStateChange } from './sessionService'
