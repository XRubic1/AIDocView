import { describe, expect, it } from 'vitest'
import {
  getInvoiceDisputeOverviewNote,
  getOpenDisputedStatusLabel,
  invoiceHasOpenDisputedStatus,
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

  it('does not use Open Disputed when response is ready', () => {
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
    expect(invoiceHasOpenDisputedStatus(invoice)).toBe(false)
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

  it('uses payment dispute description when invoice disputes are empty', () => {
    const note = getInvoiceDisputeOverviewNote(baseInvoice(), 'Funds never arrived')
    expect(note?.note).toBe('Funds never arrived')
  })
})
