import { describe, expect, it } from 'vitest'
import { buildCarrierAttentionPath, buildCarrierAttentionUrl } from './carrierAttentionLink'
import { getSafeClientReturnPath, clientLoginPathWithReturn } from './clientLoginRedirect'

describe('carrierAttentionLink', () => {
  it('deep-links an invoice with upload=1', () => {
    const path = buildCarrierAttentionPath({
      id: 'inv-1',
      invoice_number: 'INV-10428',
    })
    expect(path).toBe('/client/invoices/needattention?invoice=INV-10428&upload=1')
  })

  it('falls back to invoice id', () => {
    expect(buildCarrierAttentionPath({ id: 'inv-9', invoice_number: '' })).toContain(
      'invoice=inv-9'
    )
  })

  it('builds an absolute url', () => {
    const url = buildCarrierAttentionUrl({ id: 'inv-1', invoice_number: 'INV-1' })
    expect(url).toContain('/client/invoices/needattention?invoice=INV-1&upload=1')
  })
})

describe('clientLoginRedirect', () => {
  it('allows client portal return paths', () => {
    expect(getSafeClientReturnPath('/client/invoices/needattention?invoice=INV-1&upload=1')).toBe(
      '/client/invoices/needattention?invoice=INV-1&upload=1'
    )
    expect(getSafeClientReturnPath('/client/attention?invoice=INV-1&upload=1')).toBe(
      '/client/attention?invoice=INV-1&upload=1'
    )
  })

  it('rejects off-portal redirects', () => {
    expect(getSafeClientReturnPath('https://evil.example/phish')).toBe('/client/dashboard')
    expect(getSafeClientReturnPath('/login')).toBe('/client/dashboard')
  })

  it('encodes next on the login url', () => {
    expect(clientLoginPathWithReturn('/client/invoices/needattention?invoice=A')).toContain(
      'next=%2Fclient%2Finvoices%2Fneedattention'
    )
  })
})
