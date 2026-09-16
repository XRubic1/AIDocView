import { describe, expect, it } from 'vitest'
import type { Invoice } from '../types/invoice'
import {
  buildCalendarInvoiceFacts,
  findCalendarInvoice,
  resolveInvoicePurchasedBy,
} from './calendarInvoiceDetails'

function invoice(partial: Partial<Invoice> = {}): Invoice {
  return {
    id: 'inv-1',
    invoice_number: '001',
    client_id: 'c1',
    client_name: 'Demo Carrier LLC',
    broker_id: 'b1',
    broker_name: 'LANDSTAR RANGER INC',
    amount: 1980,
    invoice_date: '2026-09-16',
    due_date: '2026-10-16',
    status: 'approved',
    created_at: '2026-09-16T14:00:00.000Z',
    ...partial,
  }
}

describe('resolveInvoicePurchasedBy', () => {
  it('uses the carrier when no confirming user is stored', () => {
    expect(resolveInvoicePurchasedBy(invoice())).toBe('Demo Carrier LLC')
  })

  it('includes the confirming user when it differs from the carrier', () => {
    expect(
      resolveInvoicePurchasedBy(invoice({ ai_confirmed_by: 'Petar' }))
    ).toBe('Petar · Demo Carrier LLC')
  })
})

describe('buildCalendarInvoiceFacts', () => {
  it('shows purchase date, purchaser, and recent notes', () => {
    const facts = buildCalendarInvoiceFacts(
      invoice({
        load_number: 'LD-100',
        ai_confirmed_by: 'Petar',
        notes_history: [
          {
            id: 'n1',
            note: 'Status: Broker confirmed paperwork',
            created_by: 'Credyx',
            created_at: '2026-09-16T15:00:00.000Z',
            type: 'status_update',
            visibility: 'client',
          },
        ],
      }),
      { includeInternal: true }
    )
    expect(facts.purchasedOn).toBeTruthy()
    expect(facts.purchasedBy).toBe('Petar · Demo Carrier LLC')
    expect(facts.brokerName).toBe('LANDSTAR RANGER INC')
    expect(facts.loadNumber).toBe('LD-100')
    expect(facts.notes[0]?.text).toMatch(/Broker confirmed/)
    expect(facts.notes[0]?.by).toBe('Credyx')
  })

  it('hides internal notes from the carrier view', () => {
    const facts = buildCalendarInvoiceFacts(
      invoice({
        notes_history: [
          {
            id: 'n-int',
            note: 'Internal chase plan',
            created_by: 'Admin',
            created_at: '2026-09-16T15:00:00.000Z',
            type: 'note',
            visibility: 'internal',
          },
        ],
      }),
      { includeInternal: false }
    )
    expect(facts.notes).toHaveLength(0)
  })
})

describe('findCalendarInvoice', () => {
  it('matches by invoice id', () => {
    const found = findCalendarInvoice([invoice()], { invoiceId: 'inv-1' })
    expect(found?.invoice_number).toBe('001')
  })
})
