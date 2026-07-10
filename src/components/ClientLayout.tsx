import { useMemo, useState, useEffect, useRef, type ReactNode } from 'react'
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import {
  ChevronDown,
  LogOut,
  Menu,
  Upload,
  X,
  PanelLeftClose,
  PanelLeft,
} from 'lucide-react'
import { Notification } from '../types/notification'
import NotificationBell from './NotificationBell'
import {
  getNotificationsForClient,
  markAllClientNotificationsRead,
  markNotificationRead,
  subscribeClientNotifications,
} from '../data/mockNotifications'
import { getAllBatches } from '../data/mockBatches'
import { clearClientTenantCache } from '../data/clientDemoData'
import { clearClientSession } from '../utils/clearClientSession'
import {
  filterClientNavSections,
  getInitials,
  getClientUserDisplayName,
} from '../config/clientNav'
import { useClientPortal } from '../context/ClientPortalContext'
import { getTierLabel } from '../utils/clientCapabilities'
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
  const { client, tier, capabilities } = useClientPortal()
  const t = useClientTheme()
  const resolvedClientId = clientId ?? client?.id
  const resolvedClientName = clientName || client?.name || 'Client'
  const navSections = useMemo(
    () => filterClientNavSections(capabilities),
    [capabilities]
  )
  const { resolvedTheme } = useTheme()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])

  useEffect(() => {
    if (!resolvedClientId) {
      setNotifications([])
      return
    }
    const refresh = () => setNotifications(getNotificationsForClient(resolvedClientId))
    refresh()
    return subscribeClientNotifications(refresh, resolvedClientId)
  }, [resolvedClientId])
  const [collapsed, setCollapsed] = useState(() => {
    try {
      const stored = localStorage.getItem(SIDEBAR_COLLAPSED_KEY)
      if (stored === 'true' || stored === 'false') return stored === 'true'
      // Mid-size desktops: start collapsed so list tables keep usable width.
      return typeof window !== 'undefined' && window.innerWidth < 1400
    } catch {
      return false
    }
  })
  const [hoverExpanded, setHoverExpanded] = useState(false)
  const hoverLeaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Auto-collapse when shrinking into the mid-size range (do not auto-expand).
  useEffect(() => {
    const media = window.matchMedia('(max-width: 1399px)')
    const onChange = () => {
      if (media.matches) {
        setCollapsed(true)
        try {
          localStorage.setItem(SIDEBAR_COLLAPSED_KEY, 'true')
        } catch {
          /* ignore */
        }
      }
    }
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    return () => {
      if (hoverLeaveTimer.current) clearTimeout(hoverLeaveTimer.current)
    }
  }, [])

  // Rail mode = icon strip; hover temporarily expands as a flyout over content.
  const railMode = collapsed
  const sidebarExpanded = !railMode || hoverExpanded
  const sidebarWidth = sidebarExpanded ? t.sidebar.expandedWidth : t.sidebar.collapsedWidth
  // Main content only reserves the rail width so hover expand doesn't reflow the page.
  const mainOffset = railMode ? t.sidebar.collapsedWidth : t.sidebar.expandedWidth

  // Reveal labels after width settles so text never wraps mid-animation.
  const [labelsReady, setLabelsReady] = useState(() => sidebarExpanded)
  useEffect(() => {
    if (!sidebarExpanded) {
      setLabelsReady(false)
      return
    }
    const id = window.setTimeout(() => setLabelsReady(true), 160)
    return () => window.clearTimeout(id)
  }, [sidebarExpanded])

  const clearHoverLeaveTimer = () => {
    if (hoverLeaveTimer.current) {
      clearTimeout(hoverLeaveTimer.current)
      hoverLeaveTimer.current = null
    }
  }

  const handleSidebarMouseEnter = () => {
    clearHoverLeaveTimer()
    if (railMode) setHoverExpanded(true)
  }

  const handleSidebarMouseLeave = () => {
    clearHoverLeaveTimer()
    hoverLeaveTimer.current = setTimeout(() => {
      if (!userMenuOpen) setHoverExpanded(false)
    }, 160)
  }

  useEffect(() => {
    if (!userMenuOpen && railMode) {
      clearHoverLeaveTimer()
      hoverLeaveTimer.current = setTimeout(() => setHoverExpanded(false), 160)
    }
  }, [userMenuOpen, railMode])

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next))
      } catch {
        /* ignore */
      }
      if (next) setHoverExpanded(false)
      return next
    })
  }

  const userEmail = localStorage.getItem('clientEmail')
  const userRole = localStorage.getItem('clientRole') || 'A/R Manager'
  const userDisplayName = getClientUserDisplayName(userEmail)

  const pendingBatchCount = useMemo(() => {
    const batches = getAllBatches()
    const filtered = resolvedClientId
      ? batches.filter((b) => b.client_id === resolvedClientId)
      : batches
    return filtered.filter(
      (b) => b.status === 'ready_to_post' || b.status === 'documents_uploaded'
    ).length
  }, [resolvedClientId])

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
    // Collapse hover flyout immediately so chrome stays stable while the page loads.
    if (railMode) setHoverExpanded(false)
    if (path.startsWith('mailto:')) {
      window.location.href = path
      return
    }
    const [pathOnly, query] = path.split('?')
    navigate(query ? `${pathOnly}?${query}` : pathOnly)
  }

  const handleLogout = () => {
    clearClientSession()
    if (resolvedClientId) clearClientTenantCache(resolvedClientId)
    navigate('/client/login')
  }

  const handleMarkAsRead = (id: string) => {
    markNotificationRead(id)
  }

  const handleMarkAllAsRead = () => {
    if (!resolvedClientId) return
    markAllClientNotificationsRead(resolvedClientId)
  }

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.link) return
    const params = new URLSearchParams()
    if (notification.invoice_id) params.set('highlight_invoice', notification.invoice_id)
    if (notification.batch_id) params.set('highlight_batch', notification.batch_id)
    if (notification.payment_id) params.set('paymentId', notification.payment_id)
    const url = params.toString() ? `${notification.link}?${params.toString()}` : notification.link
    navigate(url)
    setMobileOpen(false)
  }

  const sidebarContent = (isMobile = false) => {
    const showLabels = isMobile || labelsReady
    // Fixed left inset so icons stay put while the rail expands/collapses.
    const iconInsetClass = 'pl-5'
    // Collapse label width until ready so text never wraps mid-width animation.
    const labelClass = showLabels
      ? 'opacity-100 min-w-0'
      : 'opacity-0 max-w-0 w-0 min-w-0 overflow-hidden pointer-events-none shrink-0'
    return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Brand — mark always; wordmark fades in after width settles */}
      <div
        className={`flex items-center border-b ${iconInsetClass} pr-2.5 py-2.5 gap-2.5 min-h-[52px]`}
        style={{ borderColor: t.sidebar.border }}
      >
        <CredyxWordmark
          variant="mark"
          theme="client"
          onClick={() => navigate('/client/dashboard')}
        />
        <div className={`overflow-hidden whitespace-nowrap transition-opacity duration-75 ${labelClass}`}>
          <CredyxWordmark
            variant="compact"
            theme="client"
            onClick={() => navigate('/client/dashboard')}
          />
        </div>
      </div>

      {/* Company context */}
      <div className={`py-2 border-b ${iconInsetClass} pr-2.5`} style={{ borderColor: t.sidebar.border }}>
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-semibold shrink-0"
            style={{ backgroundColor: t.sidebar.avatarBg, color: t.sidebar.avatarText }}
            title={resolvedClientName}
          >
            {getInitials(resolvedClientName)}
          </div>
          <div className={`transition-opacity duration-75 ${labelClass}`}>
            <div className="text-[13px] font-semibold truncate whitespace-nowrap leading-tight" style={{ color: t.sidebar.text }}>
              {resolvedClientName}
            </div>
            <div className="text-[11px] truncate whitespace-nowrap leading-tight" style={{ color: t.sidebar.muted }}>
              {getTierLabel(tier)}
            </div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-2 space-y-2.5">
        {navSections.map((section) => (
          <div key={section.title}>
            <div
              className={`${iconInsetClass} pr-2.5 mb-1 text-[10px] font-semibold tracking-wider uppercase whitespace-nowrap overflow-hidden transition-opacity duration-75 ${
                showLabels ? 'opacity-100' : 'opacity-0'
              }`}
              style={{ color: t.sidebar.muted, height: '0.875rem' }}
              aria-hidden={!showLabels}
            >
              {section.title}
            </div>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active = isNavActive(item.path)
                const Icon = item.icon
                const badge = item.badgeKey ? badges[item.badgeKey] : 0

                return (
                  <li key={item.path}>
                    <button
                      type="button"
                      onClick={() => handleNavClick(item.path)}
                      title={!showLabels ? item.label : undefined}
                      className={`w-full flex items-center gap-2.5 ${iconInsetClass} pr-2.5 py-1.5 rounded-md text-[13px] transition-[background-color,color] duration-200`}
                      style={{
                        backgroundColor: active ? t.sidebar.active : 'transparent',
                        color: active ? t.sidebar.activeText : t.sidebar.muted,
                        boxShadow: active
                          ? `inset 3px 0 0 ${t.sidebar.activeBorder}`
                          : 'inset 3px 0 0 transparent',
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
                        className="w-4 h-4 shrink-0"
                        strokeWidth={1.75}
                        style={{ color: active ? t.info : t.mutedLight }}
                      />
                      <span
                        className={`flex-1 text-left truncate whitespace-nowrap transition-opacity duration-75 ${labelClass}`}
                      >
                        {item.label}
                      </span>
                      {badge > 0 && (
                        <span
                          className={`min-w-[18px] h-4 px-1 flex items-center justify-center rounded-full text-[9px] font-bold text-white transition-opacity duration-75 ${
                            showLabels ? 'opacity-100' : 'opacity-0 max-w-0 overflow-hidden'
                          }`}
                          style={{ backgroundColor: t.sidebar.badge }}
                        >
                          {badge}
                        </span>
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
        <div className={`pb-1 ${iconInsetClass} pr-2.5`}>
          <button
            type="button"
            onClick={toggleCollapsed}
            className="w-full flex items-center gap-2.5 py-1.5 text-[13px] transition-colors rounded-md"
            style={{ color: t.sidebar.muted }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = t.sidebar.hover
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent'
            }}
            aria-label={railMode ? 'Keep sidebar expanded' : 'Collapse sidebar'}
          >
            {railMode ? (
              <PanelLeft className="w-4 h-4 shrink-0" strokeWidth={1.75} />
            ) : (
              <PanelLeftClose className="w-4 h-4 shrink-0" strokeWidth={1.75} />
            )}
            <span className={`whitespace-nowrap transition-opacity duration-75 ${labelClass}`}>
              {railMode ? 'Pin open' : 'Collapse'}
            </span>
          </button>
        </div>
      )}

      {/* User profile */}
      <div className={`py-2 border-t relative ${iconInsetClass} pr-2.5`} style={{ borderColor: t.sidebar.border }}>
        <button
          type="button"
          onClick={() => setUserMenuOpen((open) => !open)}
          className="w-full flex items-center gap-2.5 py-1.5 transition-colors rounded-md"
          style={{ color: t.sidebar.text }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = t.sidebar.hover
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent'
          }}
        >
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-semibold shrink-0"
            style={{ backgroundColor: t.sidebar.avatarBg, color: t.sidebar.avatarText }}
          >
            {getInitials(userDisplayName)}
          </div>
          <div className={`flex-1 text-left transition-opacity duration-75 ${labelClass}`}>
            <div className="text-[13px] font-semibold truncate whitespace-nowrap leading-tight">{userDisplayName}</div>
            <div className="text-[11px] truncate whitespace-nowrap leading-tight" style={{ color: t.sidebar.muted }}>
              {userRole === 'Client' ? 'A/R Manager' : userRole}
            </div>
          </div>
          <ChevronDown
            className={`w-3.5 h-3.5 shrink-0 transition-all duration-75 ${userMenuOpen ? 'rotate-180' : ''} ${
              showLabels ? 'opacity-100' : 'opacity-0'
            }`}
            style={{ color: t.sidebar.muted }}
          />
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
  }

  return (
    <div
      className="client-portal flex h-screen overflow-hidden"
      data-theme={resolvedTheme}
      style={{ backgroundColor: t.surface, ['--sidebar-width' as string]: `${mainOffset}px` }}
    >
      {/* Desktop sidebar — hover expands over content when in rail mode */}
      <aside
        className={`client-sidebar-rail hidden lg:flex flex-col shrink-0 fixed inset-y-0 left-0 z-40 border-r ${
          railMode && hoverExpanded ? 'client-sidebar-rail--flyout' : ''
        }`}
        style={{
          width: sidebarWidth,
          backgroundColor: t.sidebar.bg,
          borderColor: t.sidebar.border,
          boxShadow: railMode && hoverExpanded ? t.shadow.cardHover : t.shadow.card,
        }}
        onMouseEnter={handleSidebarMouseEnter}
        onMouseLeave={handleSidebarMouseLeave}
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
      <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden transition-[margin] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] lg:ml-[var(--sidebar-width)]">
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
              {resolvedClientName}
            </p>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <div className="hidden lg:block">
              <ThemeToggle compact />
            </div>
            {(capabilities.canCreateBatch || capabilities.canSubmitDocHandoff) && (
              <button
                type="button"
                onClick={() => navigate('/client/batches?tab=create')}
                className="lg:hidden inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold transition-colors dashboard-btn-primary"
                aria-label="Submit documents"
              >
                <Upload className="w-4 h-4" />
                {capabilities.canCreateBatch ? 'Upload' : 'Send docs'}
              </button>
            )}
            <NotificationBell
              notifications={notifications}
              onMarkAsRead={handleMarkAsRead}
              onMarkAllAsRead={handleMarkAllAsRead}
              onNotificationClick={handleNotificationClick}
            />
          </div>
        </header>

        <main
          className={`flex-1 w-full min-h-0 ${
            flushMain ? 'client-main--flush overflow-hidden' : 'p-5 overflow-y-auto'
          }`}
        >
          {children}
        </main>
      </div>
    </div>
  )
}
