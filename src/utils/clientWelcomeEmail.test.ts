import { describe, expect, it } from 'vitest'
import { buildClientWelcomeTemplateData, formatLiveFeeTermsLabel } from './clientWelcomeEmail'

describe('formatLiveFeeTermsLabel', () => {
  it('formats a percentage fee', () => {
    expect(formatLiveFeeTermsLabel({ fee_type: 'percentage', fee_percentage: 2.5 })).toBe('2.5%')
  })

  it('formats a flat fee', () => {
    expect(formatLiveFeeTermsLabel({ fee_type: 'flat', flat_fee_amount: 50 })).toBe('$50.00 flat')
  })
})

describe('buildClientWelcomeTemplateData', () => {
  it('fills fee, website, contact, and password CTA', () => {
    const data = buildClientWelcomeTemplateData(
      {
        name: 'Northline Transport',
        contact_person: 'Alex',
        fee_terms: { fee_type: 'percentage', fee_percentage: 3 },
      },
      {
        portalLink: 'https://app.credyx.net/client/login',
        setupLink: 'https://auth.example/invite',
        companyLogoHtml: '',
      }
    )
    expect(data.feeTermsLabel).toBe('3%')
    expect(data.feePercentage).toBe('3')
    expect(data.websiteUrl).toBe('https://credyx.com')
    expect(data.contactEmail).toBe('ops@credyx.net')
    expect(data.ctaLabel).toBe('Create your password')
    expect(data.setupLink).toBe('https://auth.example/invite')
  })
})
