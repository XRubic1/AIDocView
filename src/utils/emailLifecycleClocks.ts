/**
 * Resolve chase clocks: platform defaults, then broker override.
 */
import type { Broker } from '../types/broker'
import type { BrokerEmailAccept, EmailTrackClockDefaults } from '../types/emailLifecycle'
import {
  EMAIL_LIFECYCLE_SETTINGS,
  type EmailLifecycleTrack,
} from '../config/emailLifecycle'

export function daysBetween(fromIso: string, nowMs: number): number | null {
  const t = new Date(fromIso).getTime()
  if (!Number.isFinite(t)) return null
  return Math.floor((nowMs - t) / (1000 * 60 * 60 * 24))
}

function mergeClock(
  base: EmailTrackClockDefaults,
  override?: Partial<EmailTrackClockDefaults> | null
): EmailTrackClockDefaults {
  if (!override) return { ...base }
  return {
    firstAskDays: override.firstAskDays ?? base.firstAskDays,
    actionNeededAfterFirst: override.actionNeededAfterFirst ?? base.actionNeededAfterFirst,
    actionNeededAfterFirstDays:
      override.actionNeededAfterFirstDays ?? base.actionNeededAfterFirstDays,
    secondFollowupDays: override.secondFollowupDays ?? base.secondFollowupDays,
    needsAttentionAfterSecondDays:
      override.needsAttentionAfterSecondDays ?? base.needsAttentionAfterSecondDays,
  }
}

/** Whether this broker accepts email for packet / paperwork status / payment status. */
export function brokerEmailAccept(broker: Broker | undefined): BrokerEmailAccept {
  const flags = broker?.email_accept
  const phoneOnly = broker?.preferred_contact === 'phone'
  return {
    packet: flags?.packet ?? !phoneOnly,
    paperworkStatus: flags?.paperworkStatus ?? !phoneOnly,
    paymentStatus: flags?.paymentStatus ?? !phoneOnly,
  }
}

export function resolveTrackClock(
  track: EmailLifecycleTrack,
  broker?: Broker
): EmailTrackClockDefaults {
  const base =
    track === 'paperwork'
      ? EMAIL_LIFECYCLE_SETTINGS.paperwork
      : EMAIL_LIFECYCLE_SETTINGS.payment
  const override =
    track === 'paperwork' ? broker?.chase_clocks?.paperwork : broker?.chase_clocks?.payment
  return mergeClock(base, override)
}
