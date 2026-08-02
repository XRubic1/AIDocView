import { useState, useEffect, useRef, useId } from 'react'
import { createPortal } from 'react-dom'
import { Bell, X, Check, FileText, DollarSign, AlertCircle, Clock, MessageSquare } from 'lucide-react'
import { Notification } from '../types/notification'
import { formatRelativeTime } from '../utils/format'
import { useClientTheme } from '../theme/ThemeContext'

interface NotificationBellProps {
  notifications: Notification[]
  onMarkAsRead: (id: string) => void
  onMarkAllAsRead: () => void
  onNotificationClick: (notification: Notification) => void
  /** `bottom-nav` opens a bottom sheet (~80vh) with blurred backdrop. */
  variant?: 'default' | 'bottom-nav'
}

export default function NotificationBell({
  notifications,
  onMarkAsRead,
  onMarkAllAsRead,
  onNotificationClick,
  variant = 'default',
}: NotificationBellProps) {
  const t = useClientTheme()
  const [isOpen, setIsOpen] = useState(false)
  const [sheetVisible, setSheetVisible] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const sheetRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const isBottomNav = variant === 'bottom-nav'

  const unreadCount = notifications.filter((n) => !n.read).length

  /** Desktop: click-outside closes. Mobile sheet uses backdrop instead. */
  useEffect(() => {
    if (!isOpen || isBottomNav) return

    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen, isBottomNav])

  /** Animate sheet in after mount; animate out before unmount. */
  useEffect(() => {
    if (!isBottomNav) return

    if (isOpen) {
      const frame = window.requestAnimationFrame(() => setSheetVisible(true))
      const prevOverflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => {
        window.cancelAnimationFrame(frame)
        document.body.style.overflow = prevOverflow
      }
    }

    setSheetVisible(false)
    return undefined
  }, [isOpen, isBottomNav])

  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (isBottomNav) {
        setSheetVisible(false)
        window.setTimeout(() => setIsOpen(false), 280)
      } else {
        setIsOpen(false)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [isOpen, isBottomNav])

  const closeSheet = () => {
    if (!isBottomNav) {
      setIsOpen(false)
      return
    }
    setSheetVisible(false)
    window.setTimeout(() => setIsOpen(false), 280)
  }

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'invoice_approved':
      case 'invoice_on_hold':
      case 'invoice_rejected':
        return <FileText className="w-4 h-4" />
      case 'invoice_note':
        return <MessageSquare className="w-4 h-4" />
      case 'payment_received':
      case 'payment_pending':
        return <DollarSign className="w-4 h-4" />
      case 'overdue_alert':
        return <AlertCircle className="w-4 h-4" />
      case 'batch_submitted':
      case 'batch_reviewed':
        return <FileText className="w-4 h-4" />
      case 'document_uploaded':
        return <FileText className="w-4 h-4" />
      default:
        return <Bell className="w-4 h-4" />
    }
  }

  const getNotificationColor = (type: string) => {
    switch (type) {
      case 'invoice_approved':
      case 'payment_received':
      case 'batch_reviewed':
        return t.success
      case 'payment_pending':
      case 'invoice_note':
        return t.warning
      case 'invoice_on_hold':
      case 'invoice_rejected':
      case 'overdue_alert':
        return t.error
      default:
        return t.muted
    }
  }

  const sortedNotifications = [...notifications].sort((a, b) => {
    return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  })

  const unreadNotifications = sortedNotifications.filter((n) => !n.read)
  const readNotifications = sortedNotifications.filter((n) => n.read)

  const handleNotificationActivate = (notification: Notification) => {
    if (!notification.read) onMarkAsRead(notification.id)
    if (notification.link) onNotificationClick(notification)
    closeSheet()
  }

  const panelBody = (
    <>
      <div
        className={`notification-panel__header${isBottomNav ? ' notification-sheet__header' : ''}`}
        style={isBottomNav ? undefined : { borderColor: t.border }}
      >
        {isBottomNav ? <div className="notification-sheet__handle" aria-hidden /> : null}
        <div className="notification-panel__header-row">
          <div className="notification-panel__title-wrap min-w-0">
            {!isBottomNav ? (
              <Bell className="w-5 h-5 shrink-0" style={{ color: t.primary }} />
            ) : null}
            <h3
              id={titleId}
              className={isBottomNav ? 'notification-sheet__title' : 'text-lg font-semibold truncate'}
              style={isBottomNav ? undefined : { color: t.primary }}
            >
              Notifications
            </h3>
            {unreadCount > 0 ? (
              <span
                className={
                  isBottomNav
                    ? 'notification-sheet__count'
                    : 'px-2 py-0.5 text-xs font-medium rounded-full shrink-0'
                }
                style={
                  isBottomNav
                    ? undefined
                    : { backgroundColor: t.accent, color: '#FFFFFF' }
                }
              >
                {unreadCount} new
              </span>
            ) : null}
          </div>
          <div className="notification-panel__header-actions shrink-0">
            {unreadCount > 0 && !isBottomNav ? (
              <button
                type="button"
                onClick={() => {
                  onMarkAllAsRead()
                  closeSheet()
                }}
                className="text-xs px-2 py-1 rounded transition-colors"
                style={{
                  color: t.primary,
                  border: `1px solid ${t.border}`,
                }}
              >
                Mark all read
              </button>
            ) : null}
            {unreadCount > 0 && isBottomNav ? (
              <button
                type="button"
                className="notification-sheet__mark-all"
                onClick={() => {
                  onMarkAllAsRead()
                }}
              >
                Mark all read
              </button>
            ) : null}
            <button
              type="button"
              onClick={closeSheet}
              className={
                isBottomNav
                  ? 'notification-sheet__close'
                  : 'p-1 rounded transition-colors'
              }
              style={isBottomNav ? undefined : { color: t.primary }}
              aria-label="Close notifications"
            >
              <X
                className={isBottomNav ? 'notification-sheet__close-icon' : 'w-4 h-4'}
                strokeWidth={isBottomNav ? 2.5 : 2}
              />
            </button>
          </div>
        </div>
      </div>

      <div className={`notification-panel__list overflow-y-auto flex-1 min-h-0${isBottomNav ? ' notification-sheet__list' : ''}`}>
        {notifications.length === 0 ? (
          <div className="p-8 text-center">
            <Bell className="w-12 h-12 mx-auto mb-4" style={{ color: t.mutedLight }} />
            <p className="text-sm" style={{ color: t.muted }}>
              No notifications
            </p>
          </div>
        ) : isBottomNav ? (
          <div className="notification-sheet__items">
            {[...unreadNotifications, ...readNotifications].map((notification) => {
              const unread = !notification.read
              return (
                <div
                  key={notification.id}
                  className={`notification-sheet__item${unread ? ' is-unread' : ''}`}
                >
                  <button
                    type="button"
                    className="notification-sheet__item-main"
                    onClick={() => handleNotificationActivate(notification)}
                  >
                    <span
                      className="notification-sheet__item-icon"
                      style={{
                        backgroundColor: getNotificationColor(notification.type) + '20',
                        color: getNotificationColor(notification.type),
                      }}
                      aria-hidden
                    >
                      {getNotificationIcon(notification.type)}
                    </span>
                    <span className="notification-sheet__item-copy">
                      <span className="notification-sheet__item-title">
                        {notification.title}
                      </span>
                      <span className="notification-sheet__item-msg">
                        {notification.message}
                      </span>
                      <span className="notification-sheet__item-meta">
                        <Clock className="w-3.5 h-3.5" aria-hidden />
                        {formatRelativeTime(notification.timestamp)}
                        {notification.link_label ? (
                          <span className="notification-sheet__item-link">
                            {notification.link_label}
                          </span>
                        ) : null}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    className="notification-sheet__dismiss"
                    aria-label="Dismiss notification"
                    title="Dismiss"
                    onClick={(e) => {
                      e.stopPropagation()
                      if (unread) onMarkAsRead(notification.id)
                    }}
                  >
                    <X className="notification-sheet__dismiss-icon" strokeWidth={2.5} aria-hidden />
                  </button>
                </div>
              )
            })}
          </div>
        ) : (
          <>
            {unreadNotifications.length > 0 && (
              <div>
                {unreadNotifications.map((notification) => (
                  <div
                    key={notification.id}
                    className="p-4 border-b cursor-pointer transition-colors"
                    style={{
                      borderColor: t.border,
                      backgroundColor: t.surface,
                    }}
                    onClick={() => handleNotificationActivate(notification)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        handleNotificationActivate(notification)
                      }
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <div className="flex items-start space-x-3">
                      <div
                        className="flex-shrink-0 p-2 rounded-full"
                        style={{
                          backgroundColor: getNotificationColor(notification.type) + '20',
                          color: getNotificationColor(notification.type),
                        }}
                      >
                        {getNotificationIcon(notification.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between">
                          <p className="text-sm font-medium" style={{ color: t.primary }}>
                            {notification.title}
                          </p>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              onMarkAsRead(notification.id)
                            }}
                            className="ml-2 p-1 rounded transition-colors"
                            style={{ color: t.muted }}
                            title="Mark as read"
                          >
                            <Check className="w-3 h-3" />
                          </button>
                        </div>
                        <p className="text-sm mt-1" style={{ color: t.muted }}>
                          {notification.message}
                        </p>
                        <div className="flex items-center justify-between mt-2">
                          <div
                            className="flex items-center space-x-1 text-xs"
                            style={{ color: t.muted }}
                          >
                            <Clock className="w-3 h-3" />
                            <span>{formatRelativeTime(notification.timestamp)}</span>
                          </div>
                          {notification.link_label && (
                            <span className="text-xs font-medium" style={{ color: t.accent }}>
                              {notification.link_label} →
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {readNotifications.length > 0 && (
              <div>
                {unreadNotifications.length > 0 && (
                  <div
                    className="px-4 py-2 text-xs font-medium"
                    style={{ color: t.muted, backgroundColor: t.surface }}
                  >
                    Older
                  </div>
                )}
                {readNotifications.map((notification) => (
                  <div
                    key={notification.id}
                    className="p-4 border-b cursor-pointer transition-colors"
                    style={{
                      borderColor: t.border,
                      backgroundColor: t.card,
                    }}
                    onClick={() => {
                      if (notification.link) onNotificationClick(notification)
                      closeSheet()
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        if (notification.link) onNotificationClick(notification)
                        closeSheet()
                      }
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <div className="flex items-start space-x-3">
                      <div
                        className="flex-shrink-0 p-2 rounded-full opacity-60"
                        style={{
                          backgroundColor: getNotificationColor(notification.type) + '20',
                          color: getNotificationColor(notification.type),
                        }}
                      >
                        {getNotificationIcon(notification.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium" style={{ color: t.muted }}>
                          {notification.title}
                        </p>
                        <p className="text-sm mt-1" style={{ color: t.muted }}>
                          {notification.message}
                        </p>
                        <div className="flex items-center justify-between mt-2">
                          <div
                            className="flex items-center space-x-1 text-xs"
                            style={{ color: t.muted }}
                          >
                            <Clock className="w-3 h-3" />
                            <span>{formatRelativeTime(notification.timestamp)}</span>
                          </div>
                          {notification.link_label && (
                            <span className="text-xs font-medium" style={{ color: t.accent }}>
                              {notification.link_label} →
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {notifications.length > 0 && !isBottomNav && (
        <div className="p-3 border-t text-center shrink-0" style={{ borderColor: t.border }}>
          <button
            type="button"
            className="text-sm font-medium transition-colors"
            style={{ color: t.primary }}
          >
            View All Notifications
          </button>
        </div>
      )}
    </>
  )

  const sheet =
    isBottomNav && isOpen
      ? createPortal(
          <div
            className={`notification-sheet-root${sheetVisible ? ' is-visible' : ''}`}
            role="presentation"
          >
            <button
              type="button"
              className="notification-sheet__backdrop"
              aria-label="Dismiss notifications"
              onClick={closeSheet}
            />
            <div
              ref={sheetRef}
              className="notification-sheet"
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
            >
              {panelBody}
            </div>
          </div>,
          document.body
        )
      : null

  return (
    <div
      className={`relative${isBottomNav ? ' notification-bell--bottom-nav' : ''}`}
      ref={dropdownRef}
    >
      <button
        type="button"
        onClick={() => {
          if (isOpen) closeSheet()
          else setIsOpen(true)
        }}
        className={`${
          isBottomNav
            ? `client-bottom-nav__tab${isOpen ? ' client-bottom-nav__tab--active' : ''}`
            : `notification-bell-btn relative p-2 transition-colors${
                unreadCount > 0 ? ' notification-bell-btn--attention' : ''
              }`
        }`}
        style={
          isBottomNav
            ? undefined
            : { color: unreadCount > 0 ? undefined : t.muted }
        }
        onMouseEnter={
          isBottomNav
            ? undefined
            : (e) => {
                if (unreadCount === 0) e.currentTarget.style.color = t.primary
              }
        }
        onMouseLeave={
          isBottomNav
            ? undefined
            : (e) => {
                if (unreadCount === 0) e.currentTarget.style.color = t.muted
              }
        }
        aria-label={
          unreadCount > 0
            ? `Notifications, ${unreadCount} unread`
            : 'Notifications'
        }
        aria-expanded={isOpen}
        aria-haspopup="dialog"
      >
        {isBottomNav ? (
          <>
            <span className="client-bottom-nav__icon-wrap">
              <Bell className="client-bottom-nav__icon" strokeWidth={2} aria-hidden />
              {unreadCount > 0 ? (
                <span className="client-bottom-nav__badge client-bottom-nav__badge--danger">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              ) : null}
            </span>
            <span className="client-bottom-nav__label">Alerts</span>
          </>
        ) : (
          <>
            <Bell className="w-5 h-5 notification-bell-btn__icon" />
            {unreadCount > 0 && (
              <span className="notification-bell-btn__badge absolute top-0 right-0 flex items-center justify-center w-5 h-5 text-xs font-bold rounded-full">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </>
        )}
      </button>

      {!isBottomNav && isOpen ? (
        <div
          className="absolute right-0 mt-2 w-96 z-50 max-h-[600px] overflow-hidden flex flex-col border rounded-lg shadow-xl"
          style={{
            borderColor: t.border,
            backgroundColor: t.card,
          }}
        >
          {panelBody}
        </div>
      ) : null}

      {sheet}
    </div>
  )
}
