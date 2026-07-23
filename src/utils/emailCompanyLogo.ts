import { fileToEmailAttachment, type EmailAttachment } from '../services/emailService'

/** Content-ID used for inline logo in broker packet emails (cid:…). */
export const EMAIL_LOGO_CONTENT_ID = 'credyx-logo'

/** @deprecated Import from carrierRemittance — fixed pointer copy (no bank numbers). */
export { DEFAULT_BROKER_PACKET_REMITTANCE_MESSAGE } from './carrierRemittance'

/**
 * Inline logo img for transactional HTML (works with Resend content_id attachments).
 */
export function buildInlineCompanyLogoHtml(width = 140): string {
  return `<img src="cid:${EMAIL_LOGO_CONTENT_ID}" alt="Credyx" width="${width}" style="display:block;border:0;outline:none;text-decoration:none;height:auto;max-width:${width}px;" />`
}

/** Text mark when the logo file cannot be loaded. */
export function buildCompanyLogoFallbackHtml(): string {
  return `<div style="font-size:22px;font-weight:700;letter-spacing:0.06em;color:#ffffff;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">CREDYX</div>`
}

/**
 * Load public/Logo.png as an inline email attachment.
 * Returns null if the asset is missing or not an image.
 */
export async function loadCompanyLogoAttachment(): Promise<EmailAttachment | null> {
  try {
    const response = await fetch('/Logo.png')
    const contentType = response.headers.get('content-type') || ''
    if (!response.ok || !contentType.startsWith('image/')) return null

    const blob = await response.blob()
    if (!blob.type.startsWith('image/')) return null

    const attachment = await fileToEmailAttachment(blob, 'Logo.png')
    return {
      ...attachment,
      contentType: blob.type || 'image/png',
      contentId: EMAIL_LOGO_CONTENT_ID,
    }
  } catch {
    return null
  }
}

/**
 * @deprecated Prefer buildInlineCompanyLogoHtml + loadCompanyLogoAttachment.
 * Kept for templates that still reference a hosted URL.
 */
export function buildCompanyLogoHtml(opts?: {
  origin?: string
  alt?: string
  width?: number
}): string {
  const origin =
    opts?.origin?.replace(/\/$/, '') ||
    (typeof import.meta !== 'undefined' &&
      (import.meta.env?.VITE_PUBLIC_APP_URL as string | undefined)?.replace(/\/$/, '')) ||
    (typeof window !== 'undefined' ? window.location.origin : '')

  if (!origin) return buildCompanyLogoFallbackHtml()

  const width = opts?.width ?? 160
  const alt = opts?.alt ?? 'Credyx'
  return `<img src="${origin}/Logo.png" alt="${alt}" width="${width}" style="display:block;max-width:${width}px;height:auto;margin:0;border:0;" />`
}
