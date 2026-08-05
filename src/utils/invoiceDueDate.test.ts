import { describe, expect, it } from 'vitest'
import {
  resolveDueDateFromBroker,
  resolveDueDatesFromBroker,
} from './invoiceDueDate'

describe('resolveDueDateFromBroker', () => {
  const from = new Date(2026, 7, 5, 12, 0, 0) // Aug 5, 2026 local

  it('returns undefined when due-by is 0, null, or missing', () => {
    expect(resolveDueDateFromBroker(0, from)).toBeUndefined()
    expect(resolveDueDateFromBroker(null, from)).toBeUndefined()
    expect(resolveDueDateFromBroker(undefined, from)).toBeUndefined()
  })

  it('adds due-by days to the from date', () => {
    expect(resolveDueDateFromBroker(35, from)).toBe('2026-09-09')
    expect(resolveDueDateFromBroker(1, from)).toBe('2026-08-06')
  })

  it('pairs due + expected payment when set', () => {
    expect(resolveDueDatesFromBroker(0, from)).toEqual({})
    expect(resolveDueDatesFromBroker(10, from)).toEqual({
      due_date: '2026-08-15',
      expected_payment_date: '2026-08-15',
    })
  })
})
