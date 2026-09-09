/**
 * Placeholder data for the Settings “Client welcome” email (client_invite).
 */
import type { Client } from '../types/client'
import { defaultPortalLink } from './carrierAttentionLink'
import { buildCompanyLogoHtml } from './emailCompanyLogo'

export const CREDYX_WEBSITE_URL = 'https://credyx.com'
export const CREDYX_CONTACT_EMAIL = 'ops@credyx.net'

/** Human-readable collection fee for welcome copy (e.g. 2.5% or $50.00 flat). */
export function formatLiveFeeTermsLabel(feeTerms: Client['fee_terms'] | null | undefined): string {
  if (!feeTerms) return '—'
  if (feeTerms.fee_type === 'flat') {
    return `$${Number(feeTerms.flat_fee_amount ?? 0).toFixed(2)} flat`
  }
  if (feeTerms.fee_percentage == null && !feeTerms.fee_type) return '—'
  return `${feeTerms.fee_percentage ?? 0}%`
}

export function buildClientWelcomeTemplateData(
  client: Pick<Client, 'name' | 'contact_person' | 'fee_terms'>,
  options?: {
    portalLink?: string
    setupLink?: string
    websiteUrl?: string
    contactEmail?: string
    companyLogoHtml?: string
    needsPasswordSetup?: boolean
  }
): Record<string, string> {
  const portalLink = (options?.portalLink ?? `${defaultPortalLink()}/client/login`).replace(/\/$/, '')
  const setupLink = options?.setupLink ?? portalLink
  const needsSetup = options?.needsPasswordSetup ?? setupLink !== portalLink
  const feeTermsLabel = formatLiveFeeTermsLabel(client.fee_terms)
  const pct = client.fee_terms?.fee_percentage
  return {
    contactName: client.contact_person?.trim() || 'there',
    clientName: client.name?.trim() || 'your company',
    feeTermsLabel,
    feePercentage: pct == null ? '' : String(pct),
    websiteUrl: options?.websiteUrl ?? CREDYX_WEBSITE_URL,
    portalLink,
    contactEmail: options?.contactEmail ?? CREDYX_CONTACT_EMAIL,
    setupLink,
    inviteLink: setupLink,
    ctaLabel: needsSetup ? 'Create your password' : 'Sign in to your portal',
    companyLogoHtml: options?.companyLogoHtml ?? buildCompanyLogoHtml(),
  }
}
