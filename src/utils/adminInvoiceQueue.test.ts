import { describe, expect, it } from 'vitest'
import type { Invoice } from '../types/invoice'
import { enrichInvoice } from './invoiceAging'
import {
  buildAdminInvoiceQueueIndex,
  countAdminInvoiceFilters,
  createAdminInvoiceDisplayFlags,
  getAdminInvoiceDisplayBucket,
  invoicePassesDisplayFlags,
  matchesAnyAdminInvoiceStatusFilter,
  matchesAdminInvoiceStatusFilter,
  parseAdminInvoiceStatusFilters,
} from './adminInvoiceQueue'
import type { Payment } from '../types/payment'

function invoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: 'inv-1',
    invoice_number: '1001',
    client_id: 'c1',
    client_name: 'Demo Carrier LLC',
    broker_id: 'b1',
    broker_name: 'AGL GROUP',
    amount: 1000,
    invoice_date: '2026-07-01',
    due_date: '2026-07-15',
    status: 'approved',
    created_at: '2026-07-01T00:00:00Z',
    ...overrides,
  }
}

function payment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: 'p1',
    invoice_id: 'inv-1',
    invoice_number: '1001',
    broker_name: 'AGL GROUP',
    amount: 1000,
    payment_date: '2026-08-01',
    received_date: '2026-08-01',
    status: 'pending',
    payment_method: 'ach',
    ...overrides,
  }
}

describe('countAdminInvoiceFilters', () => {
  it('counts pending and awaiting invoices in the scoped list', () => {
    const asOf = new Date('2026-09-09')
    const invoices = [
      enrichInvoice(invoice({ id: 'inv-1' }), asOf),
      enrichInvoice(invoice({ id: 'inv-2', invoice_number: '1002', client_id: 'c2' }), asOf),
    ]
    const index = buildAdminInvoiceQueueIndex({
      pending: [payment({ id: 'p1', invoice_id: 'inv-1' })],
      awaiting: [payment({ id: 'p2', invoice_id: 'inv-2', status: 'awaiting_receipt' })],
      disputed: [],
      writeOffs: [],
    })
    const scoped = invoices.filter((row) => row.client_id === 'c1')
    const counts = countAdminInvoiceFilters(scoped, index.byInvoiceId)
    expect(counts.all).toBe(1)
    expect(counts.pending_payment).toBe(1)
    expect(counts.awaiting_confirmation).toBe(0)
    expect(matchesAdminInvoiceStatusFilter(invoices[0], 'pending_payment', index.byInvoiceId.get('inv-1'))).toBe(
      true
    )
  })

  it('matches invoices that hit any of the selected filters', () => {
    const asOf = new Date('2026-09-09')
    const hold = enrichInvoice(invoice({ id: 'h', status: 'hold' }), asOf)
    const open = enrichInvoice(invoice({ id: 'o', status: 'approved' }), asOf)
    expect(matchesAnyAdminInvoiceStatusFilter(hold, ['hold', 'approved'])).toBe(true)
    expect(matchesAnyAdminInvoiceStatusFilter(open, ['hold', 'approved'])).toBe(true)
    expect(matchesAnyAdminInvoiceStatusFilter(open, ['hold'])).toBe(false)
    expect(parseAdminInvoiceStatusFilters('overdue,hold')).toEqual(['overdue', 'hold'])
  })
})

describe('invoicePassesDisplayFlags', () => {
  it('assigns one exclusive bucket so turning Open off still shows overdue', () => {
    const asOf = new Date('2026-09-09')
    const overdue = enrichInvoice(
      invoice({
        id: 'ov',
        status: 'approved',
        invoice_date: '2026-01-01',
        due_date: '2026-01-15',
      }),
      asOf
    )
    const open = enrichInvoice(
      invoice({
        id: 'op',
        status: 'approved',
        invoice_date: '2026-09-01',
        due_date: '2026-10-15',
      }),
      asOf
    )
    expect(getAdminInvoiceDisplayBucket(overdue)).toBe('overdue')
    expect(getAdminInvoiceDisplayBucket(open)).toBe('approved')

    const flags = createAdminInvoiceDisplayFlags(true)
    flags.approved = false
    expect(invoicePassesDisplayFlags(overdue, flags)).toBe(true)
    expect(invoicePassesDisplayFlags(open, flags)).toBe(false)
  })

  it('hides a queue bucket independently of Open', () => {
    const asOf = new Date('2026-09-09')
    const pendingPay = enrichInvoice(invoice({ id: 'inv-1', status: 'approved' }), asOf)
    const index = buildAdminInvoiceQueueIndex({
      pending: [payment({ invoice_id: 'inv-1' })],
      awaiting: [],
      disputed: [],
      writeOffs: [],
    })
    const flags = createAdminInvoiceDisplayFlags(true)
    flags.pending_payment = false
    expect(invoicePassesDisplayFlags(pendingPay, flags, index.byInvoiceId.get('inv-1'))).toBe(false)
  })

  it('buckets disputed, Will Pay, and PPW review separately from Open / On hold', () => {
    const asOf = new Date('2026-09-09')
    const disputed = enrichInvoice(
      invoice({
        id: 'd1',
        status: 'approved',
        disputes: [
          {
            id: 'disp-1',
            reason: 'amount_discrepancy',
            description: 'Short',
            status: 'open',
            created_by: 'Carrier',
            created_at: '2026-09-08T00:00:00Z',
          },
        ],
      }),
      asOf
    )
    const willPay = enrichInvoice(
      invoice({
        id: 'w1',
        status: 'approved',
        collection_status: 'W/P',
        collection_date: '2026-09-20',
        notes_history: [
          {
            id: 'n-wp',
            note: 'Status: Will Pay · 09/20/2026 — scheduled',
            created_by: 'Credyx',
            created_at: '2026-09-08T12:00:00Z',
            type: 'status_update',
          },
        ],
      }),
      asOf
    )
    const ppwReview = enrichInvoice(
      invoice({
        id: 'p1',
        status: 'hold',
        hold_reason: 'Missing lumper',
        notes_history: [
          {
            id: 'n-up',
            note: 'Uploaded 1 document: lumper.pdf. Credyx is reviewing and will advise if further action is required.',
            created_by: 'Carrier',
            created_at: '2026-09-09T00:00:00Z',
            type: 'client_note',
          },
        ],
      }),
      asOf
    )

    expect(getAdminInvoiceDisplayBucket(disputed)).toBe('disputed')
    expect(getAdminInvoiceDisplayBucket(willPay)).toBe('will_pay')
    expect(getAdminInvoiceDisplayBucket(ppwReview)).toBe('ppw_review')

    const openPpw = enrichInvoice(
      invoice({
        id: 'p2',
        status: 'approved',
        notes_history: [
          {
            id: 'n-up-open',
            note: 'Uploaded 1 document: pod.pdf. Credyx is reviewing and will advise if further action is required.',
            created_by: 'Carrier',
            created_at: '2026-09-09T00:00:00Z',
            type: 'client_note',
          },
        ],
      }),
      asOf
    )
    expect(getAdminInvoiceDisplayBucket(openPpw)).toBe('ppw_review')

    const flags = createAdminInvoiceDisplayFlags(true)
    flags.disputed = false
    flags.will_pay = false
    flags.ppw_review = false
    expect(invoicePassesDisplayFlags(disputed, flags)).toBe(false)
    expect(invoicePassesDisplayFlags(willPay, flags)).toBe(false)
    expect(invoicePassesDisplayFlags(ppwReview, flags)).toBe(false)
  })

  it('keeps paid invoices off by default and shows them when Paid is on', () => {
    const asOf = new Date('2026-09-09')
    const paid = enrichInvoice(
      invoice({
        id: 'pd',
        status: 'paid',
        invoice_date: '2026-07-01',
        due_date: '2026-07-15',
      }),
      asOf
    )
    expect(getAdminInvoiceDisplayBucket(paid)).toBe('paid')
    const flags = createAdminInvoiceDisplayFlags(true)
    expect(flags.paid).toBe(false)
    expect(invoicePassesDisplayFlags(paid, flags)).toBe(false)
    flags.paid = true
    expect(invoicePassesDisplayFlags(paid, flags)).toBe(true)
  })
})
