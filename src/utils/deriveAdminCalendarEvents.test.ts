import { describe, expect, it } from 'vitest'
import type { Invoice } from '../types/invoice'
import { deriveAdminCalendarEvents } from './deriveAdminCalendarEvents'

function baseInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: 'inv-cb-1',
    invoice_number: '4501',
    client_id: 'c1',
    client_name: 'Acme Trucking',
    broker_id: 'b1',
    broker_name: 'TQL',
    amount: 2500,
    invoice_date: '2026-07-01',
    due_date: '2026-08-01',
    expected_payment_date: '2026-08-01',
    status: 'approved',
    created_at: '2026-07-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('deriveAdminCalendarEvents — status notes', () => {
  it('adds Call Back on the collection_date', () => {
    const events = deriveAdminCalendarEvents(
      [
        baseInvoice({
          collection_status: 'C/B',
          collection_date: '2026-08-20',
        }),
      ],
      [],
      new Date('2026-08-05T12:00:00')
    )
    const cb = events.find((e) => e.id === 'live-callback-inv-cb-1')
    expect(cb?.type).toBe('call')
    expect(cb?.title).toBe('Call Back')
    expect(cb?.dueDate).toBe('2026-08-20')
    expect(cb?.owner).toBe('credyx_staff')
  })

  it('adds Will Pay as expected payment on the collection_date', () => {
    const events = deriveAdminCalendarEvents(
      [
        baseInvoice({
          id: 'inv-wp',
          collection_status: 'W/P',
          collection_date: '2026-08-22',
        }),
      ],
      [],
      new Date('2026-08-05T12:00:00')
    )
    const wp = events.find((e) => e.id === 'live-willpay-inv-wp')
    expect(wp?.type).toBe('expected_payment')
    expect(wp?.title).toBe('Will Pay')
    expect(wp?.dueDate).toBe('2026-08-22')
    expect(wp?.owner).toBe('credyx_staff')
  })

  it('adds Payment status confirmed from the latest status note', () => {
    const events = deriveAdminCalendarEvents(
      [
        baseInvoice({
          id: 'inv-pc',
          notes_history: [
            {
              id: 'note-status-1',
              note: 'Status: Payment status confirmed · 08/18/2026',
              created_by: 'Admin',
              created_at: '2026-08-10T15:00:00.000Z',
              type: 'status_update',
              visibility: 'client',
            },
          ],
        }),
      ],
      [],
      new Date('2026-08-05T12:00:00')
    )
    const pc = events.find((e) => e.id === 'live-payconfirm-inv-pc')
    expect(pc?.type).toBe('payment_status_check')
    expect(pc?.title).toBe('Payment status confirmed')
    expect(pc?.dueDate).toBe('2026-08-18')
    expect(pc?.owner).toBe('credyx_staff')
  })

  it('skips Call Back without a date or on paid invoices', () => {
    const events = deriveAdminCalendarEvents(
      [
        baseInvoice({
          id: 'inv-no-date',
          collection_status: 'C/B',
        }),
        baseInvoice({
          id: 'inv-paid',
          status: 'paid',
          collection_status: 'C/B',
          collection_date: '2026-08-20',
        }),
      ],
      [],
      new Date('2026-08-05T12:00:00')
    )
    expect(events.some((e) => e.id.startsWith('live-callback-'))).toBe(false)
  })
})
