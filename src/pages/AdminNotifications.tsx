import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Bell,
  Building2,
  Check,
  CheckCheck,
  ExternalLink,
  Filter,
  MessageSquare,
  Search,
  Trash2,
  AlertCircle,
  DollarSign,
  FileText,
} from 'lucide-react'
import AdminLayout from '../components/AdminLayout'
import {
  dismissAdminNotification,
  dismissAdminNotificationsForClient,
  getAdminNotifications,
  markAdminNotificationRead,
  markAdminNotificationsReadForClient,
  markAllAdminNotificationsRead,
  subscribeAdminNotifications,
} from '../services/adminNotificationService'
import { getAllClients } from '../services/clientRegistry'
import { useClientTheme } from '../theme/ThemeContext'
import { formatRelativeTime } from '../utils/format'
import {
  ADMIN_NOTIFICATION_CATEGORY_LABELS,
  categorizeAdminNotification,
  getNotificationNoteText,
  groupAdminNotificationsByCompany,
  type AdminNotificationCategory,
} from '../utils/adminNotificationGroups'
import type { Notification } from '../types/notification'
import '../styles/adminNotifications.css'

type CategoryFilter = 'all' | AdminNotificationCategory
type ReadFilter = 'all' | 'unread' | 'read'

const CATEGORY_FILTERS: Array<{ id: CategoryFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'disputes', label: 'Disputes' },
  { id: 'payments', label: 'Payments' },
  { id: 'notes', label: 'Notes' },
  { id: 'docs', label: 'Docs' },
  { id: 'other', label: 'Other' },
]

/**
 * Full-page admin inbox: browse and manage client notifications by company.
 */
export default function AdminNotifications() {
  const t = useClientTheme()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [notifications, setNotifications] = useState<Notification[]>(() => getAdminNotifications())
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all')
  const [readFilter, setReadFilter] = useState<ReadFilter>('all')

  const companies = useMemo(
    () =>
      getAllClients()
        .map((c) => ({ id: c.id, name: c.name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [notifications]
  )

  const groups = useMemo(
    () => groupAdminNotificationsByCompany(notifications, companies),
    [notifications, companies]
  )

  const selectedCompanyId = searchParams.get('company') || groups[0]?.companyId || ''

  useEffect(() => {
    return subscribeAdminNotifications(() => {
      setNotifications(getAdminNotifications())
    })
  }, [])

  // Keep selection valid when the list changes
  useEffect(() => {
    if (groups.length === 0) return
    if (groups.some((g) => g.companyId === selectedCompanyId)) return
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.set('company', groups[0].companyId)
        return next
      },
      { replace: true }
    )
  }, [groups, selectedCompanyId, setSearchParams])

  const selectedGroup = groups.find((g) => g.companyId === selectedCompanyId) ?? null

  const filteredItems = useMemo(() => {
    if (!selectedGroup) return []
    const q = search.trim().toLowerCase()
    return selectedGroup.notifications.filter((n) => {
      if (readFilter === 'unread' && n.read) return false
      if (readFilter === 'read' && !n.read) return false
      if (categoryFilter !== 'all' && categorizeAdminNotification(n) !== categoryFilter) {
        return false
      }
      if (!q) return true
      const haystack = [
        n.title,
        n.message,
        getNotificationNoteText(n) ?? '',
        n.invoice_number ?? '',
      ]
        .join(' ')
        .toLowerCase()
      return haystack.includes(q)
    })
  }, [selectedGroup, search, categoryFilter, readFilter])

  const totals = useMemo(() => {
    const unread = notifications.filter((n) => !n.read).length
    const notes = notifications.filter((n) => categorizeAdminNotification(n) === 'notes').length
    const disputes = notifications.filter((n) => categorizeAdminNotification(n) === 'disputes').length
    return {
      companies: groups.length,
      total: notifications.length,
      unread,
      notes,
      disputes,
    }
  }, [notifications, groups.length])

  const selectCompany = (companyId: string) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.set('company', companyId)
        return next
      },
      { replace: true }
    )
  }

  const openNotification = (notification: Notification) => {
    if (!notification.read) markAdminNotificationRead(notification.id)
    if (notification.link) navigate(notification.link)
  }

  return (
    <AdminLayout flushMain>
      <div className="admin-notif-page" style={{ backgroundColor: t.surface }}>
        <header className="admin-notif-page__top" style={{ borderColor: t.border, backgroundColor: t.card }}>
          <div className="admin-notif-page__heading">
            <div className="admin-notif-page__title-row">
              <Bell className="admin-notif-page__title-icon" style={{ color: t.accent }} />
              <div>
                <h1 style={{ color: t.primary }}>Client notifications</h1>
                <p style={{ color: t.muted }}>
                  Review disputes, posted payments, and notes by company
                </p>
              </div>
            </div>
            <div className="admin-notif-page__actions">
              {totals.unread > 0 ? (
                <button
                  type="button"
                  className="admin-notif-page__btn"
                  style={{ borderColor: t.border, color: t.primary }}
                  onClick={() => markAllAdminNotificationsRead()}
                >
                  <CheckCheck className="w-4 h-4" />
                  Mark all read
                </button>
              ) : null}
            </div>
          </div>

          <div className="admin-notif-page__stats">
            <StatCard label="Companies" value={totals.companies} color={t.primary} muted={t.muted} card={t.surface} />
            <StatCard label="Total" value={totals.total} color={t.primary} muted={t.muted} card={t.surface} />
            <StatCard label="Unread" value={totals.unread} color="#1684FE" muted={t.muted} card={t.surface} />
            <StatCard label="Disputes" value={totals.disputes} color="#EF4444" muted={t.muted} card={t.surface} />
            <StatCard label="Notes" value={totals.notes} color="#1684FE" muted={t.muted} card={t.surface} />
          </div>
        </header>

        <div className="admin-notif-page__body">
          <aside className="admin-notif-page__sidebar" style={{ borderColor: t.border, backgroundColor: t.card }}>
            <div className="admin-notif-page__sidebar-head" style={{ borderColor: t.border }}>
              <Building2 className="w-4 h-4" style={{ color: t.accent }} />
              <span style={{ color: t.primary }}>Companies</span>
            </div>
            <div className="admin-notif-page__company-list">
              {groups.length === 0 ? (
                <p className="admin-notif-page__empty" style={{ color: t.muted }}>
                  No notifications yet
                </p>
              ) : (
                groups.map((group) => {
                  const active = group.companyId === selectedCompanyId
                  return (
                    <button
                      key={group.companyId}
                      type="button"
                      className={`admin-notif-page__company${active ? ' is-active' : ''}${
                        group.unread > 0 ? ' has-unread' : ''
                      }`}
                      style={{
                        borderColor: active ? 'rgba(22, 132, 254, 0.35)' : t.border,
                        backgroundColor: active ? 'rgba(22, 132, 254, 0.08)' : t.surface,
                      }}
                      onClick={() => selectCompany(group.companyId)}
                    >
                      <span className="admin-notif-page__company-top">
                        <span className="admin-notif-page__company-name" style={{ color: t.primary }}>
                          {group.companyName}
                        </span>
                        <span className="admin-notif-page__company-total" style={{ color: t.muted }}>
                          {group.total}
                        </span>
                      </span>
                      <span className="admin-notif-page__company-chips">
                        {group.counts.disputes > 0 ? (
                          <span className="admin-notif-page__chip admin-notif-page__chip--disputes">
                            Disputes {group.counts.disputes}
                          </span>
                        ) : null}
                        {group.counts.payments > 0 ? (
                          <span className="admin-notif-page__chip admin-notif-page__chip--payments">
                            Payments {group.counts.payments}
                          </span>
                        ) : null}
                        {group.counts.notes > 0 ? (
                          <span className="admin-notif-page__chip admin-notif-page__chip--notes">
                            Notes {group.counts.notes}
                          </span>
                        ) : null}
                        {group.counts.docs > 0 ? (
                          <span className="admin-notif-page__chip admin-notif-page__chip--docs">
                            Docs {group.counts.docs}
                          </span>
                        ) : null}
                      </span>
                      {group.unread > 0 ? (
                        <span className="admin-notif-page__company-unread">{group.unread} new</span>
                      ) : null}
                    </button>
                  )
                })
              )}
            </div>
          </aside>

          <section className="admin-notif-page__main" style={{ backgroundColor: t.card, borderColor: t.border }}>
            {!selectedGroup ? (
              <div className="admin-notif-page__blank" style={{ color: t.muted }}>
                <Bell className="w-10 h-10 mb-3 opacity-40" />
                Select a company to manage its notifications
              </div>
            ) : (
              <>
                <div className="admin-notif-page__main-head" style={{ borderColor: t.border }}>
                  <div>
                    <h2 style={{ color: t.primary }}>{selectedGroup.companyName}</h2>
                    <p style={{ color: t.muted }}>
                      {selectedGroup.total} notification{selectedGroup.total === 1 ? '' : 's'}
                      {selectedGroup.unread > 0 ? ` · ${selectedGroup.unread} unread` : ''}
                    </p>
                  </div>
                  <div className="admin-notif-page__main-actions">
                    {selectedGroup.unread > 0 && selectedGroup.companyId !== '__unassigned__' ? (
                      <button
                        type="button"
                        className="admin-notif-page__btn"
                        style={{ borderColor: t.border, color: t.primary }}
                        onClick={() => markAdminNotificationsReadForClient(selectedGroup.companyId)}
                      >
                        <Check className="w-4 h-4" />
                        Mark company read
                      </button>
                    ) : null}
                    {selectedGroup.companyId !== '__unassigned__' ? (
                      <button
                        type="button"
                        className="admin-notif-page__btn admin-notif-page__btn--danger"
                        onClick={() => {
                          if (
                            window.confirm(
                              `Dismiss all notifications for ${selectedGroup.companyName}?`
                            )
                          ) {
                            dismissAdminNotificationsForClient(selectedGroup.companyId)
                          }
                        }}
                      >
                        <Trash2 className="w-4 h-4" />
                        Clear company
                      </button>
                    ) : null}
                  </div>
                </div>

                {selectedGroup.notePreviews.length > 0 ? (
                  <div className="admin-notif-page__notes-rail">
                    <p className="admin-notif-page__notes-label">
                      <MessageSquare className="w-3.5 h-3.5" />
                      Notes — easy to scan
                    </p>
                    <div className="admin-notif-page__notes-grid">
                      {selectedGroup.notePreviews.map((note) => {
                        const source = selectedGroup.notifications.find((n) => n.id === note.id)
                        return (
                          <button
                            key={note.id}
                            type="button"
                            className={`admin-notif-page__note-card${note.unread ? ' is-unread' : ''}`}
                            onClick={() => source && openNotification(source)}
                          >
                            <span className="admin-notif-page__note-text">{note.text}</span>
                            <span className="admin-notif-page__note-time">
                              {formatRelativeTime(note.timestamp)}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ) : null}

                <div className="admin-notif-page__toolbar" style={{ borderColor: t.border }}>
                  <label className="admin-notif-page__search">
                    <Search className="w-4 h-4" style={{ color: t.muted }} />
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search title, note, invoice…"
                      style={{ color: t.primary }}
                    />
                  </label>
                  <div className="admin-notif-page__filters">
                    <Filter className="w-3.5 h-3.5" style={{ color: t.muted }} />
                    {CATEGORY_FILTERS.map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        className={`admin-notif-page__filter${categoryFilter === f.id ? ' is-active' : ''}`}
                        onClick={() => setCategoryFilter(f.id)}
                      >
                        {f.label}
                      </button>
                    ))}
                    <select
                      className="admin-notif-page__read-select"
                      value={readFilter}
                      onChange={(e) => setReadFilter(e.target.value as ReadFilter)}
                      aria-label="Filter by read state"
                      style={{ color: t.primary, borderColor: t.border, backgroundColor: t.surface }}
                    >
                      <option value="all">All states</option>
                      <option value="unread">Unread</option>
                      <option value="read">Read</option>
                    </select>
                  </div>
                </div>

                <div className="admin-notif-page__items">
                  {filteredItems.length === 0 ? (
                    <p className="admin-notif-page__empty" style={{ color: t.muted }}>
                      No notifications match these filters
                    </p>
                  ) : (
                    filteredItems.map((notification) => (
                      <NotificationManageRow
                        key={notification.id}
                        notification={notification}
                        onOpen={() => openNotification(notification)}
                        onMarkRead={() => markAdminNotificationRead(notification.id)}
                        onDismiss={() => dismissAdminNotification(notification.id)}
                      />
                    ))
                  )}
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </AdminLayout>
  )
}

function StatCard({
  label,
  value,
  color,
  muted,
  card,
}: {
  label: string
  value: number
  color: string
  muted: string
  card: string
}) {
  return (
    <div className="admin-notif-page__stat" style={{ backgroundColor: card }}>
      <span style={{ color: muted }}>{label}</span>
      <strong style={{ color }}>{value}</strong>
    </div>
  )
}

function NotificationManageRow({
  notification,
  onOpen,
  onMarkRead,
  onDismiss,
}: {
  notification: Notification
  onOpen: () => void
  onMarkRead: () => void
  onDismiss: () => void
}) {
  const t = useClientTheme()
  const category = categorizeAdminNotification(notification)
  const noteText = category === 'notes' ? getNotificationNoteText(notification) : null
  const unread = !notification.read

  const Icon =
    category === 'disputes'
      ? AlertCircle
      : category === 'payments'
        ? DollarSign
        : category === 'notes'
          ? MessageSquare
          : FileText

  return (
    <article
      className={`admin-notif-page__item${unread ? ' is-unread' : ''}`}
      style={{ borderColor: t.border, backgroundColor: unread ? t.surface : 'transparent' }}
    >
      <div className={`admin-notif-page__item-icon admin-notif-page__item-icon--${category}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="admin-notif-page__item-body">
        <div className="admin-notif-page__item-top">
          <h3 style={{ color: unread ? t.primary : t.muted }}>{notification.title}</h3>
          <span className={`admin-notif-page__chip admin-notif-page__chip--${category}`}>
            {ADMIN_NOTIFICATION_CATEGORY_LABELS[category]}
          </span>
        </div>
        {noteText ? (
          <p className="admin-notif-page__item-note">{noteText}</p>
        ) : (
          <p style={{ color: t.muted }}>{notification.message}</p>
        )}
        <div className="admin-notif-page__item-meta" style={{ color: t.muted }}>
          <span>{formatRelativeTime(notification.timestamp)}</span>
          {notification.invoice_number ? <span>INV {notification.invoice_number}</span> : null}
        </div>
      </div>
      <div className="admin-notif-page__item-actions">
        {notification.link ? (
          <button
            type="button"
            className="admin-notif-page__icon-btn"
            title={notification.link_label || 'Open'}
            onClick={onOpen}
            style={{ borderColor: t.border, color: t.accent }}
          >
            <ExternalLink className="w-4 h-4" />
          </button>
        ) : null}
        {unread ? (
          <button
            type="button"
            className="admin-notif-page__icon-btn"
            title="Mark as read"
            onClick={onMarkRead}
            style={{ borderColor: t.border, color: t.primary }}
          >
            <Check className="w-4 h-4" />
          </button>
        ) : null}
        <button
          type="button"
          className="admin-notif-page__icon-btn admin-notif-page__icon-btn--danger"
          title="Dismiss"
          onClick={onDismiss}
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </article>
  )
}
