import { describe, expect, it } from 'vitest'
import {
  toClientVisibleInvoice,
  toClientVisibleStatus,
  clientVisibleNotes,
} from './clientInvoiceView'
import type { Invoice, InvoiceNote } from '../types/invoice'

describe('clientInvoiceView', () => {
  const baseInvoice: Invoice = {
    id: 'inv-1',
    invoice_number: 'INV-001',
    client_id: 'c1',
    client_name: 'Test Carrier',
    broker_id: 'b1',
    broker_name: 'Broker',
    amount: 1000,
    invoice_date: '2026-01-01',
    due_date: '2026-01-31',
    expected_payment_date: '2026-01-31',
    status: 'write_off_pending',
    created_at: '2026-01-01T00:00:00Z',
    notes_history: [
      {
        id: 'n1',
        note: 'Client note',
        created_by: 'Client',
        created_at: '2026-01-02T00:00:00Z',
        type: 'client_note',
        visibility: 'client',
      },
      {
        id: 'n2',
        note: 'Internal only',
        created_by: 'Admin',
        created_at: '2026-01-02T00:00:00Z',
        type: 'note',
        visibility: 'internal',
      },
    ],
  }

  it('masks write_off_pending as written_off for clients', () => {
    expect(toClientVisibleStatus('write_off_pending')).toBe('written_off')
    const visible = toClientVisibleInvoice(baseInvoice)
    expect(visible.status).toBe('written_off')
    expect('write_off_request' in visible).toBe(false)
  })

  it('filters internal notes from client view', () => {
    const notes: InvoiceNote[] = baseInvoice.notes_history ?? []
    expect(clientVisibleNotes(notes)).toHaveLength(1)
    expect(clientVisibleNotes(notes)[0].note).toBe('Client note')
  })
})
