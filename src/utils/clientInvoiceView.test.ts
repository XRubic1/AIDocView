import { describe, expect, it, beforeEach } from 'vitest'
import {
  toClientVisibleInvoice,
  toClientVisibleStatus,
  clientVisibleNotes,
  isInvoicePendingClientReveal,
  isClientVisibleHold,
} from './clientInvoiceView'
import type { Invoice, InvoiceNote } from '../types/invoice'
import { hydrateInvoices } from '../data/mockInvoices'
import { hydrateBatches } from '../data/mockBatches'

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

  beforeEach(() => {
    hydrateInvoices([])
    hydrateBatches([])
  })

  it('masks write_off_pending as written_off for clients', () => {
    expect(toClientVisibleStatus('write_off_pending')).toBe('written_off')
    const visible = toClientVisibleInvoice(baseInvoice)
    expect(visible.status).toBe('written_off')
    expect('write_off_request' in visible).toBe(false)
  })

  it('masks review as pending for clients', () => {
    expect(toClientVisibleStatus('review')).toBe('pending')
  })

  it('filters internal notes from client view', () => {
    const notes: InvoiceNote[] = baseInvoice.notes_history ?? []
    expect(clientVisibleNotes(notes)).toHaveLength(1)
    expect(clientVisibleNotes(notes)[0].note).toBe('Client note')
  })

  it('keeps invoices Pending and hides admin notes while batch is still open', () => {
    hydrateBatches([
      {
        id: 'batch-1',
        batch_number: 'B-1',
        client_id: 'c1',
        client_name: 'Test Carrier',
        total_invoices: 1,
        total_amount: 1000,
        status: 'ready_to_post',
        submitted_at: '2026-01-01T00:00:00Z',
      },
    ])

    const heldDuringVerify: Invoice = {
      ...baseInvoice,
      status: 'hold',
      batch_id: 'batch-1',
      hold_reason: 'Missing POD',
      notes: 'Verified via: Email',
      notes_history: [
        ...(baseInvoice.notes_history ?? []),
        {
          id: 'n3',
          note: 'Verified via: Email | Note: waiting on broker',
          created_by: 'Admin User',
          created_at: '2026-01-03T00:00:00Z',
          type: 'note',
        },
      ],
    }

    expect(isInvoicePendingClientReveal(heldDuringVerify)).toBe(true)
    expect(isClientVisibleHold(heldDuringVerify)).toBe(false)

    const visible = toClientVisibleInvoice(heldDuringVerify)
    expect(visible.status).toBe('pending')
    expect(visible.hold_reason).toBeUndefined()
    expect(visible.notes).toBeUndefined()
    expect(visible.notes_history).toHaveLength(1)
    expect(visible.notes_history?.[0].type).toBe('client_note')
  })

  it('also masks holds while batch is in verification', () => {
    hydrateBatches([
      {
        id: 'batch-1',
        batch_number: 'B-1',
        client_id: 'c1',
        client_name: 'Test Carrier',
        total_invoices: 1,
        total_amount: 1000,
        status: 'verification',
        submitted_at: '2026-01-01T00:00:00Z',
      },
    ])

    const held: Invoice = {
      ...baseInvoice,
      status: 'hold',
      batch_id: 'batch-1',
      hold_reason: 'Carrier mismatch',
    }

    const visible = toClientVisibleInvoice(held)
    expect(visible.status).toBe('pending')
    expect(visible.hold_reason).toBeUndefined()
  })

  it('reveals hold status and verification notes after batch is processed', () => {
    hydrateBatches([
      {
        id: 'batch-1',
        batch_number: 'B-1',
        client_id: 'c1',
        client_name: 'Test Carrier',
        total_invoices: 1,
        total_amount: 1000,
        status: 'submitted',
        submitted_at: '2026-01-01T00:00:00Z',
      },
    ])

    const held: Invoice = {
      ...baseInvoice,
      status: 'hold',
      batch_id: 'batch-1',
      hold_reason: 'Missing POD',
      notes_history: [
        {
          id: 'n3',
          note: 'Verified via: Email',
          created_by: 'Admin User',
          created_at: '2026-01-03T00:00:00Z',
          type: 'note',
        },
      ],
    }

    expect(isInvoicePendingClientReveal(held)).toBe(false)
    expect(isClientVisibleHold(held)).toBe(true)

    const visible = toClientVisibleInvoice(held)
    expect(visible.status).toBe('hold')
    expect(visible.hold_reason).toBe('Missing POD')
    expect(visible.notes_history).toHaveLength(1)
    expect(visible.notes_history?.[0].note).toBe('Verified via: Email')
  })
})
