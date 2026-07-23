import { describe, expect, it } from 'vitest'
import {
  DEFAULT_BROKER_PACKET_REMITTANCE_MESSAGE,
  buildRemittanceChangeNoteHtml,
  buildRemittanceFingerprint,
  remittanceFieldsChanged,
} from './carrierRemittance'
import { enrichEmailTemplateData } from './emailTemplateRender'

describe('carrierRemittance', () => {
  it('builds a stable fingerprint from remittance fields', () => {
    const a = buildRemittanceFingerprint({
      remittance_info: 'Pay carrier',
      bank_name: 'First Bank',
      account_number: '123',
      routing_number: '456',
    })
    const b = buildRemittanceFingerprint({
      remittance_info: '  pay carrier ',
      bank_name: 'First Bank',
      account_number: '123',
      routing_number: '456',
    })
    expect(a).toBe(b)
  })

  it('detects remittance field changes', () => {
    expect(
      remittanceFieldsChanged(
        { remittance_info: 'A', bank_name: '', account_number: '', routing_number: '' },
        { remittance_info: 'B', bank_name: '', account_number: '', routing_number: '' }
      )
    ).toBe(true)
  })

  it('builds change note HTML only when changed', () => {
    expect(buildRemittanceChangeNoteHtml(false)).toBe('')
    expect(buildRemittanceChangeNoteHtml(true)).toContain('recently updated')
  })
})

describe('emailTemplateRender remittance', () => {
  it('defaults broker_packet to pointer remittance copy', () => {
    const data = enrichEmailTemplateData('broker_packet', {
      invoiceNumber: 'INV-9',
    })
    expect(data.loadNumber).toBe('N/A')
    expect(data.remittanceMessage).toBe(DEFAULT_BROKER_PACKET_REMITTANCE_MESSAGE)
    expect(data.remittanceChangeNoteHtml).toBe('')
  })

  it('defaults broker_remittance_updated fields', () => {
    const data = enrichEmailTemplateData('broker_remittance_updated', {})
    expect(data.carrierName).toBe('the carrier')
    expect(data.effectiveDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
