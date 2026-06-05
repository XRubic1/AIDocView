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
