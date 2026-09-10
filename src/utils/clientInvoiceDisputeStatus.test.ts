import { describe, expect, it } from 'vitest'
import {
  getInvoiceDisputeOverviewNote,
  getOpenDisputedStatusLabel,
  invoiceHasOpenDisputedStatus,
  listOpenDisputedInvoices,
} from './clientInvoiceDisputeStatus'
import { getInvoiceMobileInsights } from './invoiceMobileInsights'
import { enrichInvoice } from './invoiceAging'
import type { Invoice } from '../types/invoice'
import { RECEIPT_DISPUTE_HOLD_REASON } from '../services/paymentReceiptConfirmationService'

function baseInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: 'inv-1',
    invoice_number: '1001',
    client_id: 'c1',
    client_name: 'Demo',
    broker_id: 'b1',
    broker_name: 'Broker',
    amount: 1000,
    invoice_date: '2026-07-01',
    due_date: '2026-07-15',
    status: 'approved',
    created_at: '2026-07-01T00:00:00Z',
    ...overrides,
  }
}

describe('clientInvoiceDisputeStatus', () => {
  it('marks open A/R with invoice dispute as Open Disputed', () => {
    const invoice = baseInvoice({
      disputes: [
        {
          id: 'd1',
          reason: 'amount',
          description: 'Broker shorted $200',
          status: 'open',
          created_by: 'Carrier',
          created_at: '2026-07-02T00:00:00Z',
        },
      ],
    })
    expect(invoiceHasOpenDisputedStatus(invoice)).toBe(true)
    expect(getOpenDisputedStatusLabel()).toBe('Open Disputed')
  })

  it('keeps Open Disputed while a dispute is under review', () => {
    const invoice = baseInvoice({
      disputes: [
        {
          id: 'd1',
          reason: 'amount',
          description: 'Broker shorted $200',
          status: 'under_review',
          response: 'We are working with the broker',
          created_by: 'Carrier',
          created_at: '2026-07-02T00:00:00Z',
        },
      ],
    })
    expect(invoiceHasOpenDisputedStatus(invoice)).toBe(true)
  })

  it('treats capitalized dispute status as open', () => {
    const invoice = baseInvoice({
      disputes: [
        {
          id: 'd1',
          reason: 'claim_dispute',
          description: 'Cargo claim',
          status: 'Open' as 'open',
          created_by: 'Credyx',
          created_at: '2026-07-02T00:00:00Z',
        },
      ],
    })
    expect(invoiceHasOpenDisputedStatus(invoice)).toBe(true)
  })

  it('marks a dispute note as Open Disputed when disputes[] is empty', () => {
    const invoice = baseInvoice({
      notes_history: [
        {
          id: 'n1',
          note: 'Dispute opened: Claim dispute — cargo claim on load LD-D30-04',
          created_by: 'Credyx',
          created_at: '2026-07-02T00:00:00Z',
          type: 'dispute',
        },
      ],
    })
    expect(invoiceHasOpenDisputedStatus(invoice)).toBe(true)
  })

  it('marks payment-disputed open A/R as Open Disputed (not Invoiced)', () => {
    const invoice = baseInvoice({
      status: 'hold',
      hold_reason: RECEIPT_DISPUTE_HOLD_REASON,
    })
    expect(invoiceHasOpenDisputedStatus(invoice, { paymentDisputed: true })).toBe(true)
  })

  it('puts dispute note first in overview insights', () => {
    const invoice = baseInvoice({
      disputes: [
        {
          id: 'd1',
          reason: 'amount',
          description: 'Missing lumper receipt',
          status: 'open',
          created_by: 'Carrier',
          created_at: '2026-07-02T00:00:00Z',
        },
      ],
    })
    const insights = getInvoiceMobileInsights({
      invoice,
      enriched: enrichInvoice(invoice),
      documentCount: 2,
    })
    expect(insights[0]?.id).toBe('dispute')
    expect(insights[0]?.subtitle).toBe('Missing lumper receipt')
  })

  it('puts Will Pay above an older open dispute in overview insights', () => {
    const invoice = baseInvoice({
      collection_status: 'W/P',
      collection_date: '2026-09-18',
      disputes: [
        {
          id: 'd1',
          reason: 'amount',
          description: 'Missing lumper receipt',
          status: 'open',
          created_by: 'Carrier',
          created_at: '2026-09-10T12:00:00Z',
        },
      ],
      notes_history: [
        {
          id: 'n-wp',
          note: 'Status: Will Pay · 09/18/2026 — Remaining balance on 09/18',
          created_by: 'Credyx',
          created_at: '2026-09-10T18:00:00Z',
          type: 'status_update',
        },
      ],
    })
    const insights = getInvoiceMobileInsights({
      invoice,
      enriched: enrichInvoice(invoice),
    })
    expect(insights[0]?.id).toBe('will-pay')
    expect(insights[0]?.subtitle).toMatch(/09\/18\/2026/)
    expect(insights.find((row) => row.id === 'dispute')?.subtitle).toBe('Missing lumper receipt')
  })

  it('uses payment dispute description when invoice disputes are empty', () => {
    const note = getInvoiceDisputeOverviewNote(baseInvoice(), 'Funds never arrived')
    expect(note?.note).toBe('Funds never arrived')
  })

  it('lists open disputed invoices with invoice vs receipt source', () => {
    const invoiceDispute = baseInvoice({
      id: 'inv-d',
      invoice_number: '2001',
      amount: 2100,
      updated_at: '2026-09-10T12:00:00Z',
      disputes: [
        {
          id: 'd1',
          reason: 'amount',
          description: 'Broker shorted $200',
          status: 'open',
          created_by: 'Carrier',
          created_at: '2026-07-02T00:00:00Z',
        },
      ],
    })
    const receiptDispute = baseInvoice({
      id: 'inv-r',
      invoice_number: '2002',
      amount: 800,
      status: 'hold',
      hold_reason: RECEIPT_DISPUTE_HOLD_REASON,
      updated_at: '2026-09-10T11:00:00Z',
    })
    const notesOnly = baseInvoice({
      id: 'inv-n',
      invoice_number: '2003',
      amount: 500,
      updated_at: '2026-09-10T10:00:00Z',
      notes_history: [
        {
          id: 'n1',
          note: 'Dispute opened: Claim dispute — cargo claim',
          created_by: 'Credyx',
          created_at: '2026-07-02T00:00:00Z',
          type: 'dispute',
        },
      ],
    })
    const paperworkHold = baseInvoice({
      id: 'inv-h',
      invoice_number: '2004',
      status: 'hold',
      hold_reason: 'Missing BOL',
    })
    const rows = listOpenDisputedInvoices([
      paperworkHold,
      notesOnly,
      receiptDispute,
      invoiceDispute,
    ])
    expect(rows.map((r) => r.invoice.id)).toEqual(['inv-d', 'inv-r', 'inv-n'])
    expect(rows[0]).toMatchObject({ source: 'invoice', reason: 'Broker shorted $200' })
    expect(rows[1].source).toBe('receipt')
    expect(rows[2]).toMatchObject({
      source: 'invoice',
      reason: 'Dispute opened: Claim dispute — cargo claim',
    })
  })

  it('includes remittance disputes that are not on invoice hold', () => {
    const invoice = baseInvoice({
      id: 'inv-pay',
      invoice_number: '2005',
      status: 'approved',
    })
    const rows = listOpenDisputedInvoices([invoice], {
      receiptDisputedInvoiceIds: new Set(['inv-pay']),
    })
    expect(rows).toHaveLength(1)
    expect(rows[0].source).toBe('receipt')
    expect(rows[0].reason).toMatch(/Payment receipt disputed/)
  })
})
