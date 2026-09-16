import { describe, expect, it } from 'vitest'
import type { Invoice } from '../types/invoice'
import { getNextBrokerFollowup, toBrokerFollowupCalendarEvent } from './nextBrokerFollowup'

function invoice(partial: Partial<Invoice> = {}): Invoice {
  return {
    id: 'inv-1',
    invoice_number: 'INV-1',
    client_id: 'c1',
    client_name: 'Carrier Co',
    broker_id: 'b1',
    broker_name: 'TQL',
    amount: 1800,
    invoice_date: '2026-09-01',
    due_date: '2026-09-30',
    status: 'approved',
    created_at: '2026-09-01T12:00:00.000Z',
    document_send_history: [
      { email_address: 'ap@broker.test', sent_at: '2026-09-10T12:00:00.000Z', status: 'sent' },
    ],
    ...partial,
  }
}

describe('getNextBrokerFollowup', () => {
  const asOf = new Date('2026-09-12T12:00:00')

  it('schedules paperwork check PPW + broker confirm days after process', () => {
    const next = getNextBrokerFollowup({
      invoice: invoice(),
      broker: { paperwork_status_check_days: 7 },
      asOf,
    })
    expect(next).toEqual({
      date: '2026-09-17',
      kind: 'paperwork_check',
      label: 'Paperwork check',
      due: false,
    })
  })

  it('uses the default 7-day paperwork window when the broker has no override', () => {
    const next = getNextBrokerFollowup({ invoice: invoice(), asOf })
    expect(next?.date).toBe('2026-09-17')
    expect(next?.kind).toBe('paperwork_check')
  })

  it('marks paperwork check due once the window has elapsed', () => {
    const next = getNextBrokerFollowup({
      invoice: invoice(),
      broker: { paperwork_status_check_days: 7 },
      asOf: new Date('2026-09-18T12:00:00'),
    })
    expect(next?.kind).toBe('paperwork_check')
    expect(next?.date).toBe('2026-09-17')
    expect(next?.due).toBe(true)
  })

  it('uses last inquiry + follow-up days after Credyx has already reached out', () => {
    const next = getNextBrokerFollowup({
      invoice: invoice({
        document_send_history: [
          { email_address: 'ap@broker.test', sent_at: '2026-09-01T12:00:00.000Z', status: 'sent' },
        ],
        collections_last_inquiry_at: '2026-09-10T12:00:00.000Z',
      }),
      asOf: new Date('2026-09-11T12:00:00'),
    })
    expect(next).toMatchObject({
      date: '2026-09-13',
      kind: 'payment_followup',
      due: false,
    })
  })

  it('schedules payment check on the due date after paperwork is confirmed', () => {
    const next = getNextBrokerFollowup({
      invoice: invoice({
        email_lifecycle: { paperwork_status: 'good' },
      }),
      asOf,
    })
    expect(next).toEqual({
      date: '2026-09-30',
      kind: 'payment_due',
      label: 'Payment check',
      due: false,
    })
  })

  it('uses the Call Back date when scheduled', () => {
    const next = getNextBrokerFollowup({
      invoice: invoice({
        collection_status: 'C/B',
        collection_date: '2026-09-20',
      }),
      asOf,
    })
    expect(next?.kind).toBe('callback')
    expect(next?.date).toBe('2026-09-20')
  })
})

describe('toBrokerFollowupCalendarEvent', () => {
  const asOf = new Date('2026-09-12T12:00:00')

  it('places a future paperwork check on that calendar day', () => {
    const inv = invoice()
    const followup = getNextBrokerFollowup({
      invoice: inv,
      broker: { paperwork_status_check_days: 7 },
      asOf,
    })
    expect(followup).toBeTruthy()
    const evt = toBrokerFollowupCalendarEvent({
      invoice: inv,
      followup: followup!,
      asOf,
      audience: 'admin',
    })
    expect(evt?.id).toBe('live-broker-followup-inv-1')
    expect(evt?.dueDate).toBe('2026-09-17')
    expect(evt?.title).toBe('Broker paperwork check')
    expect(evt?.owner).toBe('credyx_staff')
  })

  it('shows the same follow-up on the carrier calendar as a reminder', () => {
    const inv = invoice()
    const followup = getNextBrokerFollowup({ invoice: inv, asOf })
    const evt = toBrokerFollowupCalendarEvent({
      invoice: inv,
      followup: followup!,
      asOf,
      audience: 'client',
    })
    expect(evt?.type).toBe('reminder')
    expect(evt?.owner).toBe('system')
    expect(evt?.dueDate).toBe('2026-09-17')
  })

  it('does not duplicate Will Pay / due-date events', () => {
    const inv = invoice({
      email_lifecycle: { paperwork_status: 'good' },
    })
    const followup = getNextBrokerFollowup({ invoice: inv, asOf })
    expect(followup?.kind).toBe('payment_due')
    expect(
      toBrokerFollowupCalendarEvent({
        invoice: inv,
        followup: followup!,
        asOf,
        audience: 'admin',
      })
    ).toBeNull()
  })
})
