import { Notification } from '../types/notification'
import { persistNotification } from '../services/supabase/tenantPersist'

export const mockNotifications: Notification[] = []

export function hydrateNotifications(items: Notification[]): void {
  mockNotifications.length = 0
  mockNotifications.push(...items)
}

export function clearNotifications(): void {
  mockNotifications.length = 0
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
  }
  mockNotifications.unshift(notification)
  void persistNotification(notification, clientId).catch(console.error)
  return notification
}

export function markNotificationRead(notificationId: string): void {
  const n = mockNotifications.find((x) => x.id === notificationId)
  if (!n) return
  n.read = true
  const clientId = n.metadata?.client_id as string | undefined
  if (clientId) void persistNotification(n, clientId).catch(console.error)
}

export function getNotificationsForClient(clientId: string): Notification[] {
  return mockNotifications.filter(
    (n) => (n.metadata?.client_id as string | undefined) === clientId
  )
}
