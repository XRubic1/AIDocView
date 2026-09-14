import { describe, expect, it } from 'vitest'
import type { Invoice } from '../types/invoice'
import {
  isBrokerContactActivityNote,
  matchesCollectionsFocus,
  resolveLastBrokerContact,
  type AdminCollectionsRow,
} from './adminCollections'

function row(partial: Partial<AdminCollectionsRow>): AdminCollectionsRow {
  return {
    invoice: { id: '1', invoice_number: 'INV-1' } as Invoice,
    broker: undefined,
    amount: 1000,
    ageDays: 20,
    dueDate: '2026-08-01',
    dueDays: 30,
    daysPastDue: 0,
    isOverdue: false,
    confirmedPayDate: null,
    collectionStatus: undefined,
    ppwSentAt: '2026-07-20',
    daysSincePpw: 16,
    paperworkCheckDays: 7,
    inquiryDays: 15,
    trackStage: 'payment_verify',
    chaseStatus: 'not_due',
    lastContact: null,
    brokerRiskLevel: 'unrated',
    isUrgent: false,
    isUrgentCollection: false,
    urgentReasons: [],
    isCallbackDue: false,
    ...partial,
  }
}

describe('matchesCollectionsFocus', () => {
  it('keeps Will Pay out of overdue-only when not past-due', () => {
    const willPay = row({
      collectionStatus: 'W/P',
      confirmedPayDate: '2026-08-15',
      isOverdue: false,
    })
    expect(matchesCollectionsFocus(willPay, 'will_pay')).toBe(true)
    expect(matchesCollectionsFocus(willPay, 'overdue')).toBe(false)
  })

  it('flags chase separately from due date', () => {
    const chase = row({ chaseStatus: 'due_for_inquiry' })
    expect(matchesCollectionsFocus(chase, 'chase')).toBe(true)
    expect(matchesCollectionsFocus(chase, 'overdue')).toBe(false)
  })

  it('puts missing PPW in the urgent collection queue', () => {
    const missing = row({
      ppwSentAt: null,
      trackStage: 'no_ppw',
      isUrgentCollection: true,
      urgentReasons: ['no_ppw'],
    })
    expect(matchesCollectionsFocus(missing, 'no_ppw')).toBe(true)
    expect(matchesCollectionsFocus(missing, 'urgent')).toBe(true)
  })
})

describe('resolveLastBrokerContact', () => {
  const base = {
    id: 'inv-1',
    invoice_number: 'D45-04',
    last_broker_contact: '2026-08-11T16:00:00.000Z',
    notes_history: [
      {
        id: 'n1',
        note: 'PPW sent to AGL GROUP AP (ap@aglgroup.example) — invoice, BOL, POD, rate con.',
        created_by: 'Credyx',
        created_at: '2026-06-27T15:20:00.000Z',
        type: 'status_update' as const,
      },
    ],
  } as Invoice

  it('does not treat PPW send or a silent timestamp as contact', () => {
    expect(resolveLastBrokerContact(base)).toBeNull()
  })

  it('uses payment-status inquiry time', () => {
    expect(
      resolveLastBrokerContact({
        ...base,
        collections_last_inquiry_at: '2026-08-01T12:00:00.000Z',
      })
    ).toBe('2026-08-01T12:00:00.000Z')
  })

  it('uses a Will Pay / inquiry note even without inquiry timestamp', () => {
    expect(
      resolveLastBrokerContact({
        ...base,
        notes_history: [
          ...base.notes_history!,
          {
            id: 'n2',
            note: 'Status: Will Pay · 08/20/2026',
            created_by: 'Credyx',
            created_at: '2026-08-05T10:00:00.000Z',
            type: 'status_update',
          },
        ],
      })
    ).toBe('2026-08-05T10:00:00.000Z')
  })

  it('recognizes inquiry and PPW notes correctly', () => {
    expect(isBrokerContactActivityNote('PPW sent to AGL GROUP AP')).toBe(false)
    expect(isBrokerContactActivityNote('Payment status inquiry emailed to broker.')).toBe(true)
  })
})
