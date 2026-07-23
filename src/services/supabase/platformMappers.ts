import type { AuditLog } from '../../types/audit'
import type { ClientDocument } from '../../types/clientDocument'
import type { Notification } from '../../types/notification'

export interface NotificationRow {
  id: string
  client_id: string
  type: string
  title: string
  message: string
  timestamp: string
  read: boolean
  link: string | null
  link_label: string | null
  invoice_id: string | null
  invoice_number: string | null
  batch_id: string | null
  batch_number: string | null
  payment_id: string | null
  metadata: Record<string, unknown> | null
}

export interface AuditLogRow {
  id: string
  timestamp: string
  user_id: string
  user_name: string
  user_role: string
  action: string
  entity_type: string
  entity_id: string | null
  entity_name: string | null
  description: string
  ip_address: string | null
  user_agent: string | null
  changes: AuditLog['changes'] | null
  metadata: Record<string, unknown> | null
  severity: string
  success: boolean
}

export interface ClientDocumentRow {
  id: string
  client_id: string
  name: string
  file_name: string
  category: string
  document_type: string
  notes: string | null
  size: number
  mime_type: string
  storage_path: string | null
  uploaded_at: string
  uploaded_by: string
  expires_at: string | null
  approval_status?: string | null
  approved_by?: string | null
  approved_at?: string | null
  rejection_reason?: string | null
  uploaded_by_role?: string | null
}

export function notificationRowToNotification(row: NotificationRow): Notification {
  return {
    id: row.id,
    type: row.type as Notification['type'],
    title: row.title,
    message: row.message,
    timestamp: row.timestamp,
    read: row.read,
    link: row.link ?? undefined,
    link_label: row.link_label ?? undefined,
    invoice_id: row.invoice_id ?? undefined,
    invoice_number: row.invoice_number ?? undefined,
    batch_id: row.batch_id ?? undefined,
    batch_number: row.batch_number ?? undefined,
    payment_id: row.payment_id ?? undefined,
    metadata: { ...(row.metadata ?? {}), client_id: row.client_id },
  }
}

export function notificationToRow(
  notification: Notification,
  clientId: string
): NotificationRow {
  return {
    id: notification.id,
    client_id: clientId,
    type: notification.type,
    title: notification.title,
    message: notification.message,
    timestamp: notification.timestamp,
    read: notification.read,
    link: notification.link ?? null,
    link_label: notification.link_label ?? null,
    invoice_id: notification.invoice_id ?? null,
    invoice_number: notification.invoice_number ?? null,
    batch_id: notification.batch_id ?? null,
    batch_number: notification.batch_number ?? null,
    payment_id: notification.payment_id ?? null,
    metadata: notification.metadata ?? null,
  }
}

export function auditLogRowToAuditLog(row: AuditLogRow): AuditLog {
  return {
    id: row.id,
    timestamp: row.timestamp,
    user_id: row.user_id,
    user_name: row.user_name,
    user_role: row.user_role,
    action: row.action as AuditLog['action'],
    entity_type: row.entity_type as AuditLog['entity_type'],
    entity_id: row.entity_id,
    entity_name: row.entity_name,
    description: row.description,
    ip_address: row.ip_address ?? undefined,
    user_agent: row.user_agent ?? undefined,
    changes: row.changes ?? undefined,
    metadata: row.metadata ?? undefined,
    severity: row.severity as AuditLog['severity'],
    success: row.success,
  }
}

export function auditLogToRow(log: AuditLog): AuditLogRow {
  return {
    id: log.id,
    timestamp: log.timestamp,
    user_id: log.user_id,
    user_name: log.user_name,
    user_role: log.user_role,
    action: log.action,
    entity_type: log.entity_type,
    entity_id: log.entity_id,
    entity_name: log.entity_name,
    description: log.description,
    ip_address: log.ip_address ?? null,
    user_agent: log.user_agent ?? null,
    changes: log.changes ?? null,
    metadata: log.metadata ?? null,
    severity: log.severity,
    success: log.success,
  }
}

export function clientDocumentRowToClientDocument(row: ClientDocumentRow): ClientDocument {
  const role = row.uploaded_by_role === 'client' ? 'client' : 'admin'
  const status =
    row.approval_status === 'pending' || row.approval_status === 'rejected'
      ? row.approval_status
      : 'approved'

  return {
    id: row.id,
    client_id: row.client_id,
    name: row.name,
    file_name: row.file_name,
    category: row.category as ClientDocument['category'],
    document_type: row.document_type,
    notes: row.notes ?? undefined,
    size: Number(row.size),
    mime_type: row.mime_type,
    uploaded_at: row.uploaded_at,
    uploaded_by: row.uploaded_by,
    expires_at: row.expires_at ?? undefined,
    approval_status: status,
    approved_by: row.approved_by ?? undefined,
    approved_at: row.approved_at ?? undefined,
    rejection_reason: row.rejection_reason ?? undefined,
    uploaded_by_role: role,
  }
}

export function clientDocumentToRow(
  doc: ClientDocument,
  storagePath?: string | null
): ClientDocumentRow {
  return {
    id: doc.id,
    client_id: doc.client_id,
    name: doc.name,
    file_name: doc.file_name,
    category: doc.category,
    document_type: doc.document_type,
    notes: doc.notes ?? null,
    size: doc.size,
    mime_type: doc.mime_type,
    storage_path: storagePath ?? null,
    uploaded_at: doc.uploaded_at,
    uploaded_by: doc.uploaded_by,
    expires_at: doc.expires_at ?? null,
    approval_status: doc.approval_status,
    approved_by: doc.approved_by ?? null,
    approved_at: doc.approved_at ?? null,
    rejection_reason: doc.rejection_reason ?? null,
    uploaded_by_role: doc.uploaded_by_role,
  }
}
