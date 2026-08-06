// Type definitions for Audit Logging

export type AuditActionType =
  | 'user_login'
  | 'user_logout'
  | 'batch_created'
  | 'batch_updated'
  | 'batch_status_changed'
  | 'batch_deleted'
  | 'invoice_created'
  | 'invoice_updated'
  | 'invoice_status_changed'
  | 'invoice_approved'
  | 'invoice_held'
  | 'invoice_closed'
  | 'invoice_deleted'
  | 'client_created'
  | 'client_updated'
  | 'client_deleted'
  | 'client_fee_terms_updated'
  | 'broker_created'
  | 'broker_updated'
  | 'broker_deleted'
  | 'document_uploaded'
  | 'document_deleted'
  | 'document_sent'
  | 'paperwork_sent_automatic'
  | 'paperwork_sent_manual'
  | 'note_added'
  | 'collection_info_posted'
  | 'verification_added'
  | 'payment_received'
  | 'payment_rejected'
  | 'payment_moved'
  | 'payment_unprocessed'
  | 'settings_updated'
  | 'user_created'
  | 'user_updated'
  | 'user_deleted'
  | 'permission_changed'
  | 'report_generated'
  | 'data_exported'
  | 'system_error'
  | 'unauthorized_access'
  | 'password_changed'
  | 'account_locked'
  | 'account_unlocked'

export interface AuditLog {
  id: string
  timestamp: string
  user_id: string
  user_name: string
  user_role: string
  action: AuditActionType
  entity_type: 'batch' | 'invoice' | 'client' | 'broker' | 'user' | 'document' | 'system' | 'collection' | 'report' | 'settings'
  entity_id: string | null
  entity_name: string | null
  description: string
  ip_address?: string
  user_agent?: string
  changes?: {
    field: string
    old_value: any
    new_value: any
  }[]
  metadata?: Record<string, any>
  severity: 'info' | 'warning' | 'error' | 'critical'
  success: boolean
}

export interface AuditLogFilter {
  dateFrom?: string
  dateTo?: string
  userId?: string
  action?: AuditActionType
  entityType?: AuditLog['entity_type']
  severity?: AuditLog['severity']
  success?: boolean
  search?: string
}

