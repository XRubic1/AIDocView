import { Link, useLocation } from 'react-router-dom'
import { FileText, History, Home, Settings } from 'lucide-react'

const NAV = [
  { to: '/engine', label: 'Review', icon: FileText },
  { to: '/dev/load-history', label: 'History', icon: History },
  { to: '/engine/settings', label: 'Settings', icon: Settings },
] as const

const DOC_TAGS = ['BOL', 'Invoice', 'POD', 'Rate Con', 'Lumper'] as const

interface FactorFoxSidebarProps {
  /** Inside workbench body (no duplicate logo — top bar has brand). */
  embedded?: boolean
  reviewQueueCount?: number
}

export default function FactorFoxSidebar({ embedded = false, reviewQueueCount }: FactorFoxSidebarProps) {
  const location = useLocation()

  return (
    <aside className={embedded ? 'engine-sidebar hidden md:flex' : 'engine-sidebar hidden md:flex min-h-screen'}>
      {!embedded && (
        <Link to="/" className="px-5 py-6 block no-underline engine-topbar-logo" style={{ width: '100%', borderRight: 'none' }}>
          AI<span>Doc</span>View
        </Link>
      )}

      <nav className="engine-sidebar-nav">
        {NAV.map(({ to, label, icon: Icon }) => {
          const active =
            location.pathname === to ||
            (to === '/engine' &&
              (location.pathname === '/engine' || location.pathname.startsWith('/dev/load-review'))) ||
            (to === '/engine/settings' && location.pathname.startsWith('/engine/settings'))

          return (
            <Link key={to} to={to} className={`engine-snav-item ${active ? 'active' : ''}`}>
              <Icon className="w-3.5 h-3.5 opacity-70" strokeWidth={2} />
              {label}
              {label === 'Review' && reviewQueueCount != null && reviewQueueCount > 0 ? (
                <span className="engine-snav-badge">{reviewQueueCount}</span>
              ) : null}
            </Link>
          )
        })}
      </nav>

      <div className="engine-sidebar-footer">
        <Link
          to="/"
          className="engine-snav-item mb-2"
          style={{ padding: '6px 0', borderLeft: 'none' }}
        >
          <Home className="w-3.5 h-3.5" />
          Marketing site
        </Link>
        <div className="engine-sidebar-footer-label">Doc types</div>
        <div className="engine-doc-tags">
          {DOC_TAGS.map((tag) => (
            <span key={tag} className="engine-doc-tag">
              {tag}
            </span>
          ))}
        </div>
      </div>
    </aside>
  )
}
