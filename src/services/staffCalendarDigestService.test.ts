import { describe, expect, it } from 'vitest'
import type { Invoice } from '../types/invoice'
import { buildStaffCalendarDigestTasks } from './staffCalendarDigestService'

function baseInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: 'inv-1',
    invoice_number: '9001',
    client_id: 'c1',
    client_name: 'Acme Trucking',
    broker_id: 'b1',
    broker_name: 'TQL',
    amount: 1800,
    invoice_date: '2026-07-01',
    due_date: '2026-08-14',
    expected_payment_date: '2026-08-14',
    status: 'approved',
    created_at: '2026-07-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('buildStaffCalendarDigestTasks', () => {
  it('includes Call Back and Invoice due when those dates are today', () => {
    const asOf = new Date('2026-08-14T12:00:00')
    const tasks = buildStaffCalendarDigestTasks(
      [
        baseInvoice({
          id: 'inv-cb',
          collection_status: 'C/B',
          collection_date: '2026-08-14',
        }),
        baseInvoice({
          id: 'inv-due',
          due_date: '2026-08-14',
        }),
      ],
      [],
      asOf,
      []
    )

    expect(tasks.some((t) => t.id === 'live-callback-inv-cb')).toBe(true)
    expect(tasks.some((t) => t.id === 'live-due-inv-due')).toBe(true)
  })

  it('excludes future-dated events from the digest', () => {
    const tasks = buildStaffCalendarDigestTasks(
      [
        baseInvoice({
          id: 'inv-future',
          due_date: '2026-09-01',
        }),
      ],
      [],
      new Date('2026-08-14T12:00:00'),
      []
    )
    expect(tasks.some((t) => t.id === 'live-due-inv-future')).toBe(false)
  })
})
