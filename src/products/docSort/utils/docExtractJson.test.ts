import { describe, expect, it } from 'vitest'
import type { ExtractedDocumentData } from '../../../types/documentReview'
import { fingerprintFromExtraction, loadNumbersFromExtraction } from './docExtractJson'

function extraction(partial: Partial<ExtractedDocumentData>): ExtractedDocumentData {
  return {
    documentType: 'other',
    hasSignature: false,
    confidence: 0.9,
    fieldsFound: [],
    ...partial,
  }
}

describe('docExtractJson', () => {
  it('maps a rate con extract to load, rate, and lane', () => {
    const fp = fingerprintFromExtraction(
      'rc1',
      'tender.pdf',
      extraction({
        documentType: 'rate_confirmation',
        rateConParse: {
          load_number: '91111978568',
          broker_name: 'TQL',
          carrier_name: 'ABC Trucking',
          rate_total: 390,
          origin: { city: 'Vandalia', state: 'OH' },
          destinations: [{ city: 'Salem', state: 'VA', stop_number: 1 }],
        },
      })
    )
    expect(fp.kind).toBe('rate_confirmation')
    expect(fp.loadNumbers).toContain('91111978568')
    expect(fp.broker).toBe('TQL')
    expect(fp.rateAmount).toBe(390)
    expect(fp.pickup).toMatch(/Vandalia/i)
    expect(fp.delivery).toMatch(/Salem/i)
    expect(fp.extract?.rateConParse?.load_number).toBe('91111978568')
  })

  it('surfaces broker emailDomain from rate con fields', () => {
    const fp = fingerprintFromExtraction(
      'rc2',
      'werner.pdf',
      extraction({
        documentType: 'rate_confirmation',
        rateConParse: {
          load_number: '2004515639',
          broker_name: 'Werner Logistics',
        },
        rateConFields: {
          broker: { value: 'Werner Logistics', confidence: 0.9 },
          emailDomain: { value: 'werner.com', confidence: 0.9 },
        },
      })
    )
    expect(fp.emailDomain).toBe('werner.com')
  })

  it('classifies invoice pages and keeps billed amount', () => {
    const fp = fingerprintFromExtraction(
      'inv1',
      'invoice.pdf',
      extraction({
        documentType: 'other',
        primaryInvoice: {
          invoice_number: 'INV-100',
          load_number: '91111978568',
          broker_name: 'TQL',
          amount_total: 390,
        },
      })
    )
    expect(fp.kind).toBe('invoice')
    expect(fp.invoiceNumber).toBe('INV-100')
    expect(fp.rateAmount).toBe(390)
    expect(loadNumbersFromExtraction(fp.extract!, 'invoice.pdf')).toContain('91111978568')
  })

  it('classifies lumper receipts', () => {
    const fp = fingerprintFromExtraction(
      'lump1',
      'lumper.pdf',
      extraction({
        documentType: 'lumper',
        lumperPageAudits: [{ pageNumber: 1, amount: 85, vendor: 'Lumper Co' }],
      })
    )
    expect(fp.kind).toBe('lumper')
    expect(fp.lumperAmount).toBe(85)
    expect(fp.lumperVendor).toBe('Lumper Co')
  })
})
