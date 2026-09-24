import { describe, expect, it } from 'vitest'
import type { Invoice } from '../types/invoice'
import {
  getInvoiceNoteStatusDisplay,
  getInvoiceStatusHeadline,
  getWillPayOverviewNote,
} from './invoiceStatusHeadline'

function invoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: 'inv-1',
    invoice_number: 'D30-08',
    client_id: 'c1',
    client_name: 'Demo',
    broker_id: 'b1',
    broker_name: 'AGL GROUP',
    amount: 2890,
    invoice_date: '2026-07-12',
    due_date: '2026-08-12',
    status: 'approved',
    created_at: '2026-07-12T00:00:00Z',
    ...overrides,
  }
}

const dispute = {
  id: 'd1',
  reason: 'amount_discrepancy',
  description: 'We are getting paid less than for the promised amount, please check the reason',
  status: 'open' as const,
  created_by: 'Carrier',
  created_at: '2026-09-10T12:00:00Z',
}

const willPayNote = {
  id: 'n-wp',
  note: 'Status: Will Pay · 09/18/2026 — The remaining amount will be paid, only $250.00 will be deducted due to missing lumper',
  created_by: 'Credyx',
  created_at: '2026-09-10T18:00:00Z',
  type: 'status_update' as const,
}

describe('invoiceStatusHeadline', () => {
  it('lets a later Will Pay override an open dispute', () => {
    const inv = invoice({
      collection_status: 'W/P',
      collection_date: '2026-09-18',
      disputes: [dispute],
      notes_history: [
        {
          id: 'n-d',
          note: 'Dispute opened: Amount discrepancy — We are getting paid less',
          created_by: 'Carrier',
          created_at: dispute.created_at,
          type: 'dispute',
        },
        willPayNote,
      ],
    })
    expect(getInvoiceStatusHeadline(inv)?.kind).toBe('will_pay')
    expect(getInvoiceNoteStatusDisplay(inv)).toBe('will_pay')
    expect(getWillPayOverviewNote(inv)?.note).toMatch(/09\/18\/2026/)
  })

  it('lets a later dispute override Will Pay', () => {
    const inv = invoice({
      collection_status: 'W/P',
      collection_date: '2026-09-18',
      disputes: [
        {
          ...dispute,
          created_at: '2026-09-11T00:00:00Z',
        },
      ],
      notes_history: [
        { ...willPayNote, created_at: '2026-09-10T00:00:00Z' },
        {
          id: 'n-d',
          note: 'Dispute opened: Amount discrepancy — still short',
          created_by: 'Carrier',
          created_at: '2026-09-11T00:00:00Z',
          type: 'dispute',
        },
      ],
    })
    expect(getInvoiceStatusHeadline(inv)?.kind).toBe('dispute')
    expect(getInvoiceNoteStatusDisplay(inv)).toBe('open_disputed')
    expect(getWillPayOverviewNote(inv)).toBeNull()
  })

  it('lets a later On Hold override Will Pay even with an open dispute', () => {
    const inv = invoice({
      status: 'hold',
      hold_reason: 'Broker rejected the lumper as its for a different load',
      collection_status: 'W/P',
      collection_date: '2026-09-18',
      updated_at: '2026-09-10T20:00:00Z',
      disputes: [dispute],
      notes_history: [
        {
          id: 'n-d',
          note: 'Dispute opened: Amount discrepancy — We are getting paid less',
          created_by: 'Carrier',
          created_at: dispute.created_at,
          type: 'dispute',
        },
        willPayNote,
        {
          id: 'n-hold',
          note: 'Broker rejected the lumper as its for a different load',
          created_by: 'Credyx',
          created_at: '2026-09-10T20:00:00Z',
          type: 'hold_reason',
        },
      ],
    })
    expect(getInvoiceStatusHeadline(inv)?.kind).toBe('hold')
    expect(getInvoiceNoteStatusDisplay(inv)).toBe('on_hold')
    expect(getWillPayOverviewNote(inv)).toBeNull()
  })

  it('uses collection_status Will Pay when no status note exists', () => {
    const inv = invoice({
      collection_status: 'W/P',
      collection_date: '2026-09-20',
      updated_at: '2026-09-12T00:00:00Z',
    })
    expect(getInvoiceNoteStatusDisplay(inv)).toBe('will_pay')
  })

  it('does not keep On Hold from stale hold_reason notes after status is approved', () => {
    const inv = invoice({
      status: 'approved',
      hold_reason: undefined,
      notes_history: [
        {
          id: 'n-hold',
          note: 'Missing POD page 2',
          created_by: 'Credyx',
          created_at: '2026-09-10T20:00:00Z',
          type: 'hold_reason',
        },
        {
          id: 'n-released',
          note: 'Hold released.',
          created_by: 'Credyx',
          created_at: '2026-09-11T12:00:00Z',
          type: 'status_update',
        },
      ],
    })
    expect(getInvoiceStatusHeadline(inv)?.kind).toBe('released')
    expect(getInvoiceNoteStatusDisplay(inv)).toBeNull()
  })

  it('ignores hold_reason notes when status is no longer hold (even without release note)', () => {
    const inv = invoice({
      status: 'approved',
      notes_history: [
        {
          id: 'n-hold',
          note: 'Broker asked for revised rate con',
          created_by: 'Credyx',
          created_at: '2026-09-12T00:00:00Z',
          type: 'hold_reason',
        },
      ],
    })
    expect(getInvoiceStatusHeadline(inv)?.kind).not.toBe('hold')
    expect(getInvoiceNoteStatusDisplay(inv)).not.toBe('on_hold')
  })
})
