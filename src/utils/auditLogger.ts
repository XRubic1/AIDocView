import { AuditLog, AuditActionType } from '../types/audit'
import { persistAuditLog } from '../services/supabase/tenantPersist'
import { persistOrThrow } from '../services/persistHelper'

let auditLogs: AuditLog[] = []

/**
 * Persist an audit log without ever surfacing errors to the user.
 * Audit logging is a background/compliance concern: a failed write (e.g. RLS
 * on the client portal) must never block or alarm the user mid-action. The
 * primary action always persists through its own tenant-scoped write.
 */
function persistAuditLogSilently(logEntry: AuditLog): void {
  void persistAuditLog(logEntry).catch((err) => {
    const message = err instanceof Error ? err.message : String(err)
    console.warn('[audit] persist skipped:', message)
  })
}

/** Replace audit log cache (used during hydration). */
export function setAuditLogsFromHydrate(logs: AuditLog[]): void {
  auditLogs = logs
}

/**
 * Log an audit event
 */
export const logAuditEvent = (
  action: AuditActionType,
  entityType: AuditLog['entity_type'],
  entityId: string | null,
  entityName: string | null,
  description: string,
  userId: string = 'system',
  userName: string = 'System',
  userRole: string = 'System',
  changes?: AuditLog['changes'],
  metadata?: Record<string, any>,
  severity: AuditLog['severity'] = 'info',
  success: boolean = true,
  ipAddress?: string,
  userAgent?: string
): void => {
  const logEntry: AuditLog = {
    id: `audit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    timestamp: new Date().toISOString(),
    user_id: userId,
    user_name: userName,
    user_role: userRole,
    action,
    entity_type: entityType,
    entity_id: entityId,
    entity_name: entityName,
    description,
    ip_address: ipAddress,
    user_agent: userAgent,
    changes,
    metadata,
    severity,
    success,
  }

  auditLogs.push(logEntry)

  console.log('[AUDIT]', logEntry)
  persistAuditLogSilently(logEntry)

  if (auditLogs.length > 10000) {
    auditLogs = auditLogs.slice(-10000)
  }
}

/** Log and await Supabase persist (money-path / compliance). */
export async function logAuditEventAsync(
  action: AuditActionType,
  entityType: AuditLog['entity_type'],
  entityId: string | null,
  entityName: string | null,
  description: string,
  userId: string = 'system',
  userName: string = 'System',
  userRole: string = 'System',
  changes?: AuditLog['changes'],
  metadata?: Record<string, unknown>,
  severity: AuditLog['severity'] = 'info',
  success: boolean = true,
  ipAddress?: string,
  userAgent?: string
): Promise<void> {
  const logEntry: AuditLog = {
    id: `audit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    timestamp: new Date().toISOString(),
    user_id: userId,
    user_name: userName,
    user_role: userRole,
    action,
    entity_type: entityType,
    entity_id: entityId,
    entity_name: entityName,
    description,
    ip_address: ipAddress,
    user_agent: userAgent,
    changes,
    metadata,
    severity,
    success,
  }

  auditLogs.push(logEntry)
  if (auditLogs.length > 10000) {
    auditLogs = auditLogs.slice(-10000)
  }

  await persistOrThrow('audit', () => persistAuditLog(logEntry))
}

/**
 * Get all audit logs
 */
export const getAllAuditLogs = (): AuditLog[] => {
  return [...auditLogs]
}

/**
 * Get audit logs with filters
 */
export const getFilteredAuditLogs = (filters: {
  dateFrom?: string
  dateTo?: string
  userId?: string
  action?: AuditActionType
  entityType?: AuditLog['entity_type']
  severity?: AuditLog['severity']
  success?: boolean
  search?: string
}): AuditLog[] => {
  let filtered = [...auditLogs]

  if (filters.dateFrom) {
    const fromDate = new Date(filters.dateFrom)
    filtered = filtered.filter((log) => new Date(log.timestamp) >= fromDate)
  }

  if (filters.dateTo) {
    const toDate = new Date(filters.dateTo)
    toDate.setHours(23, 59, 59, 999) // End of day
    filtered = filtered.filter((log) => new Date(log.timestamp) <= toDate)
  }

  if (filters.userId) {
    filtered = filtered.filter((log) => log.user_id === filters.userId)
  }

  if (filters.action) {
    filtered = filtered.filter((log) => log.action === filters.action)
  }

  if (filters.entityType) {
    filtered = filtered.filter((log) => log.entity_type === filters.entityType)
  }

  if (filters.severity) {
    filtered = filtered.filter((log) => log.severity === filters.severity)
  }

  if (filters.success !== undefined) {
    filtered = filtered.filter((log) => log.success === filters.success)
  }

  if (filters.search) {
    const searchLower = filters.search.toLowerCase()
    filtered = filtered.filter(
      (log) =>
        log.description.toLowerCase().includes(searchLower) ||
        log.user_name.toLowerCase().includes(searchLower) ||
        log.entity_name?.toLowerCase().includes(searchLower) ||
        log.action.toLowerCase().includes(searchLower)
    )
  }

  return filtered.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
}

