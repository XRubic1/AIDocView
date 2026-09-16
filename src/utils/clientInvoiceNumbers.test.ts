import { describe, expect, it } from 'vitest'
import {
  ensureUniqueClientInvoiceNumber,
  formatClientInvoiceNumber,
  getMaxInvoiceSequence,
  getNextClientInvoiceNumber,
  isInvoiceNumberTaken,
  parseInvoiceNumberSequence,
} from './clientInvoiceNumbers'
import { hydrateInvoices } from '../data/mockInvoices'

describe('clientInvoiceNumbers', () => {
  it('parses plain and legacy invoice numbers', () => {
    expect(parseInvoiceNumberSequence('001')).toBe(1)
    expect(parseInvoiceNumberSequence('4401')).toBe(4401)
    expect(parseInvoiceNumberSequence('INV-2026-003')).toBe(3)
  })

  it('formats with leading zeros under 1000', () => {
    expect(formatClientInvoiceNumber(1)).toBe('001')
    expect(formatClientInvoiceNumber(4402)).toBe('4402')
  })

  it('increments from existing client invoices', () => {
    hydrateInvoices([
      {
        id: 'inv-1',
        invoice_number: 'INV-2026-003',
        client_id: 'client-a',
        client_name: 'A',
        broker_id: '',
        broker_name: 'B',
        amount: 100,
        invoice_date: '2026-01-01',
        due_date: '2026-02-01',
        expected_payment_date: '2026-02-01',
        status: 'pending',
        created_at: '2026-01-01T00:00:00Z',
      },
    ])

    expect(getMaxInvoiceSequence('client-a')).toBe(3)
    expect(getNextClientInvoiceNumber('client-a')).toBe('004')
    expect(isInvoiceNumberTaken('client-a', '003')).toBe(true)
    expect(ensureUniqueClientInvoiceNumber('client-a', '003')).toBe('004')
    expect(ensureUniqueClientInvoiceNumber('client-a', '4401')).toBe('4401')
    // Extra reserved list (e.g. from DB) skips ahead of collisions.
    expect(getNextClientInvoiceNumber('client-a', ['004', '005'])).toBe('006')
    hydrateInvoices([])
  })
})
