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
  ADMIN_NOTIFICATION_CATEGORY_ORDER,
  categorizeAdminNotification,
  filterNotificationsByCategory,
  getNotificationNoteText,
  groupAdminNotificationsByCompany,
  pickDefaultAdminNotificationCategory,
  type AdminNotificationCategory,
  type AdminNotificationCompanyGroup,
} from '../../utils/adminNotificationGroups'
import { AdminNotificationSectionIcon } from './AdminNotificationSectionIcon'

type Props = {
  notifications: Notification[]
  companies: Array<{ id: string; name: string }>
  onMarkAsRead: (id: string) => void
  onActivate: (notification: Notification) => void
  isBottomNav?: boolean
}

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
  const [expandedSectionByCompany, setExpandedSectionByCompany] = useState<
    Record<string, AdminNotificationCategory | null>
  >({})

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

  useEffect(() => {
    setExpandedSectionByCompany((prev) => {
      const next = { ...prev }
      let changed = false
      for (const group of groups) {
        const current = next[group.companyId]
        const stillValid =
          current &&
          group.notifications.some((n) => categorizeAdminNotification(n) === current)
        if (stillValid) continue
        next[group.companyId] = pickDefaultAdminNotificationCategory(group.notifications)
        changed = true
      }
      return changed ? next : prev
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
            expandedSection={expandedSectionByCompany[group.companyId] ?? null}
            isBottomNav={isBottomNav}
            onToggle={() =>
              setExpandedId((prev) => (prev === group.companyId ? null : group.companyId))
            }
            onSelectSection={(category) => {
              setExpandedId(group.companyId)
              setExpandedSectionByCompany((prev) => ({
                ...prev,
                [group.companyId]: prev[group.companyId] === category ? null : category,
              }))
            }}
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
  expandedSection,
  isBottomNav,
  onToggle,
  onSelectSection,
  onMarkAsRead,
  onActivate,
}: {
  group: AdminNotificationCompanyGroup
  expanded: boolean
  expandedSection: AdminNotificationCategory | null
  isBottomNav: boolean
  onToggle: () => void
  onSelectSection: (category: AdminNotificationCategory) => void
  onMarkAsRead: (id: string) => void
  onActivate: (notification: Notification) => void
}) {
  const t = useClientTheme()
  const sections = ADMIN_NOTIFICATION_CATEGORY_ORDER.filter((key) => group.counts[key] > 0)

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

        {sections.length > 0 ? (
          <span className="admin-notif-group__counts">
            {sections.map((key) => (
              <span
                key={key}
                className={`admin-notif-group__chip admin-notif-group__chip--${key}${
                  expanded && expandedSection === key ? ' is-active' : ''
                }`}
              >
                <AdminNotificationSectionIcon category={key} size="sm" />
                {ADMIN_NOTIFICATION_CATEGORY_LABELS[key]} {group.counts[key]}
              </span>
            ))}
          </span>
        ) : null}
      </button>

      {expanded ? (
        <div className="admin-notif-group__body">
          <div className="admin-notif-sections">
            {sections.map((category) => {
              const items = filterNotificationsByCategory(group.notifications, category)
              const unread = items.filter((n) => !n.read).length
              const open = expandedSection === category

              return (
                <section
                  key={category}
                  className={`admin-notif-section${open ? ' is-open' : ''}`}
                >
                  <button
                    type="button"
                    className="admin-notif-section__header"
                    aria-expanded={open}
                    onClick={() => onSelectSection(category)}
                  >
                    <AdminNotificationSectionIcon category={category} />
                    <span className="admin-notif-section__label">
                      {ADMIN_NOTIFICATION_CATEGORY_LABELS[category]}
                    </span>
                    <span className="admin-notif-section__count">{items.length}</span>
                    {unread > 0 ? (
                      <span className="admin-notif-section__unread">{unread} new</span>
                    ) : null}
                    <ChevronDown
                      className={`admin-notif-section__chevron${open ? ' is-open' : ''}`}
                      aria-hidden
                    />
                  </button>

                  {open ? (
                    <div className="admin-notif-section__body">
                      {category === 'notes' && group.notePreviews.length > 0 ? (
                        <div className="admin-notif-notes">
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
                      ) : (
                        <div className="admin-notif-group__items">
                          {items.map((notification) => (
                            <NotificationRow
                              key={notification.id}
                              notification={notification}
                              isBottomNav={isBottomNav}
                              onMarkAsRead={onMarkAsRead}
                              onActivate={onActivate}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  ) : null}
                </section>
              )
            })}
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
      <AlertCircle className="w-3.5 h-3.5" />
    ) : category === 'payments' ? (
      <DollarSign className="w-3.5 h-3.5" />
    ) : category === 'notes' ? (
      <MessageSquare className="w-3.5 h-3.5" />
    ) : (
      <FileText className="w-3.5 h-3.5" />
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
            <span className="admin-notif-item__meta" style={isBottomNav ? undefined : { color: t.muted }}>
              <Clock className="w-3 h-3" aria-hidden />
              {formatRelativeTime(notification.timestamp)}
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
