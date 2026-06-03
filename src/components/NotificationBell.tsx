import { useState, useEffect, useRef } from 'react'
import { Bell, X, Check, FileText, DollarSign, AlertCircle, Clock } from 'lucide-react'
import { Notification } from '../types/notification'
import { formatRelativeTime } from '../utils/format'

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
      case 'payment_received':
      case 'payment_pending':
        return <DollarSign className="w-4 h-4" />
      case 'overdue_alert':
        return <AlertCircle className="w-4 h-4" />
      case 'batch_submitted':
      case 'batch_reviewed':
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
        return '#819291' // Success/Info
      case 'invoice_on_hold':
      case 'payment_pending':
        return '#C2A558' // Warning
      case 'invoice_rejected':
      case 'overdue_alert':
        return '#C2A558' // Error/Warning
      default:
        return '#819291'
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
        className="relative p-2 transition-colors"
        style={{ color: '#819291' }}
        onMouseEnter={(e) => (e.currentTarget.style.color = '#113543')}
        onMouseLeave={(e) => (e.currentTarget.style.color = '#819291')}
        aria-label="Notifications"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span
            className="absolute top-0 right-0 flex items-center justify-center w-5 h-5 text-xs font-bold rounded-full"
            style={{
              backgroundColor: '#C2A558',
              color: '#FFFFFF',
            }}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          className="absolute right-0 mt-2 w-96 bg-white border rounded-lg shadow-xl z-50 max-h-[600px] overflow-hidden flex flex-col"
          style={{
            borderColor: '#819291',
            backgroundColor: '#FFFFFF',
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: '#819291' }}>
            <div className="flex items-center space-x-2">
              <Bell className="w-5 h-5" style={{ color: '#113543' }} />
              <h3 className="text-lg font-semibold" style={{ color: '#113543' }}>
                Notifications
              </h3>
              {unreadCount > 0 && (
                <span
                  className="px-2 py-0.5 text-xs font-medium rounded-full"
                  style={{
                    backgroundColor: '#C2A558',
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
                    color: '#113543',
                    border: '1px solid #819291',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#f8f9fa'
                    e.currentTarget.style.borderColor = '#C2A558'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#FFFFFF'
                    e.currentTarget.style.borderColor = '#819291'
                  }}
                >
                  Mark all read
                </button>
              )}
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 hover:bg-gray-100 rounded transition-colors"
                style={{ color: '#113543' }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Notifications List */}
          <div className="overflow-y-auto flex-1">
            {notifications.length === 0 ? (
              <div className="p-8 text-center">
                <Bell className="w-12 h-12 mx-auto mb-4" style={{ color: '#819291' }} />
                <p className="text-sm" style={{ color: '#819291' }}>
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
                          borderColor: '#819291',
                          backgroundColor: '#f8f9fa',
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
                              <p className="text-sm font-medium" style={{ color: '#113543' }}>
                                {notification.title}
                              </p>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  onMarkAsRead(notification.id)
                                }}
                                className="ml-2 p-1 hover:bg-gray-200 rounded transition-colors"
                                style={{ color: '#819291' }}
                                title="Mark as read"
                              >
                                <Check className="w-3 h-3" />
                              </button>
                            </div>
                            <p className="text-sm mt-1" style={{ color: '#819291' }}>
                              {notification.message}
                            </p>
                            <div className="flex items-center justify-between mt-2">
                              <div className="flex items-center space-x-1 text-xs" style={{ color: '#819291' }}>
                                <Clock className="w-3 h-3" />
                                <span>{formatRelativeTime(notification.timestamp)}</span>
                              </div>
                              {notification.link_label && (
                                <span className="text-xs font-medium" style={{ color: '#C2A558' }}>
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
                      <div className="px-4 py-2 text-xs font-medium" style={{ color: '#819291', backgroundColor: '#f8f9fa' }}>
                        Older
                      </div>
                    )}
                    {readNotifications.map((notification) => (
                      <div
                        key={notification.id}
                        className="p-4 border-b cursor-pointer transition-colors"
                        style={{
                          borderColor: '#819291',
                          backgroundColor: '#FFFFFF',
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
                            <p className="text-sm font-medium" style={{ color: '#819291' }}>
                              {notification.title}
                            </p>
                            <p className="text-sm mt-1" style={{ color: '#819291' }}>
                              {notification.message}
                            </p>
                            <div className="flex items-center justify-between mt-2">
                              <div className="flex items-center space-x-1 text-xs" style={{ color: '#819291' }}>
                                <Clock className="w-3 h-3" />
                                <span>{formatRelativeTime(notification.timestamp)}</span>
                              </div>
                              {notification.link_label && (
                                <span className="text-xs font-medium" style={{ color: '#C2A558' }}>
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
            <div className="p-3 border-t text-center" style={{ borderColor: '#819291' }}>
              <button
                className="text-sm font-medium transition-colors"
                style={{ color: '#113543' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#C2A558')}
                onMouseLeave={(e) => (e.currentTarget.style.color = '#113543')}
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

