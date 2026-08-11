import { describe, expect, it } from 'vitest'
import {
  COLLECTIONS_POLICY,
  getCollectionsUrgentReasons,
  isRiskyBrokerLevel,
} from './collectionsPolicy'

describe('collections urgency', () => {
  it('marks Will Pay unpaid after the configured days', () => {
    const asOf = new Date(2026, 7, 20) // Aug 20
    const reasons = getCollectionsUrgentReasons({
      stillOpen: true,
      willPayDate: '2026-08-15',
      policy: { ...COLLECTIONS_POLICY, willPayMissedDays: 5 },
      asOf,
    })
    expect(reasons).toContain('will_pay_missed')
  })

  it('does not mark Will Pay urgent before the window', () => {
    const asOf = new Date(2026, 7, 17)
    const reasons = getCollectionsUrgentReasons({
      stillOpen: true,
      willPayDate: '2026-08-15',
      policy: { ...COLLECTIONS_POLICY, willPayMissedDays: 5 },
      asOf,
    })
    expect(reasons).not.toContain('will_pay_missed')
  })

  it('marks all loads urgent for a high-risk broker', () => {
    const reasons = getCollectionsUrgentReasons({
      stillOpen: true,
      brokerRiskLevel: 'high',
      policy: { ...COLLECTIONS_POLICY, riskyBrokerUrgent: true, riskyBrokerMinLevel: 'high' },
    })
    expect(reasons).toContain('risky_broker')
  })

  it('does not treat medium as risky when threshold is high', () => {
    expect(isRiskyBrokerLevel('medium', 'high')).toBe(false)
    expect(isRiskyBrokerLevel('high', 'high')).toBe(true)
  })

  it('marks missed call back as urgent', () => {
    const asOf = new Date(2026, 7, 20)
    const reasons = getCollectionsUrgentReasons({
      stillOpen: true,
      isCallback: true,
      callbackDate: '2026-08-15',
      policy: { ...COLLECTIONS_POLICY, callbackUrgent: true, callbackMissedDays: 2 },
      asOf,
    })
    expect(reasons).toContain('callback_missed')
  })

  it('flags Call back due on the scheduled day', () => {
    const asOf = new Date(2026, 7, 11)
    const reasons = getCollectionsUrgentReasons({
      stillOpen: true,
      isCallback: true,
      callbackDate: '2026-08-11',
      policy: { ...COLLECTIONS_POLICY, callbackUrgent: true, callbackMissedDays: 0 },
      asOf,
    })
    expect(reasons).toContain('callback_missed')
  })

  it('does not flag Call back due before the scheduled day', () => {
    const asOf = new Date(2026, 7, 10)
    const reasons = getCollectionsUrgentReasons({
      stillOpen: true,
      isCallback: true,
      callbackDate: '2026-08-11',
      policy: { ...COLLECTIONS_POLICY, callbackUrgent: true, callbackMissedDays: 0 },
      asOf,
    })
    expect(reasons).not.toContain('callback_missed')
  })
})
