import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Bell,
  Building2,
  Check,
  CheckCheck,
  ChevronDown,
  ExternalLink,
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
  ADMIN_NOTIFICATION_CATEGORY_ORDER,
  categorizeAdminNotification,
  filterNotificationsByCategory,
  getNotificationNoteText,
  groupAdminNotificationsByCompany,
  pickDefaultAdminNotificationCategory,
  type AdminNotificationCategory,
} from '../utils/adminNotificationGroups'
import type { Notification } from '../types/notification'
import { AdminNotificationSectionIcon } from '../components/admin/AdminNotificationSectionIcon'
import '../styles/adminNotifications.css'

type ReadFilter = 'all' | 'unread' | 'read'

const SECTION_PARAM_IDS = new Set<string>(ADMIN_NOTIFICATION_CATEGORY_ORDER)

/**
 * Full-page admin inbox: browse and manage client notifications by company.
 */
export default function AdminNotifications() {
  const t = useClientTheme()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [notifications, setNotifications] = useState<Notification[]>(() => getAdminNotifications())
  const [search, setSearch] = useState('')
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
  const sectionParam = searchParams.get('section')
  const selectedSection: AdminNotificationCategory | null =
    sectionParam && SECTION_PARAM_IDS.has(sectionParam)
      ? (sectionParam as AdminNotificationCategory)
      : null

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
  }, [selectedGroup, search, readFilter])

  const visibleSections = useMemo(
    () =>
      ADMIN_NOTIFICATION_CATEGORY_ORDER.filter(
        (category) => filterNotificationsByCategory(filteredItems, category).length > 0
      ),
    [filteredItems]
  )

  const lastCompanyRef = useRef(selectedCompanyId)

  // Open a default section when switching companies, or when the current one is empty
  useEffect(() => {
    if (!selectedGroup) return
    const companyChanged = lastCompanyRef.current !== selectedGroup.companyId
    lastCompanyRef.current = selectedGroup.companyId

    if (selectedSection && visibleSections.includes(selectedSection)) return
    if (!companyChanged && !selectedSection) return

    const fallback =
      pickDefaultAdminNotificationCategory(filteredItems) ?? visibleSections[0] ?? null
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (fallback) next.set('section', fallback)
        else next.delete('section')
        return next
      },
      { replace: true }
    )
  }, [selectedGroup, filteredItems, visibleSections, selectedSection, setSearchParams])

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

  const selectCompany = (companyId: string, section?: AdminNotificationCategory) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.set('company', companyId)
        if (section) next.set('section', section)
        else next.delete('section')
        return next
      },
      { replace: true }
    )
  }

  const toggleSection = (category: AdminNotificationCategory) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (selectedSection === category) next.delete('section')
        else next.set('section', category)
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
                    <div
                      key={group.companyId}
                      className={`admin-notif-page__company${active ? ' is-active' : ''}${
                        group.unread > 0 ? ' has-unread' : ''
                      }`}
                      style={{
                        borderColor: active ? 'rgba(22, 132, 254, 0.35)' : t.border,
                        backgroundColor: active ? 'rgba(22, 132, 254, 0.08)' : t.surface,
                      }}
                    >
                      <button
                        type="button"
                        className="admin-notif-page__company-main"
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
                      </button>
                      <span className="admin-notif-page__company-chips">
                        {ADMIN_NOTIFICATION_CATEGORY_ORDER.filter(
                          (key) => group.counts[key] > 0
                        ).map((key) => (
                          <button
                            key={key}
                            type="button"
                            className={`admin-notif-page__chip admin-notif-page__chip--${key}${
                              active && selectedSection === key ? ' is-active' : ''
                            }`}
                            onClick={() => selectCompany(group.companyId, key)}
                          >
                            <AdminNotificationSectionIcon category={key} size="sm" />
                            {ADMIN_NOTIFICATION_CATEGORY_LABELS[key]} {group.counts[key]}
                          </button>
                        ))}
                      </span>
                      {group.unread > 0 ? (
                        <span className="admin-notif-page__company-unread">{group.unread} new</span>
                      ) : null}
                    </div>
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
                    <div className="admin-notif-page__sections">
                      {visibleSections.map((category) => {
                        const items = filterNotificationsByCategory(filteredItems, category)
                        const unread = items.filter((n) => !n.read).length
                        const open = selectedSection === category
                        const notePreviews =
                          category === 'notes'
                            ? selectedGroup.notePreviews.filter((note) =>
                                items.some((n) => n.id === note.id)
                              )
                            : []

                        return (
                          <section
                            key={category}
                            className={`admin-notif-page__section${open ? ' is-open' : ''}`}
                            style={{ borderColor: t.border }}
                          >
                            <button
                              type="button"
                              className="admin-notif-page__section-header"
                              aria-expanded={open}
                              onClick={() => toggleSection(category)}
                              style={{ backgroundColor: open ? t.surface : 'transparent' }}
                            >
                              <AdminNotificationSectionIcon category={category} />
                              <span style={{ color: t.primary }}>
                                {ADMIN_NOTIFICATION_CATEGORY_LABELS[category]}
                              </span>
                              <span className="admin-notif-page__section-count" style={{ color: t.muted }}>
                                {items.length}
                              </span>
                              {unread > 0 ? (
                                <span className="admin-notif-page__company-unread admin-notif-page__section-unread">
                                  {unread} new
                                </span>
                              ) : null}
                              <ChevronDown
                                className={`admin-notif-page__section-chevron${open ? ' is-open' : ''}`}
                                style={{ color: t.muted }}
                                aria-hidden
                              />
                            </button>

                            {open ? (
                              <div className="admin-notif-page__section-body">
                                {category === 'notes' && notePreviews.length > 0 ? (
                                  <div className="admin-notif-page__notes-grid">
                                    {notePreviews.map((note) => {
                                      const source = selectedGroup.notifications.find(
                                        (n) => n.id === note.id
                                      )
                                      return (
                                        <button
                                          key={note.id}
                                          type="button"
                                          className={`admin-notif-page__note-card${
                                            note.unread ? ' is-unread' : ''
                                          }`}
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
                                ) : (
                                  items.map((notification) => (
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
                            ) : null}
                          </section>
                        )
                      })}
                    </div>
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
        <Icon className="w-3.5 h-3.5" />
      </div>
      <div className="admin-notif-page__item-body">
        <div className="admin-notif-page__item-top">
          <h3 style={{ color: unread ? t.primary : t.muted }}>{notification.title}</h3>
          <span className="admin-notif-page__item-meta" style={{ color: t.muted }}>
            {formatRelativeTime(notification.timestamp)}
            {notification.invoice_number ? ` · INV ${notification.invoice_number}` : ''}
          </span>
        </div>
        {noteText ? (
          <p className="admin-notif-page__item-note">{noteText}</p>
        ) : (
          <p className="admin-notif-page__item-msg" style={{ color: t.muted }}>
            {notification.message}
          </p>
        )}
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
            <ExternalLink className="w-3.5 h-3.5" />
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
            <Check className="w-3.5 h-3.5" />
          </button>
        ) : null}
        <button
          type="button"
          className="admin-notif-page__icon-btn admin-notif-page__icon-btn--danger"
          title="Dismiss"
          onClick={onDismiss}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </article>
  )
}
