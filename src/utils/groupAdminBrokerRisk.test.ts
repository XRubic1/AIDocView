import { describe, expect, it } from 'vitest'
import type { BrokerRiskProfile } from '../types/brokerRisk'
import { groupAdminBrokerRiskProfiles, mergeAdminBrokerRiskMetrics } from './groupAdminBrokerRisk'

function profile(partial: Partial<BrokerRiskProfile> & Pick<BrokerRiskProfile, 'id' | 'client_id' | 'broker_id'>): BrokerRiskProfile {
  return {
    mc_number: null,
    risk_level: 'unrated',
    computed_risk_level: 'high',
    review_status: 'pending_review',
    review_note: null,
    reviewed_at: null,
    reviewed_by: null,
    analyzed_at: '2026-09-01T00:00:00.000Z',
    metrics: {
      late_payment_count: 0,
      open_overdue_past_terms: 0,
      overdue_amount: 0,
      hold_count: 0,
      open_dispute_count: 0,
      paid_sample_size: 0,
    },
    ...partial,
  } as BrokerRiskProfile
}

describe('groupAdminBrokerRiskProfiles', () => {
  it('collapses the same broker across carriers into one queue row', () => {
    const groups = groupAdminBrokerRiskProfiles([
      profile({
        id: 'a',
        client_id: 'c1',
        broker_id: 'broker-zeal',
        computed_risk_level: 'medium',
        review_status: 'published',
      }),
      profile({
        id: 'b',
        client_id: 'c2',
        broker_id: 'broker-zeal',
        computed_risk_level: 'high',
        review_status: 'pending_review',
      }),
      profile({
        id: 'c',
        client_id: 'c3',
        broker_id: 'broker-other',
        computed_risk_level: 'low',
        review_status: 'cleared',
      }),
    ])

    expect(groups).toHaveLength(2)
    const zeal = groups.find((g) => g.brokerId === 'broker-zeal')
    expect(zeal?.carrierCount).toBe(2)
    expect(zeal?.needsReviewCount).toBe(1)
    expect(zeal?.representative.id).toBe('b')
  })
})

describe('mergeAdminBrokerRiskMetrics', () => {
  it('sums carrier-level counts for the broker', () => {
    const merged = mergeAdminBrokerRiskMetrics([
      profile({
        id: 'a',
        client_id: 'c1',
        broker_id: 'b1',
        metrics: {
          late_payment_count: 1,
          open_overdue_past_terms: 1,
          overdue_amount: 100,
          hold_count: 1,
          open_dispute_count: 0,
          paid_sample_size: 2,
          max_days_past_terms: 5,
        },
      }),
      profile({
        id: 'b',
        client_id: 'c2',
        broker_id: 'b1',
        metrics: {
          late_payment_count: 2,
          open_overdue_past_terms: 0,
          overdue_amount: 50,
          hold_count: 0,
          open_dispute_count: 1,
          paid_sample_size: 3,
          max_days_past_terms: 12,
        },
      }),
    ])
    expect(merged.late_payment_count).toBe(3)
    expect(merged.overdue_amount).toBe(150)
    expect(merged.max_days_past_terms).toBe(12)
    expect(merged.open_dispute_count).toBe(1)
  })
})
