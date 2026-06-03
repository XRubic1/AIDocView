import { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import FactorFoxSidebar from '../loadReview/factorfox/FactorFoxSidebar'
import '../../styles/engine.css'

interface EngineLayoutProps {
  children: ReactNode
  headerActions?: ReactNode
  breadcrumb?: ReactNode
  /** Legacy pages: title block in top bar (non-workbench). */
  headerTitle?: ReactNode
  showMobileBrand?: boolean
  fillViewport?: boolean
  reviewQueueCount?: number
}

/** AIDocView engine shell — top bar + sidebar + main (mockup layout). */
export default function EngineLayout({
  children,
  headerActions,
  breadcrumb,
  showMobileBrand = true,
  fillViewport = false,
  headerTitle,
  reviewQueueCount,
}: EngineLayoutProps) {
  if (fillViewport) {
    return (
      <div className="engine-app min-h-screen flex flex-col h-screen max-h-screen overflow-hidden">
        <header className="engine-topbar">
          <Link to="/" className="engine-topbar-logo no-underline">
            AI<span>Doc</span>View
          </Link>
          <div className="engine-topbar-breadcrumb">
            {breadcrumb ?? (
              <>
                <span>Review Engine</span>
                <span className="sep">/</span>
                <span className="active">Queue</span>
              </>
            )}
          </div>
          {headerActions ? <div className="engine-topbar-actions">{headerActions}</div> : null}
        </header>

        <div className="engine-body flex-1 min-h-0">
          <FactorFoxSidebar embedded reviewQueueCount={reviewQueueCount} />
          <main className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden">{children}</main>
        </div>
      </div>
    )
  }

  return (
    <div className="engine-app min-h-screen flex" style={{ backgroundColor: '#0c0c0b', color: '#eceae2' }}>
      <FactorFoxSidebar />
      <div className="flex-1 flex flex-col min-w-0">
        {showMobileBrand && (
          <div className="md:hidden flex-shrink-0 border-b px-4 py-3 engine-topbar" style={{ height: 'auto' }}>
            <Link to="/" className="engine-topbar-logo no-underline" style={{ width: 'auto', border: 'none' }}>
              AI<span>Doc</span>View
            </Link>
          </div>
        )}
        {(headerActions || breadcrumb || headerTitle) && (
          <header className="engine-topbar">
            <div className="engine-topbar-breadcrumb flex-1">{breadcrumb ?? headerTitle}</div>
            {headerActions ? <div className="engine-topbar-actions">{headerActions}</div> : null}
          </header>
        )}
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  )
}
