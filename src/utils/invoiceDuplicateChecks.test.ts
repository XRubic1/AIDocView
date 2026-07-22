import { describe, expect, it, beforeEach } from 'vitest'
import { hydrateInvoices } from '../data/mockInvoices'
import { isInvoiceNumberTaken } from './clientInvoiceNumbers'
import {
  assertInvoiceNumberAvailable,
  findInvoicesByLoadNumber,
  formatLoadNumberWarning,
  getLoadNumberWarnings,
  getWithinBatchLoadWarnings,
  normalizeLoadNumber,
  validateBatchInvoiceNumbers,
} from './invoiceDuplicateChecks'
import type { Invoice } from '../types/invoice'

function stubInvoice(partial: Partial<Invoice> & Pick<Invoice, 'id' | 'invoice_number' | 'client_id'>): Invoice {
  return {
    client_name: partial.client_name ?? 'Carrier',
    broker_id: '',
    broker_name: 'Broker',
    amount: 100,
    invoice_date: '2026-01-01',
    due_date: '2026-02-01',
    expected_payment_date: '2026-02-01',
    status: 'pending',
    created_at: '2026-01-01T00:00:00Z',
    ...partial,
  }
}

describe('invoiceDuplicateChecks', () => {
  beforeEach(() => {
    hydrateInvoices([
      stubInvoice({
        id: 'inv-a1',
        invoice_number: '001',
        client_id: 'client-a',
        client_name: 'Alpha Carrier',
        load_number: 'LD100',
      }),
      stubInvoice({
        id: 'inv-a2',
        invoice_number: '002',
        client_id: 'client-a',
        client_name: 'Alpha Carrier',
        load_number: 'LD200',
      }),
      stubInvoice({
        id: 'inv-b1',
        invoice_number: '001',
        client_id: 'client-b',
        client_name: 'Beta Carrier',
        load_number: 'LD100',
      }),
    ])
  })

  it('detects invoice numbers taken per carrier only', () => {
    expect(isInvoiceNumberTaken('client-a', '001')).toBe(true)
    expect(isInvoiceNumberTaken('client-a', '003')).toBe(false)
    expect(isInvoiceNumberTaken('client-b', '002')).toBe(false)
  })

  it('allows custom alphanumeric invoice numbers that share a trailing digit', () => {
    // Custom labels must not collide with system sequence (001).
    expect(isInvoiceNumberTaken('client-a', 'ABC-1')).toBe(false)
    expect(isInvoiceNumberTaken('client-a', 'LOAD-001')).toBe(false)
    expect(assertInvoiceNumberAvailable('client-a', 'ABC-1')).toBe('ABC-1')
  })

  it('still treats system-style numeric equivalents as taken', () => {
    expect(isInvoiceNumberTaken('client-a', '1')).toBe(true)
    expect(isInvoiceNumberTaken('client-a', 'INV-2026-001')).toBe(true)
  })

  it('validateBatchInvoiceNumbers flags store + within-batch duplicates', () => {
    const issues = validateBatchInvoiceNumbers('client-a', ['003', '001', '003'])
    expect(issues.some((i) => i.reason === 'already_used' && i.invoiceNumber === '001')).toBe(true)
    expect(issues.some((i) => i.reason === 'duplicate_in_batch' && i.index === 2)).toBe(true)
  })

  it('assertInvoiceNumberAvailable throws when taken', () => {
    expect(() => assertInvoiceNumberAvailable('client-a', '001')).toThrow(/already used/)
    expect(assertInvoiceNumberAvailable('client-a', '050')).toBe('050')
  })

  it('assertInvoiceNumberAvailable allows editing own invoice number', () => {
    expect(assertInvoiceNumberAvailable('client-a', '001', [], ['inv-a1'])).toBe('001')
  })

  it('ignores empty load numbers', () => {
    expect(normalizeLoadNumber('  ')).toBe('')
    expect(findInvoicesByLoadNumber('')).toEqual([])
    expect(getLoadNumberWarnings('', { forClientId: 'client-a' })).toEqual([])
  })

  it('client load warnings are same-carrier only', () => {
    const warnings = getLoadNumberWarnings('LD100', {
      forClientId: 'client-a',
      crossCarrier: false,
    })
    expect(warnings).toHaveLength(1)
    expect(warnings[0].level).toBe('same_carrier')
    expect(warnings[0].clientId).toBe('client-a')
    expect(formatLoadNumberWarning(warnings[0], 'client')).toMatch(/You already submitted load LD100/)
  })

  it('admin load warnings include other carriers', () => {
    const warnings = getLoadNumberWarnings('LD100', {
      forClientId: 'client-a',
      crossCarrier: true,
    })
    expect(warnings).toHaveLength(2)
    const other = warnings.find((w) => w.level === 'other_carrier')
    expect(other?.clientName).toBe('Beta Carrier')
    expect(formatLoadNumberWarning(other!, 'admin')).toMatch(/Beta Carrier/)
  })

  it('getWithinBatchLoadWarnings flags repeated loads in the draft', () => {
    const msgs = getWithinBatchLoadWarnings(['LD1', 'LD2', 'ld1'])
    expect(msgs).toHaveLength(1)
    expect(msgs[0]).toMatch(/more than once/)
  })
})
