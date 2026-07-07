/** A/R volume tier rate table — monthly fee = rate × collected volume in period. */

export interface ArRateTier {
  maxVolume: number | null
  standardPct: number
  factoringPct: number
}

export const PLATFORM_APP_FEE_MONTHLY = 99

export const AR_RATE_TIERS: ArRateTier[] = [
  { maxVolume: 100_000, standardPct: 1.25, factoringPct: 0.7 },
  { maxVolume: 250_000, standardPct: 1.0, factoringPct: 0.6 },
  { maxVolume: 500_000, standardPct: 0.9, factoringPct: 0.5 },
  { maxVolume: null, standardPct: NaN, factoringPct: NaN },
]

export const BILL_PAYMENT_TERMS_DAYS = 30
export const BILL_LOCK_AFTER_DAYS = 90
export const BILL_WARNING_DAYS = 60
export const BILL_REMINDER_DAYS = 30

/** Resolve rate % from collected volume and factoring flag. */
export function lookupArRatePct(
  collectedVolume: number,
  factoring: boolean,
  override?: number | null
): number {
  if (override != null && Number.isFinite(override)) return override

  const tier =
    AR_RATE_TIERS.find((t) => t.maxVolume == null || collectedVolume <= t.maxVolume) ??
    AR_RATE_TIERS[AR_RATE_TIERS.length - 1]

  const rate = factoring ? tier.factoringPct : tier.standardPct
  if (!Number.isFinite(rate)) {
    throw new Error('Collected volume exceeds negotiated tier — set ar_rate_override on client')
  }
  return rate
}
