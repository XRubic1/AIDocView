import { describe, expect, it } from 'vitest'
import type { Invoice } from '../types/invoice'
import { buildBrokerAgingRows, buildCarrierAgingRows, brokerAgingBucketKey } from './brokerAgingSummary'

function invoice(
  partial: Partial<Invoice> & Pick<Invoice, 'id' | 'broker_id' | 'broker_name' | 'amount' | 'invoice_date'>
): Invoice {
  return {
    invoice_number: partial.id,
    client_id: 'c1',
    client_name: 'Carrier One',
    status: 'approved',
    created_at: '2026-01-01T00:00:00.000Z',
    ...partial,
  } as Invoice
}

describe('brokerAgingBucketKey', () => {
  it('maps 61+ into the last column', () => {
    expect(brokerAgingBucketKey(0)).toBe('d0_15')
    expect(brokerAgingBucketKey(15)).toBe('d0_15')
    expect(brokerAgingBucketKey(16)).toBe('d16_30')
    expect(brokerAgingBucketKey(61)).toBe('d61_up')
    expect(brokerAgingBucketKey(120)).toBe('d61_up')
  })
})

describe('buildBrokerAgingRows', () => {
  it('rolls open invoices into one row per broker', () => {
    const asOf = new Date(2026, 8, 9) // Sep 9, 2026 local
    const invoices = [
      invoice({
        id: 'i1',
        broker_id: 'ranger',
        broker_name: 'Landstar Ranger',
        amount: 1000,
        invoice_date: '2026-09-01',
      }),
      invoice({
        id: 'i2',
        broker_id: 'ranger',
        broker_name: 'Landstar Ranger',
        amount: 500,
        invoice_date: '2026-06-01',
      }),
      invoice({
        id: 'i3',
        broker_id: 'tql',
        broker_name: 'TQL',
        amount: 2000,
        invoice_date: '2026-09-05',
        status: 'paid',
      }),
    ]

    const rows = buildBrokerAgingRows(invoices, asOf)
    const ranger = rows.find((row) => row.brokerId === 'ranger')
    expect(ranger?.invoiceCount).toBe(2)
    expect(ranger?.total).toBe(1500)
    expect(ranger?.amounts.d0_15).toBe(1000)
    expect(ranger?.amounts.d61_up).toBe(500)
    expect(rows.some((row) => row.brokerId === 'tql')).toBe(false)
  })
})

describe('buildCarrierAgingRows', () => {
  it('nests brokers under each carrier with concentration vs that carrier', () => {
    const asOf = new Date(2026, 8, 9)
    const invoices = [
      invoice({
        id: 'i1',
        client_id: 'prima',
        client_name: 'Prima Freight',
        broker_id: 'ranger',
        broker_name: 'Landstar Ranger',
        amount: 1000,
        invoice_date: '2026-09-01',
      }),
      invoice({
        id: 'i2',
        client_id: 'prima',
        client_name: 'Prima Freight',
        broker_id: 'tql',
        broker_name: 'TQL',
        amount: 3000,
        invoice_date: '2026-09-02',
      }),
      invoice({
        id: 'i4',
        client_id: 'other',
        client_name: 'Other Carrier',
        broker_id: 'ranger',
        broker_name: 'Landstar Ranger',
        amount: 200,
        invoice_date: '2026-09-01',
      }),
    ]

    const rows = buildCarrierAgingRows(invoices, asOf)
    const prima = rows.find((row) => row.clientId === 'prima')
    expect(prima?.total).toBe(4000)
    expect(prima?.brokers).toHaveLength(2)
    const tql = prima?.brokers.find((b) => b.brokerId === 'tql')
    expect(tql?.percentOfTotal).toBe(75)
    expect(prima?.brokers.find((b) => b.brokerId === 'ranger')?.percentOfTotal).toBe(25)
  })
})

