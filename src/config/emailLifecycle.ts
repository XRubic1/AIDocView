/**
 * Declarative email lifecycle rules and platform default clocks.
 */
import type { EmailTrackClockDefaults } from '../types/emailLifecycle'

export type { EmailTrackClockDefaults }

export type EmailLifecycleRuleId =
  | 'batch_processed_carrier'
  | 'broker_paperwork_status_inquiry'
  | 'broker_paperwork_status_followup'
  | 'broker_payment_status_inquiry'
  | 'broker_payment_status_followup'
  | 'broker_claim_scope'
  | 'carrier_claim_or_hold_notice'

export type EmailLifecycleTrack = 'paperwork' | 'payment'

export interface EmailLifecycleRule {
  id: EmailLifecycleRuleId
  name: string
  description: string
  audience: 'carrier' | 'broker' | 'staff' | 'ops'
}

export interface EmailLifecycleSettings {
  rules: Partial<Record<EmailLifecycleRuleId, { enabled: boolean }>>
  paperwork: EmailTrackClockDefaults
  payment: EmailTrackClockDefaults
}

export const EMAIL_LIFECYCLE_RULES: EmailLifecycleRule[] = [
  {
    id: 'batch_processed_carrier',
    name: 'Carrier — batch processed',
    description: 'After Process: all-good summary or holds listed.',
    audience: 'carrier',
  },
  {
    id: 'broker_paperwork_status_inquiry',
    name: 'Chase — paperwork status (first)',
    description: 'First paperwork-status ask after PPW is delivered.',
    audience: 'broker',
  },
  {
    id: 'broker_paperwork_status_followup',
    name: 'Chase — paperwork status (second)',
    description: 'Second paperwork follow-up if no reply.',
    audience: 'broker',
  },
  {
    id: 'broker_payment_status_inquiry',
    name: 'Chase — payment status (first)',
    description: 'Only after paperwork status is logged good.',
    audience: 'broker',
  },
  {
    id: 'broker_payment_status_followup',
    name: 'Chase — payment status (second)',
    description: 'Second payment follow-up if no reply.',
    audience: 'broker',
  },
  {
    id: 'broker_claim_scope',
    name: 'Broker — claim on whole account?',
    description: 'Staff-sent from Inbox.',
    audience: 'broker',
  },
  {
    id: 'carrier_claim_or_hold_notice',
    name: 'Carrier — hold or claim notice',
    description: 'After staff confirms a negative, missing-docs, or claim reply.',
    audience: 'carrier',
  },
]

const DEFAULT_CLOCK: EmailTrackClockDefaults = {
  firstAskDays: 3,
  actionNeededAfterFirst: false,
  actionNeededAfterFirstDays: 1,
  secondFollowupDays: 3,
  needsAttentionAfterSecondDays: 5,
}

export const DEFAULT_EMAIL_LIFECYCLE_SETTINGS: EmailLifecycleSettings = {
  rules: Object.fromEntries(EMAIL_LIFECYCLE_RULES.map((r) => [r.id, { enabled: true }])),
  paperwork: { ...DEFAULT_CLOCK, firstAskDays: 7 },
  payment: { ...DEFAULT_CLOCK, firstAskDays: 15 },
}

/** Mutable runtime copy applied at hydrate. */
export const EMAIL_LIFECYCLE_SETTINGS: EmailLifecycleSettings = JSON.parse(
  JSON.stringify(DEFAULT_EMAIL_LIFECYCLE_SETTINGS)
) as EmailLifecycleSettings

export function isEmailLifecycleRuleEnabled(id: EmailLifecycleRuleId): boolean {
  return EMAIL_LIFECYCLE_SETTINGS.rules[id]?.enabled !== false
}

export function getEmailLifecycleSettings(): EmailLifecycleSettings {
  return EMAIL_LIFECYCLE_SETTINGS
}
