import { describe, expect, it } from 'vitest'
import type { Invoice } from '../types/invoice'
import { DEFAULT_COLLECTIONS_POLICY } from './collectionsPolicy'
import { getCollectionsTrackStage, isUrgentCollectionStage } from './collectionsTrack'

function invoice(partial: Partial<Invoice>): Invoice {
  return {
    id: 'inv-1',
    invoice_number: 'INV-1',
    client_id: 'c1',
    client_name: 'Carrier',
    broker_id: 'b1',
    broker_name: 'Broker Co',
    amount: 1000,
    invoice_date: '2026-09-01',
    due_date: '2026-09-30',
    status: 'approved',
    created_at: '2026-09-01T12:00:00.000Z',
    ...partial,
  }
}

describe('collections track', () => {
  const asOf = new Date('2026-09-14T12:00:00')

  it('flags open invoices with no PPW as a major issue', () => {
    const stage = getCollectionsTrackStage({ invoice: invoice({}), asOf })
    expect(stage).toBe('no_ppw')
    expect(isUrgentCollectionStage(stage)).toBe(true)
  })

  it('waits for the broker paperwork-check window after PPW', () => {
    const stage = getCollectionsTrackStage({
      invoice: invoice({
        document_send_history: [
          { email_address: 'ap@broker.test', sent_at: '2026-09-10T12:00:00.000Z', status: 'sent' },
        ],
      }),
      broker: { paperwork_status_check_days: 7 },
      asOf,
    })
    expect(stage).toBe('ppw_waiting')
  })

  it('moves to PPW status check after the broker’s confirm days', () => {
    const stage = getCollectionsTrackStage({
      invoice: invoice({
        document_send_history: [
          { email_address: 'ap@broker.test', sent_at: '2026-09-01T12:00:00.000Z', status: 'sent' },
        ],
      }),
      broker: { paperwork_status_check_days: 7 },
      asOf,
    })
    expect(stage).toBe('ppw_check')
  })

  it('uses a longer broker confirm window when set', () => {
    const stage = getCollectionsTrackStage({
      invoice: invoice({
        document_send_history: [
          { email_address: 'ap@broker.test', sent_at: '2026-09-01T12:00:00.000Z', status: 'sent' },
        ],
      }),
      broker: { paperwork_status_check_days: 15 },
      asOf,
    })
    expect(stage).toBe('ppw_waiting')
  })

  it('enters payment waiting after broker confirmed and before Net terms', () => {
    const stage = getCollectionsTrackStage({
      invoice: invoice({
        due_date: '2026-09-30',
        document_send_history: [
          { email_address: 'ap@broker.test', sent_at: '2026-09-01T12:00:00.000Z', status: 'sent' },
        ],
        email_lifecycle: { paperwork_status: 'good' },
      }),
      asOf,
    })
    expect(stage).toBe('payment_waiting')
  })

  it('enters payment verify on the due date', () => {
    const stage = getCollectionsTrackStage({
      invoice: invoice({
        due_date: '2026-09-14',
        document_send_history: [
          { email_address: 'ap@broker.test', sent_at: '2026-08-01T12:00:00.000Z', status: 'sent' },
        ],
        email_lifecycle: { paperwork_status: 'good' },
      }),
      paymentVerifyUrgentDays: DEFAULT_COLLECTIONS_POLICY.paymentVerifyUrgentDays,
      asOf,
    })
    expect(stage).toBe('payment_verify')
  })

  it('enters urgent collection after Net + configured days', () => {
    const stage = getCollectionsTrackStage({
      invoice: invoice({
        due_date: '2026-09-01',
        document_send_history: [
          { email_address: 'ap@broker.test', sent_at: '2026-08-01T12:00:00.000Z', status: 'sent' },
        ],
        email_lifecycle: { paperwork_status: 'good' },
      }),
      paymentVerifyUrgentDays: 5,
      asOf,
    })
    expect(stage).toBe('past_due_urgent')
    expect(isUrgentCollectionStage(stage)).toBe(true)
  })
})
