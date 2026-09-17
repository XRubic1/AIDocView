import { describe, expect, it } from 'vitest'
import type { AuditLog } from '../types/audit'
import {
  brokerRiskAuditDedupeKey,
  dedupeBrokerRiskAuditLogs,
} from './brokerRiskAudit'

function riskLog(overrides: Partial<AuditLog> & Pick<AuditLog, 'id'>): AuditLog {
  return {
    timestamp: '2026-09-08T18:30:12.000Z',
    user_id: 'admin',
    user_name: 'System',
    user_role: 'Admin',
    action: 'broker_risk_flagged',
    entity_type: 'broker',
    entity_id: 'broker-1',
    entity_name: 'CH Robinson',
    description: 'Flagged for review — High risk (CH Robinson)',
    metadata: {
      kind: 'broker_risk',
      to_status: 'pending_review',
      to_level: 'high',
      client_id: 'client-a',
      client_name: 'Demo Carrier LLC',
    },
    severity: 'warning',
    success: true,
    ...overrides,
  }
}

describe('brokerRiskAuditDedupeKey', () => {
  it('ignores carrier metadata and buckets by second', () => {
    const base = {
      brokerId: 'broker-1',
      action: 'broker_risk_flagged' as const,
      description: 'Flagged for review — High risk (CH Robinson)',
      reviewedBy: 'System',
      toStatus: 'pending_review' as const,
      toLevel: 'high' as const,
    }
    const a = brokerRiskAuditDedupeKey({ ...base, timestampMs: Date.parse('2026-09-08T18:30:12.000Z') })
    const b = brokerRiskAuditDedupeKey({ ...base, timestampMs: Date.parse('2026-09-08T18:30:12.500Z') })
    const c = brokerRiskAuditDedupeKey({ ...base, timestampMs: Date.parse('2026-09-08T18:30:13.000Z') })

    expect(a).toBe(b)
    expect(a).not.toBe(c)
  })
})

describe('dedupeBrokerRiskAuditLogs', () => {
  it('collapses per-carrier duplicates for the same broker action', () => {
    const logs = [
      riskLog({ id: '1', metadata: { kind: 'broker_risk', to_status: 'pending_review', to_level: 'high', client_id: 'a', client_name: 'Demo Carrier LLC' } }),
      riskLog({ id: '2', metadata: { kind: 'broker_risk', to_status: 'pending_review', to_level: 'high', client_id: 'b', client_name: 'Test Carrier' } }),
      riskLog({ id: '3', metadata: { kind: 'broker_risk', to_status: 'pending_review', to_level: 'high', client_id: 'c', client_name: 'Test Carrier' } }),
    ]

    expect(dedupeBrokerRiskAuditLogs(logs)).toHaveLength(1)
  })
})
