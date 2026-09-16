import { describe, expect, it } from 'vitest'
import {
  addDaysToYmd,
  buildBrokerTermsDueDatePatch,
  dueDatesForDatabase,
  formatBrokerDueDays,
  getInvoiceBrokerDueDays,
  resolveDueDateFromBroker,
  resolveDueDatesFromBroker,
  resolveEffectiveDueDate,
  isPlaceholderPaymentDueDate,
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

describe('dueDatesForDatabase', () => {
  it('keeps broker due dates when set', () => {
    expect(
      dueDatesForDatabase({
        invoice_date: '2026-08-01',
        due_date: '2026-09-01',
        expected_payment_date: '2026-09-01',
      })
    ).toEqual({ due_date: '2026-09-01', expected_payment_date: '2026-09-01' })
  })

  it('falls back to invoice_date so NOT NULL databases can save', () => {
    expect(
      dueDatesForDatabase({
        invoice_date: '2026-08-01',
      })
    ).toEqual({ due_date: '2026-08-01', expected_payment_date: '2026-08-01' })
  })
})

describe('buildBrokerTermsDueDatePatch', () => {
  const asOf = new Date(2026, 7, 11, 12, 0, 0) // Aug 11, 2026

  it('shifts an existing Net 30 due date to Net 45', () => {
    const patch = buildBrokerTermsDueDatePatch(
      {
        invoice_date: '2026-07-12',
        created_at: '2026-07-12T10:00:00.000Z',
        due_date: '2026-08-11',
        expected_payment_date: '2026-08-11',
      },
      45,
      30,
      asOf
    )
    expect(patch.due_date).toBe('2026-08-26')
    expect(patch.expected_payment_date).toBe('2026-08-26')
    expect(patch.days_since_expected).toBe(0)
  })

  it('clears due dates when terms go to 0', () => {
    const patch = buildBrokerTermsDueDatePatch(
      {
        invoice_date: '2026-07-12',
        created_at: '2026-07-12T10:00:00.000Z',
        due_date: '2026-08-11',
        expected_payment_date: '2026-08-11',
      },
      0,
      30,
      asOf
    )
    expect(patch.due_date).toBeUndefined()
    expect(patch.expected_payment_date).toBeUndefined()
    expect(patch.days_since_expected).toBeUndefined()
  })

  it('stamps invoice_date + N when there was no prior due', () => {
    const patch = buildBrokerTermsDueDatePatch(
      {
        invoice_date: '2026-07-12',
        created_at: '2026-07-12T10:00:00.000Z',
      },
      45,
      0,
      asOf
    )
    expect(patch.due_date).toBe('2026-08-26')
  })
})

describe('resolveEffectiveDueDate', () => {
  it('uses invoice_date + live broker terms for open invoices', () => {
    expect(
      resolveEffectiveDueDate(
        {
          status: 'approved',
          invoice_date: '2026-06-27',
          created_at: '2026-06-27T10:00:00.000Z',
          due_date: '2026-07-27',
          expected_payment_date: '2026-07-27',
        },
        45
      )
    ).toBe('2026-08-11')
  })

  it('keeps stored due on paid invoices', () => {
    expect(
      resolveEffectiveDueDate(
        {
          status: 'paid',
          invoice_date: '2026-06-27',
          created_at: '2026-06-27T10:00:00.000Z',
          due_date: '2026-07-27',
          expected_payment_date: '2026-07-27',
        },
        45
      )
    ).toBe('2026-07-27')
  })
})

describe('formatBrokerDueDays / getInvoiceBrokerDueDays', () => {
  it('formats Net terms for the invoices list', () => {
    expect(formatBrokerDueDays(45)).toBe('45d')
    expect(formatBrokerDueDays(0)).toBe('—')
    expect(formatBrokerDueDays(undefined)).toBe('—')
  })

  it('prefers live broker terms over stored dates', () => {
    expect(
      getInvoiceBrokerDueDays(
        {
          broker_id: 'broker-1',
          broker_name: 'TQL',
          invoice_date: '2026-07-12',
          due_date: '2026-08-11',
        },
        [{ id: 'broker-1', name: 'TQL', payment_terms_days: 45 }]
      )
    ).toBe(45)
  })

  it('falls back to due − invoice date when broker terms are missing', () => {
    expect(
      getInvoiceBrokerDueDays(
        {
          broker_id: 'broker-1',
          broker_name: 'TQL',
          invoice_date: '2026-07-12',
          due_date: '2026-08-11',
        },
        []
      )
    ).toBe(30)
  })
})

describe('addDaysToYmd', () => {
  it('adds calendar days without UTC shift', () => {
    expect(addDaysToYmd('2026-07-12', 15)).toBe('2026-07-27')
  })
})

describe('isPlaceholderPaymentDueDate', () => {
  it('treats due date on the invoice/purchase day as a placeholder', () => {
    expect(
      isPlaceholderPaymentDueDate({
        invoice_date: '2026-09-16',
        due_date: '2026-09-16',
        expected_payment_date: '2026-09-16',
      })
    ).toBe(true)
  })

  it('keeps a real Net-terms due date', () => {
    expect(
      isPlaceholderPaymentDueDate({
        invoice_date: '2026-09-16',
        due_date: '2026-10-16',
        expected_payment_date: '2026-10-16',
      })
    ).toBe(false)
  })
})
