import { useEffect, useMemo, useState } from 'react'
import {
  Building2,
  Check,
  ChevronDown,
  Clock,
  FileText,
  MessageSquare,
  AlertCircle,
  DollarSign,
} from 'lucide-react'
import type { Notification } from '../../types/notification'
import { formatRelativeTime } from '../../utils/format'
import { useClientTheme } from '../../theme/ThemeContext'
import {
  ADMIN_NOTIFICATION_CATEGORY_LABELS,
  categorizeAdminNotification,
  getNotificationNoteText,
  groupAdminNotificationsByCompany,
  type AdminNotificationCategory,
  type AdminNotificationCompanyGroup,
} from '../../utils/adminNotificationGroups'

type Props = {
  notifications: Notification[]
  companies: Array<{ id: string; name: string }>
  onMarkAsRead: (id: string) => void
  onActivate: (notification: Notification) => void
  isBottomNav?: boolean
}

const CATEGORY_ORDER: AdminNotificationCategory[] = [
  'disputes',
  'payments',
  'notes',
  'docs',
  'other',
]

/**
 * Admin notification list grouped under each company with scannable counts.
 */
export function AdminNotificationCompanyList({
  notifications,
  companies,
  onMarkAsRead,
  onActivate,
  isBottomNav = false,
}: Props) {
  const t = useClientTheme()
  const groups = useMemo(
    () => groupAdminNotificationsByCompany(notifications, companies),
    [notifications, companies]
  )
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Keep a sensible expanded company as notifications load/update
  useEffect(() => {
    if (groups.length === 0) {
      setExpandedId(null)
      return
    }
    setExpandedId((prev) => {
      if (prev && groups.some((g) => g.companyId === prev)) return prev
      return groups.find((g) => g.unread > 0)?.companyId ?? groups[0].companyId
    })
  }, [groups])

  if (groups.length === 0) {
    return (
      <div className="p-8 text-center">
        <Building2 className="w-12 h-12 mx-auto mb-4" style={{ color: t.mutedLight }} />
        <p className="text-sm" style={{ color: t.muted }}>
          No notifications
        </p>
      </div>
    )
  }

  return (
    <div className={`admin-notif-groups${isBottomNav ? ' admin-notif-groups--sheet' : ''}`}>
      {groups.map((group) => {
        const expanded = expandedId === group.companyId
        return (
          <CompanyGroup
            key={group.companyId}
            group={group}
            expanded={expanded}
            isBottomNav={isBottomNav}
            onToggle={() =>
              setExpandedId((prev) => (prev === group.companyId ? null : group.companyId))
            }
            onMarkAsRead={onMarkAsRead}
            onActivate={onActivate}
          />
        )
      })}
    </div>
  )
}

function CompanyGroup({
  group,
  expanded,
  isBottomNav,
  onToggle,
  onMarkAsRead,
  onActivate,
}: {
  group: AdminNotificationCompanyGroup
  expanded: boolean
  isBottomNav: boolean
  onToggle: () => void
  onMarkAsRead: (id: string) => void
  onActivate: (notification: Notification) => void
}) {
  const t = useClientTheme()
  const countChips = CATEGORY_ORDER.filter((key) => group.counts[key] > 0)

  return (
    <section
      className={`admin-notif-group${expanded ? ' is-expanded' : ''}${
        group.unread > 0 ? ' has-unread' : ''
      }`}
    >
      <button
        type="button"
        className="admin-notif-group__header"
        onClick={onToggle}
        aria-expanded={expanded}
        style={
          isBottomNav
            ? undefined
            : {
                borderColor: t.border,
                backgroundColor: group.unread > 0 ? t.surface : t.card,
              }
        }
      >
        <span className="admin-notif-group__title-row">
          <Building2 className="admin-notif-group__building" aria-hidden />
          <span className="admin-notif-group__name" style={isBottomNav ? undefined : { color: t.primary }}>
            {group.companyName}
          </span>
          <span
            className="admin-notif-group__total"
            style={isBottomNav ? undefined : { color: t.muted, backgroundColor: t.surface }}
          >
            {group.total}
          </span>
          {group.unread > 0 ? (
            <span className="admin-notif-group__unread">{group.unread} new</span>
          ) : null}
          <ChevronDown
            className={`admin-notif-group__chevron${expanded ? ' is-open' : ''}`}
            aria-hidden
          />
        </span>

        {countChips.length > 0 ? (
          <span className="admin-notif-group__counts">
            {countChips.map((key) => (
              <span
                key={key}
                className={`admin-notif-group__chip admin-notif-group__chip--${key}`}
              >
                {ADMIN_NOTIFICATION_CATEGORY_LABELS[key]} {group.counts[key]}
              </span>
            ))}
          </span>
        ) : null}
      </button>

      {expanded ? (
        <div className="admin-notif-group__body">
          {group.notePreviews.length > 0 ? (
            <div className="admin-notif-notes">
              <p className="admin-notif-notes__label">Notes</p>
              {group.notePreviews.map((note) => {
                const source = group.notifications.find((n) => n.id === note.id)
                return (
                  <button
                    key={note.id}
                    type="button"
                    className={`admin-notif-notes__card${note.unread ? ' is-unread' : ''}`}
                    onClick={() => {
                      if (source) onActivate(source)
                    }}
                  >
                    <MessageSquare className="admin-notif-notes__icon" aria-hidden />
                    <span className="admin-notif-notes__text">{note.text}</span>
                    <span className="admin-notif-notes__time">
                      {formatRelativeTime(note.timestamp)}
                    </span>
                  </button>
                )
              })}
            </div>
          ) : null}

          <div className="admin-notif-group__items">
            {group.notifications.map((notification) => (
              <NotificationRow
                key={notification.id}
                notification={notification}
                isBottomNav={isBottomNav}
                onMarkAsRead={onMarkAsRead}
                onActivate={onActivate}
              />
            ))}
          </div>
        </div>
      ) : null}
    </section>
  )
}

function NotificationRow({
  notification,
  isBottomNav,
  onMarkAsRead,
  onActivate,
}: {
  notification: Notification
  isBottomNav: boolean
  onMarkAsRead: (id: string) => void
  onActivate: (notification: Notification) => void
}) {
  const t = useClientTheme()
  const category = categorizeAdminNotification(notification)
  const noteText = category === 'notes' ? getNotificationNoteText(notification) : null
  const unread = !notification.read

  const icon =
    category === 'disputes' ? (
      <AlertCircle className="w-4 h-4" />
    ) : category === 'payments' ? (
      <DollarSign className="w-4 h-4" />
    ) : category === 'notes' ? (
      <MessageSquare className="w-4 h-4" />
    ) : (
      <FileText className="w-4 h-4" />
    )

  return (
    <div
      className={`admin-notif-item${unread ? ' is-unread' : ''}`}
      style={
        isBottomNav
          ? undefined
          : {
              borderColor: t.border,
              backgroundColor: unread ? t.surface : t.card,
            }
      }
    >
      <button
        type="button"
        className="admin-notif-item__main"
        onClick={() => onActivate(notification)}
      >
        <span
          className={`admin-notif-item__icon admin-notif-item__icon--${category}`}
          aria-hidden
        >
          {icon}
        </span>
        <span className="admin-notif-item__copy">
          <span className="admin-notif-item__title-row">
            <span
              className="admin-notif-item__title"
              style={isBottomNav ? undefined : { color: unread ? t.primary : t.muted }}
            >
              {notification.title}
            </span>
            <span className={`admin-notif-item__tag admin-notif-item__tag--${category}`}>
              {ADMIN_NOTIFICATION_CATEGORY_LABELS[category]}
            </span>
          </span>
          {noteText ? (
            <span className="admin-notif-item__note">{noteText}</span>
          ) : (
            <span
              className="admin-notif-item__msg"
              style={isBottomNav ? undefined : { color: t.muted }}
            >
              {notification.message}
            </span>
          )}
          <span className="admin-notif-item__meta" style={isBottomNav ? undefined : { color: t.muted }}>
            <Clock className="w-3 h-3" aria-hidden />
            {formatRelativeTime(notification.timestamp)}
            {notification.link_label ? (
              <span className="admin-notif-item__link">{notification.link_label} →</span>
            ) : null}
          </span>
        </span>
      </button>
      {unread ? (
        <button
          type="button"
          className="admin-notif-item__read"
          title="Mark as read"
          aria-label="Mark as read"
          onClick={(e) => {
            e.stopPropagation()
            onMarkAsRead(notification.id)
          }}
        >
          <Check className="w-3.5 h-3.5" />
        </button>
      ) : null}
    </div>
  )
}
