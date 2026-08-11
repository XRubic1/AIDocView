import type { BrokerRiskLevel } from '../types/brokerRisk'

/**
 * Collections chase + urgency rules.
 * Mutable singleton (same pattern as AR_POLICY); admin Settings persist it.
 */
export const DEFAULT_COLLECTIONS_POLICY = {
  /** Fallback when the broker has no Status inquiry (days after PPW). */
  defaultInquiryDays: 15,
  /** Days after inquiry with no reply → send follow-up. */
  followupAfterDays: 3,
  /** Days after inquiry with no reply → Credyx should call. */
  needsAttentionAfterDays: 5,

  willPayUrgent: true,
  /** Days after Will Pay date with no payment received → urgent. */
  willPayMissedDays: 5,
  callbackUrgent: true,
  /** Extra days after Call Back before Review flags it (0 = due on that date). */
  callbackMissedDays: 0,

  riskyBrokerUrgent: true,
  riskyBrokerMinLevel: 'high' as Extract<BrokerRiskLevel, 'medium' | 'high'>,

  overdueUrgent: true,
  /** Days past due before overdue open A/R is urgent (15 = same as overdue). */
  overdueUrgentDays: 15,
  noPpwUrgent: true,
  /** Invoice age with no PPW sent → urgent. */
  noPpwAfterDays: 7,
  staleContactUrgent: true,
  /** Days since last broker contact (after PPW) → urgent. Never contacted counts. */
  staleContactDays: 7,
  /** Chase “call broker” items are urgent. */
  needsCallUrgent: true,
}

export type CollectionsPolicy = typeof DEFAULT_COLLECTIONS_POLICY

export const COLLECTIONS_POLICY: CollectionsPolicy = { ...DEFAULT_COLLECTIONS_POLICY }

const RISK_RANK: Record<BrokerRiskLevel, number> = {
  unrated: 0,
  low: 1,
  medium: 2,
  high: 3,
}

/** True when broker risk meets the configured urgent threshold. */
export function isRiskyBrokerLevel(
  level: BrokerRiskLevel | null | undefined,
  minLevel: CollectionsPolicy['riskyBrokerMinLevel'] = COLLECTIONS_POLICY.riskyBrokerMinLevel
): boolean {
  if (!level || level === 'unrated' || level === 'low') return false
  return RISK_RANK[level] >= RISK_RANK[minLevel]
}

export type CollectionsUrgentReason =
  | 'will_pay_missed'
  | 'callback_missed'
  | 'risky_broker'
  | 'overdue'
  | 'no_ppw'
  | 'stale_contact'
  | 'needs_call'

export function collectionsUrgentLabel(reason: CollectionsUrgentReason): string {
  const p = COLLECTIONS_POLICY
  switch (reason) {
    case 'will_pay_missed':
      return `Will Pay unpaid ${p.willPayMissedDays}d+`
    case 'callback_missed':
      return 'Call back due'
    case 'risky_broker':
      return 'Risky broker'
    case 'overdue':
      return `${p.overdueUrgentDays}d+ past due`
    case 'no_ppw':
      return `No PPW ${p.noPpwAfterDays}d+`
    case 'stale_contact':
      return `No contact ${p.staleContactDays}d+`
    case 'needs_call':
      return 'Needs call'
    default:
      return reason
  }
}

/** Signed calendar days from a YYYY-MM-DD to asOf (negative = still in the future). */
export function daysFromYmd(ymd: string, asOf: Date = new Date()): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd.trim())
  if (!m) return null
  const expected = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  expected.setHours(0, 0, 0, 0)
  const today = new Date(asOf)
  today.setHours(0, 0, 0, 0)
  return Math.floor((today.getTime() - expected.getTime()) / 86_400_000)
}

/** Calendar days past a YYYY-MM-DD (0 if that day is today or in the future). */
export function daysPastYmd(ymd: string, asOf: Date = new Date()): number {
  return Math.max(0, daysFromYmd(ymd, asOf) ?? 0)
}

export function daysSinceIso(iso: string, asOf: Date = new Date()): number {
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return 0
  const then = new Date(t)
  then.setHours(0, 0, 0, 0)
  const today = new Date(asOf)
  today.setHours(0, 0, 0, 0)
  return Math.max(0, Math.floor((today.getTime() - then.getTime()) / 86_400_000))
}

export type CollectionsUrgentInput = {
  stillOpen: boolean
  willPayDate?: string | null
  callbackDate?: string | null
  isCallback?: boolean
  brokerRiskLevel?: BrokerRiskLevel | null
  brokerReviewCleared?: boolean
  daysPastDue?: number
  invoiceAgeDays?: number
  ppwSent?: boolean
  daysSincePpw?: number | null
  lastContact?: string | null
  needsCall?: boolean
  policy?: CollectionsPolicy
  asOf?: Date
}

/**
 * Why this open invoice is urgent for Credyx review.
 */
export function getCollectionsUrgentReasons(
  input: CollectionsUrgentInput
): CollectionsUrgentReason[] {
  const policy = input.policy ?? COLLECTIONS_POLICY
  if (!input.stillOpen) return []
  const asOf = input.asOf ?? new Date()
  const reasons: CollectionsUrgentReason[] = []

  if (policy.willPayUrgent && input.willPayDate) {
    if (daysPastYmd(input.willPayDate, asOf) >= policy.willPayMissedDays) {
      reasons.push('will_pay_missed')
    }
  }

  if (policy.callbackUrgent && input.isCallback && input.callbackDate) {
    const days = daysFromYmd(input.callbackDate, asOf)
    // On or after the Call Back date → Review + red Call back pill.
    if (days != null && days >= 0) {
      reasons.push('callback_missed')
    }
  }

  if (
    policy.riskyBrokerUrgent &&
    !input.brokerReviewCleared &&
    isRiskyBrokerLevel(input.brokerRiskLevel, policy.riskyBrokerMinLevel)
  ) {
    reasons.push('risky_broker')
  }

  if (policy.overdueUrgent && (input.daysPastDue ?? 0) >= policy.overdueUrgentDays) {
    reasons.push('overdue')
  }

  if (
    policy.noPpwUrgent &&
    !input.ppwSent &&
    (input.invoiceAgeDays ?? 0) >= policy.noPpwAfterDays
  ) {
    reasons.push('no_ppw')
  }

  if (policy.staleContactUrgent && input.ppwSent) {
    const stale =
      !input.lastContact || daysSinceIso(input.lastContact, asOf) >= policy.staleContactDays
    const pastInquiry =
      (input.daysSincePpw ?? 0) >= policy.defaultInquiryDays
    if (stale && pastInquiry) reasons.push('stale_contact')
  }

  if (policy.needsCallUrgent && input.needsCall) {
    reasons.push('needs_call')
  }

  return reasons
}
