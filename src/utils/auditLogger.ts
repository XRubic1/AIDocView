import { AuditLog, AuditActionType } from '../types/audit'

// In-memory storage for audit logs (in a real app, this would be a database)
let auditLogs: AuditLog[] = []

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

  // In a real application, you would also send this to a logging service
  console.log('[AUDIT]', logEntry)

  // Keep only last 10,000 logs in memory (in production, this would be in a database)
  if (auditLogs.length > 10000) {
    auditLogs = auditLogs.slice(-10000)
  }
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

/**
 * Initialize with some sample audit logs for demonstration
 */
export const initializeAuditLogs = (): void => {
  const now = new Date()
  const sampleLogs: AuditLog[] = [
    {
      id: 'audit-1',
      timestamp: new Date(now.getTime() - 3600000).toISOString(), // 1 hour ago
      user_id: 'user-1',
      user_name: 'Admin User',
      user_role: 'Admin',
      action: 'batch_created',
      entity_type: 'batch',
      entity_id: 'batch-1',
      entity_name: 'BATCH-2025-001',
      description: 'Created new batch BATCH-2025-001 with 5 invoices',
      severity: 'info',
      success: true,
    },
    {
      id: 'audit-2',
      timestamp: new Date(now.getTime() - 7200000).toISOString(), // 2 hours ago
      user_id: 'user-1',
      user_name: 'Admin User',
      user_role: 'Admin',
      action: 'batch_status_changed',
      entity_type: 'batch',
      entity_id: 'batch-4',
      entity_name: 'BATCH-2025-004',
      description: 'Batch status changed from ready_to_post to verification',
      changes: [
        {
          field: 'status',
          old_value: 'ready_to_post',
          new_value: 'verification',
        },
      ],
      severity: 'info',
      success: true,
    },
    {
      id: 'audit-3',
      timestamp: new Date(now.getTime() - 10800000).toISOString(), // 3 hours ago
      user_id: 'user-2',
      user_name: 'Sarah Johnson',
      user_role: 'Admin',
      action: 'invoice_approved',
      entity_type: 'invoice',
      entity_id: 'inv-1',
      entity_name: 'INV-2025-001',
      description: 'Invoice INV-2025-001 approved',
      severity: 'info',
      success: true,
    },
    {
      id: 'audit-4',
      timestamp: new Date(now.getTime() - 14400000).toISOString(), // 4 hours ago
      user_id: 'user-1',
      user_name: 'Admin User',
      user_role: 'Admin',
      action: 'client_fee_terms_updated',
      entity_type: 'client',
      entity_id: 'client-1',
      entity_name: 'ABC Trucking',
      description: 'Updated fee terms for client ABC Trucking',
      changes: [
        {
          field: 'fee_percentage',
          old_value: 2.0,
          new_value: 2.5,
        },
      ],
      severity: 'info',
      success: true,
    },
    {
      id: 'audit-5',
      timestamp: new Date(now.getTime() - 18000000).toISOString(), // 5 hours ago
      user_id: 'user-3',
      user_name: 'Mike Davis',
      user_role: 'Admin',
      action: 'document_uploaded',
      entity_type: 'document',
      entity_id: 'doc-1',
      entity_name: 'Invoice.pdf',
      description: 'Uploaded document Invoice.pdf for invoice INV-2025-001',
      severity: 'info',
      success: true,
    },
    {
      id: 'audit-6',
      timestamp: new Date(now.getTime() - 21600000).toISOString(), // 6 hours ago
      user_id: 'user-1',
      user_name: 'Admin User',
      user_role: 'Admin',
      action: 'invoice_closed',
      entity_type: 'invoice',
      entity_id: 'inv-2',
      entity_name: 'INV-2025-002',
      description: 'Invoice INV-2025-002 closed as Paid for $5,000.00',
      metadata: {
        close_type: 'Paid',
        close_amount: 5000.0,
      },
      severity: 'info',
      success: true,
    },
    {
      id: 'audit-7',
      timestamp: new Date(now.getTime() - 86400000).toISOString(), // 1 day ago
      user_id: 'user-1',
      user_name: 'Admin User',
      user_role: 'Admin',
      action: 'collection_info_posted',
      entity_type: 'collection',
      entity_id: 'inv-3',
      entity_name: 'INV-2025-003',
      description: 'Collection information posted for invoice INV-2025-003',
      metadata: {
        collection_status: 'C/B',
        collection_date: '2025-12-01',
      },
      severity: 'info',
      success: true,
    },
    {
      id: 'audit-8',
      timestamp: new Date(now.getTime() - 172800000).toISOString(), // 2 days ago
      user_id: 'user-2',
      user_name: 'Sarah Johnson',
      user_role: 'Admin',
      action: 'verification_added',
      entity_type: 'invoice',
      entity_id: 'inv-4',
      entity_name: 'INV-2025-004',
      description: 'Verification information added for invoice INV-2025-004',
      metadata: {
        verification_method: 'Phone',
        contact_person: 'John Smith',
      },
      severity: 'info',
      success: true,
    },
    {
      id: 'audit-9',
      timestamp: new Date(now.getTime() - 259200000).toISOString(), // 3 days ago
      user_id: 'user-1',
      user_name: 'Admin User',
      user_role: 'Admin',
      action: 'report_generated',
      entity_type: 'report',
      entity_id: null,
      entity_name: 'Earnings Report',
      description: 'Generated earnings report for Q4 2025',
      severity: 'info',
      success: true,
    },
    {
      id: 'audit-10',
      timestamp: new Date(now.getTime() - 345600000).toISOString(), // 4 days ago
      user_id: 'user-1',
      user_name: 'Admin User',
      user_role: 'Admin',
      action: 'user_login',
      entity_type: 'system',
      entity_id: null,
      entity_name: null,
      description: 'User logged in successfully',
      ip_address: '192.168.1.100',
      severity: 'info',
      success: true,
    },
    {
      id: 'audit-11',
      timestamp: new Date(now.getTime() - 7200000).toISOString(), // 2 hours ago
      user_id: 'user-1',
      user_name: 'Admin User',
      user_role: 'Admin',
      action: 'document_sent',
      entity_type: 'invoice',
      entity_id: 'inv-1',
      entity_name: 'INV-2025-001',
      description: 'Paperwork automatically sent to john.smith@tql.com for invoice INV-2025-001 (Batch: BATCH-2025-012)',
      metadata: {
        batch_number: 'BATCH-2025-012',
        broker_id: 'broker-1',
        broker_name: 'TQL',
        broker_email: 'john.smith@tql.com',
        documents_sent: ['Invoice.pdf', 'BOL.pdf'],
        automatic: true,
      },
      severity: 'info',
      success: true,
    },
    {
      id: 'audit-12',
      timestamp: new Date(now.getTime() - 7200000).toISOString(), // 2 hours ago
      user_id: 'user-1',
      user_name: 'Admin User',
      user_role: 'Admin',
      action: 'document_sent',
      entity_type: 'batch',
      entity_id: null,
      entity_name: 'BATCH-2025-012',
      description: 'Automatic paperwork sending completed for batch BATCH-2025-012: 15 successful, 0 failed',
      metadata: {
        batch_number: 'BATCH-2025-012',
        total_invoices: 15,
        successful: 15,
        failed: 0,
      },
      severity: 'info',
      success: true,
    },
    {
      id: 'audit-13',
      timestamp: new Date(now.getTime() - 10800000).toISOString(), // 3 hours ago
      user_id: 'user-1',
      user_name: 'Admin User',
      user_role: 'Admin',
      action: 'batch_status_changed',
      entity_type: 'batch',
      entity_id: 'batch-approval-2',
      entity_name: 'BATCH-2025-012',
      description: 'Batch BATCH-2025-012 processed and moved to submitted status. Paperwork sent: 15 successful, 0 failed',
      changes: [
        {
          field: 'status',
          old_value: 'approval',
          new_value: 'submitted',
        },
      ],
      metadata: {
        total_invoices: 15,
        paperwork_sent: 15,
        paperwork_failed: 0,
      },
      severity: 'info',
      success: true,
    },
  ]

  auditLogs = [...sampleLogs, ...auditLogs]
}

// Initialize with sample logs on module load
initializeAuditLogs()

