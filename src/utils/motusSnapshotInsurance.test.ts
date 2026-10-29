import { describe, expect, it } from 'vitest'
import { buildMotusReport } from './motusInsurance'
import { applyMotusInsurance } from './motusSnapshotInsurance'

function filing(over: Record<string, unknown> = {}) {
  return {
    policyNumber: 'URG-05815',
    effectiveDate: '2026-10-13T04:00:00.000+00:00',
    maxCovAmount: '750000.00',
    cancellationDate: null,
    insuranceForm: { insuranceForm: 'BMC-91' },
    status: { filingStatusDesc: 'Active' },
    insuranceEntity: { entityNames: [{ nameType: 'Legal', entityName: 'Universal Casualty', disableDate: null }] },
    ...over,
  }
}

function report(status: string, filings: unknown[]) {
  return buildMotusReport({
    dotNumber: '3788627',
    carrier: { entityRegistrations: [] },
    authorities: [
      {
        detail: {
          entityOperatingAuthorityId: '1',
          docketNumber: 'MC1359017',
          operatingAuthorityStatus: { operatingAuthorityStatusName: status },
          insuranceFilings: filings,
        },
      },
    ],
  })
}

const snapshot = {
  found: true,
  name: 'ACME TRUCKING',
  totalTrucks: 7,
  insuranceVerdict: 'ok',
  riskFlags: ['No active insurance on file in Snapshot', 'Authority under 1 year old'],
}

describe('applyMotusInsurance', () => {
  it('marks active MOTUS coverage ok and keeps non-insurance fields', () => {
    const out = applyMotusInsurance(snapshot, report('Active', [filing()]))
    expect(out.insuranceVerdict).toBe('ok')
    expect(out.insuranceSource).toBe('motus')
    expect(out.activeInsuranceCount).toBe(1)
    expect(out.insurances[0]).toMatchObject({ companyName: 'Universal Casualty', maxLimit: 750000 })
    expect(out.totalTrucks).toBe(7)
    expect(out.riskFlags).toEqual(['Authority under 1 year old'])
  })

  it('reports a cancelled policy with no current coverage as cancelled', () => {
    const out = applyMotusInsurance(
      snapshot,
      report('Active', [filing({ status: { filingStatusDesc: 'Cancelled' }, cancellationDate: '2026-09-01T00:00:00.000+00:00' })])
    )
    expect(out.insuranceVerdict).toBe('cancelled')
    expect(out.hasInsuranceCancellation).toBe(true)
    expect(out.activeInsuranceCount).toBe(0)
    expect(out.riskFlags.some((flag) => /cancelled on MOTUS/.test(flag))).toBe(true)
  })

  it('reports missing coverage when authority is inactive', () => {
    const out = applyMotusInsurance(snapshot, report('Inactive', []))
    expect(out.insuranceVerdict).toBe('missing')
    expect(out.riskFlags).toContain('No active insurance on file in MOTUS')
  })
})
