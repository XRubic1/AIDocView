import { describe, expect, it } from 'vitest'
import {
  formatInboundInvoiceGuessLabel,
  guessInboundInvoiceMatch,
} from './guessInboundInvoiceMatch'

describe('guessInboundInvoiceMatch', () => {
  it('formats Inv# · Load# · Carrier', () => {
    expect(
      formatInboundInvoiceGuessLabel({
        invoiceNumber: 'D30-07',
        loadNumber: 'L-9',
        carrierName: 'Northline',
      })
    ).toBe('Inv# D30-07 · Load# L-9 · Carrier Northline')
  })

  it('extracts INV token from subject when not in store', () => {
    const g = guessInboundInvoiceMatch({
      subject: 'Re: Test inbound INV-1001',
      body: 'Testing system',
    })
    expect(g.matched).toBe(false)
    expect(g.label).toContain('Inv#')
    expect(g.invoiceNumber.toLowerCase()).toContain('1001')
  })

  it('extracts Inv# from body table style text', () => {
    const g = guessInboundInvoiceMatch({
      subject: 'rates',
      body: 'Inv# D30-07 Load# 8821 please verify',
    })
    expect(g.invoiceNumber.toLowerCase()).toContain('d30-07')
    expect(g.loadNumber).toBe('8821')
  })
})
