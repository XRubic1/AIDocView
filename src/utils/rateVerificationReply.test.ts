import { describe, expect, it } from 'vitest'
import { readRateVerificationReply } from '../../supabase/functions/_shared/rateVerificationReply'

describe('readRateVerificationReply', () => {
  it('marks a clean rate as OK', () => {
    const reading = readRateVerificationReply(
      'Re: Rate confirmation — Invoice 012',
      'No advances or deductions. Good to go.'
    )
    expect(reading.outcome).toBe('ok')
  })

  it('holds when the broker lists a deduction', () => {
    const reading = readRateVerificationReply('Re: Rate confirmation', 'There is a $200 deduction.')
    expect(reading.outcome).toBe('hold')
  })

  it('holds a deduction even when advances are none', () => {
    const reading = readRateVerificationReply(
      'Re: Rate confirmation',
      'No advances, but there is a $50 lumper deduction.'
    )
    expect(reading.outcome).toBe('hold')
  })

  it('leaves a vague reply unknown', () => {
    const reading = readRateVerificationReply('Re: Rate confirmation', 'Thanks, we will look.')
    expect(reading.outcome).toBe('unknown')
  })
})
