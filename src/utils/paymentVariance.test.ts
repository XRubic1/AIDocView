import { describe, expect, it } from 'vitest'
import {
  formatSignedInvoiceBalanceDisplay,
  getInvoiceBalanceState,
} from './paymentVariance'

describe('formatSignedInvoiceBalanceDisplay', () => {
  it('shows outstanding as a positive amount', () => {
    const open = getInvoiceBalanceState(2500, 0)
    expect(formatSignedInvoiceBalanceDisplay(open)).toBe('$2,500.00')

    const short = getInvoiceBalanceState(2500, 1000)
    expect(formatSignedInvoiceBalanceDisplay(short)).toBe('$1,500.00')
  })

  it('shows overage with a plus, not as negative outstanding', () => {
    const over = getInvoiceBalanceState(2500, 2800)
    expect(formatSignedInvoiceBalanceDisplay(over)).toBe('+$300.00')
  })
})
