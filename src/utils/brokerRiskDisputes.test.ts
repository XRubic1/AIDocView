import { describe, expect, it } from 'vitest'
import type { Invoice } from '../types/invoice'
import type { Payment } from '../types/payment'
import {
  brokerDisputeEvidenceLines,
  collectBrokerDisputes,
  summarizeBrokerDisputeReasons,
} from './brokerRiskDisputes'

function invoice(partial: Partial<Invoice> & Pick<Invoice, 'id' | 'invoice_number'>): Invoice {
  return {
    client_id: 'c1',
    client_name: 'ABC',
    broker_id: 'b1',
    broker_name: 'TQL',
    amount: 1000,
    invoice_date: '2026-08-01',
    status: 'approved',
    ...partial,
  } as Invoice
}

describe('collectBrokerDisputes', () => {
  it('collects invoice dispute kinds and payment receipt disputes', () => {
    const invoices = [
      invoice({
        id: 'inv-1',
        invoice_number: '1001',
        disputes: [
          {
            id: 'd1',
            reason: 'claim_dispute',
            description: 'Cargo claim short-pay',
            status: 'open',
            created_by: 'Carrier',
            created_at: '2026-08-20T12:00:00.000Z',
          },
          {
            id: 'd2',
            reason: 'amount_discrepancy',
            description: 'Rate mismatch',
            status: 'resolved',
            created_by: 'Carrier',
            created_at: '2026-08-10T12:00:00.000Z',
          },
        ],
      }),
    ]
    const payments: Payment[] = [
      {
        id: 'pay-1',
        invoice_id: 'inv-1',
        invoice_number: '1001',
        broker_name: 'TQL',
        amount: 1000,
        payment_date: '2026-08-18',
        received_date: '2026-08-18',
        payment_method: 'ach',
        status: 'disputed',
        dispute: {
          id: 'pd1',
          reason: 'funds_not_received',
          description: 'Wire never hit the account',
          status: 'open',
          created_by: 'Carrier',
          created_at: '2026-08-21T12:00:00.000Z',
        },
      },
    ]

    const rows = collectBrokerDisputes(invoices, payments)
    expect(rows).toHaveLength(3)
    expect(rows[0].kind).toBe('payment_receipt')
    expect(rows.find((r) => r.reason === 'claim_dispute')?.reasonLabel).toBe('Claim dispute')

    const summary = summarizeBrokerDisputeReasons(rows)
    expect(summary.map((s) => s.reason)).toContain('claim_dispute')
    expect(summary.find((s) => s.reason === 'claim_dispute')?.openCount).toBe(1)

    const lines = brokerDisputeEvidenceLines(rows)
    expect(lines[0]).toMatch(/2 open dispute/)
  })

  it('returns empty when no disputes', () => {
    expect(collectBrokerDisputes([invoice({ id: 'inv-2', invoice_number: '1002' })])).toEqual([])
  })
})
