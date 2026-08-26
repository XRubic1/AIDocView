import { describe, expect, it } from 'vitest'
import {
  buildBrokerPaymentTiming,
  formatPaymentTimingPublishNote,
  paymentTimingEvidenceBullet,
} from './brokerPaymentTiming'

describe('buildBrokerPaymentTiming', () => {
  it('describes slight delays vs Net terms when sample meets the floor', () => {
    const t = buildBrokerPaymentTiming({
      paymentTermsDays: 31,
      avgDaysInvoiceToPay: 36,
      paidSampleSize: 10,
    })
    expect(t).not.toBeNull()
    expect(t!.daysLate).toBe(5)
    expect(t!.severity).toBe('slight')
    expect(t!.headline).toBe('Slight payment delays')
    expect(t!.summary).toContain('Around 5 days late')
    expect(t!.summary).toContain('(36 days)')
    expect(t!.summary).toContain('(31 days)')
    expect(formatPaymentTimingPublishNote(t!)).toMatch(/Slight payment delays/)
    expect(paymentTimingEvidenceBullet(t!)).toMatch(/avg pay 36d/)
  })

  it('returns null without an average', () => {
    expect(
      buildBrokerPaymentTiming({
        paymentTermsDays: 30,
        avgDaysInvoiceToPay: null,
        paidSampleSize: 12,
      })
    ).toBeNull()
  })

  it('returns null when paid sample is below the policy minimum', () => {
    expect(
      buildBrokerPaymentTiming({
        paymentTermsDays: 31,
        avgDaysInvoiceToPay: 36,
        paidSampleSize: 8,
      })
    ).toBeNull()
  })

  it('respects an explicit minPaidSample override', () => {
    const t = buildBrokerPaymentTiming({
      paymentTermsDays: 31,
      avgDaysInvoiceToPay: 36,
      paidSampleSize: 3,
      minPaidSample: 3,
    })
    expect(t).not.toBeNull()
    expect(t!.daysLate).toBe(5)
  })

  it('treats early pay as on_time severity', () => {
    const t = buildBrokerPaymentTiming({
      paymentTermsDays: 45,
      avgDaysInvoiceToPay: 40,
      paidSampleSize: 12,
    })
    expect(t!.daysLate).toBe(-5)
    expect(t!.severity).toBe('on_time')
    expect(t!.summary).toMatch(/early/)
  })
})
