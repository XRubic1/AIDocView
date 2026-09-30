import { describe, expect, it } from 'vitest'
import type { BrokerSnapshotSummary } from '../types/brokerSnapshot'
import {
  displaySnapshotRiskFlags,
  hasActiveFreightAuthority,
  isDoNotWorkBroker,
  shouldShowCancellationHistory,
} from './brokerSnapshotSafety'

function summary(partial: Partial<BrokerSnapshotSummary>): BrokerSnapshotSummary {
  return {
    found: true,
    riskFlags: [],
    ...partial,
  }
}

describe('brokerSnapshotSafety', () => {
  it('treats Active broker authority as good even if operating status is Not Authorized', () => {
    const data = summary({
      operatingStatus: 'Not Authorized',
      brokerAuthority: 'Active',
      commonAuthority: 'None',
      contractAuthority: 'None',
      insuranceVerdict: 'ok',
      activeInsuranceCount: 1,
      hasInsuranceCancellation: true,
      riskFlags: [
        'Not authorized — do not work this broker',
        'Insurance cancellation on file (2024-09-25)',
      ],
    })
    expect(hasActiveFreightAuthority(data)).toBe(true)
    expect(isDoNotWorkBroker(data)).toBe(false)
    expect(displaySnapshotRiskFlags(data)).toEqual([])
    expect(shouldShowCancellationHistory(data)).toBe(false)
  })

  it('treats broker-of-property operating status as active authority', () => {
    const data = summary({
      operatingStatus: 'AUTHORIZED FOR: Broker of Property (Except Household Goods)',
      brokerAuthority: null,
      commonAuthority: 'None',
      contractAuthority: 'None',
      insuranceVerdict: 'ok',
      activeInsuranceCount: 1,
    })
    expect(hasActiveFreightAuthority(data)).toBe(true)
    expect(isDoNotWorkBroker(data)).toBe(false)
  })
  it('blocks when no authority is active', () => {
    const data = summary({
      operatingStatus: 'Not Authorized',
      brokerAuthority: 'Inactive',
      commonAuthority: 'None',
      contractAuthority: 'None',
    })
    expect(isDoNotWorkBroker(data)).toBe(true)
  })
})
