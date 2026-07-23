import { describe, expect, it } from 'vitest'
import {
  buildHoldList,
  buildPpwResultsSummary,
  buildPpwSummaryLines,
} from './batchLifecycleEmails'
import type { Invoice } from '../types/invoice'

function inv(partial: Partial<Invoice> & Pick<Invoice, 'id' | 'invoice_number'>): Invoice {
  return {
    client_id: 'c1',
    client_name: 'Carrier',
    broker_id: 'b1',
    broker_name: 'Broker',
    amount: 1000,
    invoice_date: '2026-01-01',
    due_date: '2026-02-01',
    expected_payment_date: '2026-02-01',
    status: 'approved',
    created_at: '2026-01-01T00:00:00Z',
    ...partial,
  }
}

describe('batchLifecycleEmails helpers', () => {
  it('formats PPW send results for carrier email', () => {
    const summary = buildPpwResultsSummary([
      {
        invoiceId: '1',
        invoiceNumber: 'INV-1',
        brokerEmail: 'ppw@broker.com',
        success: true,
      },
      {
        invoiceId: '2',
        invoiceNumber: 'INV-2',
        brokerEmail: '—',
        success: true,
        skipped: true,
      },
      {
        invoiceId: '3',
        invoiceNumber: 'INV-3',
        brokerEmail: 'N/A',
        success: false,
        error: 'No attachable documents found',
      },
    ])
    expect(summary).toContain('INV-1: sent to ppw@broker.com')
    expect(summary).toContain('INV-2: already sent (skipped)')
    expect(summary).toContain('INV-3: failed (No attachable documents found)')
  })

  it('formats hold list with reasons', () => {
    const list = buildHoldList([
      inv({
        id: 'h1',
        invoice_number: 'INV-H',
        load_number: 'L-9',
        status: 'hold',
        hold_reason: 'Missing POD',
      }),
    ])
    expect(list).toBe('• INV-H (Load L-9): Missing POD')
  })

  it('builds PPW summary from invoice send history', () => {
    const lines = buildPpwSummaryLines([
      inv({
        id: '1',
        invoice_number: 'INV-1',
        document_send_history: [
          {
            email_address: 'old@broker.com',
            sent_at: '2026-01-01T00:00:00Z',
            sent_by: 'Admin',
            status: 'failed',
            documents_sent: [],
          },
          {
            email_address: 'ppw@broker.com',
            sent_at: '2026-01-02T00:00:00Z',
            sent_by: 'Admin',
            status: 'delivered',
            documents_sent: ['Invoice.pdf'],
          },
        ],
      }),
    ])
    expect(lines).toBe('INV-1: sent to ppw@broker.com')
  })
})
