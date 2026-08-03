import { useMemo, useState, useEffect, useCallback, type ReactNode } from 'react'
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import {
  ChevronDown,
  LogOut,
  Menu,
  Upload,
  X,
  PanelLeftClose,
  PanelLeft,
  RefreshCw,
} from 'lucide-react'
import { Notification } from '../types/notification'
import NotificationBell from './NotificationBell'
import {
  getNotificationsForClient,
  markAllClientNotificationsRead,
  markNotificationRead,
  subscribeClientNotifications,
} from '../data/mockNotifications'
import { subscribeClientNotificationPreferences } from '../utils/clientNotificationPreferences'
import { getAllBatches } from '../data/mockBatches'
import { mockInvoices } from '../data/mockInvoices'
import { isClientVisibleHold } from '../utils/clientInvoiceView'
import { clearClientTenantCache } from '../data/clientDemoData'
import { clearClientSession } from '../utils/clearClientSession'
import {
  dispatchReplayOnboardingTour,
  getOnboardingDashboardPrefs,
  resetOnboardingDashboardPrefs,
  setOnboardingDashboardPrefs,
} from '../utils/onboardingDashboardPrefs'
import {
  applyTourInvoiceStage,
  buildStatusTourNavigateTo,
  cleanupTourInvoice,
  stageForStatusTourStep,
} from '../utils/onboardingTourInvoice'
import {
  filterClientNavSections,
  getInitials,
  getClientUserDisplayName,
} from '../config/clientNav'
import { useClientPortal } from '../context/ClientPortalContext'
import {
  filterNavForOnboardingStage,
  pathsForStatusTourStep,
  pathsForSubmitTourStep,
  showAssistantBuddyForStage,
  showNotificationsForStage,
  showUploadForStage,
  useOnboardingChrome,
} from '../context/OnboardingChromeContext'
import OnboardingTourOverlay from './client/dashboard/OnboardingTourOverlay'
import { SUBMIT_INVOICE_TOUR_STEPS } from './client/dashboard/submitInvoiceTourSteps'
import {
  getFollowOnTourSteps,
  type FollowOnTourKind,
} from './client/dashboard/invoiceStatusTourSteps'
import InvoiceStatusTourOffer from './client/dashboard/InvoiceStatusTourOffer'
import { getTierLabel } from '../utils/clientCapabilities'
import { useClientTheme, useTheme } from '../theme/ThemeContext'
import ThemeToggle from './ThemeToggle'
import CredyxWordmark from './CredyxWordmark'
import AssistantFab from './client/assistant/AssistantFab'
import AssistantHeaderBuddy from './client/assistant/AssistantHeaderBuddy'
import ClientBottomNav from './client/ClientBottomNav'
import { useIsMobileViewport } from '../hooks/useIsMobileViewport'
import { useTenantDataRevision } from '../hooks/useTenantDataRevision'
import '../styles/clientPortal.css'
import '../styles/clientPortalDark.css'
import '../styles/credyxWordmark.css'
import '../styles/clientDashboard.css'

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
  const {
    progressive,
    stage: chromeStage,
    unlockedNavPaths,
    justRevealedNavPaths,
    revealNavPaths,
    submitTourActive,
    submitTourStepIndex,
    nextSubmitTourStep,
    backSubmitTourStep,
    skipSubmitTour,
    completeSubmitTour,
    statusTourOfferVisible,
    statusTourOfferKind,
    showStatusTourOffer,
    dismissStatusTourOffer,
    statusTourActive,
    statusTourKind,
    statusTourStepIndex,
    startBatchTour,
    startStatusTour,
    nextStatusTourStep,
    backStatusTourStep,
    completeStatusTour,
    resetAllOnboardingChrome,
  } = useOnboardingChrome()
  const t = useClientTheme()
  const resolvedClientId = clientId ?? client?.id
  const resolvedClientName = clientName || client?.name || 'Client'
  const tenantRevision = useTenantDataRevision()
  const navSections = useMemo(() => {
    const base = filterClientNavSections(capabilities)
    if (!progressive) return base
    return filterNavForOnboardingStage(base, chromeStage, unlockedNavPaths)
  }, [capabilities, progressive, chromeStage, unlockedNavPaths])
  const showUpload = !progressive || showUploadForStage(chromeStage, unlockedNavPaths)
  const showBuddy = !progressive || showAssistantBuddyForStage(chromeStage, unlockedNavPaths)
  const showNotifs = !progressive || showNotificationsForStage(chromeStage, unlockedNavPaths)
  /** Welcome / about / submit-offer — hide sidebar + topbar entirely. */
  const hidePortalChrome = progressive && chromeStage === 'welcome'
  const submitTourStep = SUBMIT_INVOICE_TOUR_STEPS[submitTourStepIndex]
  const followOnSteps = statusTourKind ? getFollowOnTourSteps(statusTourKind) : []
  const statusTourStep = followOnSteps[statusTourStepIndex]
  const activeFollowOnStep = submitTourActive
    ? submitTourStep
    : statusTourActive
      ? statusTourStep
      : null

  // Apply demo invoice lifecycle + navigate once per follow-on tour step.
  // Pages may strip query params after applying filters — do not re-sync.
  useEffect(() => {
    if (!activeFollowOnStep) return

    if (statusTourActive && statusTourStep) {
      revealNavPaths(pathsForStatusTourStep(statusTourStep.id))
      if (resolvedClientId) {
        const stage = stageForStatusTourStep(statusTourStep.id)
        if (stage) {
          applyTourInvoiceStage(resolvedClientId, resolvedClientName, stage)
        }
        const path = buildStatusTourNavigateTo(statusTourStep, resolvedClientId)
        if (path) {
          navigate(path)
          return
        }
      }
    }

    if (submitTourActive && submitTourStep) {
      revealNavPaths(pathsForSubmitTourStep(submitTourStep.id))
    }

    if (!activeFollowOnStep.navigateTo) return
    navigate(activeFollowOnStep.navigateTo)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on step change
  }, [activeFollowOnStep?.id, navigate, statusTourActive, submitTourActive, resolvedClientId])

  const finishSubmitTour = () => {
    if (resolvedClientId) {
      setOnboardingDashboardPrefs(resolvedClientId, { hasSeenSubmitTour: true })
    }
    completeSubmitTour()
    const prefs = resolvedClientId
      ? getOnboardingDashboardPrefs(resolvedClientId)
      : { hasSeenBatchTour: true, hasSeenInvoiceStatusTour: true }
    // After submit → batches tour, then invoices tour.
    if (!prefs.hasSeenBatchTour) {
      showStatusTourOffer('batch')
    } else if (!prefs.hasSeenInvoiceStatusTour) {
      showStatusTourOffer('invoice')
    }
  }

  const finishStatusTour = () => {
    const kind: FollowOnTourKind = statusTourKind ?? 'invoice'
    if (resolvedClientId) {
      if (kind === 'batch') {
        setOnboardingDashboardPrefs(resolvedClientId, { hasSeenBatchTour: true })
      } else {
        setOnboardingDashboardPrefs(resolvedClientId, { hasSeenInvoiceStatusTour: true })
        cleanupTourInvoice(resolvedClientId)
      }
    }
    completeStatusTour()
    // After batches tour, offer the separate invoices tour once.
    if (kind === 'batch' && resolvedClientId) {
      const prefs = getOnboardingDashboardPrefs(resolvedClientId)
      if (!prefs.hasSeenInvoiceStatusTour) {
        window.setTimeout(() => showStatusTourOffer('invoice'), 0)
      }
    }
  }

  const skipStatusOffer = () => {
    const kind = statusTourOfferKind ?? 'invoice'
    if (resolvedClientId) {
      if (kind === 'batch') {
        setOnboardingDashboardPrefs(resolvedClientId, { hasSeenBatchTour: true })
        const prefs = getOnboardingDashboardPrefs(resolvedClientId)
        dismissStatusTourOffer()
        if (!prefs.hasSeenInvoiceStatusTour) {
          window.setTimeout(() => showStatusTourOffer('invoice'), 0)
        }
        return
      }
      setOnboardingDashboardPrefs(resolvedClientId, { hasSeenInvoiceStatusTour: true })
      cleanupTourInvoice(resolvedClientId)
    }
    dismissStatusTourOffer()
  }
  const { resolvedTheme } = useTheme()
  const isPhoneViewport = useIsMobileViewport()
  const [mobileDrawerMounted, setMobileDrawerMounted] = useState(false)
  const [mobileDrawerVisible, setMobileDrawerVisible] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  /** Phone bottom tabs — tablet keeps hamburger; immersive onboarding hides chrome. */
  const showBottomNav = isPhoneViewport && !hidePortalChrome
  /** Dashboard hosts the menu in the Open Balance row — hide the floating control there. */
  const showFloatingPhoneMenu =
    showBottomNav &&
    !location.pathname.startsWith('/client/dashboard') &&
    !location.pathname.startsWith('/client/onboarding')

  const openMobileDrawer = useCallback(() => {
    setMobileDrawerMounted(true)
  }, [])

  /** Animate panel out, then unmount after the transition finishes. */
  const closeMobileDrawer = useCallback(() => {
    setMobileDrawerVisible(false)
  }, [])

  useEffect(() => {
    const onOpenMenu = () => openMobileDrawer()
    window.addEventListener('credyx:open-client-menu', onOpenMenu)
    return () => window.removeEventListener('credyx:open-client-menu', onOpenMenu)
  }, [openMobileDrawer])

  /** After mount, flip visible on the next frame so CSS can transition in. */
  useEffect(() => {
    if (!mobileDrawerMounted) return
    const frame = requestAnimationFrame(() => {
      requestAnimationFrame(() => setMobileDrawerVisible(true))
    })
    return () => cancelAnimationFrame(frame)
  }, [mobileDrawerMounted])

  /** After close transition, unmount the drawer. */
  useEffect(() => {
    if (mobileDrawerVisible || !mobileDrawerMounted) return
    const timer = window.setTimeout(() => setMobileDrawerMounted(false), 320)
    return () => window.clearTimeout(timer)
  }, [mobileDrawerVisible, mobileDrawerMounted])

  /** Lock background scroll while the phone menu drawer is open. */
  useEffect(() => {
    if (!mobileDrawerMounted) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [mobileDrawerMounted])

  useEffect(() => {
    if (!mobileDrawerMounted) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeMobileDrawer()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mobileDrawerMounted, closeMobileDrawer])

  useEffect(() => {
    if (!resolvedClientId) {
      setNotifications([])
      return
    }
    const refresh = () => setNotifications(getNotificationsForClient(resolvedClientId))
    refresh()
    const unsubNotifs = subscribeClientNotifications(refresh, resolvedClientId)
    const unsubPrefs = subscribeClientNotificationPreferences((clientId) => {
      if (clientId === resolvedClientId) refresh()
    })
    return () => {
      unsubNotifs()
      unsubPrefs()
    }
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

  // Collapsed = icon rail; expanded only when the user clicks Extend (no hover open).
  const sidebarExpanded = !collapsed
  const sidebarWidth = hidePortalChrome
    ? 0
    : sidebarExpanded
      ? t.sidebar.expandedWidth
      : t.sidebar.collapsedWidth
  const mainOffset = sidebarWidth
  /** Fixed icon column = collapsed rail width so icons stay centered while labels slide out. */
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
  }, [resolvedClientId, tenantRevision])

  const heldInvoiceCount = useMemo(() => {
    return mockInvoices.filter(
      (inv) =>
        (!resolvedClientId || inv.client_id === resolvedClientId) &&
        isClientVisibleHold(inv)
    ).length
  }, [resolvedClientId, tenantRevision, notifications])

  const badges: Record<string, number> = {
    pendingBatches: pendingBatchCount,
    heldInvoices: heldInvoiceCount,
  }

  const isNavActive = (path: string) => {
    const [pathOnly, query] = path.split('?')

    if (path.startsWith('mailto:')) return false

    // Onboarding route highlights Dashboard while the progressive tour is active.
    if (
      pathOnly === '/client/dashboard' &&
      location.pathname.startsWith('/client/onboarding')
    ) {
      return true
    }

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
    closeMobileDrawer()
    if (path.startsWith('mailto:')) {
      window.location.href = path
      return
    }
    // During onboarding tour, keep "Dashboard" on the onboarding experience.
    if (progressive && path.split('?')[0] === '/client/dashboard') {
      navigate('/client/onboarding')
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
    closeMobileDrawer()
  }

  const sidebarContent = (isMobile = false) => {
    // Tooltips on icon rail only when labels are hidden.
    const tip = (label: string) =>
      !isMobile && collapsed ? label : undefined

    return (
    <div className={`flex flex-col h-full overflow-hidden${isMobile ? ' client-mobile-drawer__content' : ''}`}>
      {/* Brand — full logo when expanded; C mark in collapsed rail */}
      <div
        className={`flex items-center border-b${isMobile ? ' client-mobile-drawer__brand' : ''}`}
        style={{ borderColor: t.sidebar.border, minHeight: isMobile ? 56 : sidebarExpanded ? 64 : 52 }}
      >
        {sidebarExpanded || isMobile ? (
          <div className={isMobile ? 'client-mobile-drawer__brand-logo' : 'min-w-0 flex-1 px-3 py-2'}>
            <CredyxWordmark
              variant="compact"
              theme="client"
              surface={resolvedTheme === 'dark' ? 'on-dark' : 'on-light'}
              onClick={() => {
                if (isMobile) closeMobileDrawer()
                navigate('/client/dashboard')
              }}
            />
          </div>
        ) : (
          <div
            className="shrink-0 flex items-center justify-center w-full"
            style={{ width: iconColWidth }}
          >
            <CredyxWordmark
              variant="mark"
              theme="client"
              onClick={() => navigate('/client/dashboard')}
            />
          </div>
        )}
      </div>

      {/* Company context — desktop sidebar only */}
      {!isMobile ? (
        <div className="border-b" style={{ borderColor: t.sidebar.border }}>
          <div className="flex items-center min-w-0 py-2">
            <div
              className="shrink-0 flex items-center justify-center"
              style={{ width: iconColWidth }}
              title={tip(resolvedClientName)}
            >
              <div
                className="w-7 h-7 text-[10px] rounded-full flex items-center justify-center font-semibold"
                style={{ backgroundColor: t.sidebar.avatarBg, color: t.sidebar.avatarText }}
              >
                {getInitials(resolvedClientName)}
              </div>
            </div>
            <div className="min-w-0 flex-1 overflow-hidden whitespace-nowrap pr-3">
              <div className="text-[13px] font-semibold truncate leading-tight" style={{ color: t.sidebar.text }}>
                {resolvedClientName}
              </div>
              <div className="text-[11px] truncate leading-tight" style={{ color: t.sidebar.muted }}>
                {getTierLabel(tier)}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Navigation */}
      <nav className={`client-sidebar-nav-scroll${isMobile ? ' client-mobile-drawer__nav' : ''} space-y-1`}>
        {navSections.map((section, sectionIndex) => (
          <div key={section.title || `section-${sectionIndex}`}>
            {section.title ? (
              <div
                className={`${isMobile ? 'mb-1 mt-2 px-4 text-[11px]' : 'mb-0.5 px-3 text-[10px]'} font-semibold tracking-wider uppercase whitespace-nowrap overflow-hidden`}
                style={{
                  color: t.sidebar.muted,
                  height: isMobile ? 'auto' : '0.875rem',
                  // Keep row height when collapsed so expand doesn't shove items down.
                  opacity: sidebarExpanded || isMobile ? 1 : 0,
                }}
                aria-hidden={!sidebarExpanded && !isMobile}
              >
                {section.title}
              </div>
            ) : null}
            <ul className={isMobile ? 'space-y-1' : 'space-y-px'}>
              {section.items.map((item) => {
                const active = isNavActive(item.path)
                const Icon = item.icon
                const badge = item.badgeKey ? badges[item.badgeKey] : 0
                const badgeColor =
                  item.badgeTone === 'danger' ? t.error : t.sidebar.badge
                const showLabels = sidebarExpanded || isMobile
                // Icon column matches rail width minus the shared 8px inset on each side,
                // so left offset stays identical while collapsed ↔ expanded.
                const navIconColWidth = isMobile ? 44 : iconColWidth - 16

                return (
                  <li key={item.path}>
                    <button
                      type="button"
                      onClick={() => handleNavClick(item.path)}
                      title={tip(item.label)}
                      data-onboard-target={
                        item.path.startsWith('/client/batches?tab=create')
                          ? 'navSubmitDocs'
                          : item.path === '/client/invoices'
                            ? 'navInvoices'
                            : item.path === '/client/batches'
                              ? 'navBatches'
                              : item.path === '/client/documents'
                                ? 'navDocuments'
                                : item.path === '/client/collections'
                                  ? 'navCollections'
                                  : item.path === '/client/brokers'
                                    ? 'navBrokers'
                                    : item.path === '/client/assistant'
                                      ? 'navAssistant'
                                      : item.path === '/client/payments'
                                        ? 'navPayments'
                                        : item.path === '/client/short-payments'
                                          ? 'navShortPayments'
                                          : item.path === '/client/reports'
                                            ? 'navReports'
                                            : item.path === '/client/tutorials'
                                              ? 'navTutorials'
                                              : item.path === '/client/settings'
                                                ? 'navSettings'
                                                : item.path === '/client/dashboard'
                                                  ? 'navDashboard'
                                                  : undefined
                      }
                      className={`client-sidebar-nav-item w-full flex items-center transition-colors duration-200${
                        isMobile ? ' client-sidebar-nav-item--mobile text-[15px]' : ' text-[13px]'
                      }${
                        progressive && justRevealedNavPaths.includes(item.path)
                          ? ' client-sidebar-nav-item--onboard-reveal'
                          : ''
                      }`}
                      style={{
                        backgroundColor: active ? t.sidebar.active : 'transparent',
                        color: active ? t.sidebar.activeText : t.sidebar.muted,
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
                          style={{ color: active ? t.sidebar.activeText : t.mutedLight }}
                        />
                        {/* Collapsed rail: keep count visible on the icon */}
                        {badge > 0 && !showLabels && (
                          <span
                            className="client-sidebar-nav-item__badge"
                            style={{ backgroundColor: badgeColor }}
                          >
                            {badge > 9 ? '9+' : badge}
                          </span>
                        )}
                      </span>
                      <span className={`flex-1 min-w-0 text-left truncate whitespace-nowrap pr-3${isMobile ? ' py-3' : ' py-1'}`}>
                        {item.label}
                      </span>
                      {badge > 0 && showLabels && (
                        <span
                          className={`${isMobile ? 'mr-3 min-w-[22px] h-5 text-[11px]' : 'mr-3 min-w-[18px] h-4 text-[9px]'} px-1.5 flex items-center justify-center rounded-full font-bold text-white shrink-0`}
                          style={{ backgroundColor: badgeColor }}
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
        <div className="pb-1">
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
            <span className="whitespace-nowrap truncate py-1.5 pr-3">
              {collapsed ? 'Extend' : 'Collapse'}
            </span>
          </button>
        </div>
      )}

      {/* User profile */}
      <div className={`${isMobile ? 'py-3' : 'py-2'} border-t relative`} style={{ borderColor: t.sidebar.border }}>
        <button
          type="button"
          onClick={() => setUserMenuOpen((open) => !open)}
          className={`w-full flex items-center transition-colors${isMobile ? ' min-h-[52px]' : ''}`}
          style={{ color: t.sidebar.text }}
          title={tip(userDisplayName)}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = t.sidebar.hover
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent'
          }}
        >
          <span
            className={`shrink-0 flex items-center justify-center self-stretch${isMobile ? ' py-2' : ' py-1.5'}`}
            style={{ width: isMobile ? 48 : iconColWidth }}
          >
            <div
              className={`${isMobile ? 'w-9 h-9 text-[11px]' : 'w-7 h-7 text-[10px]'} rounded-full flex items-center justify-center font-semibold`}
              style={{ backgroundColor: t.sidebar.avatarBg, color: t.sidebar.avatarText }}
            >
              {getInitials(userDisplayName)}
            </div>
          </span>
          <div className={`flex-1 min-w-0 text-left overflow-hidden whitespace-nowrap pr-1${isMobile ? ' py-2' : ' py-1.5'}`}>
            <div className={`${isMobile ? 'text-[15px]' : 'text-[13px]'} font-semibold truncate leading-tight`}>{userDisplayName}</div>
            <div className={`${isMobile ? 'text-[12px]' : 'text-[11px]'} truncate leading-tight`} style={{ color: t.sidebar.muted }}>
              {userRole === 'Client' ? 'A/R Manager' : userRole}
            </div>
          </div>
          <ChevronDown
            className={`w-3.5 h-3.5 shrink-0 mr-3 transition-transform duration-150 ${
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
      className={`client-portal flex h-screen overflow-hidden${
        hidePortalChrome ? ' client-portal--onboard-immersive' : ''
      }${showBottomNav ? ' client-portal--bottom-nav' : ''}`}
      data-theme={resolvedTheme}
      style={{ backgroundColor: t.surface, ['--sidebar-width' as string]: `${mainOffset}px` }}
    >
      {/* Desktop sidebar — expand/collapse via Extend control only (no hover open) */}
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

      {/* Mobile sidebar overlay — phone-friendly drawer */}
      {mobileDrawerMounted ? (
        <div
          className={`client-mobile-drawer lg:hidden${mobileDrawerVisible ? ' is-visible' : ''}`}
          role="presentation"
        >
          <button
            type="button"
            className="client-mobile-drawer__backdrop"
            onClick={closeMobileDrawer}
            aria-label="Close menu"
          />
          <aside
            className="client-mobile-drawer__panel"
            role="dialog"
            aria-modal="true"
            aria-label="Navigation menu"
            style={{
              backgroundColor: t.sidebar.bg,
              borderColor: t.sidebar.border,
            }}
          >
            <button
              type="button"
              onClick={closeMobileDrawer}
              className="client-mobile-drawer__close"
              style={{ color: t.sidebar.text }}
              aria-label="Close menu"
            >
              <X className="w-5 h-5" strokeWidth={2} aria-hidden />
            </button>
            {sidebarContent(true)}
          </aside>
        </div>
      ) : null}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden transition-[margin] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] lg:ml-[var(--sidebar-width)]">
        {showFloatingPhoneMenu ? (
          <button
            type="button"
            className="client-phone-menu-btn"
            onClick={openMobileDrawer}
            aria-label="Open menu"
            aria-expanded={mobileDrawerVisible}
          >
            <Menu className="w-5 h-5" strokeWidth={1.75} aria-hidden />
          </button>
        ) : null}

        {!showBottomNav ? (
          <header
            className="client-topbar sticky top-0 z-30 border-b"
            style={{ borderColor: t.border, backgroundColor: t.sidebar.bg }}
          >
            <button
              type="button"
              onClick={openMobileDrawer}
              className="client-topbar__menu-btn lg:hidden p-2 -ml-1 rounded-lg client-header-icon-btn shrink-0"
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

            <div className="client-topbar__actions">
              {location.pathname.startsWith('/client/onboarding') ? (
                <button
                  type="button"
                  className="client-header-icon-btn p-2 rounded-lg shrink-0"
                  style={{ color: t.primary }}
                  title="Replay onboarding tour"
                  aria-label="Replay onboarding tour"
                  onClick={() => {
                    if (resolvedClientId) {
                      resetOnboardingDashboardPrefs(resolvedClientId)
                      cleanupTourInvoice(resolvedClientId)
                    }
                    resetAllOnboardingChrome()
                    if (!location.pathname.startsWith('/client/onboarding')) {
                      navigate('/client/onboarding')
                    }
                    // Let OnboardingDashboard remount tour state (same-tab).
                    window.setTimeout(() => dispatchReplayOnboardingTour(), 0)
                  }}
                >
                  <RefreshCw className="w-4 h-4" strokeWidth={1.75} />
                </button>
              ) : null}
              {showBuddy ? (
                <div className="hidden lg:block shrink-0 client-topbar__onboard-reveal">
                  <AssistantHeaderBuddy mode="client" />
                </div>
              ) : null}
              <div className="hidden lg:block shrink-0">
                <ThemeToggle compact />
              </div>
              {showNotifs ? (
                <div className="client-topbar__onboard-reveal">
                  <NotificationBell
                    notifications={notifications}
                    onMarkAsRead={handleMarkAsRead}
                    onMarkAllAsRead={handleMarkAllAsRead}
                    onNotificationClick={handleNotificationClick}
                  />
                </div>
              ) : null}
              {showUpload &&
              (capabilities.canCreateBatch || capabilities.canSubmitDocHandoff) ? (
                <button
                  type="button"
                  onClick={() => navigate('/client/batches?tab=create')}
                  data-onboard-target="navUpload"
                  className="client-topbar__upload-btn client-topbar__onboard-reveal inline-flex items-center gap-1.5 rounded-lg text-xs font-semibold transition-colors dashboard-btn-primary shrink-0"
                  aria-label="Submit documents"
                >
                  <Upload className="w-4 h-4" />
                  {capabilities.canCreateBatch ? 'Upload' : 'Send docs'}
                </button>
              ) : null}
            </div>
          </header>
        ) : null}

        <main
          className={`flex-1 w-full min-h-0 min-w-0 ${
            flushMain
              ? 'client-main--flush overflow-hidden'
              : 'client-shell-scroll p-5 overflow-y-auto'
          }`}
        >
          {children}
        </main>

        {showBottomNav ? (
          <ClientBottomNav
            isNavActive={isNavActive}
            onNavigate={handleNavClick}
            badges={{
              pendingBatches: pendingBatchCount,
              heldInvoices: heldInvoiceCount,
            }}
            showUpload={showUpload}
            canUpload={capabilities.canCreateBatch || capabilities.canSubmitDocHandoff}
            showNotifications={showNotifs}
            notifications={notifications}
            onMarkAsRead={handleMarkAsRead}
            onMarkAllAsRead={handleMarkAllAsRead}
            onNotificationClick={handleNotificationClick}
          />
        ) : null}
      </div>

      {submitTourActive && submitTourStep ? (
        <OnboardingTourOverlay
          step={submitTourStep}
          stepIndex={submitTourStepIndex}
          stepCount={SUBMIT_INVOICE_TOUR_STEPS.length}
          onNext={() => {
            if (submitTourStepIndex >= SUBMIT_INVOICE_TOUR_STEPS.length - 1) {
              finishSubmitTour()
            } else {
              nextSubmitTourStep()
            }
          }}
          onBack={backSubmitTourStep}
          onSkip={finishSubmitTour}
          finishLabel="Done"
        />
      ) : null}

      {statusTourOfferVisible ? (
        <InvoiceStatusTourOffer
          kind={statusTourOfferKind ?? 'invoice'}
          onStart={statusTourOfferKind === 'batch' ? startBatchTour : startStatusTour}
          onSkip={skipStatusOffer}
        />
      ) : null}

      {statusTourActive && statusTourStep ? (
        <OnboardingTourOverlay
          step={statusTourStep}
          stepIndex={statusTourStepIndex}
          stepCount={followOnSteps.length}
          onNext={() => {
            if (statusTourStepIndex >= followOnSteps.length - 1) {
              finishStatusTour()
            } else {
              nextStatusTourStep()
            }
          }}
          onBack={backStatusTourStep}
          onSkip={finishStatusTour}
          finishLabel="Done"
        />
      ) : null}

      {!hidePortalChrome ? <AssistantFab /> : null}
    </div>
  )
}
