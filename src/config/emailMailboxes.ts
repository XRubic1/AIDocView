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
  /**
   * Extra From addresses for Blueprints Then-do (and similar).
   * Must be @credyx.net (or other Resend-verified domain).
   */
  extraFromEmails: string[]
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
  extraFromEmails: [],
}

/** Mutable runtime copy (hydrated from platform_settings). */
export const EMAIL_MAILBOXES: EmailMailboxSettings = { ...DEFAULT_EMAIL_MAILBOXES }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** True when value looks like a usable email. */
export function isValidMailboxEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim())
}

function normalizeExtraFromEmails(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of raw) {
    if (typeof item !== 'string') continue
    const email = item.trim().toLowerCase()
    if (!isValidMailboxEmail(email) || seen.has(email)) continue
    seen.add(email)
    out.push(email)
  }
  return out
}

/** Normalize partial settings into a full mailbox map. */
export function normalizeEmailMailboxes(
  value: Partial<EmailMailboxSettings> | null | undefined
): EmailMailboxSettings {
  const d = DEFAULT_EMAIL_MAILBOXES
  const pick = (key: keyof Omit<EmailMailboxSettings, 'extraFromEmails'>): string => {
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
    extraFromEmails: normalizeExtraFromEmails(value?.extraFromEmails),
  }
}

/** Build a Resend-style From header. */
export function formatResendFrom(displayName: string, email: string): string {
  return `${displayName} <${email.trim()}>`
}

export type BlueprintFromOption = {
  email: string
  label: string
  /** Custom extras can be removed from Settings / picker. */
  removable: boolean
}

/** From options for Blueprints Then-do — shows real addresses. */
export function listBlueprintFromOptions(
  settings: EmailMailboxSettings = EMAIL_MAILBOXES
): BlueprintFromOption[] {
  const core: BlueprintFromOption[] = [
    { email: settings.billingEmail, label: 'Billing', removable: false },
    { email: settings.opsEmail, label: 'Ops', removable: false },
    {
      email: settings.adminEmail || settings.opsEmail,
      label: 'Admin',
      removable: false,
    },
    {
      email: settings.notificationsEmail,
      label: 'Notifications',
      removable: false,
    },
  ]
  const seen = new Set(core.map((o) => o.email.toLowerCase()))
  const extras: BlueprintFromOption[] = []
  for (const email of settings.extraFromEmails) {
    const key = email.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    extras.push({ email, label: 'Custom', removable: true })
  }
  return [...core, ...extras]
}

/** Display name for a From address (Resend header). */
export function displayNameForFromEmail(
  email: string,
  settings: EmailMailboxSettings = EMAIL_MAILBOXES
): string {
  const e = email.trim().toLowerCase()
  if (e === settings.billingEmail.toLowerCase()) return 'Credyx Billing'
  if (e === settings.opsEmail.toLowerCase()) return 'Credyx Ops'
  if (e === (settings.adminEmail || '').toLowerCase()) return 'Credyx Ops'
  if (e === settings.notificationsEmail.toLowerCase()) return 'Credyx'
  return 'Credyx'
}
