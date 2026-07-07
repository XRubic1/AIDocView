import { requireSupabase } from '../lib/supabase'

export type EmailTemplate = 'client_invite' | 'broker_packet' | 'admin_enrollment_alert'

export async function sendTransactionalEmail(
  template: EmailTemplate,
  to: string,
  data: Record<string, string>
): Promise<{ ok: boolean; error?: string }> {
  const supabase = requireSupabase()
  const { data: result, error } = await supabase.functions.invoke('send-email', {
    body: { template, to, data },
  })
  if (error) return { ok: false, error: error.message }
  const payload = result as { ok?: boolean; error?: string }
  if (!payload?.ok) return { ok: false, error: payload?.error ?? 'Send failed' }
  return { ok: true }
}
