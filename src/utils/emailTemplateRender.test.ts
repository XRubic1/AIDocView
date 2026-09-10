import { describe, expect, it } from 'vitest'
import {
  enrichEmailTemplateData,
  renderEmailTemplateString,
} from './emailTemplateRender'

describe('emailTemplateRender', () => {
  it('replaces placeholders and escapes HTML in values', () => {
    const out = renderEmailTemplateString(
      'Hello {{name}} — <b>static</b>',
      { name: '<script>x</script>' }
    )
    expect(out).toBe('Hello &lt;script&gt;x&lt;/script&gt; — <b>static</b>')
  })

  it('allows holdSection HTML through unescaped', () => {
    const out = renderEmailTemplateString('Before {{holdSection}} after', {
      holdSection: '<p>Hold</p>',
    })
    expect(out).toBe('Before <p>Hold</p> after')
  })

  it('enriches carrier_batch_processed hold fields', () => {
    const data = enrichEmailTemplateData('carrier_batch_processed', {
      holdCount: '2',
      holdList: '• INV-1: missing POD',
    })
    expect(data.holdSubjectSuffix).toContain('2 on hold')
    expect(data.holdSection).toContain('2 invoice(s) on hold')
    expect(data.holdSection).toContain('INV-1')
  })

  it('defaults remittance message and load number for broker_packet', () => {
    const data = enrichEmailTemplateData('broker_packet', {
      invoiceNumber: 'INV-9',
    })
    expect(data.loadNumber).toBe('N/A')
    expect(data.remittanceMessage).toContain('remit-to on the attached invoice')
  })

  it('builds document-issue issue list HTML', () => {
    const data = enrichEmailTemplateData('carrier_document_issue', {
      issueList: 'Missing POD\nRate confirmation',
      invoiceNumber: 'INV-1',
    })
    expect(data.issueListHtml).toContain('Missing POD')
    expect(data.issueListHtml).toContain('Rate confirmation')
    expect(data.ctaLabel).toBe('Upload documents')
    expect(data.portalLink).toContain('/client/invoices/needattention?invoice=INV-1&upload=1')
  })

  it('builds auth CTA and OTP blocks', () => {
    const data = enrichEmailTemplateData('auth_recovery', {
      contactName: 'Alex',
      confirmation_url: 'https://example.com/reset',
      token: '29436028',
    })
    expect(data.ctaHtml).toContain('Choose a new password')
    expect(data.ctaHtml).toContain('https://example.com/reset')
    expect(data.otpHtml).toContain('29436028')
    expect(data.companyLogoHtml.length).toBeGreaterThan(0)
  })

  it('passes paymentUrl through unescaped for hrefs', () => {
    const out = renderEmailTemplateString('<a href="{{paymentUrl}}">Pay</a>', {
      paymentUrl: 'https://pay.example.com/inv?x=1&y=2',
    })
    expect(out).toBe('<a href="https://pay.example.com/inv?x=1&y=2">Pay</a>')
  })
})
