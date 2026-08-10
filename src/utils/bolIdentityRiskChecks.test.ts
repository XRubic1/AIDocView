import { describe, expect, it } from 'vitest'
import {
  evaluateBolIdentityRiskFlags,
  looksLikeFacilityAddress,
  partyMatchesBroker,
} from './bolIdentityRiskChecks'

describe('looksLikeFacilityAddress', () => {
  it('rejects blanks and placeholders', () => {
    expect(looksLikeFacilityAddress('')).toBe(false)
    expect(looksLikeFacilityAddress('as directed')).toBe(false)
    expect(looksLikeFacilityAddress('Shipper')).toBe(false)
    expect(looksLikeFacilityAddress('Dallas')).toBe(false)
  })

  it('accepts real facility lines', () => {
    expect(
      looksLikeFacilityAddress('Walmart DC #6023 – 4500 Distribution Dr, Sealy, TX 77474')
    ).toBe(true)
    expect(looksLikeFacilityAddress('Tyson Foods, 100 Packers Rd, Springdale, AR 72762')).toBe(
      true
    )
  })

  it('rejects broker/company name only', () => {
    expect(looksLikeFacilityAddress('Acme Brokerage LLC')).toBe(false)
  })
})

describe('partyMatchesBroker', () => {
  it('matches broker name inside a ship-from line', () => {
    expect(
      partyMatchesBroker('Acme Logistics – 100 Main St, Dallas, TX', 'Acme Logistics Inc')
    ).toBe(true)
  })

  it('does not match unrelated shipper', () => {
    expect(partyMatchesBroker('Walmart DC 6023, Sealy TX', 'Acme Logistics')).toBe(false)
  })
})

describe('evaluateBolIdentityRiskFlags', () => {
  it('flags broker as both shipper and receiver', () => {
    const result = evaluateBolIdentityRiskFlags({
      brokerName: 'Acme Brokerage LLC',
      shipFrom: 'Acme Brokerage',
      shipTo: 'Acme Brokerage LLC – Dallas',
    })
    expect(result.brokerAsShipperAndReceiver).toBe(true)
    expect(result.flags.some((f) => f.field === 'bol_broker_as_shipper_and_receiver')).toBe(true)
  })

  it('flags missing shipper and receiver facilities', () => {
    const result = evaluateBolIdentityRiskFlags({
      brokerName: 'Acme Brokerage',
      shipFrom: 'as directed',
      shipTo: '',
    })
    expect(result.missingBothFacilities).toBe(true)
    expect(result.flags.some((f) => f.field === 'bol_missing_shipper_receiver_facilities')).toBe(
      true
    )
  })

  it('does not flag normal shipper/receiver facilities', () => {
    const result = evaluateBolIdentityRiskFlags({
      brokerName: 'Acme Brokerage LLC',
      shipFrom: 'Walmart DC #1, 100 Warehouse Rd, Dallas, TX 75001',
      shipTo: 'Costco Depot, 200 Dock Ave, Houston, TX 77001',
    })
    expect(result.flags).toHaveLength(0)
  })
})
