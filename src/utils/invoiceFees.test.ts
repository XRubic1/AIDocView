import { describe, expect, it } from 'vitest'
import { billableInvoices, calculateBatchFeeCalculation, isFeeBillableInvoice } from './invoiceFees'

describe('invoiceFees', () => {
  it('excludes written_off from fee billable set', () => {
    expect(isFeeBillableInvoice({ status: 'approved' })).toBe(true)
    expect(isFeeBillableInvoice({ status: 'force_closed' })).toBe(true)
    expect(isFeeBillableInvoice({ status: 'write_off_pending' })).toBe(true)
    expect(isFeeBillableInvoice({ status: 'written_off' })).toBe(false)
  })

  it('calculates percentage fee on billable amounts only', () => {
    const invoices = [
      { amount: 1000, status: 'approved' as const },
      { amount: 500, status: 'written_off' as const },
    ]
    const calc = calculateBatchFeeCalculation(invoices, {
      fee_type: 'percentage',
      fee_percentage: 10,
    })
    expect(calc?.total_fee).toBe(100)
    expect(billableInvoices(invoices)).toHaveLength(1)
  })

  it('charges flat fee per billable invoice only', () => {
    const invoices = [
      { amount: 1000, status: 'approved' as const },
      { amount: 800, status: 'force_closed' as const },
      { amount: 200, status: 'written_off' as const },
    ]
    const calc = calculateBatchFeeCalculation(invoices, {
      fee_type: 'flat',
      flat_fee_amount: 25,
    })
    expect(calc?.total_fee).toBe(50)
  })
})
