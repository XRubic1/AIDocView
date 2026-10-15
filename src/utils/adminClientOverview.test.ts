import { describe, expect, it } from 'vitest'
import type { Client } from '../types/client'
import type { Invoice } from '../types/invoice'
import type { Payment } from '../types/payment'
import { buildAdminClientOverview, sortAdminClientRows } from './adminClientOverview'

const asOf = new Date('2026-10-15T12:00:00')

function daysAgo(n: number): string {
  const d = new Date(asOf)
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

function invoice(partial: Partial<Invoice> & Pick<Invoice, 'id' | 'client_id' | 'amount'>): Invoice {
  return {
    invoice_number: partial.id,
    client_name: partial.client_id,
    broker_id: 'b1',
    broker_name: 'Broker',
    invoice_date: daysAgo(5),
    status: 'approved',
    created_at: daysAgo(5),
    ...partial,
  } as Invoice
}

const clients: Client[] = [
  {
    id: 'c1',
    name: 'Alpha Freight',
    service_tier: 'managed',
    email: 'a@x.com',
    mc_number: '123',
    remittance_info: 'Lockbox 1',
    fee_terms: { fee_type: 'percentage', fee_percentage: 2.5 },
  },
  { id: 'c2', name: 'Bravo Trucking', service_tier: 'self_service' },
]

describe('buildAdminClientOverview', () => {
  const invoices = [
    invoice({ id: 'i1', client_id: 'c1', amount: 1000 }),
    invoice({ id: 'i2', client_id: 'c1', amount: 500, invoice_date: daysAgo(45) }),
    invoice({ id: 'i3', client_id: 'c2', amount: 2000, invoice_date: daysAgo(75) }),
    invoice({ id: 'i4', client_id: 'c2', amount: 300, status: 'paid' }),
  ]
  const payments = [
    { id: 'p1', invoice_id: 'i4', amount: 300, status: 'confirmed', payment_date: daysAgo(3) },
    { id: 'p2', invoice_id: 'i1', amount: 200, status: 'confirmed', payment_date: daysAgo(40) },
  ] as Payment[]

  const { rows, totals } = buildAdminClientOverview({
    clients,
    invoices,
    payments,
    workSummaries: [],
    asOf,
  })
  const alpha = rows.find((r) => r.clientId === 'c1')!
  const bravo = rows.find((r) => r.clientId === 'c2')!

  it('nets confirmed payments out of open A/R and buckets aging', () => {
    expect(alpha.openAr).toBe(1300)
    expect(alpha.overdueAr).toBe(500)
    expect(bravo.openAr).toBe(2000)
    expect(bravo.severeAr).toBe(2000)
    expect(totals.openAr).toBe(3300)
  })

  it('splits collections into the last and prior 30 days', () => {
    expect(bravo.collected30d).toBe(300)
    expect(totals.collected30d).toBe(300)
    expect(totals.collectedPrev30d).toBe(200)
  })

  it('flags health and setup gaps', () => {
    expect(alpha.setupGaps).toEqual([])
    expect(bravo.setupGaps).toEqual(['remittance', 'fee_terms', 'contact', 'mc_number'])
    expect(bravo.health).toBe('at_risk')
    expect(alpha.health).toBe('watch')
  })

  it('sorts at-risk clients first for attention', () => {
    expect(sortAdminClientRows(rows, 'attention')[0].clientId).toBe('c2')
    expect(sortAdminClientRows(rows, 'name')[0].clientId).toBe('c1')
  })
})
