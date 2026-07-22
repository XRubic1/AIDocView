import type { Notification } from '../types/notification'
import type { ClientNotificationPreferences } from '../types/client'

/** Categories that map to real client-portal bell pushes. */
export type ClientNotificationCategory =
  | 'payment'
  | 'shortOver'
  | 'hold'
  | 'notes'
  | 'dispute'

export type { ClientNotificationPreferences }

export const DEFAULT_CLIENT_NOTIFICATION_PREFERENCES: ClientNotificationPreferences = {
  bellEnabled: true,
  payment: true,
  shortOver: true,
  hold: true,
  notes: true,
  dispute: true,
}

export const CLIENT_NOTIFICATION_PREFS_EVENT = 'credyx-client-notification-prefs-updated'

const storageKey = (clientId: string) => `credyx-client-notif-prefs:${clientId}`

/** Merge partial prefs with defaults. */
export function normalizeClientNotificationPreferences(
  partial?: Partial<ClientNotificationPreferences> | null
): ClientNotificationPreferences {
  return {
    ...DEFAULT_CLIENT_NOTIFICATION_PREFERENCES,
    ...(partial ?? {}),
  }
}

function readLocalPrefs(clientId: string): Partial<ClientNotificationPreferences> | null {
  if (typeof window === 'undefined' || !clientId) return null
  try {
    const raw = localStorage.getItem(storageKey(clientId))
    if (!raw) return null
    return JSON.parse(raw) as Partial<ClientNotificationPreferences>
  } catch {
    return null
  }
}

function writeLocalPrefs(clientId: string, prefs: ClientNotificationPreferences): void {
  if (typeof window === 'undefined' || !clientId) return
  localStorage.setItem(storageKey(clientId), JSON.stringify(prefs))
}

function emitPrefsUpdated(clientId: string): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(
    new CustomEvent(CLIENT_NOTIFICATION_PREFS_EVENT, { detail: { clientId } })
  )
}

/**
 * Load prefs for a client (localStorage first, then optional record prefs).
 * Local wins so Settings saves apply instantly even before a remote round-trip.
 */
export function getClientNotificationPreferences(
  clientId: string,
  recordPrefs?: Partial<ClientNotificationPreferences> | null
): ClientNotificationPreferences {
  const local = readLocalPrefs(clientId)
  return normalizeClientNotificationPreferences(local ?? recordPrefs)
}

/** Persist prefs locally and notify open UIs to re-filter the bell. */
export function saveClientNotificationPreferences(
  clientId: string,
  prefs: ClientNotificationPreferences
): ClientNotificationPreferences {
  const normalized = normalizeClientNotificationPreferences(prefs)
  writeLocalPrefs(clientId, normalized)
  emitPrefsUpdated(clientId)
  return normalized
}

/** Map a notification to a preference category (null = always show / uncategorized). */
export function getClientNotificationCategory(
  notification: Pick<Notification, 'type' | 'metadata'>
): ClientNotificationCategory | null {
  if (notification.type === 'invoice_on_hold') return 'hold'
  if (notification.type === 'invoice_note') return 'notes'

  if (notification.type === 'payment_received' || notification.type === 'payment_pending') {
    const kind = notification.metadata?.kind as string | undefined
    if (kind === 'short' || kind === 'over') return 'shortOver'
    const outcome = notification.metadata?.outcome as string | undefined
    if (outcome === 'rejected' || outcome === 'requeued') return 'dispute'
    return 'payment'
  }

  return null
}

/** Whether this client should receive / see a notification of this category. */
export function isClientNotificationCategoryEnabled(
  clientId: string,
  category: ClientNotificationCategory,
  recordPrefs?: Partial<ClientNotificationPreferences> | null
): boolean {
  const prefs = getClientNotificationPreferences(clientId, recordPrefs)
  if (!prefs.bellEnabled) return false
  return prefs[category] !== false
}

/** Filter notifications for display / badge by the client's current prefs. */
export function filterNotificationsByClientPreferences(
  clientId: string,
  notifications: Notification[],
  recordPrefs?: Partial<ClientNotificationPreferences> | null
): Notification[] {
  const prefs = getClientNotificationPreferences(clientId, recordPrefs)
  if (!prefs.bellEnabled) return []

  return notifications.filter((n) => {
    const category = getClientNotificationCategory(n)
    if (!category) return true
    return prefs[category] !== false
  })
}

/** Subscribe to preference changes (Settings save). */
export function subscribeClientNotificationPreferences(
  onUpdate: (clientId: string) => void
): () => void {
  if (typeof window === 'undefined') return () => undefined
  const handler = (event: Event) => {
    const clientId = (event as CustomEvent<{ clientId?: string }>).detail?.clientId
    if (clientId) onUpdate(clientId)
  }
  window.addEventListener(CLIENT_NOTIFICATION_PREFS_EVENT, handler)
  return () => window.removeEventListener(CLIENT_NOTIFICATION_PREFS_EVENT, handler)
}
