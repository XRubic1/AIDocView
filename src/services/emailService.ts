import { requireSupabase } from '../lib/supabase'

import type { EmailTemplateId } from '../config/emailTemplateDefaults'

export type EmailTemplate = EmailTemplateId

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
  id?: string
}

export interface SendTransactionalEmailOptions {
  attachments?: EmailAttachment[]
  /** Prefix subject with [TEST] so preview sends are obvious. */
  isTest?: boolean
  /** Admin-only: send unsaved editor HTML instead of the saved DB template. */
  overrideSubject?: string
  overrideHtml?: string
}

function friendlySendError(raw: string, stub?: boolean): string {
  if (stub || /email not configured/i.test(raw)) {
    return 'Email is not configured on this Supabase project. Add RESEND_API_KEY on Edge Function secrets for send-email, then deploy the function.'
  }
  if (/unknown template/i.test(raw)) {
    return 'send-email on this project is out of date (missing the document-issue template). Deploy supabase/functions/send-email and try again.'
  }
  try {
    const parsed = JSON.parse(raw) as { message?: string; error?: string }
    if (parsed.message) return parsed.message
    if (typeof parsed.error === 'string') return parsed.error
  } catch {
    /* not JSON */
  }
  return raw.length > 280 ? `${raw.slice(0, 280)}…` : raw
}

async function errorFromInvoke(
  error: unknown,
  result: unknown
): Promise<{ message: string; stub?: boolean }> {
  const payload = result as { ok?: boolean; error?: string; stub?: boolean; msg?: string } | null
  if (payload?.stub || payload?.error === 'Email not configured') {
    return { message: friendlySendError(payload.error ?? '', true), stub: true }
  }
  if (payload?.error) {
    return { message: friendlySendError(payload.error, payload.stub), stub: payload.stub }
  }

  if (error && typeof error === 'object' && 'context' in error) {
    const ctx = (error as { context?: unknown }).context
    if (ctx && typeof ctx === 'object' && 'json' in ctx && typeof (ctx as Response).json === 'function') {
      try {
        const body = (await (ctx as Response).clone().json()) as {
          error?: string
          stub?: boolean
          message?: string
        }
        if (body?.stub || body?.error === 'Email not configured') {
          return { message: friendlySendError(body.error ?? '', true), stub: true }
        }
        if (body?.error) return { message: friendlySendError(body.error), stub: body.stub }
        if (body?.message) return { message: friendlySendError(body.message) }
      } catch {
        /* ignore */
      }
    }
  }

  if (error instanceof Error && error.message) {
    return { message: friendlySendError(error.message) }
  }
  return { message: 'Send failed' }
}

/**
 * Send a transactional email via the send-email Edge Function (Resend).
 * Attachments are optional; content must be base64.
 */
export async function sendTransactionalEmail(
  template: EmailTemplate,
  to: string,
  data: Record<string, string>,
  attachmentsOrOptions?: EmailAttachment[] | SendTransactionalEmailOptions
): Promise<SendTransactionalEmailResult> {
  const options: SendTransactionalEmailOptions = Array.isArray(attachmentsOrOptions)
    ? { attachments: attachmentsOrOptions }
    : attachmentsOrOptions ?? {}

  try {
    const supabase = requireSupabase()
    const { data: result, error } = await supabase.functions.invoke('send-email', {
      body: {
        template,
        to,
        data,
        ...(options.attachments?.length ? { attachments: options.attachments } : {}),
        ...(options.isTest ? { isTest: true } : {}),
        ...(options.overrideSubject ? { overrideSubject: options.overrideSubject } : {}),
        ...(options.overrideHtml ? { overrideHtml: options.overrideHtml } : {}),
      },
    })

    if (error) {
      const parsed = await errorFromInvoke(error, result)
      return { ok: false, error: parsed.message, stub: parsed.stub }
    }

    const payload = result as { ok?: boolean; error?: string; stub?: boolean; id?: string }
    if (!payload?.ok) {
      const parsed = await errorFromInvoke(null, payload)
      return { ok: false, error: parsed.message, stub: parsed.stub || Boolean(payload?.stub) }
    }
    return { ok: true, id: payload.id }
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
