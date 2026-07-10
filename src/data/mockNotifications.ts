import { Notification } from '../types/notification'
import { getSupabase, isSupabaseConfigured } from '../lib/supabase'
import { persistNotification } from '../services/supabase/tenantPersist'
import { notificationRowToNotification, type NotificationRow } from '../services/supabase/platformMappers'
import { formatCurrency } from '../utils/format'

const CLIENT_NOTIFICATIONS_EVENT = 'client-notifications-updated'
const CLIENT_NOTIFICATIONS_CHANNEL = 'credyx-client-notifications'
const POLL_INTERVAL_MS = 20_000

export const mockNotifications: Notification[] = []

let realtimeClientId: string | null = null
let realtimeChannel: ReturnType<NonNullable<ReturnType<typeof getSupabase>>['channel']> | null =
  null
let pollTimer: ReturnType<typeof setInterval> | null = null
let broadcast: BroadcastChannel | null = null

function emitClientNotificationsUpdated(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(CLIENT_NOTIFICATIONS_EVENT))
  }
}

function getBroadcast(): BroadcastChannel | null {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return null
  if (!broadcast) {
    broadcast = new BroadcastChannel(CLIENT_NOTIFICATIONS_CHANNEL)
    broadcast.onmessage = (event: MessageEvent) => {
      const data = event.data as
        | { type?: string; clientId?: string; notification?: Notification }
        | null
      if (!data || data.type !== 'client-notification' || !data.notification || !data.clientId) {
        return
      }
      mergeNotification(data.notification)
    }
  }
  return broadcast
}

function broadcastNotification(clientId: string, notification: Notification): void {
  try {
    getBroadcast()?.postMessage({
      type: 'client-notification',
      clientId,
      notification,
    })
  } catch {
    /* ignore */
  }
}

/** Merge a notification from another tab / realtime without re-broadcasting. */
function mergeNotification(notification: Notification): void {
  const idx = mockNotifications.findIndex((n) => n.id === notification.id)
  if (idx >= 0) {
    mockNotifications[idx] = { ...mockNotifications[idx], ...notification }
  } else {
    mockNotifications.unshift(notification)
  }
  emitClientNotificationsUpdated()
}

export function hydrateNotifications(items: Notification[]): void {
  mockNotifications.length = 0
  mockNotifications.push(...items)
  emitClientNotificationsUpdated()
}

export function clearNotifications(): void {
  mockNotifications.length = 0
  emitClientNotificationsUpdated()
}

async function refreshClientNotificationsFromServer(clientId: string): Promise<void> {
  if (!isSupabaseConfigured() || !clientId) return
  const supabase = getSupabase()
  if (!supabase) return

  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('client_id', clientId)
    .order('timestamp', { ascending: false })
    .limit(200)

  if (error || !data) {
    if (error) console.error('[clientNotifications] hydrate failed', error.message)
    return
  }

  const mapped = (data as NotificationRow[]).map(notificationRowToNotification)
  // Keep other tenants' in-memory rows (admin demo) and replace this client's set.
  const others = mockNotifications.filter(
    (n) => (n.metadata?.client_id as string | undefined) !== clientId
  )
  mockNotifications.length = 0
  mockNotifications.push(...mapped, ...others)
  emitClientNotificationsUpdated()
}

/**
 * Keep client bell in sync across tabs (BroadcastChannel) and sessions
 * (Supabase realtime + light polling fallback).
 */
export function ensureClientNotificationLiveSync(clientId: string): void {
  if (!clientId) return
  getBroadcast()

  if (!isSupabaseConfigured()) return
  const supabase = getSupabase()
  if (!supabase) return

  if (realtimeClientId === clientId && realtimeChannel) return

  if (realtimeChannel) {
    void supabase.removeChannel(realtimeChannel)
    realtimeChannel = null
  }
  realtimeClientId = clientId

  realtimeChannel = supabase
    .channel(`client-notifications-live-${clientId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'notifications',
        filter: `client_id=eq.${clientId}`,
      },
      (payload) => {
        if (payload.eventType === 'DELETE') {
          const id = (payload.old as { id?: string } | null)?.id
          if (!id) return
          const next = mockNotifications.filter((n) => n.id !== id)
          mockNotifications.length = 0
          mockNotifications.push(...next)
          emitClientNotificationsUpdated()
          return
        }

        const row = payload.new as NotificationRow | null
        if (!row?.id) return
        mergeNotification(notificationRowToNotification(row))
      }
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED' && pollTimer) {
        clearInterval(pollTimer)
        pollTimer = null
      }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        startClientNotificationPolling(clientId)
      }
    })

  startClientNotificationPolling(clientId)
}

function startClientNotificationPolling(clientId: string): void {
  if (pollTimer || typeof window === 'undefined') return
  pollTimer = setInterval(() => {
    void refreshClientNotificationsFromServer(clientId)
  }, POLL_INTERVAL_MS)
}

/** Subscribe to client notification list changes (same pattern as admin bell). */
export function subscribeClientNotifications(
  onUpdate: () => void,
  clientId?: string | null
): () => void {
  if (typeof window === 'undefined') return () => undefined
  if (clientId) ensureClientNotificationLiveSync(clientId)
  const handler = () => onUpdate()
  window.addEventListener(CLIENT_NOTIFICATIONS_EVENT, handler)
  return () => window.removeEventListener(CLIENT_NOTIFICATIONS_EVENT, handler)
}

/** Add a client notification and persist when Supabase is configured. */
export function addNotification(
  clientId: string,
  data: Omit<Notification, 'id' | 'timestamp' | 'read'> & {
    id?: string
    timestamp?: string
    read?: boolean
  }
): Notification {
  const notification: Notification = {
    ...data,
    id: data.id ?? `notif-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: data.timestamp ?? new Date().toISOString(),
    read: data.read ?? false,
    metadata: {
      ...data.metadata,
      client_id: clientId,
    },
  }
  mockNotifications.unshift(notification)
  void persistNotification(notification, clientId).catch((err) =>
    console.error('[clientNotifications] persist failed', err)
  )
  broadcastNotification(clientId, notification)
  emitClientNotificationsUpdated()
  return notification
}

export function markNotificationRead(notificationId: string): void {
  const n = mockNotifications.find((x) => x.id === notificationId)
  if (!n) return
  n.read = true
  const clientId = n.metadata?.client_id as string | undefined
  if (clientId) {
    void persistNotification(n, clientId).catch(console.error)
    broadcastNotification(clientId, n)
  }
  emitClientNotificationsUpdated()
}

export function markAllClientNotificationsRead(clientId: string): void {
  for (const n of mockNotifications) {
    if ((n.metadata?.client_id as string | undefined) !== clientId) continue
    if (n.read) continue
    n.read = true
    void persistNotification(n, clientId).catch(console.error)
    broadcastNotification(clientId, n)
  }
  emitClientNotificationsUpdated()
}

export function getNotificationsForClient(clientId: string): Notification[] {
  return mockNotifications.filter(
    (n) => (n.metadata?.client_id as string | undefined) === clientId
  )
}

export type ClientPaymentNotifyKind = 'payment' | 'over' | 'short'

export interface ClientPaymentPostedNotificationInput {
  clientId: string
  invoiceId: string
  invoiceNumber: string
  paymentId: string
  amount: number
  kind: ClientPaymentNotifyKind
  /** Managed clients — payment awaits receipt confirmation. */
  awaitingConfirmation?: boolean
}

/** Credyx posted a payment / overpayment / short correction — client bell. */
export function notifyClientPaymentPosted(
  input: ClientPaymentPostedNotificationInput
): Notification {
  const amountLabel = formatCurrency(input.amount)
  const awaiting = input.awaitingConfirmation === true

  let title: string
  let message: string
  let type: Notification['type']

  if (input.kind === 'short') {
    title = awaiting ? 'Short payment to confirm' : 'Short payment posted'
    message = awaiting
      ? `Credyx posted a short payment correction of ${amountLabel} on ${input.invoiceNumber}. Confirm or dispute within 30 days.`
      : `Credyx posted a short payment correction of ${amountLabel} on ${input.invoiceNumber}.`
    type = awaiting ? 'payment_pending' : 'payment_received'
  } else if (input.kind === 'over') {
    title = awaiting ? 'Overpayment to confirm' : 'Overpayment posted'
    message = awaiting
      ? `Credyx posted ${amountLabel} on ${input.invoiceNumber} (overpayment). Confirm receipt or dispute within 30 days.`
      : `Credyx posted an overpayment of ${amountLabel} on ${input.invoiceNumber}.`
    type = awaiting ? 'payment_pending' : 'payment_received'
  } else {
    title = awaiting ? 'Payment to confirm' : 'Payment posted'
    message = awaiting
      ? `Credyx posted ${amountLabel} on ${input.invoiceNumber}. Confirm receipt or dispute within 30 days.`
      : `Credyx posted ${amountLabel} on ${input.invoiceNumber}.`
    type = awaiting ? 'payment_pending' : 'payment_received'
  }

  return addNotification(input.clientId, {
    type,
    title,
    message,
    link: '/client/payments',
    link_label: awaiting ? 'Confirm payment' : 'View payment',
    invoice_id: input.invoiceId,
    invoice_number: input.invoiceNumber,
    payment_id: input.paymentId,
    metadata: {
      amount: input.amount,
      kind: input.kind,
      awaiting_confirmation: awaiting,
    },
  })
}

export interface ClientDisputeResolvedNotificationInput {
  clientId: string
  invoiceId: string
  invoiceNumber: string
  paymentId: string
  amount: number
  /** Credyx re-queued for confirmation vs reversed the payment. */
  outcome: 'requeued' | 'rejected'
  response?: string
}

/** Credyx resolved a receipt dispute — client bell. */
export function notifyClientDisputeResolved(
  input: ClientDisputeResolvedNotificationInput
): Notification {
  const amountLabel = formatCurrency(input.amount)
  const responseNote = input.response?.trim() ? ` ${input.response.trim()}` : ''

  if (input.outcome === 'rejected') {
    return addNotification(input.clientId, {
      type: 'payment_pending',
      title: 'Dispute resolved — payment reversed',
      message: `Credyx resolved your dispute on ${input.invoiceNumber} and reversed ${amountLabel}.${responseNote}`,
      link: '/client/payments',
      link_label: 'View payment',
      invoice_id: input.invoiceId,
      invoice_number: input.invoiceNumber,
      payment_id: input.paymentId,
      metadata: {
        amount: input.amount,
        outcome: 'rejected',
      },
    })
  }

  return addNotification(input.clientId, {
    type: 'payment_pending',
    title: 'Dispute resolved — confirm payment',
    message: `Credyx resolved your dispute on ${input.invoiceNumber}. Please confirm receipt of ${amountLabel} within 30 days.${responseNote}`,
    link: '/client/payments',
    link_label: 'Confirm payment',
    invoice_id: input.invoiceId,
    invoice_number: input.invoiceNumber,
    payment_id: input.paymentId,
    metadata: {
      amount: input.amount,
      outcome: 'requeued',
      awaiting_confirmation: true,
    },
  })
}
