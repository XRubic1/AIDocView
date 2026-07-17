/**
 * Carrier-facing copy for remittance clearing times by payment method.
 */
import type { Payment } from '../types/payment'

export type PaymentMethod = Payment['payment_method']

export interface PaymentTimingInfo {
  method: PaymentMethod
  label: string
  /** Short line for confirm / list UI */
  summary: string
  /** Longer explanation before disputing */
  disputeWarning: string
  /** Days to treat as "still in float" for dispute gate */
  floatDays: number
}

const TIMING: Record<PaymentMethod, PaymentTimingInfo> = {
  ach: {
    method: 'ach',
    label: 'ACH',
    summary: 'ACH usually posts in 1–2 business days. If sent today, it often arrives tomorrow.',
    disputeWarning:
      'ACH transfers typically take up to 2 business days to hit your account. If the payment was just posted, please wait before opening a dispute.',
    floatDays: 2,
  },
  check: {
    method: 'check',
    label: 'Check',
    summary: 'Checks can take up to 2 weeks to clear and hit your account.',
    disputeWarning:
      'Check payments can take up to 2 weeks to reach your account. Please wait for the check to clear before opening a dispute unless you are sure it will not arrive.',
    floatDays: 14,
  },
  wire: {
    method: 'wire',
    label: 'Wire',
    summary: 'Wire transfers usually arrive the same day or next business day.',
    disputeWarning:
      'Wire transfers are typically fast (same or next business day). Confirm your bank has not received the funds before disputing.',
    floatDays: 1,
  },
  credit_card: {
    method: 'credit_card',
    label: 'Card',
    summary: 'Card payments usually settle within 1–3 business days.',
    disputeWarning:
      'Card settlements can take 1–3 business days. Please wait for the charge to settle before opening a dispute.',
    floatDays: 3,
  },
}

export function getPaymentTimingInfo(method: PaymentMethod | string | undefined): PaymentTimingInfo {
  if (method && method in TIMING) return TIMING[method as PaymentMethod]
  return TIMING.ach
}

/** True when payment was posted recently enough that funds may still be in transit. */
export function isPaymentInFloatWindow(
  payment: { payment_method?: string; received_date?: string; payment_date?: string },
  nowMs = Date.now()
): boolean {
  const timing = getPaymentTimingInfo(payment.payment_method)
  const posted = payment.received_date || payment.payment_date
  if (!posted) return false
  const t = new Date(posted).getTime()
  if (!Number.isFinite(t)) return false
  const days = (nowMs - t) / (1000 * 60 * 60 * 24)
  return days >= 0 && days < timing.floatDays
}
