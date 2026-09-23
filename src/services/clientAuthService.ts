import { requireSupabase } from '../lib/supabase'
import { clearPasswordSetupRequired, getCurrentSession } from './sessionService'

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

/** Send password reset email (Forgot password). Lands on /client/setup-password. */
export async function requestClientPasswordReset(email: string): Promise<ClientAuthResult> {
  const supabase = requireSupabase()
  const origin = window.location.origin.replace(/\/$/, '')
  const redirectTo = `${origin}/client/setup-password`
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
    redirectTo,
  })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

/** Update password for authenticated user and clear first-login gate. */
export async function updateClientPassword(newPassword: string): Promise<ClientAuthResult> {
  const supabase = requireSupabase()
  const { error } = await supabase.auth.updateUser({
    password: newPassword,
    data: { must_set_password: false },
  })
  if (error) return { ok: false, error: error.message }
  clearPasswordSetupRequired()
  return { ok: true }
}

async function readFunctionError(error: unknown, data: unknown): Promise<string> {
  const payload = data as { error?: string; message?: string } | null
  if (payload?.error) return payload.error
  if (payload?.message) return payload.message
  if (error && typeof error === 'object' && 'context' in error) {
    const ctx = (error as { context?: unknown }).context
    if (ctx && typeof ctx === 'object' && 'json' in ctx && typeof (ctx as Response).json === 'function') {
      try {
        const body = (await (ctx as Response).clone().json()) as { error?: string; message?: string }
        if (body?.error) return body.error
        if (body?.message) return body.message
      } catch {
        /* ignore */
      }
    }
  }
  if (error instanceof Error && error.message) return error.message
  return 'Provisioning failed'
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
  const result = data as { ok?: boolean; error?: string }
  if (error) return { ok: false, error: await readFunctionError(error, data) }
  if (!result?.ok) return { ok: false, error: result?.error ?? 'Provisioning failed' }
  return { ok: true, clientId }
}

export { getCurrentSession, onAuthStateChange } from './sessionService'
