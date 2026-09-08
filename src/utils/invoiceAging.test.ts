import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { mockBrokers } from '../data/mockBrokers'
import type { Invoice } from '../types/invoice'
import {
  getAgingArBucketKey,
  getDaysOutstanding,
  getDisplayAgingBucketId,
  isInvoiceOverdue,
  isOpenArInvoice,
  enrichInvoice,
} from './invoiceAging'

function baseInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: 'inv-d45-04',
    invoice_number: 'D45-04',
    client_id: 'client-1',
    client_name: 'Demo Carrier LLC',
    broker_id: 'broker-agl',
    broker_name: 'AGL GROUP',
    amount: 4100,
    invoice_date: '2026-06-27',
    due_date: '2026-07-27',
    expected_payment_date: '2026-07-27',
    status: 'approved',
    created_at: '2026-06-27T10:00:00.000Z',
    days_since_expected: 15,
    ...overrides,
  }
}

describe('getDaysOutstanding vs live broker terms', () => {
  const asOf = new Date(2026, 7, 11, 12, 0, 0) // Aug 11, 2026

  beforeEach(() => {
    mockBrokers.length = 0
  })

  afterEach(() => {
    mockBrokers.length = 0
  })

  it('is not overdue when broker Due by is 45 and invoice is 45 days old', () => {
    mockBrokers.push({
      id: 'broker-agl',
      name: 'AGL GROUP',
      payment_terms_days: 45,
    })
    const invoice = baseInvoice()
    expect(getDaysOutstanding(invoice, asOf)).toBe(0)
    expect(isInvoiceOverdue(invoice, asOf)).toBe(false)
  })

  it('buckets Aging A/R by invoice age, not days past due', () => {
    expect(getDisplayAgingBucketId(15)).toBe('0_15')
    expect(getDisplayAgingBucketId(45)).toBe('31_45')
    expect(getDisplayAgingBucketId(0)).toBe('0_15')
    expect(getAgingArBucketKey(45)).toBe('31_45')
    expect(getAgingArBucketKey(15)).toBe('1_15')
  })

  it('stays overdue when broker Due by is still 30', () => {
    mockBrokers.push({
      id: 'broker-agl',
      name: 'AGL GROUP',
      payment_terms_days: 30,
    })
    const invoice = baseInvoice()
    expect(getDaysOutstanding(invoice, asOf)).toBe(15)
    expect(isInvoiceOverdue(invoice, asOf)).toBe(true)
  })

  it('keeps hold invoices in open A/R and aging without renaming the status', () => {
    mockBrokers.push({
      id: 'broker-agl',
      name: 'AGL GROUP',
      payment_terms_days: 30,
    })
    const invoice = baseInvoice({ status: 'hold', hold_reason: 'Missing POD' })
    expect(isOpenArInvoice(invoice)).toBe(true)
    expect(getDaysOutstanding(invoice, asOf)).toBe(15)
    expect(isInvoiceOverdue(invoice, asOf)).toBe(true)
    expect(enrichInvoice(invoice, asOf).displayStatus).toBe('hold')
    expect(enrichInvoice(invoice, asOf).agingBucket).not.toBe('closed')
  })
})
