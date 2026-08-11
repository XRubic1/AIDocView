import type { Notification } from '../types/notification'

export type AdminNotificationCategory = 'disputes' | 'payments' | 'notes' | 'docs' | 'other'

export type AdminNotificationCompanyGroup = {
  companyId: string
  companyName: string
  total: number
  unread: number
  counts: Record<AdminNotificationCategory, number>
  notifications: Notification[]
  /** Notes surfaced for quick reading (newest first). */
  notePreviews: Array<{ id: string; text: string; unread: boolean; timestamp: string }>
}

const UNASSIGNED_ID = '__unassigned__'

/** Resolve carrier/company id from notification metadata. */
export function getNotificationCompanyId(notification: Notification): string | null {
  const raw = notification.metadata?.client_id
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null
}

/** Resolve display name from metadata or company map. */
export function getNotificationCompanyName(
  notification: Notification,
  companyNameById?: Map<string, string>
): string {
  const id = getNotificationCompanyId(notification)
  if (id && companyNameById?.has(id)) return companyNameById.get(id) ?? 'Unknown company'
  const name = notification.metadata?.client_name
  if (typeof name === 'string' && name.trim()) return name.trim()
  return id ? 'Unknown company' : 'General'
}

/** Bucket admin notifications into scannable categories. */
export function categorizeAdminNotification(
  notification: Notification
): AdminNotificationCategory {
  const title = (notification.title || '').toLowerCase()
  const type = notification.type

  if (title.includes('dispute') || notification.metadata?.reason) {
    return 'disputes'
  }

  if (
    type === 'invoice_note' ||
    title.includes('client note') ||
    typeof notification.metadata?.note_text === 'string' ||
    typeof notification.metadata?.noteText === 'string'
  ) {
    return 'notes'
  }

  if (
    type === 'payment_received' ||
    type === 'payment_pending' ||
    title.includes('payment') ||
    title.includes('write-off')
  ) {
    return 'payments'
  }

  if (type === 'document_uploaded' || title.includes('document') || title.includes('handoff')) {
    return 'docs'
  }

  return 'other'
}

/** Pull the readable note body for quick preview. */
export function getNotificationNoteText(notification: Notification): string | null {
  const meta = notification.metadata
  const fromMeta =
    (typeof meta?.note_text === 'string' && meta.note_text.trim()) ||
    (typeof meta?.noteText === 'string' && meta.noteText.trim()) ||
    (typeof meta?.notes === 'string' && meta.notes.trim()) ||
    ''

  if (fromMeta) return fromMeta

  if (categorizeAdminNotification(notification) !== 'notes') return null

  // Fallback: text after the em dash in "… — note body"
  const message = notification.message || ''
  const dashIdx = message.lastIndexOf(' — ')
  if (dashIdx >= 0) {
    const excerpt = message.slice(dashIdx + 3).trim()
    if (excerpt) return excerpt
  }

  return message.trim() || null
}

const emptyCounts = (): Record<AdminNotificationCategory, number> => ({
  disputes: 0,
  payments: 0,
  notes: 0,
  docs: 0,
  other: 0,
})

/**
 * Group admin notifications under each company with category counts.
 * Companies with zero notifications are omitted.
 */
export function groupAdminNotificationsByCompany(
  notifications: Notification[],
  companies: Array<{ id: string; name: string }> = []
): AdminNotificationCompanyGroup[] {
  const companyNameById = new Map(companies.map((c) => [c.id, c.name]))
  const groups = new Map<string, AdminNotificationCompanyGroup>()

  const ensureGroup = (companyId: string, companyName: string) => {
    let group = groups.get(companyId)
    if (!group) {
      group = {
        companyId,
        companyName,
        total: 0,
        unread: 0,
        counts: emptyCounts(),
        notifications: [],
        notePreviews: [],
      }
      groups.set(companyId, group)
    }
    return group
  }

  const sorted = [...notifications].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  )

  for (const notification of sorted) {
    const id = getNotificationCompanyId(notification) ?? UNASSIGNED_ID
    const name = getNotificationCompanyName(notification, companyNameById)
    const group = ensureGroup(id, name === 'General' && id === UNASSIGNED_ID ? 'General' : name)
    const category = categorizeAdminNotification(notification)

    group.notifications.push(notification)
    group.total += 1
    if (!notification.read) group.unread += 1
    group.counts[category] += 1

    if (category === 'notes') {
      const text = getNotificationNoteText(notification)
      if (text) {
        group.notePreviews.push({
          id: notification.id,
          text,
          unread: !notification.read,
          timestamp: notification.timestamp,
        })
      }
    }
  }

  return [...groups.values()].sort((a, b) => {
    // Unread companies first, then by most recent activity, then name
    if (a.unread !== b.unread) return b.unread - a.unread
    const aTs = a.notifications[0]?.timestamp ?? ''
    const bTs = b.notifications[0]?.timestamp ?? ''
    if (aTs !== bTs) return new Date(bTs).getTime() - new Date(aTs).getTime()
    return a.companyName.localeCompare(b.companyName)
  })
}

export const ADMIN_NOTIFICATION_CATEGORY_LABELS: Record<AdminNotificationCategory, string> = {
  disputes: 'Disputes',
  payments: 'Payments',
  notes: 'Notes',
  docs: 'Docs',
  other: 'Other',
}

export const ADMIN_NOTIFICATION_CATEGORY_ORDER: AdminNotificationCategory[] = [
  'disputes',
  'payments',
  'notes',
  'docs',
  'other',
]

/** Notifications that belong to one category, newest first (input should already be sorted). */
export function filterNotificationsByCategory(
  notifications: Notification[],
  category: AdminNotificationCategory
): Notification[] {
  return notifications.filter((n) => categorizeAdminNotification(n) === category)
}

/**
 * Default open section: first category with unread items, otherwise the first
 * category that has any notifications.
 */
export function pickDefaultAdminNotificationCategory(
  notifications: Notification[]
): AdminNotificationCategory | null {
  for (const category of ADMIN_NOTIFICATION_CATEGORY_ORDER) {
    if (notifications.some((n) => !n.read && categorizeAdminNotification(n) === category)) {
      return category
    }
  }
  for (const category of ADMIN_NOTIFICATION_CATEGORY_ORDER) {
    if (notifications.some((n) => categorizeAdminNotification(n) === category)) {
      return category
    }
  }
  return null
}
