import { useMemo, useState, useEffect, type ReactNode } from 'react'
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

  const badges: Record<string, number> = {
    pendingBatches: pendingBatchCount,
    pendingPayments: pendingPaymentCount,
    pendingWriteOffs: pendingWriteOffCount,
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

  const sidebarContent = (isMobile = false) => (
    <div className="flex flex-col h-full">
      <div
        className={`flex items-center border-b ${collapsed && !isMobile ? 'justify-center px-2' : 'px-5'} pt-5 pb-4`}
        style={{ borderColor: t.sidebar.border }}
      >
        {collapsed && !isMobile ? (
          <CredyxWordmark
            variant="mark"
            theme="admin"
            onClick={() => navigate('/admin/dashboard')}
          />
        ) : (
          <CredyxWordmark
            variant="full"
            theme="admin"
            onClick={() => navigate('/admin/dashboard')}
          />
        )}
      </div>

      {!collapsed || isMobile ? (
        <div className="px-5 py-4 border-b" style={{ borderColor: t.sidebar.border }}>
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold shrink-0"
              style={{ backgroundColor: t.sidebar.avatarBg, color: t.sidebar.avatarText }}
            >
              CX
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold truncate" style={{ color: t.sidebar.text }}>
                Credyx Admin
              </div>
              <div className="text-xs truncate" style={{ color: t.sidebar.muted }}>
                Operations console
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
            CX
          </div>
        </div>
      )}

      <nav className={`flex-1 overflow-y-auto py-4 space-y-5 ${collapsed && !isMobile ? 'px-2' : 'px-3'}`}>
        {navSections.map((section) => (
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
            {getInitials(userName)}
          </div>
          {(!collapsed || isMobile) && (
            <>
              <div className="flex-1 min-w-0 text-left">
                <div className="text-sm font-semibold truncate">{userName}</div>
                <div className="text-xs truncate" style={{ color: t.sidebar.muted }}>
                  {userRole}
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
      className="client-portal flex h-screen overflow-hidden"
      data-theme={resolvedTheme}
      style={{ backgroundColor: t.surface, ['--sidebar-width' as string]: `${sidebarWidth}px` }}
    >
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

      <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden transition-all duration-200 lg:ml-[var(--sidebar-width)]">
        <header
          className="client-topbar sticky top-0 z-30 border-b"
          style={{ borderColor: t.border, backgroundColor: t.sidebar.bg }}
        >
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="lg:hidden p-2 -ml-1 rounded-lg client-header-icon-btn shrink-0"
            style={{ color: t.primary }}
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="flex-1 min-w-0 hidden lg:block">
            <p className="text-sm font-medium truncate" style={{ color: t.secondary }}>
              Credyx Admin
            </p>
          </div>

          <div className="client-topbar__actions">
            <AssistantHeaderBuddy mode="admin" />
            <div className="hidden lg:block shrink-0">
              <ThemeToggle compact />
            </div>
            <NotificationBell
              notifications={notifications}
              onMarkAsRead={markAdminNotificationRead}
              onMarkAllAsRead={markAllAdminNotificationsRead}
              onNotificationClick={(notification) => {
                if (notification.link) navigate(notification.link)
              }}
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
