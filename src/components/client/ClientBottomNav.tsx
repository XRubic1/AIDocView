import {
  FileText,
  Home,
  Sparkles,
  Upload,
  type LucideIcon,
} from 'lucide-react'
import type { Notification } from '../../types/notification'
import { requestAssistantOpen } from '../../utils/assistantFabPlacement'
import NotificationBell from '../NotificationBell'

export interface ClientBottomNavBadges {
  pendingBatches: number
  heldInvoices: number
}

interface ClientBottomNavProps {
  /** Whether the current route matches a nav path (incl. query rules). */
  isNavActive: (path: string) => boolean
  onNavigate: (path: string) => void
  badges: ClientBottomNavBadges
  /** Hide upload when onboarding / capabilities block it. */
  showUpload: boolean
  canUpload: boolean
  /** Show notification bell as a primary tab (phone chrome). */
  showNotifications?: boolean
  notifications?: Notification[]
  onMarkAsRead?: (id: string) => void
  onMarkAllAsRead?: () => void
  onNotificationClick?: (notification: Notification) => void
}

interface SideTab {
  id: string
  label: string
  path: string
  icon: LucideIcon
  badgeKey?: keyof ClientBottomNavBadges
  badgeTone?: 'default' | 'danger'
}

/** Primary phone tabs — Batches lives in the menu; AI opens the assistant. */
const SIDE_TABS: SideTab[] = [
  { id: 'home', label: 'Home', path: '/client/dashboard-v2', icon: Home },
  {
    id: 'invoices',
    label: 'Invoices',
    path: '/client/invoices',
    icon: FileText,
    badgeKey: 'heldInvoices',
    badgeTone: 'danger',
  },
]

/**
 * Phone-only bottom tab bar with an elevated Upload action in the center.
 * Desktop / tablet continue using the sidebar + hamburger drawer.
 * More menu lives top-left on phone (`client-phone-menu-btn`).
 */
export default function ClientBottomNav({
  isNavActive,
  onNavigate,
  badges,
  showUpload,
  canUpload,
  showNotifications = false,
  notifications = [],
  onMarkAsRead,
  onMarkAllAsRead,
  onNotificationClick,
}: ClientBottomNavProps) {
  const leftTabs = SIDE_TABS
  const uploadEnabled = showUpload && canUpload
  const uploadActive = Boolean(isNavActive('/client/batches?tab=create'))
  const aiActive = Boolean(isNavActive('/client/assistant'))
  const showBell =
    showNotifications && onMarkAsRead && onMarkAllAsRead && onNotificationClick

  const renderTab = (tab: SideTab) => {
    const active = Boolean(isNavActive(tab.path))
    const Icon = tab.icon
    const badge = tab.badgeKey ? badges[tab.badgeKey] : 0

    return (
      <button
        key={tab.id}
        type="button"
        className={`client-bottom-nav__tab${active ? ' client-bottom-nav__tab--active' : ''}`}
        onClick={() => onNavigate(tab.path)}
        aria-label={tab.label}
        aria-current={active ? 'page' : undefined}
        data-onboard-target={
          tab.path === '/client/invoices'
            ? 'navInvoices'
            : tab.path === '/client/dashboard-v2' || tab.path === '/client/dashboard'
              ? 'navDashboard'
              : undefined
        }
      >
        <span className="client-bottom-nav__icon-wrap">
          <Icon className="client-bottom-nav__icon" strokeWidth={2} aria-hidden />
          {badge > 0 ? (
            <span
              className={`client-bottom-nav__badge${
                tab.badgeTone === 'danger' ? ' client-bottom-nav__badge--danger' : ''
              }`}
            >
              {badge > 9 ? '9+' : badge}
            </span>
          ) : null}
        </span>
        <span className="client-bottom-nav__label">{tab.label}</span>
      </button>
    )
  }

  return (
    <nav
      className={`client-bottom-nav${showBell ? ' client-bottom-nav--with-notifs' : ''}`}
      aria-label="Primary"
    >
      <div className="client-bottom-nav__inner">
        {leftTabs.map(renderTab)}

        <div className="client-bottom-nav__center">
          <button
            type="button"
            className={`client-bottom-nav__upload${
              !uploadEnabled ? ' client-bottom-nav__upload--disabled' : ''
            }${uploadActive ? ' client-bottom-nav__upload--active' : ''}`}
            onClick={() => {
              if (!uploadEnabled) return
              onNavigate('/client/batches?tab=create')
            }}
            disabled={!uploadEnabled}
            aria-label="Upload documents"
            aria-current={uploadActive ? 'page' : undefined}
            title="Upload documents"
            data-onboard-target="navUpload"
          >
            <Upload className="client-bottom-nav__upload-icon" strokeWidth={2.25} aria-hidden />
          </button>
          <span
            className={`client-bottom-nav__upload-label${
              uploadActive ? ' client-bottom-nav__upload-label--active' : ''
            }`}
          >
            Upload
          </span>
        </div>

        <button
          type="button"
          className={`client-bottom-nav__tab${aiActive ? ' client-bottom-nav__tab--active' : ''}`}
          onClick={() => requestAssistantOpen()}
          aria-label="Ask AI"
          aria-current={aiActive ? 'page' : undefined}
          data-onboard-target="navAssistant"
        >
          <span className="client-bottom-nav__icon-wrap">
            <Sparkles className="client-bottom-nav__icon" strokeWidth={2} aria-hidden />
          </span>
          <span className="client-bottom-nav__label">AI</span>
        </button>

        {showBell ? (
          <NotificationBell
            variant="bottom-nav"
            notifications={notifications}
            onMarkAsRead={onMarkAsRead}
            onMarkAllAsRead={onMarkAllAsRead}
            onNotificationClick={onNotificationClick}
          />
        ) : null}
      </div>
    </nav>
  )
}
