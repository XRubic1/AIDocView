import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { MarketingHeader } from './MarketingHeader'
import '../../styles/credyxMarketing.css'

interface LegalPageShellProps {
  title: string
  /** Shown under the title (e.g. effective date). */
  subtitle?: string
  children: ReactNode
}

/**
 * Shared marketing shell for public legal pages (/privacy, /terms).
 * Uses the waitlist marketing header so marketing-only deploys stay consistent.
 */
export function LegalPageShell({ title, subtitle, children }: LegalPageShellProps) {
  const year = new Date().getFullYear()

  return (
    <div className="credyx-page credyx-page--waitlist credyx-page--legal">
      <MarketingHeader />

      <main className="cx-legal">
        <div className="cx-legal-inner">
          <p className="cx-eyebrow">Legal</p>
          <h1 className="cx-legal-title">{title}</h1>
          {subtitle ? <p className="cx-legal-meta">{subtitle}</p> : null}
          <div className="cx-legal-body">{children}</div>
        </div>
      </main>

      <footer className="cx-footer">
        <div className="cx-footer-brand">
          <img
            src="/credyx-logo-white-cred-no-bg.png"
            alt="Credyx"
            className="cx-footer-logo"
            width={320}
            height={84}
          />
        </div>
        <div className="cx-footer-links">
          <Link to="/privacy" className="cx-footer-link">
            Privacy
          </Link>
          <Link to="/terms" className="cx-footer-link">
            Terms
          </Link>
        </div>
        <div className="cx-footer-copy">
          © {year} Credyx A/R Solutions. All rights reserved.
        </div>
      </footer>
    </div>
  )
}
