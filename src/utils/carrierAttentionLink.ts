import type { Invoice } from '../types/invoice'

/** Public app origin for email links (no trailing slash). */
export function defaultPortalLink(): string {
  const fromEnv =
    typeof import.meta !== 'undefined'
      ? (import.meta.env?.VITE_PUBLIC_APP_URL as string | undefined)?.replace(/\/$/, '')
      : ''
  if (fromEnv) return fromEnv
  if (typeof window !== 'undefined') return window.location.origin
  return 'https://app.credyx.net'
}

/** Client portal path: holds that need paperwork, optional invoice + upload. */
export function buildCarrierAttentionPath(invoice?: Pick<Invoice, 'id' | 'invoice_number'>): string {
  const params = new URLSearchParams()
  const ref = invoice?.invoice_number?.trim() || invoice?.id?.trim()
  if (ref) {
    params.set('invoice', ref)
    params.set('upload', '1')
  }
  const qs = params.toString()
  return qs ? `/client/attention?${qs}` : '/client/attention'
}

/** Absolute URL for document-issue emails (sign-in required). */
export function buildCarrierAttentionUrl(invoice?: Pick<Invoice, 'id' | 'invoice_number'>): string {
  return `${defaultPortalLink()}${buildCarrierAttentionPath(invoice)}`
}
