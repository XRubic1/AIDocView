import { describe, expect, it } from 'vitest'
import {
  buildMotusReport,
  classifyMotusReport,
  formatMotusDate,
  isRetryableMotusFailure,
  parseMotusQuery,
  type MotusInsuranceReport,
} from './motusInsurance'

const filing = {
  policyNumber: 'URG-05815',
  receivedDate: '2026-10-13T13:56:46.720+00:00',
  effectiveDate: '2026-10-13T04:00:00.000+00:00',
  maxCovAmount: '750000.00',
  cancellationDate: null,
  insuranceForm: { insuranceForm: 'BMC-91' },
  status: { filingStatusDesc: 'Active' },
  insuranceEntity: {
    entityNames: [{ nameType: 'Legal', entityName: 'Universal Casualty Risk Retention Group, Inc', disableDate: null }],
  },
}

describe('parseMotusQuery', () => {
  it('reads a DOT from a MOTUS account URL', () => {
    expect(parseMotusQuery('https://motus.dot.gov/customer/3788627/account')).toEqual({
      kind: 'dot',
      dot: '3788627',
    })
  })

  it('reads an MC docket', () => {
    expect(parseMotusQuery('MC-1359017')).toEqual({
      kind: 'docket',
      prefix: 'MC',
      number: '1359017',
    })
  })

  it('treats bare digits as a DOT number', () => {
    expect(parseMotusQuery('3788627')).toEqual({ kind: 'dot', dot: '3788627' })
  })
})

describe('buildMotusReport', () => {
  it('marks insurance active only when status is Active and there is no cancellation date', () => {
    const report = buildMotusReport({
      dotNumber: '3788627',
      queriedAt: '2026-10-15T00:00:00.000Z',
      carrier: {
        entityName: 'KANONE LLC',
        entityNames: [{ nameType: 'Legal', entityName: 'KANONE LLC', disableDate: null }],
      },
      authorities: [
        {
          minimumBipd: {
            minimumBipdAmount: 750000,
            display: { primaryLabel: 'BIPD' },
          },
          detail: {
            entityOperatingAuthorityId: '0484b79c-7a9e-4cbc-bd49-e9f547863951',
            docketNumber: 'MC1359017',
            operatingAuthorityType: {
              operatingAuthorityType: 'Motor Carrier of Property (Except Household Goods)',
            },
            operatingAuthorityStatus: { operatingAuthorityStatusName: 'Active' },
            entityOperatingAuthorityHistories: [
              {
                changeDesc: 'GRANTED',
                updateDate: '2026-06-09T00:51:58.692+00:00',
                operatingAuthorityStatus: { operatingAuthorityStatusName: 'Active' },
              },
            ],
            insuranceFilings: [
              filing,
              {
                ...filing,
                policyNumber: 'URG05815',
                effectiveDate: '2026-07-26T04:00:00.000+00:00',
                cancellationDate: '2026-11-11T04:00:00.000+00:00',
                status: { filingStatusDesc: 'Replaced' },
              },
              {
                ...filing,
                policyNumber: 'KSCAL000012-00',
                effectiveDate: '2026-06-01T04:00:00.000+00:00',
                cancellationDate: '2026-07-26T16:27:36.655+00:00',
                insuranceForm: { insuranceForm: 'BMC-91X' },
                insuranceClass: { insuranceClassDesc: 'Primary' },
                status: { filingStatusDesc: 'Canceled' },
              },
            ],
          },
        },
      ],
    })

    expect(report.legalName).toBe('KANONE LLC')
    expect(report.insuranceActive).toBe(true)
    expect(report.accountUrl).toBe('https://motus.dot.gov/customer/3788627/account')
    const authority = report.authorities[0]
    expect(authority.status).toBe('Active')
    expect(authority.statusReason).toBe('GRANTED')
    expect(authority.minimumInsurance).toBe('BIPD: $750,000.00')
    expect(authority.detailUrl).toContain('/operating-authority-detail/0484b79c-7a9e-4cbc-bd49-e9f547863951')
    expect(authority.policies.map((policy) => policy.policyNumber)).toEqual([
      'URG-05815',
      'URG05815',
      'KSCAL000012-00',
    ])
    expect(authority.policies[0]).toMatchObject({
      companyName: 'Universal Casualty Risk Retention Group, Inc',
      form: 'BMC-91',
      status: 'Active',
      receivedDate: '10/13/2026',
      insuranceFiled: '$750,000.00',
      active: true,
      hasCancellationDate: false,
    })
    expect(authority.policies[1]).toMatchObject({
      status: 'Replaced',
      active: false,
      hasCancellationDate: true,
    })
    expect(authority.policies[2]).toMatchObject({
      form: 'BMC-91X (Primary)',
      status: 'Canceled',
      active: false,
      hasCancellationDate: true,
      cancellationDate: '7/26/2026',
    })
  })

  it('does not treat an Active policy with a cancellation date as current coverage', () => {
    const report = buildMotusReport({
      dotNumber: '1',
      carrier: { entityName: 'Example LLC' },
      authorities: [
        {
          detail: {
            entityOperatingAuthorityId: 'abc',
            docketNumber: 'MC1',
            operatingAuthorityStatus: { operatingAuthorityStatusName: 'Active' },
            insuranceFilings: [
              {
                ...filing,
                cancellationDate: '2026-11-11T04:00:00.000+00:00',
              },
            ],
          },
        },
      ],
    })
    expect(report.insuranceActive).toBe(false)
    expect(report.authorities[0].policies[0]).toMatchObject({
      active: false,
      activeWithCancellation: true,
      hasCancellationDate: true,
    })
  })
})

describe('isRetryableMotusFailure', () => {
  it('retries a MOTUS failure and leaves a missing account alone', () => {
    expect(isRetryableMotusFailure('MOTUS lookup failed')).toBe(true)
    expect(isRetryableMotusFailure('No MOTUS account found for that number.')).toBe(false)
  })
})

describe('formatMotusDate', () => {
  it('uses the Eastern calendar date shown on MOTUS', () => {
    expect(formatMotusDate('2026-10-13T04:00:00.000+00:00')).toBe('10/13/2026')
  })
})

function report(partial: Partial<MotusInsuranceReport> & Pick<MotusInsuranceReport, 'authorities'>): MotusInsuranceReport {
  return {
    dotNumber: '3788627',
    legalName: 'KANONE LLC',
    accountUrl: 'https://motus.dot.gov/customer/3788627/account',
    queriedAt: '2026-10-15T00:00:00.000Z',
    insuranceActive: partial.authorities.some((authority) => authority.insuranceActive),
    ...partial,
  }
}

describe('classifyMotusReport', () => {
  it('calls a carrier good when authority and insurance are active', () => {
    const classified = classifyMotusReport(
      report({
        authorities: [
          {
            id: 'a',
            legalName: 'KANONE LLC',
            authorityType: 'Motor Carrier of Property',
            docketNumber: 'MC1359017',
            status: 'Active',
            statusReason: 'GRANTED',
            statusActive: true,
            minimumInsurance: null,
            detailUrl: '',
            insuranceActive: true,
            policies: [
              {
                companyName: 'Universal',
                policyNumber: 'URG-05815',
                form: 'BMC-91',
                insuranceFiled: '$750,000.00',
                status: 'Active',
                receivedDate: '10/13/2026',
                effectiveDate: '10/13/2026',
                cancellationDate: null,
                active: true,
                activeWithCancellation: false,
                hasCancellationDate: false,
              },
              {
                companyName: 'Knight',
                policyNumber: 'OLD',
                form: 'BMC-91X',
                insuranceFiled: '$750,000.00',
                status: 'Canceled',
                receivedDate: null,
                effectiveDate: null,
                cancellationDate: '7/26/2026',
                active: false,
                activeWithCancellation: false,
                hasCancellationDate: true,
              },
            ],
          },
        ],
      })
    )
    expect(classified.verdict).toBe('good')
    expect(classified.cancellationDates).toEqual([])
    expect(classified.summary).toBe('Active insurance, no cancellation date.')
  })

  it('calls a carrier a cancellation when active coverage has a cancellation date', () => {
    const classified = classifyMotusReport(
      report({
        authorities: [
          {
            id: 'a',
            legalName: 'KANONE LLC',
            authorityType: 'Motor Carrier',
            docketNumber: 'MC1',
            status: 'Active',
            statusReason: null,
            statusActive: true,
            minimumInsurance: null,
            detailUrl: '',
            insuranceActive: false,
            policies: [
              {
                companyName: 'Universal',
                policyNumber: 'URG',
                form: 'BMC-91',
                insuranceFiled: '$750,000.00',
                status: 'Active',
                receivedDate: null,
                effectiveDate: null,
                cancellationDate: '11/11/2026',
                active: false,
                activeWithCancellation: true,
                hasCancellationDate: true,
              },
            ],
          },
        ],
      })
    )
    expect(classified.verdict).toBe('cancellation')
    expect(classified.cancellationDates).toEqual(['11/11/2026'])
    expect(classified.summary).not.toContain('7/26/2026')
  })

  it('calls a carrier inactive when the authority is not active', () => {
    const classified = classifyMotusReport(
      report({
        authorities: [
          {
            id: 'a',
            legalName: 'KANONE LLC',
            authorityType: 'Broker of Property',
            docketNumber: 'MC2',
            status: 'Inactive',
            statusReason: null,
            statusActive: false,
            minimumInsurance: null,
            detailUrl: '',
            insuranceActive: false,
            policies: [],
          },
        ],
      })
    )
    expect(classified.verdict).toBe('inactive')
    expect(classified.summary).toContain('Inactive')
  })
})
