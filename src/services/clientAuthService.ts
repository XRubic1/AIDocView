import { getSupabase, isSupabaseConfigured } from '../lib/supabase'

/** Create Supabase Auth user and link to Credyx client. */
export async function enrollClientAuth(
  email: string,
  password: string,
  clientId: string
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured()) return { ok: true }

  const supabase = getSupabase()
  if (!supabase) return { ok: true }

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

  return { ok: true }
}

/** Sign in with Supabase Auth; returns session on success. */
export async function signInClientAuth(
  email: string,
  password: string
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured()) return { ok: true }

  const supabase = getSupabase()
  if (!supabase) return { ok: true }

  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

/** Sign out Supabase session. */
export async function signOutClientAuth(): Promise<void> {
  const supabase = getSupabase()
  if (!supabase) return
  await supabase.auth.signOut()
}
