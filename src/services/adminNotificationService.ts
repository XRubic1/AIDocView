import { getSupabase, isSupabaseConfigured } from '../lib/supabase'
import type { Notification } from '../types/notification'
import { persistOrThrow } from './persistHelper'

const ADMIN_NOTIFICATIONS_EVENT = 'admin-notifications-updated'

let adminNotifications: Notification[] = []

function emitUpdated(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(ADMIN_NOTIFICATIONS_EVENT))
  }
}

function rowToNotification(row: Record<string, unknown>): Notification {
  return {
    id: String(row.id),
    type: row.type as Notification['type'],
    title: String(row.title),
    message: String(row.message),
    timestamp: String(row.timestamp),
    read: Boolean(row.read),
    link: row.link ? String(row.link) : undefined,
    link_label: row.link_label ? String(row.link_label) : undefined,
    metadata: row.metadata as Notification['metadata'],
    invoice_id: (row.metadata as { invoice_id?: string })?.invoice_id,
    invoice_number: (row.metadata as { invoice_number?: string })?.invoice_number,
    batch_id: (row.metadata as { batch_id?: string })?.batch_id,
  }
}

/** Hydrate admin notifications from Supabase. */
export async function hydrateAdminNotifications(): Promise<void> {
  if (!isSupabaseConfigured()) return
  const supabase = getSupabase()
  if (!supabase) return

  const { data, error } = await supabase
    .from('admin_notifications')
    .select('*')
    .order('timestamp', { ascending: false })
    .limit(200)

  if (error || !data) return
  adminNotifications = data.map(rowToNotification)
  emitUpdated()
}

async function persistAdminNotification(notification: Notification): Promise<void> {
  if (!isSupabaseConfigured()) return
  const supabase = getSupabase()
  if (!supabase) return

  const { error } = await supabase.from('admin_notifications').upsert({
    id: notification.id,
    type: notification.type,
    title: notification.title,
    message: notification.message,
    timestamp: notification.timestamp,
    read: notification.read,
    link: notification.link,
    link_label: notification.link_label,
    metadata: {
      ...notification.metadata,
      invoice_id: notification.invoice_id,
      invoice_number: notification.invoice_number,
      batch_id: notification.batch_id,
    },
  })
  if (error) throw new Error(error.message)
}

function pushNotification(notification: Notification): Notification {
  adminNotifications.unshift(notification)
  void persistOrThrow('admin_notification', () => persistAdminNotification(notification)).catch(
    console.error
  )
  emitUpdated()
  return notification
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
    void persistOrThrow('admin_notification', () => persistAdminNotification(notification)).catch(
      console.error
    )
    emitUpdated()
  }
}

export function markAllAdminNotificationsRead(): void {
  adminNotifications = adminNotifications.map((n) => ({ ...n, read: true }))
  adminNotifications.forEach((n) => {
    void persistOrThrow('admin_notification', () => persistAdminNotification(n)).catch(console.error)
  })
  emitUpdated()
}

export interface ClientDocumentUploadNotificationInput {
  invoiceId: string
  invoiceNumber: string
  clientName: string
  fileNames: string[]
  fileCount: number
}

export function notifyAdminClientDocumentUpload(
  input: ClientDocumentUploadNotificationInput
): Notification {
  const fileList =
    input.fileNames.length <= 2
      ? input.fileNames.join(', ')
      : `${input.fileNames.slice(0, 2).join(', ')} +${input.fileNames.length - 2} more`

  return pushNotification({
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
  })
}

export interface ClientEnrolledNotificationInput {
  clientId: string
  clientName: string
  email: string
  tier: 'self_service' | 'managed'
}

export function notifyAdminClientEnrolled(input: ClientEnrolledNotificationInput): Notification {
  const tierLabel = input.tier === 'managed' ? 'Managed' : 'Self-Service'
  return pushNotification({
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
  })
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

export function notifyAdminDocHandoff(input: DocHandoffNotificationInput): Notification {
  const fileList =
    input.fileNames.length <= 2
      ? input.fileNames.join(', ')
      : `${input.fileNames.slice(0, 2).join(', ')} +${input.fileNames.length - 2} more`

  return pushNotification({
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
  })
}

export interface WriteOffRequestedNotificationInput {
  clientId: string
  clientName: string
  invoiceNumber: string
  shortfall: number
}

export function notifyAdminWriteOffRequested(input: WriteOffRequestedNotificationInput): Notification {
  return pushNotification({
    id: `admin-notif-wo-${Date.now()}`,
    type: 'payment_pending',
    title: 'Write-off approval needed',
    message: `${input.clientName} requested write-off on ${input.invoiceNumber} ($${input.shortfall.toFixed(2)} shortfall)`,
    timestamp: new Date().toISOString(),
    read: false,
    link: '/payment-posting',
    link_label: 'Review queue',
    invoice_number: input.invoiceNumber,
    metadata: { client_id: input.clientId, shortfall: input.shortfall },
  })
}

export interface PaymentReportedNotificationInput {
  clientName: string
  invoiceNumber: string
  amount: number
}

export function notifyAdminPaymentReported(input: PaymentReportedNotificationInput): Notification {
  return pushNotification({
    id: `admin-notif-pay-${Date.now()}`,
    type: 'payment_received',
    title: 'Payment reported',
    message: `${input.clientName} reported $${input.amount.toFixed(2)} on ${input.invoiceNumber}`,
    timestamp: new Date().toISOString(),
    read: false,
    link: '/payment-posting',
    link_label: 'Confirm payment',
    invoice_number: input.invoiceNumber,
    metadata: { amount: input.amount },
  })
}

export interface PaymentReceiptDisputeNotificationInput {
  clientName: string
  invoiceNumber: string
  amount: number
  reason: string
}

export function notifyAdminPaymentReceiptDispute(
  input: PaymentReceiptDisputeNotificationInput
): Notification {
  return pushNotification({
    id: `admin-notif-pay-dispute-${Date.now()}`,
    type: 'payment_received',
    title: 'Payment receipt dispute',
    message: `${input.clientName} disputed ${input.invoiceNumber} ($${input.amount.toFixed(2)}) — ${input.reason}. Funds on hold.`,
    timestamp: new Date().toISOString(),
    read: false,
    link: '/payment-posting',
    link_label: 'Resolve dispute',
    invoice_number: input.invoiceNumber,
    metadata: { amount: input.amount, reason: input.reason },
  })
}
