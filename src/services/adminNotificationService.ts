import { getSupabase, isSupabaseConfigured } from '../lib/supabase'
import type { Notification } from '../types/notification'
import { persistOrThrow } from './persistHelper'

const ADMIN_NOTIFICATIONS_EVENT = 'admin-notifications-updated'
const ADMIN_NOTIFICATIONS_CHANNEL = 'credyx-admin-notifications'
const POLL_INTERVAL_MS = 20_000

let adminNotifications: Notification[] = []
let realtimeStarted = false
let pollTimer: ReturnType<typeof setInterval> | null = null
let broadcast: BroadcastChannel | null = null

function emitUpdated(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(ADMIN_NOTIFICATIONS_EVENT))
  }
}

function getBroadcast(): BroadcastChannel | null {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return null
  if (!broadcast) {
    broadcast = new BroadcastChannel(ADMIN_NOTIFICATIONS_CHANNEL)
    broadcast.onmessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; notification?: Notification } | null
      if (!data || data.type !== 'admin-notification' || !data.notification) return
      mergeNotification(data.notification)
    }
  }
  return broadcast
}

/** Merge a notification from another tab / realtime without re-broadcasting. */
function mergeNotification(notification: Notification): void {
  if (adminNotifications.some((n) => n.id === notification.id)) {
    adminNotifications = adminNotifications.map((n) =>
      n.id === notification.id ? { ...n, ...notification } : n
    )
  } else {
    adminNotifications = [notification, ...adminNotifications]
  }
  emitUpdated()
}

function broadcastNotification(notification: Notification): void {
  try {
    getBroadcast()?.postMessage({ type: 'admin-notification', notification })
  } catch {
    /* ignore broadcast failures */
  }
}

function rowToNotification(row: Record<string, unknown>): Notification {
  const metadata = (row.metadata ?? {}) as Notification['metadata']
  return {
    id: String(row.id),
    type: row.type as Notification['type'],
    title: String(row.title),
    message: String(row.message),
    timestamp: String(row.timestamp),
    read: Boolean(row.read),
    link: row.link ? String(row.link) : undefined,
    link_label: row.link_label ? String(row.link_label) : undefined,
    metadata,
    invoice_id: metadata?.invoice_id as string | undefined,
    invoice_number:
      (row.invoice_number ? String(row.invoice_number) : undefined) ??
      (metadata?.invoice_number as string | undefined),
    batch_id: metadata?.batch_id as string | undefined,
    payment_id: metadata?.payment_id as string | undefined,
  }
}

/** Hydrate admin notifications from Supabase. */
export async function hydrateAdminNotifications(): Promise<void> {
  await refreshAdminNotificationsFromServer()
  ensureAdminNotificationLiveSync()
}

async function refreshAdminNotificationsFromServer(): Promise<void> {
  if (!isSupabaseConfigured()) return
  const supabase = getSupabase()
  if (!supabase) return

  const { data, error } = await supabase
    .from('admin_notifications')
    .select('*')
    .order('timestamp', { ascending: false })
    .limit(200)

  if (error || !data) {
    if (error) console.error('[adminNotifications] hydrate failed', error.message)
    return
  }

  const fromServer = data.map(rowToNotification)
  const serverIds = new Set(fromServer.map((n) => n.id))
  // Keep local-only rows briefly (e.g. BroadcastChannel ahead of DB persist).
  const localOnly = adminNotifications.filter((n) => !serverIds.has(n.id))
  adminNotifications = [...fromServer, ...localOnly].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  )
  emitUpdated()
}

function notificationMetadata(notification: Notification): Record<string, unknown> {
  return {
    ...notification.metadata,
    invoice_id: notification.invoice_id,
    invoice_number: notification.invoice_number,
    batch_id: notification.batch_id,
    payment_id: notification.payment_id,
  }
}

/** Persist via SECURITY DEFINER RPC so clients can create admin inbox rows. */
async function persistAdminNotification(notification: Notification): Promise<void> {
  if (!isSupabaseConfigured()) return
  const supabase = getSupabase()
  if (!supabase) return

  const metadata = notificationMetadata(notification)

  const { error: rpcError } = await supabase.rpc('credyx_insert_admin_notification', {
    p_id: notification.id,
    p_type: notification.type,
    p_title: notification.title,
    p_message: notification.message,
    p_timestamp: notification.timestamp,
    p_read: notification.read,
    p_link: notification.link ?? null,
    p_link_label: notification.link_label ?? null,
    p_metadata: metadata,
  })

  if (!rpcError) return

  // Fallback for older DBs: plain insert (clients) then update (admins marking read).
  const row = {
    id: notification.id,
    type: notification.type,
    title: notification.title,
    message: notification.message,
    timestamp: notification.timestamp,
    read: notification.read,
    link: notification.link,
    link_label: notification.link_label,
    metadata,
  }

  if (notification.read) {
    const { error } = await supabase.from('admin_notifications').update(row).eq('id', notification.id)
    if (error) throw new Error(rpcError.message || error.message)
    return
  }

  const { error } = await supabase.from('admin_notifications').insert(row)
  if (error) throw new Error(rpcError.message || error.message)
}

function pushNotification(notification: Notification): Notification {
  adminNotifications.unshift(notification)
  void persistOrThrow('admin_notification', () => persistAdminNotification(notification)).catch(
    (err) => console.error('[adminNotifications] persist failed', err)
  )
  broadcastNotification(notification)
  emitUpdated()
  return notification
}

export function getAdminNotifications(): Notification[] {
  return [...adminNotifications]
}

/**
 * Keep Credyx admin bell in sync across tabs (BroadcastChannel) and sessions
 * (Supabase realtime + light polling fallback).
 */
export function ensureAdminNotificationLiveSync(): void {
  getBroadcast()

  if (!isSupabaseConfigured() || realtimeStarted) return
  const supabase = getSupabase()
  if (!supabase) return

  realtimeStarted = true

  supabase
    .channel('admin-notifications-live')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'admin_notifications' },
      (payload) => {
        if (payload.eventType === 'DELETE') {
          const id = (payload.old as { id?: string } | null)?.id
          if (!id) return
          adminNotifications = adminNotifications.filter((n) => n.id !== id)
          emitUpdated()
          return
        }

        const row = payload.new as Record<string, unknown> | null
        if (!row?.id) return
        mergeNotification(rowToNotification(row))
      }
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED' && pollTimer) {
        clearInterval(pollTimer)
        pollTimer = null
      }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        startAdminNotificationPolling()
      }
    })

  startAdminNotificationPolling()
}

function startAdminNotificationPolling(): void {
  if (pollTimer || typeof window === 'undefined') return
  pollTimer = setInterval(() => {
    void refreshAdminNotificationsFromServer()
  }, POLL_INTERVAL_MS)
}

export function subscribeAdminNotifications(onUpdate: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined

  ensureAdminNotificationLiveSync()
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
    broadcastNotification(notification)
    emitUpdated()
  }
}

export function markAllAdminNotificationsRead(): void {
  adminNotifications = adminNotifications.map((n) => ({ ...n, read: true }))
  adminNotifications.forEach((n) => {
    void persistOrThrow('admin_notification', () => persistAdminNotification(n)).catch(console.error)
    broadcastNotification(n)
  })
  emitUpdated()
}

/** Mark every notification for a carrier as read. */
export function markAdminNotificationsReadForClient(clientId: string): void {
  const id = clientId.trim()
  if (!id) return
  let changed = false
  adminNotifications = adminNotifications.map((n) => {
    if (n.read) return n
    const metaId = typeof n.metadata?.client_id === 'string' ? n.metadata.client_id : ''
    if (metaId !== id) return n
    changed = true
    const next = { ...n, read: true }
    void persistOrThrow('admin_notification', () => persistAdminNotification(next)).catch(console.error)
    broadcastNotification(next)
    return next
  })
  if (changed) emitUpdated()
}

async function deleteAdminNotificationRow(id: string): Promise<void> {
  if (!isSupabaseConfigured()) return
  const supabase = getSupabase()
  if (!supabase) return
  const { error } = await supabase.from('admin_notifications').delete().eq('id', id)
  if (error) throw error
}

/** Remove a notification from the admin inbox (local + Supabase). */
export function dismissAdminNotification(id: string): void {
  const existing = adminNotifications.find((n) => n.id === id)
  if (!existing) return
  adminNotifications = adminNotifications.filter((n) => n.id !== id)
  emitUpdated()
  void persistOrThrow('admin_notification', () => deleteAdminNotificationRow(id)).catch(console.error)
}

/** Remove all notifications for a carrier. */
export function dismissAdminNotificationsForClient(clientId: string): void {
  const id = clientId.trim()
  if (!id) return
  const toRemove = adminNotifications.filter((n) => {
    const metaId = typeof n.metadata?.client_id === 'string' ? n.metadata.client_id : ''
    return metaId === id
  })
  if (toRemove.length === 0) return
  const removeIds = new Set(toRemove.map((n) => n.id))
  adminNotifications = adminNotifications.filter((n) => !removeIds.has(n.id))
  emitUpdated()
  toRemove.forEach((n) => {
    void persistOrThrow('admin_notification', () => deleteAdminNotificationRow(n.id)).catch(
      console.error
    )
  })
}

export interface ClientDocumentUploadNotificationInput {
  invoiceId: string
  invoiceNumber: string
  clientName: string
  fileNames: string[]
  fileCount: number
  /** Carrier uploaded missing docs on a held invoice — Credyx should accept or reject. */
  holdReview?: boolean
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
    title: 'PPW uploaded — review documents',
    message: `${input.clientName} uploaded paperwork for invoice ${input.invoiceNumber} (${fileList}). Confirm to send the packet to the broker, or reject with a reason.`,
    timestamp: new Date().toISOString(),
    read: false,
    link: `/invoices?invoice=${input.invoiceId}`,
    link_label: 'Review documents',
    invoice_id: input.invoiceId,
    invoice_number: input.invoiceNumber,
    metadata: {
      client_name: input.clientName,
      file_names: input.fileNames,
      hold_review: Boolean(input.holdReview),
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

export interface BrokerRequestedNotificationInput {
  clientId: string
  clientName: string
  batchId: string
  batchNumber: string
  /** Broker names carriers requested that are not yet in the directory. */
  brokerNames: string[]
}

/** Carrier requested broker(s) not in the Credyx directory — needs linking. */
export function notifyAdminBrokerRequested(
  input: BrokerRequestedNotificationInput
): Notification {
  const names =
    input.brokerNames.length <= 2
      ? input.brokerNames.join(', ')
      : `${input.brokerNames.slice(0, 2).join(', ')} +${input.brokerNames.length - 2} more`

  return pushNotification({
    id: `admin-notif-broker-req-${input.batchId}-${Date.now()}`,
    type: 'batch_submitted',
    title: 'New broker requested',
    message: `${input.clientName} requested broker(s) on ${input.batchNumber}: ${names}`,
    timestamp: new Date().toISOString(),
    read: false,
    link: '/brokers?tab=new',
    link_label: 'Review new brokers',
    batch_id: input.batchId,
    batch_number: input.batchNumber,
    metadata: {
      client_id: input.clientId,
      client_name: input.clientName,
      broker_names: input.brokerNames,
    },
  })
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
    title: 'Write-off posted',
    message: `${input.clientName} wrote off $${input.shortfall.toFixed(2)} on ${input.invoiceNumber}`,
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
    title: 'Payment posted',
    message: `${input.clientName} posted $${input.amount.toFixed(2)} on ${input.invoiceNumber}`,
    timestamp: new Date().toISOString(),
    read: false,
    link: '/payment-posting',
    link_label: 'View payments',
    invoice_number: input.invoiceNumber,
    metadata: { amount: input.amount },
  })
}

export interface PaymentReceiptDisputeNotificationInput {
  clientId?: string
  clientName: string
  invoiceNumber: string
  amount: number
  reason: string
  paymentId?: string
}

export function notifyAdminPaymentReceiptDispute(
  input: PaymentReceiptDisputeNotificationInput
): Notification {
  const stableId = input.paymentId
    ? `admin-notif-pay-dispute-${input.paymentId}`
    : `admin-notif-pay-dispute-${Date.now()}`

  // Avoid duplicate bells when syncing open disputes on admin load.
  const existing = adminNotifications.find((n) => n.id === stableId)
  if (existing) return existing

  return pushNotification({
    id: stableId,
    type: 'payment_received',
    title: 'Payment receipt dispute',
    message: `${input.clientName} disputed ${input.invoiceNumber} ($${input.amount.toFixed(2)}) — ${input.reason}. Funds on hold.`,
    timestamp: new Date().toISOString(),
    read: false,
    link: '/payment-posting',
    link_label: 'Resolve dispute',
    invoice_number: input.invoiceNumber,
    payment_id: input.paymentId,
    metadata: {
      amount: input.amount,
      reason: input.reason,
      payment_id: input.paymentId,
      client_id: input.clientId,
    },
  })
}

export interface PaymentReceiptConfirmedNotificationInput {
  clientId?: string
  clientName: string
  invoiceNumber: string
  amount: number
  paymentId?: string
  /** Short payment correction vs regular payment. */
  isShortCorrection?: boolean
}

/** Client confirmed Credyx-posted payment receipt — admin bell. */
export function notifyAdminPaymentReceiptConfirmed(
  input: PaymentReceiptConfirmedNotificationInput
): Notification {
  const kindLabel = input.isShortCorrection ? 'short payment correction' : 'payment'
  return pushNotification({
    id: `admin-notif-pay-confirmed-${Date.now()}`,
    type: 'payment_received',
    title: 'Payment receipt confirmed',
    message: `${input.clientName} confirmed ${kindLabel} of $${input.amount.toFixed(2)} on ${input.invoiceNumber}.`,
    timestamp: new Date().toISOString(),
    read: false,
    link: '/payment-posting',
    link_label: 'View payments',
    invoice_number: input.invoiceNumber,
    payment_id: input.paymentId,
    metadata: {
      amount: input.amount,
      payment_id: input.paymentId,
      client_id: input.clientId,
      is_short_correction: input.isShortCorrection === true,
    },
  })
}

export interface ClientInvoiceNoteAdminNotificationInput {
  clientId?: string
  clientName: string
  invoiceId: string
  invoiceNumber: string
  authorName: string
  noteText: string
}

/** Carrier left a free-text note on an invoice — admin bell. */
export function notifyAdminClientInvoiceNote(
  input: ClientInvoiceNoteAdminNotificationInput
): Notification {
  const excerpt =
    input.noteText.trim().length > 120
      ? `${input.noteText.trim().slice(0, 117)}…`
      : input.noteText.trim()

  return pushNotification({
    id: `admin-notif-note-${Date.now()}`,
    type: 'system_alert',
    title: 'Client note on invoice',
    message: `${input.clientName}: ${input.authorName} noted on ${input.invoiceNumber} — ${excerpt}`,
    timestamp: new Date().toISOString(),
    read: false,
    link: `/invoices?invoice=${input.invoiceId}`,
    link_label: 'View invoice',
    invoice_id: input.invoiceId,
    invoice_number: input.invoiceNumber,
    metadata: {
      client_id: input.clientId,
      client_name: input.clientName,
      author_name: input.authorName,
      note_text: input.noteText.trim(),
    },
  })
}

export type CalendarEventAdminNotificationInput = {
  clientId: string
  clientName: string
  eventTitle: string
  whenLabel: string
  createdBy: 'admin' | 'client'
  meetingUrl?: string
}

/** Shared calendar event created — admin bell. */
export function notifyAdminCalendarEvent(
  input: CalendarEventAdminNotificationInput
): Notification {
  const who = input.createdBy === 'admin' ? 'Credyx' : input.clientName
  const meeting = input.meetingUrl ? ' · Meeting link' : ''
  return pushNotification({
    id: `admin-notif-cal-${Date.now()}`,
    type: 'system_alert',
    title: 'Calendar event',
    message: `${who}: ${input.eventTitle} — ${input.whenLabel}${meeting}`,
    timestamp: new Date().toISOString(),
    read: false,
    link: '/clients',
    link_label: 'Open clients',
    metadata: {
      client_id: input.clientId,
      client_name: input.clientName,
      calendar: true,
    },
  })
}

export interface BrokerRiskUrgentNotificationInput {
  clientId: string
  clientName: string
  brokerId: string
  brokerName: string
  /** Worst days past this broker's Net terms. */
  daysPastTerms: number
  netTerms: number
}

/**
 * Urgent broker risk (21+ days past Net terms) — Credyx must review what is going on.
 * Deduped per carrier+broker while an unread alert already exists.
 */
export function notifyAdminBrokerRiskUrgent(
  input: BrokerRiskUrgentNotificationInput
): Notification {
  const stableId = `admin-notif-broker-risk-urgent-${input.clientId}-${input.brokerId}`
  const existing = adminNotifications.find((n) => n.id === stableId)
  const message = `${input.brokerName} for ${input.clientName}: ${input.daysPastTerms}d past Net ${input.netTerms} — urgent review required. Check what is going on.`

  if (existing && !existing.read) {
    const refreshed: Notification = {
      ...existing,
      title: 'Urgent broker risk review',
      message,
      timestamp: new Date().toISOString(),
      link: '/admin/broker-risk',
      link_label: 'Open Broker Risk',
      metadata: {
        ...(existing.metadata ?? {}),
        client_id: input.clientId,
        client_name: input.clientName,
        broker_id: input.brokerId,
        broker_name: input.brokerName,
        days_past_terms: input.daysPastTerms,
        net_terms: input.netTerms,
        urgent: true,
      },
    }
    mergeNotification(refreshed)
    void persistOrThrow('admin_notification', () => persistAdminNotification(refreshed)).catch(
      (err) => console.error('[adminNotifications] persist failed', err)
    )
    broadcastNotification(refreshed)
    return refreshed
  }

  return pushNotification({
    id: stableId,
    type: 'overdue_alert',
    title: 'Urgent broker risk review',
    message,
    timestamp: new Date().toISOString(),
    read: false,
    link: '/admin/broker-risk',
    link_label: 'Open Broker Risk',
    metadata: {
      client_id: input.clientId,
      client_name: input.clientName,
      broker_id: input.brokerId,
      broker_name: input.brokerName,
      days_past_terms: input.daysPastTerms,
      net_terms: input.netTerms,
      urgent: true,
    },
  })
}

export type BlueprintAlertNotificationInput = {
  title: string
  message: string
  blueprintName: string
  brokerId?: string
  brokerName?: string
  batchId?: string
  batchNumber?: string
  clientName?: string
}

export type BlueprintIssueCode =
  | 'no-broker-email'
  | 'no-carrier-email'
  | 'paperwork-issue'
  | 'reply-unclear'

export function blueprintIssueNotificationId(invoiceId: string, code: BlueprintIssueCode): string {
  return `bp-issue-${invoiceId}-${code}`
}

/**
 * One bell item per invoice and issue. A later retry does not create another
 * row or mark a read alert unread.
 */
export function notifyAdminBlueprintIssue(input: {
  invoiceId: string
  invoiceNumber?: string
  code: BlueprintIssueCode
  title: string
  message: string
  blueprintName: string
  brokerName?: string
}): Notification {
  const id = blueprintIssueNotificationId(input.invoiceId, input.code)
  const existing = adminNotifications.find((n) => n.id === id)
  if (existing) return existing

  const notification: Notification = {
    id,
    type: 'system_alert',
    title: input.title,
    message: input.message,
    timestamp: new Date().toISOString(),
    read: false,
    link: `/invoices?invoice=${encodeURIComponent(input.invoiceId)}`,
    link_label: 'Open invoice',
    invoice_id: input.invoiceId,
    invoice_number: input.invoiceNumber,
    metadata: {
      invoice_id: input.invoiceId,
      invoice_number: input.invoiceNumber,
      broker_name: input.brokerName,
      blueprint_name: input.blueprintName,
      source: 'blueprint',
      issue: input.code,
    },
  }
  adminNotifications.unshift(notification)
  emitUpdated()
  broadcastNotification(notification)
  void insertAdminNotificationOnce(notification).then((inserted) => {
    if (!inserted) void refreshAdminNotificationsFromServer()
  })
  return notification
}

/** Clear the bell item once the blueprint can send again. */
export function resolveAdminBlueprintIssue(invoiceId: string, code: BlueprintIssueCode): void {
  markAdminNotificationRead(blueprintIssueNotificationId(invoiceId, code))
}

/** Insert only. A duplicate id means the alert is already in the inbox. */
async function insertAdminNotificationOnce(notification: Notification): Promise<boolean> {
  if (!isSupabaseConfigured()) return true
  const supabase = getSupabase()
  if (!supabase) return true
  const { error } = await supabase.from('admin_notifications').insert({
    id: notification.id,
    type: notification.type,
    title: notification.title,
    message: notification.message,
    timestamp: notification.timestamp,
    read: notification.read,
    link: notification.link,
    link_label: notification.link_label,
    metadata: notificationMetadata(notification),
  })
  if (!error) return true
  const duplicate = error.code === '23505' || /duplicate key/i.test(error.message)
  if (duplicate) return false
  console.error('[adminNotifications] blueprint issue insert failed', error.message)
  return false
}

/** Ops alert from a live blueprint Then-do (e.g. new broker urgent review). */
export function notifyAdminBlueprintAlert(
  input: BlueprintAlertNotificationInput
): Notification {
  const entityId = input.batchId ?? input.brokerId ?? 'ops'
  const id = `admin-notif-bp-${entityId}-${Date.now()}`
  return pushNotification({
    id,
    type: 'system_alert',
    title: input.title,
    message: input.message,
    timestamp: new Date().toISOString(),
    read: false,
    link: '/admin/blueprints',
    link_label: 'Open Blueprints',
    batch_id: input.batchId,
    metadata: {
      broker_id: input.brokerId,
      broker_name: input.brokerName,
      batch_id: input.batchId,
      batch_number: input.batchNumber,
      client_name: input.clientName,
      blueprint_name: input.blueprintName,
      source: 'blueprint',
    },
  })
}
