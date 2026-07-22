import { useState, useEffect, useRef } from 'react'
import { Bell, X, Check, FileText, DollarSign, AlertCircle, Clock, MessageSquare } from 'lucide-react'
import { Notification } from '../types/notification'
import { formatRelativeTime } from '../utils/format'
import { useClientTheme } from '../theme/ThemeContext'

interface NotificationBellProps {
  notifications: Notification[]
  onMarkAsRead: (id: string) => void
  onMarkAllAsRead: () => void
  onNotificationClick: (notification: Notification) => void
}

export default function NotificationBell({
  notifications,
  onMarkAsRead,
  onMarkAllAsRead,
  onNotificationClick,
}: NotificationBellProps) {
  const t = useClientTheme()
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const unreadCount = notifications.filter((n) => !n.read).length

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

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

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`notification-bell-btn relative p-2 transition-colors${
          unreadCount > 0 ? ' notification-bell-btn--attention' : ''
        }`}
        style={{ color: unreadCount > 0 ? undefined : t.muted }}
        onMouseEnter={(e) => {
          if (unreadCount === 0) e.currentTarget.style.color = t.primary
        }}
        onMouseLeave={(e) => {
          if (unreadCount === 0) e.currentTarget.style.color = t.muted
        }}
        aria-label={
          unreadCount > 0
            ? `Notifications, ${unreadCount} unread`
            : 'Notifications'
        }
      >
        <Bell className="w-5 h-5 notification-bell-btn__icon" />
        {unreadCount > 0 && (
          <span className="notification-bell-btn__badge absolute top-0 right-0 flex items-center justify-center w-5 h-5 text-xs font-bold rounded-full">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          className="absolute right-0 mt-2 w-96 bg-white border rounded-lg shadow-xl z-50 max-h-[600px] overflow-hidden flex flex-col"
          style={{
            borderColor: t.border,
            backgroundColor: t.card,
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: t.border }}>
            <div className="flex items-center space-x-2">
              <Bell className="w-5 h-5" style={{ color: t.primary }} />
              <h3 className="text-lg font-semibold" style={{ color: t.primary }}>
                Notifications
              </h3>
              {unreadCount > 0 && (
                <span
                  className="px-2 py-0.5 text-xs font-medium rounded-full"
                  style={{
                    backgroundColor: t.accent,
                    color: '#FFFFFF',
                  }}
                >
                  {unreadCount} new
                </span>
              )}
            </div>
            <div className="flex items-center space-x-2">
              {unreadCount > 0 && (
                <button
                  onClick={() => {
                    onMarkAllAsRead()
                    setIsOpen(false)
                  }}
                  className="text-xs px-2 py-1 rounded transition-colors"
                  style={{
                    color: t.primary,
                    border: `1px solid ${t.border}`,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = t.surface
                    e.currentTarget.style.borderColor = t.accent
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = t.card
                    e.currentTarget.style.borderColor = t.border
                  }}
                >
                  Mark all read
                </button>
              )}
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 hover:bg-gray-100 rounded transition-colors"
                style={{ color: t.primary }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Notifications List */}
          <div className="overflow-y-auto flex-1">
            {notifications.length === 0 ? (
              <div className="p-8 text-center">
                <Bell className="w-12 h-12 mx-auto mb-4" style={{ color: t.mutedLight }} />
                <p className="text-sm" style={{ color: t.muted }}>
                  No notifications
                </p>
              </div>
            ) : (
              <>
                {/* Unread Notifications */}
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
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = '#f0f0f0'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = '#f8f9fa'
                        }}
                        onClick={() => {
                          if (!notification.read) {
                            onMarkAsRead(notification.id)
                          }
                          if (notification.link) {
                            onNotificationClick(notification)
                          }
                          setIsOpen(false)
                        }}
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
                                onClick={(e) => {
                                  e.stopPropagation()
                                  onMarkAsRead(notification.id)
                                }}
                                className="ml-2 p-1 hover:bg-gray-200 rounded transition-colors"
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
                              <div className="flex items-center space-x-1 text-xs" style={{ color: t.muted }}>
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

                {/* Read Notifications */}
                {readNotifications.length > 0 && (
                  <div>
                    {unreadNotifications.length > 0 && (
                      <div className="px-4 py-2 text-xs font-medium" style={{ color: t.muted, backgroundColor: t.surface }}>
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
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = '#f8f9fa'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = '#FFFFFF'
                        }}
                        onClick={() => {
                          if (notification.link) {
                            onNotificationClick(notification)
                          }
                          setIsOpen(false)
                        }}
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
                              <div className="flex items-center space-x-1 text-xs" style={{ color: t.muted }}>
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

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="p-3 border-t text-center" style={{ borderColor: t.border }}>
              <button
                className="text-sm font-medium transition-colors"
                style={{ color: t.primary }}
                onMouseEnter={(e) => (e.currentTarget.style.color = t.accent)}
                onMouseLeave={(e) => (e.currentTarget.style.color = t.primary)}
              >
                View All Notifications
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

