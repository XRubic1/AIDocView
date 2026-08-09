import type { AuditLog } from '../types/audit'
import type { BrokerRiskLevel, BrokerRiskProfile, BrokerRiskReviewStatus } from '../types/brokerRisk'
import { getAllAuditLogs, logAuditEvent } from './auditLogger'

/** Risk-related audit actions for broker entity. */
export const BROKER_RISK_AUDIT_ACTIONS = [
  'broker_risk_flagged',
  'broker_risk_published',
  'broker_risk_cleared',
  'broker_risk_note_updated',
  'broker_risk_level_changed',
] as const

export type BrokerRiskAuditAction = (typeof BROKER_RISK_AUDIT_ACTIONS)[number]

export type BrokerRiskAuditEventInput = {
  action: BrokerRiskAuditAction
  brokerId: string
  brokerName: string
  clientId: string
  clientName?: string | null
  reviewedBy: string
  description: string
  fromStatus?: BrokerRiskReviewStatus | null
  toStatus?: BrokerRiskReviewStatus | null
  fromLevel?: BrokerRiskLevel | null
  toLevel?: BrokerRiskLevel | null
  note?: string | null
  severity?: AuditLog['severity']
}

/** Human label for risk audit action. */
export function brokerRiskAuditActionLabel(action: string): string {
  switch (action) {
    case 'broker_risk_flagged':
      return 'Flagged for review'
    case 'broker_risk_published':
      return 'Marked risky'
    case 'broker_risk_cleared':
      return 'Risk removed'
    case 'broker_risk_note_updated':
      return 'Note updated'
    case 'broker_risk_level_changed':
      return 'Risk level changed'
    default:
      return action
  }
}

/** Persist a broker-risk audit event (admin compliance trail). */
export function logBrokerRiskAudit(input: BrokerRiskAuditEventInput): void {
  const severity =
    input.severity ??
    (input.action === 'broker_risk_published' || input.action === 'broker_risk_flagged'
      ? 'warning'
      : 'info')

  const changes: AuditLog['changes'] = []
  if (input.fromStatus != null || input.toStatus != null) {
    changes.push({
      field: 'review_status',
      old_value: input.fromStatus ?? null,
      new_value: input.toStatus ?? null,
    })
  }
  if (input.fromLevel != null || input.toLevel != null) {
    changes.push({
      field: 'risk_level',
      old_value: input.fromLevel ?? null,
      new_value: input.toLevel ?? null,
    })
  }
  if (input.note != null && input.note.trim()) {
    changes.push({
      field: 'review_note',
      old_value: null,
      new_value: input.note.trim(),
    })
  }

  logAuditEvent(
    input.action,
    'broker',
    input.brokerId,
    input.brokerName,
    input.description,
    'admin',
    input.reviewedBy,
    'Admin',
    changes.length > 0 ? changes : undefined,
    {
      client_id: input.clientId,
      client_name: input.clientName ?? null,
      from_status: input.fromStatus ?? null,
      to_status: input.toStatus ?? null,
      from_level: input.fromLevel ?? null,
      to_level: input.toLevel ?? null,
      review_note: input.note?.trim() || null,
      kind: 'broker_risk',
    },
    severity
  )
}

/** List risk audit events for a broker (optionally scoped to one carrier). */
export function listBrokerRiskAuditLogs(args: {
  brokerId: string
  clientId?: string | null
  limit?: number
}): AuditLog[] {
  const limit = args.limit ?? 50
  return getAllAuditLogs()
    .filter((log) => {
      if (log.entity_type !== 'broker') return false
      if (log.entity_id !== args.brokerId) return false
      const isRisk =
        BROKER_RISK_AUDIT_ACTIONS.includes(log.action as BrokerRiskAuditAction) ||
        log.metadata?.kind === 'broker_risk'
      if (!isRisk) return false
      if (args.clientId && log.metadata?.client_id && log.metadata.client_id !== args.clientId) {
        return false
      }
      return true
    })
    .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))
    .slice(0, limit)
}

/**
 * When no audit rows exist yet, surface the latest Credyx decision from the
 * profile so the timeline is not empty after deploy.
 */
export function synthesizeBrokerRiskAuditFromProfile(
  profile: BrokerRiskProfile | null | undefined,
  brokerName: string,
  clientName?: string | null
): AuditLog[] {
  if (!profile?.reviewed_at || !profile.reviewed_by) return []
  if (profile.review_status !== 'published' && profile.review_status !== 'cleared') {
    return []
  }

  const action: BrokerRiskAuditAction =
    profile.review_status === 'cleared' ? 'broker_risk_cleared' : 'broker_risk_published'
  const levelLabel =
    profile.risk_level === 'high'
      ? 'High'
      : profile.risk_level === 'medium'
        ? 'Medium'
        : profile.risk_level === 'low'
          ? 'Low'
          : 'Unrated'

  return [
    {
      id: `synthetic-${profile.id}-review`,
      timestamp: profile.reviewed_at,
      user_id: 'admin',
      user_name: profile.reviewed_by,
      user_role: 'Admin',
      action,
      entity_type: 'broker',
      entity_id: profile.broker_id,
      entity_name: brokerName,
      description:
        profile.review_status === 'cleared'
          ? `Risk removed for ${brokerName}${clientName ? ` · ${clientName}` : ''}`
          : `Marked ${levelLabel} risk for ${brokerName}${clientName ? ` · ${clientName}` : ''}`,
      changes: profile.review_note
        ? [{ field: 'review_note', old_value: null, new_value: profile.review_note }]
        : undefined,
      metadata: {
        client_id: profile.client_id,
        client_name: clientName ?? null,
        to_status: profile.review_status,
        to_level: profile.risk_level,
        review_note: profile.review_note,
        kind: 'broker_risk',
        synthetic: true,
      },
      severity: profile.review_status === 'published' ? 'warning' : 'info',
      success: true,
    },
  ]
}
