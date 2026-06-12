import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { LogOut } from 'lucide-react'
import { Notification } from '../types/notification'
import NotificationBell from './NotificationBell'
import CredyxWordmark from './CredyxWordmark'
import { mockNotifications } from '../data/mockNotifications'
import '../styles/credyxWordmark.css'

interface ClientHeaderProps {
  clientName: string
  navItems: Array<{ label: string; path: string }>
}

export default function ClientHeader({ clientName, navItems }: ClientHeaderProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const [notifications, setNotifications] = useState<Notification[]>(mockNotifications)

  const isActive = (path: string) => {
    return location.pathname === path || location.pathname.startsWith(path + '/')
  }

  const handleMarkAsRead = (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    )
  }

  const handleMarkAllAsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
  }

  const handleNotificationClick = (notification: Notification) => {
    if (notification.link) {
      // Add invoice_id or batch_id as URL parameter for highlighting
      const params = new URLSearchParams()
      if (notification.invoice_id) {
        params.set('highlight_invoice', notification.invoice_id)
      }
      if (notification.batch_id) {
        params.set('highlight_batch', notification.batch_id)
      }
      const url = params.toString() ? `${notification.link}?${params.toString()}` : notification.link
      navigate(url)
    }
  }

  return (
    <header className="bg-white border-b sticky top-0 z-50" style={{ borderColor: '#819291' }}>
      <div className="w-full px-3 sm:px-4 lg:px-5 xl:px-6">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center space-x-8">
            <div>
              <CredyxWordmark variant="full" theme="admin" onClick={() => navigate('/client/dashboard')} />
              <p className="text-xs mt-1.5" style={{ color: '#819291' }}>{clientName}</p>
            </div>
            <nav className="hidden md:flex space-x-1">
              {navItems.map((item) => (
                <button
                  key={item.path}
                  onClick={() => navigate(item.path)}
                  className="px-4 py-2 text-sm font-medium transition-colors"
                  style={{
                    color: isActive(item.path) ? '#113543' : '#819291',
                    borderBottom: isActive(item.path) ? '2px solid #C2A558' : '2px solid transparent',
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive(item.path)) {
                      e.currentTarget.style.color = '#113543'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive(item.path)) {
                      e.currentTarget.style.color = '#819291'
                    }
                  }}
                >
                  {item.label}
                </button>
              ))}
            </nav>
          </div>
          <div className="flex items-center space-x-4">
            <div className="text-right hidden sm:block">
              <div className="text-sm font-medium" style={{ color: '#113543' }}>{clientName}</div>
              <div className="text-xs" style={{ color: '#819291' }}>Client Portal</div>
            </div>
            <NotificationBell
              notifications={notifications}
              onMarkAsRead={handleMarkAsRead}
              onMarkAllAsRead={handleMarkAllAsRead}
              onNotificationClick={handleNotificationClick}
            />
            <button
              onClick={() => {
                localStorage.removeItem('clientAuthenticated')
                localStorage.removeItem('clientEmail')
                localStorage.removeItem('clientRole')
                localStorage.removeItem('clientId')
                navigate('/client/login')
              }}
              className="flex items-center space-x-2 px-3 py-2 text-sm transition-colors"
              style={{ color: '#819291' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#113543')}
              onMouseLeave={(e) => (e.currentTarget.style.color = '#819291')}
              aria-label="Logout"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  )
}

