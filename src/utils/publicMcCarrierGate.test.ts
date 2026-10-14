import { describe, expect, it } from 'vitest'
import { assessCarrierMcGate } from './publicMcCarrierGate'
import type { BrokerSnapshotSummary } from '../types/brokerSnapshot'

function summary(partial: Partial<BrokerSnapshotSummary>): BrokerSnapshotSummary {
  return {
    found: true,
    riskFlags: [],
    ...partial,
  }
}

describe('assessCarrierMcGate', () => {
  it('rejects missing records', () => {
    const result = assessCarrierMcGate({ found: false, riskFlags: [] })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('not_found')
  })

  it('rejects broker-only dockets', () => {
    const result = assessCarrierMcGate(
      summary({
        entityType: 'B',
        brokerAuthority: 'Active',
        commonAuthority: 'None',
        contractAuthority: 'None',
      })
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('broker_only')
  })

  it('accepts carriers with common authority', () => {
    const result = assessCarrierMcGate(
      summary({
        entityType: 'C',
        commonAuthority: 'Active',
        brokerAuthority: 'None',
      })
    )
    expect(result.ok).toBe(true)
  })

  it('accepts dual C+B when common is active', () => {
    const result = assessCarrierMcGate(
      summary({
        entityType: 'C;B',
        commonAuthority: 'Active',
        brokerAuthority: 'Active',
      })
    )
    expect(result.ok).toBe(true)
  })

  it('rejects inactive carriers without authority or fleet', () => {
    const result = assessCarrierMcGate(
      summary({
        entityType: 'C',
        operatingStatus: 'Not Authorized',
        commonAuthority: 'None',
        contractAuthority: 'None',
        totalPowerUnits: 0,
      })
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('inactive')
  })
})
