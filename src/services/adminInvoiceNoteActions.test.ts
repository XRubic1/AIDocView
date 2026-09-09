import { beforeEach, describe, expect, it } from 'vitest'
import { clearInvoices, hydrateInvoices, mockInvoices } from '../data/mockInvoices'
import type { Invoice } from '../types/invoice'
import {
  addAdminInvoiceNote,
  isCredyxRemovableNote,
  postInvoiceStatusNote,
  removeAdminInvoiceNote,
} from './adminInvoiceNoteActions'

function seedInvoice(): Invoice {
  const invoice: Invoice = {
    id: 'inv-note-test',
    invoice_number: '1001',
    client_id: 'c1',
    client_name: 'Test Carrier',
    broker_id: 'b1',
    broker_name: 'Test Broker',
    amount: 1000,
    invoice_date: '2026-08-01',
    status: 'open',
    notes: '',
    notes_history: [],
    created_at: '2026-08-01T00:00:00.000Z',
  }
  hydrateInvoices([invoice])
  return invoice
}

describe('removeAdminInvoiceNote', () => {
  beforeEach(() => {
    clearInvoices()
    seedInvoice()
  })

  it('removes Credyx free-text notes only', () => {
    const added = addAdminInvoiceNote('inv-note-test', 'Follow up Monday', 'Admin')
    expect(added?.notes_history).toHaveLength(1)
    const noteId = added!.notes_history![0].id
    expect(isCredyxRemovableNote(added!.notes_history![0])).toBe(true)

    const updated = removeAdminInvoiceNote('inv-note-test', noteId)
    expect(updated?.notes_history).toEqual([])
    expect(updated?.notes).toBe('')
  })

  it('removes Credyx status notes and clears Call Back collection fields', () => {
    const invoice = mockInvoices[0]
    invoice.collection_status = 'C/B'
    invoice.collection_date = '2026-08-20'
    invoice.notes_history = [
      {
        id: 'note-status-cb',
        note: 'Status: Call Back · 08/20/2026',
        created_by: 'Admin',
        created_at: '2026-08-05T10:00:00.000Z',
        type: 'status_update',
        visibility: 'client',
      },
    ]
    expect(isCredyxRemovableNote(invoice.notes_history[0])).toBe(true)

    const updated = removeAdminInvoiceNote('inv-note-test', 'note-status-cb')
    expect(updated?.notes_history).toEqual([])
    expect(updated?.collection_status).toBeUndefined()
    expect(updated?.collection_date).toBeUndefined()
  })

  it('refuses carrier client_note entries', () => {
    const invoice = mockInvoices[0]
    invoice.notes_history = [
      {
        id: 'note-carrier-1',
        note: 'Carrier question',
        created_by: 'Carrier',
        created_at: new Date().toISOString(),
        type: 'client_note',
      },
    ]

    const result = removeAdminInvoiceNote('inv-note-test', 'note-carrier-1')
    expect(result).toBeUndefined()
    expect(invoice.notes_history).toHaveLength(1)
  })

  it('keeps internal notes out of flattened notes string after remove', () => {
    const invoice = mockInvoices[0]
    invoice.notes_history = [
      {
        id: 'note-admin-visible',
        note: 'Visible',
        created_by: 'Admin',
        created_at: '2026-08-05T10:00:00.000Z',
        type: 'note',
        visibility: 'client',
      },
      {
        id: 'note-admin-secret',
        note: 'Secret',
        created_by: 'Admin',
        created_at: '2026-08-05T10:01:00.000Z',
        type: 'note',
        visibility: 'internal',
      },
    ]
    invoice.notes = 'Visible'

    const updated = removeAdminInvoiceNote('inv-note-test', 'note-admin-visible')
    expect(updated?.notes_history).toHaveLength(1)
    expect(updated?.notes_history?.[0].note).toBe('Secret')
    expect(updated?.notes).toBe('')
  })
})

describe('postInvoiceStatusNote — set due date', () => {
  beforeEach(() => {
    clearInvoices()
    seedInvoice()
  })

  it('sets due_date and expected_payment_date with a status note', () => {
    const updated = postInvoiceStatusNote('inv-note-test', {
      kind: 'set_due_date',
      authorName: 'Admin',
      collectionDate: '2026-09-10',
    })
    expect(updated?.due_date).toBe('2026-09-10')
    expect(updated?.expected_payment_date).toBe('2026-09-10')
    expect(updated?.notes_history?.some((n) => /Due date set/i.test(n.note))).toBe(true)
  })

  it('requires a date for set_due_date', () => {
    const updated = postInvoiceStatusNote('inv-note-test', {
      kind: 'set_due_date',
      authorName: 'Admin',
    })
    expect(updated).toBeUndefined()
    expect(mockInvoices[0].due_date).toBeUndefined()
  })
})

describe('postInvoiceStatusNote — will pay', () => {
  beforeEach(() => {
    clearInvoices()
    seedInvoice()
  })

  it('sets Will Pay collection status and scheduled payment date', () => {
    const updated = postInvoiceStatusNote('inv-note-test', {
      kind: 'will_pay',
      authorName: 'Admin',
      collectionDate: '2026-09-20',
    })
    expect(updated?.collection_status).toBe('W/P')
    expect(updated?.collection_date).toBe('2026-09-20')
    expect(updated?.notes_history?.some((n) => /Will Pay/i.test(n.note))).toBe(true)
  })
})
