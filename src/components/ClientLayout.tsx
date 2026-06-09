import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import {
  ChevronDown,
  LogOut,
  Menu,
  X,
  PanelLeftClose,
  PanelLeft,
} from 'lucide-react'
import { Notification } from '../types/notification'
import NotificationBell from './NotificationBell'
import { mockNotifications } from '../data/mockNotifications'
import { getAllBatches } from '../data/mockBatches'
import { clientNavSections,
  getInitials,
  getClientUserDisplayName,
} from '../config/clientNav'
import { useClientTheme, useTheme } from '../theme/ThemeContext'
import ThemeToggle from './ThemeToggle'
import CredyxWordmark from './CredyxWordmark'
import '../styles/clientPortal.css'
import '../styles/clientPortalDark.css'
import '../styles/credyxWordmark.css'

interface ClientLayoutProps {
  clientName: string
  clientId?: string
  /** Remove main padding for edge-to-edge page layouts (e.g. invoices). */
  flushMain?: boolean
  children: ReactNode
}

const SIDEBAR_COLLAPSED_KEY = 'clientSidebarCollapsed'

export default function ClientLayout({ clientName, clientId, flushMain = false, children }: ClientLayoutProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const t = useClientTheme()
  const { resolvedTheme } = useTheme()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>(mockNotifications)
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true'
    } catch {
      return false
    }
  })

  const sidebarWidth = collapsed ? t.sidebar.collapsedWidth : t.sidebar.expandedWidth

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next))
      } catch {
        /* ignore */
      }
      return next
    })
  }

  const userEmail = localStorage.getItem('clientEmail')
  const userRole = localStorage.getItem('clientRole') || 'A/R Manager'
  const userDisplayName = getClientUserDisplayName(userEmail)

  const pendingBatchCount = useMemo(() => {
    const batches = getAllBatches()
    const filtered = clientId ? batches.filter((b) => b.client_id === clientId) : batches
    return filtered.filter(
      (b) => b.status === 'ready_to_post' || b.status === 'documents_uploaded'
    ).length
  }, [clientId])

  const badges: Record<string, number> = {
    pendingBatches: pendingBatchCount,
  }

  const isNavActive = (path: string) => {
    const [pathOnly, query] = path.split('?')

    if (path.startsWith('mailto:')) return false

    const pathnameMatch =
      location.pathname === pathOnly ||
      (pathOnly !== '/client/dashboard' && location.pathname.startsWith(`${pathOnly}/`))

    if (!pathnameMatch) return false

    if (query) {
      const expected = new URLSearchParams(query)
      for (const [key, value] of expected.entries()) {
        if (searchParams.get(key) !== value) return false
      }
      return true
    }

    if (pathOnly === '/client/batches') {
      return searchParams.get('tab') !== 'create'
    }

    return true
  }

  const handleNavClick = (path: string) => {
    setMobileOpen(false)
    if (path.startsWith('mailto:')) {
      window.location.href = path
      return
    }
    const [pathOnly, query] = path.split('?')
    navigate(query ? `${pathOnly}?${query}` : pathOnly)
  }

  const handleLogout = () => {
    localStorage.removeItem('clientAuthenticated')
    localStorage.removeItem('clientEmail')
    localStorage.removeItem('clientRole')
    navigate('/client/login')
  }

  const handleMarkAsRead = (id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)))
  }

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.link) return
    const params = new URLSearchParams()
    if (notification.invoice_id) params.set('highlight_invoice', notification.invoice_id)
    if (notification.batch_id) params.set('highlight_batch', notification.batch_id)
    const url = params.toString() ? `${notification.link}?${params.toString()}` : notification.link
    navigate(url)
    setMobileOpen(false)
  }

  const sidebarContent = (isMobile = false) => (
    <div className="flex flex-col h-full">
      {/* Brand */}
      <div
        className={`flex items-center border-b ${collapsed && !isMobile ? 'justify-center px-2' : 'px-5'} pt-5 pb-4`}
        style={{ borderColor: t.sidebar.border }}
      >
        {collapsed && !isMobile ? (
          <CredyxWordmark
            variant="mark"
            theme="client"
            onClick={() => navigate('/client/dashboard')}
          />
        ) : (
          <CredyxWordmark
            variant="full"
            theme="client"
            onClick={() => navigate('/client/dashboard')}
          />
        )}
      </div>

      {/* Company context */}
      {!collapsed || isMobile ? (
        <div className="px-5 py-4 border-b" style={{ borderColor: t.sidebar.border }}>
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold shrink-0"
              style={{ backgroundColor: t.sidebar.avatarBg, color: t.sidebar.avatarText }}
            >
              {getInitials(clientName)}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold truncate" style={{ color: t.sidebar.text }}>
                {clientName}
              </div>
              <div className="text-xs truncate" style={{ color: t.sidebar.muted }}>
                Motor carrier
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="py-4 border-b flex justify-center" style={{ borderColor: t.sidebar.border }}>
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold"
            style={{ backgroundColor: t.sidebar.avatarBg, color: t.sidebar.avatarText }}
          >
            {getInitials(clientName)}
          </div>
        </div>
      )}

      {/* Navigation */}
      <nav className={`flex-1 overflow-y-auto py-4 space-y-5 ${collapsed && !isMobile ? 'px-2' : 'px-3'}`}>
        {clientNavSections.map((section) => (
          <div key={section.title}>
            {!collapsed || isMobile ? (
              <div
                className="px-3 mb-2 text-[11px] font-semibold tracking-wider uppercase"
                style={{ color: t.sidebar.muted }}
              >
                {section.title}
              </div>
            ) : null}
            <ul className="space-y-1">
              {section.items.map((item) => {
                const active = isNavActive(item.path)
                const Icon = item.icon
                const badge = item.badgeKey ? badges[item.badgeKey] : 0

                return (
                  <li key={item.path}>
                    <button
                      type="button"
                      onClick={() => handleNavClick(item.path)}
                      title={collapsed && !isMobile ? item.label : undefined}
                      className={`w-full flex items-center rounded-lg text-sm transition-all duration-200 border-l-[3px] ${
                        collapsed && !isMobile ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2.5'
                      }`}
                      style={{
                        backgroundColor: active ? t.sidebar.active : 'transparent',
                        color: active ? t.sidebar.activeText : t.sidebar.muted,
                        borderLeftColor: active ? t.sidebar.activeBorder : 'transparent',
                        fontWeight: active ? 600 : 500,
                      }}
                      onMouseEnter={(e) => {
                        if (!active) e.currentTarget.style.backgroundColor = t.sidebar.hover
                      }}
                      onMouseLeave={(e) => {
                        if (!active) e.currentTarget.style.backgroundColor = 'transparent'
                      }}
                    >
                      <Icon
                        className="w-[18px] h-[18px] shrink-0"
                        strokeWidth={1.75}
                        style={{ color: active ? t.info : t.mutedLight }}
                      />
                      {(!collapsed || isMobile) && (
                        <>
                          <span className="flex-1 text-left truncate">{item.label}</span>
                          {badge > 0 && (
                            <span
                              className="min-w-[20px] h-5 px-1.5 flex items-center justify-center rounded-full text-[10px] font-bold text-white"
                              style={{ backgroundColor: t.sidebar.badge }}
                            >
                              {badge}
                            </span>
                          )}
                        </>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Collapse toggle — desktop only */}
      {!isMobile && (
        <div className="px-3 pb-2">
          <button
            type="button"
            onClick={toggleCollapsed}
            className={`w-full flex items-center rounded-lg py-2 text-sm transition-colors ${
              collapsed ? 'justify-center px-2' : 'gap-2 px-3'
            }`}
            style={{ color: t.sidebar.muted }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = t.sidebar.hover
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent'
            }}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? (
              <PanelLeft className="w-[18px] h-[18px]" strokeWidth={1.75} />
            ) : (
              <>
                <PanelLeftClose className="w-[18px] h-[18px]" strokeWidth={1.75} />
                <span>Collapse</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* User profile */}
      <div className="px-3 py-3 border-t relative" style={{ borderColor: t.sidebar.border }}>
        <button
          type="button"
          onClick={() => setUserMenuOpen((open) => !open)}
          className={`w-full flex items-center rounded-lg py-2 transition-colors ${
            collapsed && !isMobile ? 'justify-center px-2' : 'gap-3 px-2'
          }`}
          style={{ color: t.sidebar.text }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = t.sidebar.hover
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent'
          }}
        >
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0"
            style={{ backgroundColor: t.sidebar.avatarBg, color: t.sidebar.avatarText }}
          >
            {getInitials(userDisplayName)}
          </div>
          {(!collapsed || isMobile) && (
            <>
              <div className="flex-1 min-w-0 text-left">
                <div className="text-sm font-semibold truncate">{userDisplayName}</div>
                <div className="text-xs truncate" style={{ color: t.sidebar.muted }}>
                  {userRole === 'Client' ? 'A/R Manager' : userRole}
                </div>
              </div>
              <ChevronDown
                className={`w-4 h-4 shrink-0 transition-transform ${userMenuOpen ? 'rotate-180' : ''}`}
                style={{ color: t.sidebar.muted }}
              />
            </>
          )}
        </button>

        {userMenuOpen && (
          <div
            className="absolute bottom-full left-3 right-3 mb-1 rounded-xl border py-1 z-10"
            style={{
              backgroundColor: t.card,
              borderColor: t.border,
              boxShadow: t.shadow.cardHover,
            }}
          >
            <button
              type="button"
              onClick={handleLogout}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-left transition-colors rounded-lg mx-0"
              style={{ color: t.sidebar.text }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = t.sidebar.hover
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent'
              }}
            >
              <LogOut className="w-4 h-4" />
              Sign out
            </button>
          </div>
        )}
      </div>
    </div>
  )

  return (
    <div
      className="client-portal flex min-h-screen"
      data-theme={resolvedTheme}
      style={{ backgroundColor: t.surface, ['--sidebar-width' as string]: `${sidebarWidth}px` }}
    >
      {/* Desktop sidebar */}
      <aside
        className="hidden lg:flex flex-col shrink-0 fixed inset-y-0 left-0 z-40 border-r transition-all duration-200"
        style={{
          width: sidebarWidth,
          backgroundColor: t.sidebar.bg,
          borderColor: t.sidebar.border,
          boxShadow: t.shadow.card,
        }}
      >
        {sidebarContent()}
      </aside>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/20"
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
          />
          <aside
            className="relative w-[260px] h-full border-r"
            style={{
              backgroundColor: t.sidebar.bg,
              borderColor: t.sidebar.border,
              boxShadow: t.shadow.cardHover,
            }}
          >
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="absolute top-3 right-3 p-1.5 rounded-lg client-header-icon-btn"
              style={{ color: t.muted }}
              aria-label="Close menu"
            >
              <X className="w-5 h-5" />
            </button>
            {sidebarContent(true)}
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 transition-all duration-200 lg:ml-[var(--sidebar-width)]">
        <header
          className="sticky top-0 z-30 flex items-center justify-between gap-3 px-5 h-12 border-b"
          style={{ borderColor: t.border, backgroundColor: t.card }}
        >
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="lg:hidden p-2 -ml-1 rounded-lg client-header-icon-btn"
            style={{ color: t.primary }}
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="flex-1 min-w-0 hidden lg:block">
            <p className="text-sm font-medium truncate" style={{ color: t.secondary }}>
              {clientName}
            </p>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <ThemeToggle compact />
            <NotificationBell
              notifications={notifications}
              onMarkAsRead={handleMarkAsRead}
              onMarkAllAsRead={() =>
                setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
              }
              onNotificationClick={handleNotificationClick}
            />
          </div>
        </header>

        <main className={`flex-1 w-full min-h-0 ${flushMain ? 'client-main--flush' : 'p-5'}`}>
          {children}
        </main>
      </div>
    </div>
  )
}
