import { requireSupabase } from '../lib/supabase'

export type EmailTemplate =
  | 'client_invite'
  | 'broker_packet'
  | 'broker_remittance_updated'
  | 'admin_enrollment_alert'
  | 'waitlist_signup_alert'
  | 'waitlist_welcome'
  | 'credyx_batch_error'
  | 'carrier_batch_verified'
  | 'carrier_batch_holds'
  | 'carrier_batch_processed'
  | 'broker_payment_status_inquiry'
  | 'broker_payment_status_followup'
  | 'calendar_event_notice'

/** Attachment for Resend (base64 content). */
export interface EmailAttachment {
  filename: string
  content: string
  contentType?: string
  /** Inline image content-id (use cid:… in HTML). */
  contentId?: string
}

export interface SendTransactionalEmailResult {
  ok: boolean
  error?: string
  stub?: boolean
}

/**
 * Send a transactional email via the send-email Edge Function (Resend).
 * Attachments are optional; content must be base64.
 */
export async function sendTransactionalEmail(
  template: EmailTemplate,
  to: string,
  data: Record<string, string>,
  attachments?: EmailAttachment[]
): Promise<SendTransactionalEmailResult> {
  try {
    const supabase = requireSupabase()
    const { data: result, error } = await supabase.functions.invoke('send-email', {
      body: {
        template,
        to,
        data,
        ...(attachments?.length ? { attachments } : {}),
      },
    })
    if (error) return { ok: false, error: error.message }

    const payload = result as { ok?: boolean; error?: string; stub?: boolean }
    if (!payload?.ok) {
      const message =
        payload?.stub || payload?.error === 'Email not configured'
          ? 'Email not configured (set RESEND_API_KEY on send-email)'
          : payload?.error ?? 'Send failed'
      return { ok: false, error: message, stub: Boolean(payload?.stub) }
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Send failed' }
  }
}

/** Convert a File/Blob to a Resend-ready base64 attachment. */
export async function fileToEmailAttachment(
  file: File | Blob,
  filename: string
): Promise<EmailAttachment> {
  const buffer = await file.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  const contentType =
    file instanceof File
      ? file.type || 'application/octet-stream'
      : (file as Blob).type || 'application/octet-stream'
  return {
    filename,
    content: btoa(binary),
    contentType,
  }
}
