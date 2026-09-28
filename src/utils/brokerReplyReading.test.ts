import { describe, expect, it } from 'vitest'
import { readBrokerReplyRules } from './brokerReplyReading'

describe('readBrokerReplyRules', () => {
  it('confirms a paperwork good-to-go reply', () => {
    const reading = readBrokerReplyRules({
      replyBody: 'Good to go',
      outboundKind: 'paperwork',
    })
    expect(reading.status).toBe('confirmed')
    expect(reading.classification).toBe('paperwork_ok')
  })

  it('confirms a pay date on a payment email', () => {
    const reading = readBrokerReplyRules({
      replyBody: 'Will pay 10/15/2026',
      outboundKind: 'payment',
    })
    expect(reading.status).toBe('confirmed')
    expect(reading.classification).toBe('payment_ok')
    expect(reading.payDate).toBe('2026-10-15')
  })

  it('rejects missing lumper or pages', () => {
    const reading = readBrokerReplyRules({
      replyBody: 'Not received, missing lumper and pages',
      outboundKind: 'paperwork',
    })
    expect(reading.status).toBe('rejected')
    expect(reading.classification).toBe('missing_docs')
  })

  it('leaves a vague reply unknown', () => {
    const reading = readBrokerReplyRules({
      replyBody: 'Thanks, looping in our team',
      outboundKind: 'paperwork',
    })
    expect(reading.status).toBe('unknown')
  })
})
