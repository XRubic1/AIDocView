/**
 * Credyx outbound / inbound email address map.
 * Actual From headers are set by Supabase Edge secrets (RESEND_FROM_*).
 * This table is the intended product map for Settings → Addresses.
 */

export type EmailAudience = 'broker' | 'carrier' | 'admin' | 'inbound' | 'copy'

export type EmailAddressRow = {
  id: string
  action: string
  audience: EmailAudience
  /** Intended From (or mailbox) when secrets are set correctly. */
  intendedAddress: string
  /** Resend / env secret that controls From (if any). */
  secretHint: string
  examples: string
  notes?: string
}

/** Recommended production addresses (credyx.net must be verified in Resend). */
export const CREDYX_EMAIL_DEFAULTS = {
  brokerFrom: 'Credyx Billing <billing@credyx.net>',
  carrierFrom: 'Credyx Ops <ops@credyx.net>',
  adminFrom: 'Credyx Ops <ops@credyx.net>',
  fallbackFrom: 'Credyx <notifications@credyx.net>',
  replyBroker: 'billing@credyx.net',
  replyCarrier: 'ops@credyx.net',
  remittanceAdvice: 'billing@credyx.net',
  collectionsInbox: 'collections@credyx.net',
  remittanceInbox: 'remittance@credyx.net',
  contact: 'ops@credyx.net',
} as const

/**
 * What email is used for what.
 * If only RESEND_FROM_EMAIL / billing@ is set, everything may appear to come from billing@.
 */
export const EMAIL_ADDRESS_MAP: EmailAddressRow[] = [
  {
    id: 'ppw',
    action: 'PPW / invoice packet to broker',
    audience: 'broker',
    intendedAddress: CREDYX_EMAIL_DEFAULTS.brokerFrom,
    secretHint: 'RESEND_FROM_BROKER',
    examples: 'broker_packet, broker_remittance_updated',
    notes: 'Brokers should see Billing, not Ops.',
  },
  {
    id: 'ppw-chase',
    action: 'PPW chase / paperwork status emails',
    audience: 'broker',
    intendedAddress: CREDYX_EMAIL_DEFAULTS.brokerFrom,
    secretHint: 'RESEND_FROM_BROKER',
    examples: 'broker_paperwork_status_inquiry, broker_paperwork_status_followup',
  },
  {
    id: 'pay-chase',
    action: 'Payment chase emails to broker',
    audience: 'broker',
    intendedAddress: CREDYX_EMAIL_DEFAULTS.brokerFrom,
    secretHint: 'RESEND_FROM_BROKER',
    examples: 'broker_payment_status_inquiry, broker_payment_status_followup',
  },
  {
    id: 'waitlist-welcome',
    action: 'Waitlist welcome',
    audience: 'broker',
    intendedAddress: CREDYX_EMAIL_DEFAULTS.brokerFrom,
    secretHint: 'RESEND_FROM_BROKER',
    examples: 'waitlist_welcome',
    notes: 'Uses broker From on purpose (billing@).',
  },
  {
    id: 'client-invite',
    action: 'Carrier invite / password setup',
    audience: 'carrier',
    intendedAddress: CREDYX_EMAIL_DEFAULTS.carrierFrom,
    secretHint: 'RESEND_FROM_CARRIER',
    examples: 'client_invite, auth_*',
  },
  {
    id: 'carrier-batch',
    action: 'Carrier batch updates (verified / holds / processed)',
    audience: 'carrier',
    intendedAddress: CREDYX_EMAIL_DEFAULTS.carrierFrom,
    secretHint: 'RESEND_FROM_CARRIER',
    examples: 'carrier_batch_verified, carrier_batch_holds, carrier_batch_processed',
  },
  {
    id: 'carrier-billing',
    action: 'Credyx fee invoice to carrier',
    audience: 'carrier',
    intendedAddress: CREDYX_EMAIL_DEFAULTS.carrierFrom,
    secretHint: 'RESEND_FROM_CARRIER',
    examples: 'carrier_billing_invoice',
    notes: 'Body copy may still say reply to billing@credyx.net for fee questions.',
  },
  {
    id: 'carrier-docs',
    action: 'Missing / document issue to carrier',
    audience: 'carrier',
    intendedAddress: CREDYX_EMAIL_DEFAULTS.carrierFrom,
    secretHint: 'RESEND_FROM_CARRIER',
    examples: 'carrier_document_issue',
  },
  {
    id: 'admin-alerts',
    action: 'Admin alerts (enrollment, waitlist, batch errors)',
    audience: 'admin',
    intendedAddress: CREDYX_EMAIL_DEFAULTS.adminFrom,
    secretHint: 'RESEND_FROM_ADMIN (falls back to RESEND_FROM_EMAIL)',
    examples: 'admin_enrollment_alert, waitlist_signup_alert, credyx_batch_error',
  },
  {
    id: 'staff-digest',
    action: 'Staff calendar digest',
    audience: 'admin',
    intendedAddress: CREDYX_EMAIL_DEFAULTS.adminFrom,
    secretHint: 'RESEND_FROM_ADMIN',
    examples: 'staff_calendar_digest',
  },
  {
    id: 'remittance-copy',
    action: 'Remittance advice (on invoice / PPW copy)',
    audience: 'copy',
    intendedAddress: `${CREDYX_EMAIL_DEFAULTS.remittanceAdvice} + ${CREDYX_EMAIL_DEFAULTS.contact}`,
    secretHint: 'Hardcoded in templates / PDF (not Resend From)',
    examples: 'Invoice remit block, broker_packet body',
    notes: 'Tells brokers where to send remittance advice — not the From header.',
  },
  {
    id: 'collections-inbox',
    action: 'Collections inbound mailbox',
    audience: 'inbound',
    intendedAddress: CREDYX_EMAIL_DEFAULTS.collectionsInbox,
    secretHint: 'Resend inbound → email-inbound webhook',
    examples: 'Broker replies to chase / PPW',
  },
  {
    id: 'remittance-inbox',
    action: 'Remittance inbound mailbox',
    audience: 'inbound',
    intendedAddress: CREDYX_EMAIL_DEFAULTS.remittanceInbox,
    secretHint: 'Resend inbound → email-inbound webhook',
    examples: 'Payment remittance notices',
  },
]

export function audienceLabel(audience: EmailAudience): string {
  switch (audience) {
    case 'broker':
      return 'To brokers'
    case 'carrier':
      return 'To carriers'
    case 'admin':
      return 'To Credyx staff'
    case 'inbound':
      return 'Inbound'
    case 'copy':
      return 'In message body'
    default:
      return audience
  }
}
