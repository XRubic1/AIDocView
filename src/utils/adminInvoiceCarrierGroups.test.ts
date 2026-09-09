import { describe, expect, it } from 'vitest'
import type { Invoice } from '../types/invoice'
import { enrichInvoice } from './invoiceAging'
import { buildCarrierInvoiceGroups } from './adminInvoiceCarrierGroups'

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

describe('buildCarrierInvoiceGroups', () => {
  it('nests invoices under the carrier with summary counts', () => {
    const asOf = new Date('2026-09-09')
    const invoices = [
      enrichInvoice(
        invoice({
          id: 'a',
          invoice_number: 'D30-01',
          amount: 4100,
          collection_status: 'W/P',
        }),
        asOf
      ),
      enrichInvoice(
        invoice({
          id: 'b',
          invoice_number: 'D30-02',
          amount: 2000,
          status: 'hold',
        }),
        asOf
      ),
      enrichInvoice(
        invoice({
          id: 'c',
          invoice_number: 'D30-03',
          client_id: 'c2',
          client_name: 'Other Carrier',
          amount: 500,
        }),
        asOf
      ),
      enrichInvoice(
        invoice({
          id: 'd',
          invoice_number: 'D30-04',
          amount: 4990,
          disputes: [
            {
              id: 'd1',
              reason: 'claim_dispute',
              description: 'Cargo claim',
              status: 'open',
              created_by: 'Credyx',
              created_at: '2026-08-01T00:00:00Z',
            },
          ],
        }),
        asOf
      ),
    ]

    const groups = buildCarrierInvoiceGroups(invoices)
    const demo = groups.find((row) => row.clientId === 'c1')
    const other = groups.find((row) => row.clientId === 'c2')

    expect(groups).toHaveLength(2)
    expect(demo?.invoiceCount).toBe(3)
    expect(demo?.totalAmount).toBe(11090)
    expect(demo?.willPayCount).toBe(1)
    expect(demo?.holdCount).toBe(1)
    expect(demo?.disputeCount).toBe(1)
    expect(demo?.invoices.map((row) => row.invoice_number)).toEqual(['D30-01', 'D30-02', 'D30-04'])
    expect(other?.invoiceCount).toBe(1)
    expect(other?.totalAmount).toBe(500)
  })
})
