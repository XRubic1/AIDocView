/**
 * Credyx mailbox addresses stored in platform_settings (admin Settings → Addresses).
 * Edge send-email prefers these over identical RESEND_FROM_* when set.
 */

export type EmailMailboxSettings = {
  /** Carrier / ops From mailbox (invites, batch updates). */
  opsEmail: string
  /** Broker / billing From mailbox (PPW, chase). */
  billingEmail: string
  /** Staff alerts From (optional; falls back to ops). */
  adminEmail: string
  /** Fallback / notifications From. */
  notificationsEmail: string
  /** Reply-To for broker mail. */
  replyToBroker: string
  /** Reply-To for carrier mail. */
  replyToCarrier: string
  /** Contact line in templates / welcome emails. */
  contactEmail: string
  /** Remittance advice address shown on invoices / PPW. */
  remittanceAdviceEmail: string
  /** Inbound collections mailbox. */
  collectionsInbox: string
  /** Inbound remittance mailbox. */
  remittanceInbox: string
}

export const DEFAULT_EMAIL_MAILBOXES: EmailMailboxSettings = {
  opsEmail: 'ops@credyx.net',
  billingEmail: 'billing@credyx.net',
  adminEmail: 'ops@credyx.net',
  notificationsEmail: 'notifications@credyx.net',
  replyToBroker: 'billing@credyx.net',
  replyToCarrier: 'ops@credyx.net',
  contactEmail: 'ops@credyx.net',
  remittanceAdviceEmail: 'billing@credyx.net',
  collectionsInbox: 'collections@credyx.net',
  remittanceInbox: 'remittance@credyx.net',
}

/** Mutable runtime copy (hydrated from platform_settings). */
export const EMAIL_MAILBOXES: EmailMailboxSettings = { ...DEFAULT_EMAIL_MAILBOXES }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** True when value looks like a usable email. */
export function isValidMailboxEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim())
}

/** Normalize partial settings into a full mailbox map. */
export function normalizeEmailMailboxes(
  value: Partial<EmailMailboxSettings> | null | undefined
): EmailMailboxSettings {
  const d = DEFAULT_EMAIL_MAILBOXES
  const pick = (key: keyof EmailMailboxSettings): string => {
    const raw = value?.[key]
    const trimmed = typeof raw === 'string' ? raw.trim() : ''
    return isValidMailboxEmail(trimmed) ? trimmed.toLowerCase() : d[key]
  }
  return {
    opsEmail: pick('opsEmail'),
    billingEmail: pick('billingEmail'),
    adminEmail: pick('adminEmail'),
    notificationsEmail: pick('notificationsEmail'),
    replyToBroker: pick('replyToBroker'),
    replyToCarrier: pick('replyToCarrier'),
    contactEmail: pick('contactEmail'),
    remittanceAdviceEmail: pick('remittanceAdviceEmail'),
    collectionsInbox: pick('collectionsInbox'),
    remittanceInbox: pick('remittanceInbox'),
  }
}

/** Build a Resend-style From header. */
export function formatResendFrom(displayName: string, email: string): string {
  return `${displayName} <${email.trim()}>`
}
