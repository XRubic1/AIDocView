import { Notification } from '../types/notification'

const ADMIN_NOTIFICATIONS_EVENT = 'admin-notifications-updated'

let adminNotifications: Notification[] = []

function emitUpdated(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(ADMIN_NOTIFICATIONS_EVENT))
  }
}

export function getAdminNotifications(): Notification[] {
  return [...adminNotifications]
}

export function subscribeAdminNotifications(onUpdate: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined

  const handler = () => onUpdate()
  window.addEventListener(ADMIN_NOTIFICATIONS_EVENT, handler)
  return () => window.removeEventListener(ADMIN_NOTIFICATIONS_EVENT, handler)
}

export function markAdminNotificationRead(id: string): void {
  const notification = adminNotifications.find((n) => n.id === id)
  if (notification) {
    notification.read = true
    emitUpdated()
  }
}

export function markAllAdminNotificationsRead(): void {
  adminNotifications = adminNotifications.map((n) => ({ ...n, read: true }))
  emitUpdated()
}

export interface ClientDocumentUploadNotificationInput {
  invoiceId: string
  invoiceNumber: string
  clientName: string
  fileNames: string[]
  fileCount: number
}

/** Notify admin team when a client uploads documents on an invoice. */
export function notifyAdminClientDocumentUpload(
  input: ClientDocumentUploadNotificationInput
): Notification {
  const fileList =
    input.fileNames.length <= 2
      ? input.fileNames.join(', ')
      : `${input.fileNames.slice(0, 2).join(', ')} +${input.fileNames.length - 2} more`

  const notification: Notification = {
    id: `admin-notif-${Date.now()}`,
    type: 'document_uploaded',
    title: 'Client uploaded documents',
    message: `${input.clientName} uploaded ${input.fileCount} file${input.fileCount > 1 ? 's' : ''} to ${input.invoiceNumber}: ${fileList}`,
    timestamp: new Date().toISOString(),
    read: false,
    link: `/invoice-search?invoice=${input.invoiceId}`,
    link_label: 'Review invoice',
    invoice_id: input.invoiceId,
    invoice_number: input.invoiceNumber,
    metadata: {
      client_name: input.clientName,
      file_names: input.fileNames,
    },
  }

  adminNotifications.unshift(notification)
  emitUpdated()
  console.log('[ADMIN NOTIFICATION]', notification)

  return notification
}

export interface ClientEnrolledNotificationInput {
  clientId: string
  clientName: string
  email: string
  tier: 'self_service' | 'managed'
}

/** Notify admin when a new carrier enrolls. */
export function notifyAdminClientEnrolled(input: ClientEnrolledNotificationInput): Notification {
  const tierLabel = input.tier === 'managed' ? 'Managed' : 'Self-Service'
  const notification: Notification = {
    id: `admin-notif-enroll-${Date.now()}`,
    type: 'batch_submitted',
    title: 'New enrollment application',
    message: `${input.clientName} applied for ${tierLabel} (${input.email})`,
    timestamp: new Date().toISOString(),
    read: false,
    link: '/clients',
    link_label: 'Review clients',
    metadata: {
      client_id: input.clientId,
      client_name: input.clientName,
      tier: input.tier,
    },
  }
  adminNotifications.unshift(notification)
  emitUpdated()
  return notification
}

export interface DocHandoffNotificationInput {
  clientId: string
  clientName: string
  batchId: string
  batchNumber: string
  fileCount: number
  fileNames: string[]
  notes?: string
}

/** Notify admin when a managed client submits a document handoff. */
export function notifyAdminDocHandoff(input: DocHandoffNotificationInput): Notification {
  const fileList =
    input.fileNames.length <= 2
      ? input.fileNames.join(', ')
      : `${input.fileNames.slice(0, 2).join(', ')} +${input.fileNames.length - 2} more`

  const notification: Notification = {
    id: `admin-notif-handoff-${Date.now()}`,
    type: 'document_uploaded',
    title: 'Managed doc handoff',
    message: `${input.clientName} sent ${input.fileCount} file${input.fileCount > 1 ? 's' : ''}: ${fileList}`,
    timestamp: new Date().toISOString(),
    read: false,
    link: '/batches',
    link_label: 'Review batch',
    batch_id: input.batchId,
    metadata: {
      client_id: input.clientId,
      client_name: input.clientName,
      notes: input.notes,
    },
  }
  adminNotifications.unshift(notification)
  emitUpdated()
  return notification
}
