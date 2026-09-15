import { describe, expect, it } from 'vitest'
import {
  brokerLookupStatusTone,
  displayBrokerLookupStatus,
  formatMcLookupStatusLabel,
} from './brokerLookupStatus'

describe('formatMcLookupStatusLabel', () => {
  it('labels a missing company', () => {
    expect(formatMcLookupStatusLabel(null, false)).toBe('No company found')
  })

  it('combines active broker authority with insurance OK', () => {
    expect(
      formatMcLookupStatusLabel({
        found: true,
        brokerAuthority: 'Active',
        commonAuthority: 'None',
        contractAuthority: 'None',
        operatingStatus: 'Not Authorized',
        insuranceVerdict: 'ok',
      })
    ).toBe('Broker Active · Insurance OK')
  })

  it('marks brokers with no usable authority as do not use', () => {
    expect(
      formatMcLookupStatusLabel({
        found: true,
        brokerAuthority: 'Inactive',
        commonAuthority: 'None',
        contractAuthority: 'None',
        operatingStatus: 'Not Authorized',
        insuranceVerdict: 'missing',
      })
    ).toBe('Not Authorized — do not use · Insurance missing')
  })
})

describe('displayBrokerLookupStatus', () => {
  it('uses the frozen status_label when present', () => {
    expect(
      displayBrokerLookupStatus({
        found: true,
        operating_status: 'Authorized',
        broker_authority: 'Active',
        insurance_verdict: 'ok',
        status_label: 'Broker Active · Insurance OK',
      })
    ).toBe('Broker Active · Insurance OK')
  })

  it('rebuilds a label for older rows without status_label', () => {
    expect(
      displayBrokerLookupStatus({
        found: false,
        operating_status: null,
        broker_authority: null,
        insurance_verdict: null,
        status_label: null,
      })
    ).toBe('No company found')
  })
})

describe('brokerLookupStatusTone', () => {
  it('treats insurance OK as ok', () => {
    expect(
      brokerLookupStatusTone({
        found: true,
        operating_status: 'Authorized',
        broker_authority: 'Active',
        insurance_verdict: 'ok',
        status_label: 'Broker Active · Insurance OK',
      })
    ).toBe('ok')
  })

  it('treats do-not-use as bad', () => {
    expect(
      brokerLookupStatusTone({
        found: true,
        operating_status: 'Not Authorized',
        broker_authority: 'Inactive',
        insurance_verdict: 'cancelled',
        status_label: 'Not Authorized — do not use · Insurance cancelled',
      })
    ).toBe('bad')
  })
})
