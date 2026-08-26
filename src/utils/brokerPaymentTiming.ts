/**
 * Net terms vs actual average payment timing for Broker Risk.
 * Example: Net 31 → avg pay 36d → ~5 days late.
 */
import { BROKER_RISK_POLICY } from './brokerRiskPolicy'

export type BrokerPaymentTiming = {
  /** Broker catalog / Net terms days. */
  termsDays: number
  /** Average confirmed days from invoice → payment. */
  avgPayDays: number
  /** avgPayDays − termsDays (negative = early). */
  daysLate: number
  /** Confirmed payments in the sample. */
  paidSampleSize: number
  /** Short severity for UI chips. */
  severity: 'on_time' | 'slight' | 'moderate' | 'severe'
  /** e.g. "Slight payment delays" */
  headline: string
  /** Carrier-facing paragraph. */
  summary: string
  /** Compact admin / list label. */
  shortLabel: string
}

function roundDays(n: number): number {
  return Math.round(n)
}

/**
 * Build Net vs actual average payment timing.
 * Returns null when the paid sample is below the configured minimum
 * (default 10) or there is no average to compare.
 */
export function buildBrokerPaymentTiming(args: {
  paymentTermsDays?: number | null
  avgDaysInvoiceToPay?: number | null
  paidSampleSize?: number | null
  /** Fallback Net when terms missing. */
  fallbackTermsDays?: number
  /**
   * Override minimum confirmed pays (tests / one-offs).
   * Defaults to BROKER_RISK_POLICY.min_paid_sample_for_payment_timing.
   */
  minPaidSample?: number
}): BrokerPaymentTiming | null {
  const avg =
    args.avgDaysInvoiceToPay != null && Number.isFinite(args.avgDaysInvoiceToPay)
      ? roundDays(args.avgDaysInvoiceToPay)
      : null
  if (avg == null || avg < 0) return null

  const sample =
    args.paidSampleSize != null && Number.isFinite(args.paidSampleSize) && args.paidSampleSize > 0
      ? Math.floor(args.paidSampleSize)
      : 0

  const minSample = Math.max(
    1,
    Math.floor(
      args.minPaidSample ?? BROKER_RISK_POLICY.min_paid_sample_for_payment_timing
    )
  )
  // Require a known sample at or above the policy floor (no avg-only shortcut).
  if (sample < minSample) return null

  const termsRaw =
    args.paymentTermsDays != null && args.paymentTermsDays > 0
      ? Math.floor(args.paymentTermsDays)
      : args.fallbackTermsDays != null && args.fallbackTermsDays > 0
        ? Math.floor(args.fallbackTermsDays)
        : null
  if (termsRaw == null) return null

  const daysLate = avg - termsRaw
  const absLate = Math.abs(daysLate)

  let severity: BrokerPaymentTiming['severity']
  let headline: string
  if (daysLate <= 0) {
    severity = 'on_time'
    headline =
      daysLate === 0
        ? 'Pays on Net terms'
        : absLate <= 2
          ? 'Pays slightly early'
          : 'Pays ahead of terms'
  } else if (daysLate <= 7) {
    severity = 'slight'
    headline = 'Slight payment delays'
  } else if (daysLate <= 14) {
    severity = 'moderate'
    headline = 'Moderate payment delays'
  } else {
    severity = 'severe'
    headline = 'Significant payment delays'
  }

  const latePhrase =
    daysLate > 0
      ? `Around ${daysLate} day${daysLate === 1 ? '' : 's'} late.`
      : daysLate < 0
        ? `Around ${absLate} day${absLate === 1 ? '' : 's'} early.`
        : 'In line with Net terms.'

  const summary = `${latePhrase} Average payment moved to (${avg} days) was (${termsRaw} days).`

  const shortLabel =
    daysLate > 0
      ? `Avg ${avg}d · Net ${termsRaw} · ~${daysLate}d late`
      : daysLate < 0
        ? `Avg ${avg}d · Net ${termsRaw} · ~${absLate}d early`
        : `Avg ${avg}d · Net ${termsRaw} · on time`

  return {
    termsDays: termsRaw,
    avgPayDays: avg,
    daysLate,
    paidSampleSize: sample,
    severity,
    headline,
    summary,
    shortLabel,
  }
}

/** One evidence / review-note line for publish to carriers. */
export function formatPaymentTimingPublishNote(timing: BrokerPaymentTiming): string {
  return `${timing.headline}. ${timing.summary}`
}

/** Evidence bullet when average pay drifts past Net. */
export function paymentTimingEvidenceBullet(timing: BrokerPaymentTiming): string | null {
  if (timing.severity === 'on_time') {
    return `Avg pay ${timing.avgPayDays}d vs Net ${timing.termsDays} — on time`
  }
  return `${timing.headline}: avg pay ${timing.avgPayDays}d (was Net ${timing.termsDays}) · ~${timing.daysLate}d late`
}
