import { useMemo, useState, useEffect, useLayoutEffect, useRef, type ReactNode } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
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
import {
  getAdminNotifications,
  markAdminNotificationRead,
  markAllAdminNotificationsRead,
  subscribeAdminNotifications,
} from '../services/adminNotificationService'
import { getAllClients } from '../services/clientRegistry'
import { countPendingBrokerRiskReviews } from '../data/brokerRiskStore'
import { countPendingBrokerSnapshotChanges } from '../services/brokerSnapshotReviewService'
import { getAllBatches } from '../data/mockBatches'
import { getInitials, getAdminUserDisplayName } from '../config/adminNav'
import { useAdminCapabilities } from '../hooks/useAdminCapabilities'
import {
  filterAdminNavSections,
  getAdminStaffRoleLabel,
} from '../utils/adminRoles'
import { listPendingPayments } from '../services/clientPaymentService'
import { listPendingWriteOffs } from '../services/writeOffApprovalService'
import { syncAdminNotificationsForOpenReceiptDisputes } from '../services/paymentReceiptConfirmationService'
import { useClientTheme, useTheme } from '../theme/ThemeContext'
import ThemeToggle from './ThemeToggle'
import CredyxWordmark from './CredyxWordmark'
import AssistantFab from './client/assistant/AssistantFab'
import AssistantHeaderBuddy from './client/assistant/AssistantHeaderBuddy'
import { signOutAdmin } from '../services/adminAuthService'
import { useAuth } from '../context/AuthContext'
import { useTenantDataRevision } from '../hooks/useTenantDataRevision'
import '../styles/clientPortal.css'
import '../styles/clientPortalDark.css'
import '../styles/credyxWordmark.css'

interface AdminLayoutProps {
  children: ReactNode
  /** Remove main padding for edge-to-edge page layouts. */
  flushMain?: boolean
  userName?: string
  userRole?: string
}

const SIDEBAR_COLLAPSED_KEY = 'adminSidebarCollapsed'
/** Survives page remounts so scrolling the rail then clicking a link does not jump to top. */
let savedAdminNavScrollTop = 0

export default function AdminLayout({
  children,
  flushMain = false,
  userName: userNameProp,
  userRole: userRoleProp,
}: AdminLayoutProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const t = useClientTheme()
  const { resolvedTheme } = useTheme()
  const { resolved } = useAuth()
  const tenantRevision = useTenantDataRevision()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>(() => getAdminNotifications())
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true'
    } catch {
      return false
    }
  })

  const userEmail = resolved.user?.email ?? undefined
  const userName = userNameProp || getAdminUserDisplayName(userEmail ?? null)
  const { capabilities } = useAdminCapabilities()
  const navSections = useMemo(
    () => filterAdminNavSections(capabilities.staffRole),
    [capabilities.staffRole]
  )
  const userRole = userRoleProp || getAdminStaffRoleLabel(capabilities.staffRole)

  useEffect(() => {
    syncAdminNotificationsForOpenReceiptDisputes()
    setNotifications(getAdminNotifications())
    return subscribeAdminNotifications(() => {
      setNotifications(getAdminNotifications())
    })
  }, [])

  const sidebarExpanded = !collapsed
  /** Slightly wider than the client rail so admin labels (Broker Snapshot, etc.) stay fully visible. */
  const expandedWidth = Math.max(t.sidebar.expandedWidth, 220)
  const sidebarWidth = collapsed ? t.sidebar.collapsedWidth : expandedWidth
  const iconColWidth = t.sidebar.collapsedWidth

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

  const pendingBatchCount = useMemo(() => {
    return getAllBatches().filter(
      (b) =>
        b.status === 'ready_to_post' ||
        b.status === 'verification' ||
        b.status === 'approval'
    ).length
  }, [tenantRevision])

  const pendingPaymentCount = useMemo(() => listPendingPayments().length, [tenantRevision])
  const pendingWriteOffCount = useMemo(() => listPendingWriteOffs().length, [tenantRevision])
  const pendingBrokerRiskCount = useMemo(
    () => countPendingBrokerRiskReviews(),
    [tenantRevision]
  )
  const [pendingBrokerSnapshotCount, setPendingBrokerSnapshotCount] = useState(0)

  useEffect(() => {
    let cancelled = false
    void countPendingBrokerSnapshotChanges()
      .then((n) => {
        if (!cancelled) setPendingBrokerSnapshotCount(n)
      })
      .catch(() => {
        if (!cancelled) setPendingBrokerSnapshotCount(0)
      })
    return () => {
      cancelled = true
    }
  }, [tenantRevision, location.pathname])

  const notificationCompanies = useMemo(
    () =>
      getAllClients()
        .map((c) => ({ id: c.id, name: c.name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [tenantRevision]
  )

  const navScrollRef = useRef<HTMLElement>(null)

  useLayoutEffect(() => {
    const el = navScrollRef.current
    if (el) el.scrollTop = savedAdminNavScrollTop
  }, [])

  const badges: Record<string, number> = {
    pendingBatches: pendingBatchCount,
    pendingPayments: pendingPaymentCount,
    pendingWriteOffs: pendingWriteOffCount,
    pendingBrokerRisk: pendingBrokerRiskCount,
    pendingBrokerSnapshot: pendingBrokerSnapshotCount,
  }

  const isNavActive = (path: string) => {
    if (path === '/admin/dashboard') {
      return location.pathname === path
    }
    return location.pathname === path || location.pathname.startsWith(`${path}/`)
  }

  const handleNavClick = (path: string) => {
    setMobileOpen(false)
    navigate(path)
  }

  const handleLogout = () => {
    void signOutAdmin().then(() => navigate('/login'))
  }

  const sidebarContent = (isMobile = false) => {
    const tip = (label: string) => (!isMobile && collapsed ? label : undefined)
    const showLabels = sidebarExpanded || isMobile
    const navIconColWidth = isMobile ? 44 : iconColWidth - 12

    return (
    <div className={`flex flex-col h-full overflow-hidden${isMobile ? ' client-mobile-drawer__content' : ''}`}>
      <div
        className={`client-sidebar-brand flex items-center border-b shrink-0${isMobile ? ' client-mobile-drawer__brand' : ''}`}
        style={{ borderColor: t.sidebar.border }}
      >
        {showLabels ? (
          <div className={isMobile ? 'client-mobile-drawer__brand-logo' : 'client-sidebar-brand__logo'}>
            <CredyxWordmark
              variant="compact"
              theme="client"
              surface={resolvedTheme === 'dark' ? 'on-dark' : 'on-light'}
              onClick={() => navigate('/admin/dashboard')}
            />
          </div>
        ) : (
          <div
            className="client-sidebar-brand__mark shrink-0 flex items-center justify-center w-full"
            style={{ width: iconColWidth }}
          >
            <CredyxWordmark
              variant="mark"
              theme="client"
              onClick={() => navigate('/admin/dashboard')}
            />
          </div>
        )}
      </div>

      <nav
        ref={isMobile ? undefined : navScrollRef}
        className={`client-sidebar-nav-scroll${isMobile ? ' client-mobile-drawer__nav' : ''} space-y-1`}
        onScroll={
          isMobile
            ? undefined
            : (event) => {
                savedAdminNavScrollTop = event.currentTarget.scrollTop
              }
        }
      >
        {navSections.map((section, sectionIndex) => (
          <div
            key={section.title}
            className={sectionIndex > 0 ? (isMobile ? 'mt-3' : 'mt-2.5') : undefined}
          >
            {section.title ? (
              <div
                className={`${isMobile ? 'mb-1 px-4 text-[11px]' : 'mb-0.5 px-3 text-[10px]'} font-semibold tracking-wider uppercase whitespace-nowrap overflow-hidden`}
                style={{
                  color: t.sidebar.muted,
                  height: isMobile ? 'auto' : '0.875rem',
                  opacity: showLabels ? 1 : 0,
                }}
                aria-hidden={!showLabels}
              >
                {section.title}
              </div>
            ) : null}
            <ul className={isMobile ? 'space-y-1' : 'space-y-px'}>
              {section.items.map((item) => {
                const active = isNavActive(item.path)
                const Icon = item.icon
                const badge = item.badgeKeys
                  ? item.badgeKeys.reduce((sum, key) => sum + (badges[key] ?? 0), 0)
                  : item.badgeKey
                    ? (badges[item.badgeKey] ?? 0)
                    : 0

                return (
                  <li key={item.path}>
                    <button
                      type="button"
                      onClick={() => handleNavClick(item.path)}
                      title={tip(item.label)}
                      className={`client-sidebar-nav-item w-full flex items-center transition-colors duration-200${
                        isMobile ? ' client-sidebar-nav-item--mobile text-[15px]' : ' text-[13px]'
                      }`}
                      style={{
                        backgroundColor: active ? t.sidebar.active : 'transparent',
                        color: active ? t.sidebar.activeText : t.sidebar.text,
                        fontWeight: active ? 600 : 500,
                      }}
                      onMouseEnter={(e) => {
                        if (!active) e.currentTarget.style.backgroundColor = t.sidebar.hover
                      }}
                      onMouseLeave={(e) => {
                        if (!active) e.currentTarget.style.backgroundColor = 'transparent'
                      }}
                    >
                      <span
                        className="relative shrink-0 flex items-center justify-center self-stretch"
                        style={{ width: navIconColWidth }}
                      >
                        <Icon
                          className={isMobile ? 'w-5 h-5' : 'w-4 h-4'}
                          strokeWidth={1.75}
                          style={{ color: active ? t.sidebar.activeText : t.sidebar.muted }}
                        />
                        {badge > 0 && !showLabels && (
                          <span
                            className="client-sidebar-nav-item__badge"
                            style={{ backgroundColor: t.sidebar.badge }}
                          >
                            {badge > 9 ? '9+' : badge}
                          </span>
                        )}
                      </span>
                      <span className={`flex-1 min-w-0 text-left truncate whitespace-nowrap pr-2${isMobile ? ' py-3' : ' py-1'}`}>
                        {item.label}
                      </span>
                      {badge > 0 && showLabels && (
                        <span
                          className={`${isMobile ? 'mr-3 min-w-[22px] h-5 text-[11px]' : 'mr-2 min-w-[18px] h-4 text-[9px]'} px-1.5 flex items-center justify-center rounded-full font-bold text-white shrink-0`}
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

      <div className={`${isMobile ? 'pb-1 pt-1' : 'pb-1'}`}>
        <ThemeToggle
          sidebar={{
            iconColWidth: isMobile ? 48 : iconColWidth,
            mutedColor: t.sidebar.muted,
            hoverColor: t.sidebar.hover,
            title: tip(resolvedTheme === 'dark' ? 'Light mode' : 'Dark mode'),
          }}
        />
        {!isMobile && (
          <button
            type="button"
            onClick={toggleCollapsed}
            className="w-full flex items-center text-[13px] transition-colors"
            style={{ color: t.sidebar.muted }}
            title={tip(collapsed ? 'Extend' : 'Collapse')}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = t.sidebar.hover
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent'
            }}
            aria-label={collapsed ? 'Extend sidebar' : 'Collapse sidebar'}
          >
            <span
              className="shrink-0 flex items-center justify-center self-stretch py-1.5"
              style={{ width: iconColWidth }}
            >
              {collapsed ? (
                <PanelLeft className="w-4 h-4" strokeWidth={1.75} />
              ) : (
                <PanelLeftClose className="w-4 h-4" strokeWidth={1.75} />
              )}
            </span>
            <span className="whitespace-nowrap truncate py-1.5 pr-2">
              {collapsed ? 'Extend' : 'Collapse'}
            </span>
          </button>
        )}
      </div>

      <div
        className={`client-sidebar-account${isMobile ? ' client-sidebar-account--mobile' : ''} border-t relative`}
        style={{ borderColor: t.sidebar.border }}
      >
        <button
          type="button"
          onClick={() => setUserMenuOpen((open) => !open)}
          className="client-sidebar-account__btn w-full flex items-center transition-colors"
          style={{ color: t.sidebar.text }}
          title={userName}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = t.sidebar.hover
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent'
          }}
        >
          <span
            className="client-sidebar-account__avatar-col shrink-0 flex items-center justify-center self-stretch"
            style={{ width: isMobile ? 48 : collapsed ? iconColWidth : undefined }}
          >
            <div
              className="client-sidebar-account__avatar rounded-full flex items-center justify-center font-semibold"
              style={{ backgroundColor: t.sidebar.avatarBg, color: t.sidebar.avatarText }}
            >
              {getInitials(userName)}
            </div>
          </span>
          <div className="client-sidebar-account__meta flex-1 min-w-0 text-left">
            <div className="client-sidebar-account__name font-semibold leading-tight">
              {userName}
            </div>
            <div className="client-sidebar-account__tier leading-tight" style={{ color: t.sidebar.muted }}>
              {userRole}
            </div>
          </div>
          <ChevronDown
            className={`client-sidebar-account__chevron w-3.5 h-3.5 shrink-0 transition-transform duration-150 ${
              userMenuOpen ? 'rotate-180' : ''
            }`}
            style={{ color: t.sidebar.muted }}
          />
        </button>

        {userMenuOpen && (
          <div
            className="absolute bottom-full left-2 right-2 mb-1 rounded-xl border py-1 z-10"
            style={{
              backgroundColor: t.card,
              borderColor: t.border,
              boxShadow: t.shadow.cardHover,
            }}
          >
            <button
              type="button"
              onClick={handleLogout}
              className={`w-full flex items-center gap-2 px-3 text-left transition-colors rounded-lg mx-0${isMobile ? ' py-3.5 text-[15px]' : ' py-2.5 text-sm'}`}
              style={{ color: t.sidebar.text }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = t.sidebar.hover
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent'
              }}
            >
              <LogOut className={isMobile ? 'w-5 h-5' : 'w-4 h-4'} />
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
      style={{ backgroundColor: t.surface, ['--sidebar-width' as string]: `${sidebarWidth}px` }}
    >
      <aside
        className={`client-sidebar-rail hidden lg:flex flex-col shrink-0 fixed inset-y-0 left-0 z-40 border-r${
          collapsed ? ' client-sidebar-rail--collapsed' : ''
        }`}
        style={{
          width: sidebarWidth,
          backgroundColor: t.sidebar.bg,
          borderColor: t.sidebar.border,
          boxShadow: t.shadow.card,
        }}
      >
        {sidebarContent()}
      </aside>

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

      <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden transition-[margin] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] lg:ml-[var(--sidebar-width)]">
        <header
          className="client-topbar sticky top-0 z-30 border-b"
          style={{ borderColor: t.border, backgroundColor: t.sidebar.bg }}
        >
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="client-topbar__menu-btn lg:hidden p-2 -ml-1 rounded-lg client-header-icon-btn shrink-0"
            style={{ color: t.primary }}
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="flex-1 min-w-0">
            <p className="client-topbar__welcome truncate" style={{ color: t.primary }}>
              Welcome back, {userName}
            </p>
          </div>

          <div className="client-topbar__actions">
            <AssistantHeaderBuddy mode="admin" />
            <NotificationBell
              notifications={notifications}
              companies={notificationCompanies}
              onMarkAsRead={markAdminNotificationRead}
              onMarkAllAsRead={markAllAdminNotificationsRead}
              onNotificationClick={(notification) => {
                if (notification.link) navigate(notification.link)
              }}
              onViewAll={() => navigate('/admin/notifications')}
            />
          </div>
        </header>

        <main
          className={`flex-1 w-full min-h-0 min-w-0 ${
            flushMain
              ? 'client-main--flush overflow-hidden'
              : 'client-shell-scroll p-5 overflow-y-auto'
          }`}
        >
          {children}
        </main>
      </div>

      <AssistantFab mode="admin" />
    </div>
  )
}
