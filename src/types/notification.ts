// Type definitions for Notifications

export type NotificationType =
  | 'invoice_approved'
  | 'invoice_on_hold'
  | 'invoice_rejected'
  | 'payment_received'
  | 'batch_submitted'
  | 'batch_reviewed'
  | 'payment_pending'
  | 'overdue_alert'
  | 'document_uploaded'
  | 'system_alert'

export interface Notification {
  id: string
  type: NotificationType
  title: string
  message: string
  timestamp: string
  read: boolean
  link?: string
  link_label?: string
  invoice_id?: string
  invoice_number?: string
  batch_id?: string
  batch_number?: string
  payment_id?: string
  metadata?: Record<string, any>
}


