import { describe, expect, it } from 'vitest'
import { buildPaymentStatusSnapshot, isPaymentStatusQuery } from './assistantPaymentStatus'
import type { Invoice } from '../types/invoice'
import type { Payment } from '../types/payment'

function baseInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: 'inv-2305',
    invoice_number: '2305',
    client_id: 'c1',
    client_name: 'Demo Carrier LLC',
    broker_id: 'b1',
    broker_name: 'TQL',
    amount: 3000,
    invoice_date: '2026-07-01',
    due_date: '2026-07-30',
    expected_payment_date: '2026-07-30',
    status: 'approved',
    created_at: '2026-07-01T00:00:00Z',
    ...overrides,
  }
}

function awaitingPartialPayment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: 'pay-2305',
    invoice_id: 'inv-2305',
    invoice_number: '2305',
    broker_name: 'TQL',
    amount: 2550,
    payment_date: '2026-07-28',
    received_date: '2026-07-28',
    payment_method: 'ach',
    status: 'awaiting_receipt',
    payment_kind: 'normal',
    notes: 'Demo seed — partial payment awaiting confirmation',
    posted_source: 'credyx',
    ...overrides,
  }
}

describe('assistantPaymentStatus — short remittance awaiting confirm', () => {
  it('labels #2305-shaped partial remittance clearly (not generic awaiting)', () => {
    const snap = buildPaymentStatusSnapshot(baseInvoice(), [awaitingPartialPayment()])

    expect(snap.headline).toBe('awaiting_carrier_receipt')
    expect(snap.headlineLabel).toBe('Partial payment awaiting confirmation')
    expect(snap.isPartialRemittance).toBe(true)
    expect(snap.postedAwaitingConfirm).toBe(2550)
    expect(snap.confirmedReceived).toBe(0)
    expect(snap.remainingAfterPending).toBe(450)
    expect(snap.summary).toMatch(/short remittance/i)
    expect(snap.summary).toMatch(/\$2,550/)
    expect(snap.summary).toMatch(/\$3,000/)
    expect(snap.summary).toMatch(/\$450/)
    expect(snap.balanceTone).toBe('short')
  })

  it('keeps full-amount awaiting as non-partial', () => {
    const snap = buildPaymentStatusSnapshot(baseInvoice(), [
      awaitingPartialPayment({ amount: 3000, notes: 'Full remittance awaiting confirm' }),
    ])

    expect(snap.isPartialRemittance).toBe(false)
    expect(snap.headlineLabel).toBe('Awaiting your payment confirmation')
    expect(snap.summary).toMatch(/\$3,000/)
    expect(snap.summary).not.toMatch(/short remittance/i)
  })

  it('detects short-pay and “what’s going on with Inv” queries', () => {
    expect(isPaymentStatusQuery('but i see there is a short payment?')).toBe(true)
    expect(isPaymentStatusQuery('What is going on with Inv# 2305?')).toBe(true)
    expect(isPaymentStatusQuery('Explain this underpaid invoice')).toBe(true)
  })
})
