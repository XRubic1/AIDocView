import { requireSupabase } from '../lib/supabase'

export type EmailTemplate =
  | 'client_invite'
  | 'broker_packet'
  | 'admin_enrollment_alert'
  | 'credyx_batch_error'
  | 'carrier_batch_verified'
  | 'carrier_batch_holds'
  | 'broker_payment_status_inquiry'
  | 'broker_payment_status_followup'

export async function sendTransactionalEmail(
  template: EmailTemplate,
  to: string,
  data: Record<string, string>
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = requireSupabase()
    const { data: result, error } = await supabase.functions.invoke('send-email', {
      body: { template, to, data },
    })
    if (error) return { ok: false, error: error.message }
    const payload = result as { ok?: boolean; error?: string; stub?: boolean }
    if (!payload?.ok) return { ok: false, error: payload?.error ?? 'Send failed' }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Send failed' }
  }
}
