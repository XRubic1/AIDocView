import { describe, expect, it } from 'vitest'
import type { Invoice } from '../types/invoice'
import type { Payment } from '../types/payment'
import {
  deriveClientCalendarEvents,
  getClientCalendarInvoicePayDate,
} from './deriveClientCalendarEvents'

function baseInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: 'inv-1',
    invoice_number: '8801',
    client_id: 'c1',
    client_name: 'Acme Trucking',
    broker_id: 'b1',
    broker_name: 'TQL',
    amount: 2500,
    invoice_date: '2026-07-01',
    due_date: '2026-08-15',
    expected_payment_date: '2026-08-20',
    status: 'approved',
    created_at: '2026-07-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('getClientCalendarInvoicePayDate', () => {
  it('uses the invoice expected payment date', () => {
    expect(getClientCalendarInvoicePayDate(baseInvoice())).toEqual({
      date: '2026-08-20',
      kind: 'expected',
    })
  })

  it('uses Will Pay collection_date over expected_payment_date', () => {
    expect(
      getClientCalendarInvoicePayDate(
        baseInvoice({
          collection_status: 'W/P',
          collection_date: '2026-09-12',
        })
      )
    ).toEqual({ date: '2026-09-12', kind: 'will_pay' })
  })
})

describe('deriveClientCalendarEvents', () => {
  const asOf = new Date('2026-08-05T12:00:00')

  it('places expected payment on the invoice date, not a forecast', () => {
    const events = deriveClientCalendarEvents([baseInvoice()], [], asOf)
    const expected = events.find((e) => e.id === 'live-expect-inv-1')
    expect(expected?.dueDate).toBe('2026-08-20')
    expect(expected?.title).toBe('Expected payment')
    expect(expected?.detail).not.toMatch(/forecast/i)
  })

  it('places Will Pay on the scheduled remittance date', () => {
    const events = deriveClientCalendarEvents(
      [
        baseInvoice({
          collection_status: 'W/P',
          collection_date: '2026-09-12',
        }),
      ],
      [],
      asOf
    )
    const willPay = events.find((e) => e.id === 'live-willpay-inv-1')
    expect(willPay?.title).toBe('Will Pay')
    expect(willPay?.dueDate).toBe('2026-09-12')
    expect(events.some((e) => e.id === 'live-expect-inv-1')).toBe(false)
  })

  it('reads Will Pay from a status note when collection_status is missing', () => {
    const events = deriveClientCalendarEvents(
      [
        baseInvoice({
          notes_history: [
            {
              id: 'n1',
              note: 'Status: Will Pay · 09/12/2026 — This will be paid',
              created_by: 'Admin',
              created_at: '2026-08-10T00:00:00Z',
              type: 'status_update',
            },
          ],
        }),
      ],
      [],
      asOf
    )
    expect(events.find((e) => e.id === 'live-willpay-inv-1')?.dueDate).toBe('2026-09-12')
  })

  it('keeps past expected dates on their real day instead of clamping to today', () => {
    const events = deriveClientCalendarEvents(
      [baseInvoice({ expected_payment_date: '2026-07-10', due_date: '2026-07-10' })],
      [],
      asOf
    )
    expect(events.find((e) => e.id === 'live-expect-inv-1')?.dueDate).toBe('2026-07-10')
  })

  it('skips invoices with no expected or Will Pay date', () => {
    const events = deriveClientCalendarEvents(
      [baseInvoice({ expected_payment_date: undefined, due_date: undefined })],
      [],
      asOf
    )
    expect(events.some((e) => e.type === 'expected_payment')).toBe(false)
  })

  it('does not invent expected pay from a confirmed payment pattern', () => {
    const payments: Payment[] = [
      {
        id: 'p1',
        invoice_id: 'other',
        invoice_number: '1',
        broker_name: 'TQL',
        amount: 1000,
        payment_date: '2026-08-01',
        received_date: '2026-08-30',
        payment_method: 'ach',
        status: 'confirmed',
      },
    ]
    const events = deriveClientCalendarEvents([baseInvoice()], payments, asOf)
    expect(events.find((e) => e.id === 'live-expect-inv-1')?.dueDate).toBe('2026-08-20')
  })
})
