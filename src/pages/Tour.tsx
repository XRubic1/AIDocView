import { useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  BarChart3,
  FileText,
  FolderOpen,
  LayoutDashboard,
  Shield,
  Wallet,
} from 'lucide-react'
import '../styles/credyxMarketing.css'
import '../styles/credyxWaitlistSales.css'
import { useRevealOnScroll } from '../hooks/useRevealOnScroll'
import { useWebsiteAnalytics } from '../hooks/useWebsiteAnalytics'
import { trackWebsiteEvent } from '../services/websiteAnalytics'
import { MarketingHeader } from '../components/enroll/MarketingHeader'
import { WaitlistForm } from '../components/enroll/WaitlistForm'
import { getClientLoginHref } from '../utils/clientLoginRedirect'

const isMarketingOnly = import.meta.env.VITE_MARKETING_ONLY === 'true'

const TOUR_STOPS = [
  {
    icon: LayoutDashboard,
    title: 'Operations dashboard',
    description:
      'See total A/R, invoice status counts, and items needing attention the moment you log in.',
    highlights: ['Live A/R total', 'Pending / approved / hold counts', 'Recent activity feed'],
  },
  {
    icon: FolderOpen,
    title: 'Batch workflow',
    description:
      'Group loads into batches, upload PODs and rate cons, and track each batch through review.',
    highlights: ['Drag-and-drop uploads', 'Status per batch', 'Document vault access'],
  },
  {
    icon: FileText,
    title: 'Invoice tracking',
    description:
      'Every invoice in one sortable list — amount, broker, days outstanding, and approval status.',
    highlights: ['Filter by status', 'Sortable columns', 'Detail workspace per invoice'],
  },
  {
    icon: Wallet,
    title: 'Payments & collections',
    description:
      'Recorded payments, short-pay variances, and aging A/R so you always know what is still open.',
    highlights: ['Payment history', 'Variance flags', 'Aging buckets'],
  },
  {
    icon: BarChart3,
    title: 'Reports & cash flow',
    description:
      'Period summaries, cash flow trends, collection forecasts, and exportable CSV packs.',
    highlights: ['Overview KPIs', 'A/R aging charts', 'Cash flow forecast'],
  },
  {
    icon: Shield,
    title: 'Secure client portal',
    description:
      'Role-based access for your team with a clean, finance-grade interface on desktop and mobile.',
    highlights: ['Client login', 'Notification center', 'Settings & preferences'],
  },
] as const

const PORTAL_STATS = [
  { value: 'Real-time', label: 'A/R visibility' },
  { value: 'Minutes', label: 'Invoice turnaround' },
  { value: '24/7', label: 'Portal access' },
]

/** Credyx product tour — marketing walkthrough of the client portal (sales site styling). */
export default function Tour() {
  const navigate = useNavigate()
  const pageRef = useRef<HTMLDivElement>(null)
  useRevealOnScroll(pageRef)
  useWebsiteAnalytics()

  const scrollToDemo = (source: string) => {
    trackWebsiteEvent('cta_click', source)
    document.getElementById('waitlist-form')?.scrollIntoView({ behavior: 'smooth' })
  }

  const goToClientLogin = (source: string) => {
    trackWebsiteEvent(source.startsWith('footer') ? 'nav_click' : 'cta_click', source)
    if (isMarketingOnly) {
      window.location.assign(getClientLoginHref())
      return
    }
    navigate('/client/login')
  }

  return (
    <div ref={pageRef} className="credyx-page credyx-page--waitlist credyx-page--sales">
      <MarketingHeader />

      {/* ── Hero ── */}
      <header className="cx-sales-hero" id="top">
        <svg className="cx-sales-hero-arrow" viewBox="0 0 400 400" aria-hidden>
          <path d="M400 0 L318 24 L352 58 L198 220 L148 170 L0 340 L42 382 L152 252 L202 302 L372 90 L400 128 Z" />
        </svg>
        <div className="cx-sales-hero2">
          <div>
            <span className="cx-sales-pill reveal">Product tour</span>
            <h1 className="reveal">
              Your back office, <span className="cx-sales-b">in one portal.</span>
            </h1>
            <div className="cx-sales-bar reveal" />
            <p className="cx-sales-lead reveal">
              Submit documents, track invoices, monitor collections, and understand cash flow,
              without spreadsheets or guesswork.
            </p>
            <div className="cx-sales-hero-actions reveal">
              <button
                type="button"
                className="cx-btn-primary"
                onClick={() => scrollToDemo('tour_hero_demo')}
              >
                Schedule Demo
                <ArrowRight size={17} />
              </button>
              <button
                type="button"
                className="cx-btn-secondary"
                onClick={() => goToClientLogin('tour_hero_login')}
              >
                Client login
              </button>
            </div>
          </div>
          <div className="reveal">
            <div className="cx-sales-pnl cx-tour-stats">
              <div className="cx-sales-pt2">
                <span>The portal</span>
                <span className="cx-sales-ex">At a glance</span>
              </div>
              {PORTAL_STATS.map((stat) => (
                <div key={stat.label} className="cx-tour-stat">
                  <span className="cx-tour-stat-num">{stat.value}</span>
                  <span className="cx-tour-stat-label">{stat.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </header>

      {/* ── Inside the portal ── */}
      <section id="inside" className="cx-sales-section cx-sales-how">
        <div className="cx-sales-wrap">
          <span className="cx-sales-pill reveal">Inside the portal</span>
          <h2 className="reveal">
            Six areas. <span className="cx-sales-b">Complete control.</span>
          </h2>
          <p className="cx-sales-lead reveal">
            What your team sees after onboarding, from the dashboard to reports.
          </p>
          <div className="cx-sales-grid5 cx-tour-grid reveal">
            {TOUR_STOPS.map((stop, index) => (
              <article key={stop.title} className="cx-sales-card">
                <div className="cx-tour-card-top">
                  <div className="n">{String(index + 1).padStart(2, '0')}</div>
                  <stop.icon className="cx-tour-card-icon" size={22} aria-hidden />
                </div>
                <h3>{stop.title}</h3>
                <p>{stop.description}</p>
                <ul className="cx-tour-list">
                  {stop.highlights.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── Schedule demo ── */}
      <section id="waitlist-form" className="cx-sales-section cx-sales-cta">
        <div className="cx-sales-wrap cx-sales-cta-cols">
          <div>
            <span className="cx-sales-pill reveal">Schedule Demo</span>
            <h2 className="reveal">
              See it with your <span className="cx-sales-b">freight.</span>
            </h2>
            <p className="cx-sales-lead reveal" style={{ margin: '24px 0 0' }}>
              Tell us about your fleet. We&apos;ll walk through the portal with your operation in
              mind.
            </p>
          </div>
          <div className="reveal">
            <WaitlistForm />
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="cx-footer">
        <div className="cx-footer-brand">
          <img
            src="/credyx-logo-white-cred-no-bg.png"
            alt="Credyx"
            className="cx-footer-logo"
            width={107}
            height={28}
          />
        </div>
        <div className="cx-footer-links">
          {!isMarketingOnly && (
            <button
              type="button"
              className="cx-footer-link"
              onClick={() => {
                trackWebsiteEvent('nav_click', 'footer_how')
                navigate('/how-it-works')
              }}
            >
              How it works
            </button>
          )}
          <button
            type="button"
            className="cx-footer-link"
            onClick={() => goToClientLogin('footer_client_login')}
          >
            Client login
          </button>
          <button
            type="button"
            className="cx-footer-link"
            onClick={() => {
              trackWebsiteEvent('nav_click', 'footer_privacy')
              navigate('/privacy')
            }}
          >
            Privacy
          </button>
          <button
            type="button"
            className="cx-footer-link"
            onClick={() => {
              trackWebsiteEvent('nav_click', 'footer_terms')
              navigate('/terms')
            }}
          >
            Terms
          </button>
        </div>
        <div className="cx-footer-copy">
          © {new Date().getFullYear()} Credyx A/R Solutions. All rights reserved.
        </div>
        <p className="cx-footer-mission">
          Empowering truckers. Simplifying payments. Driving success.
        </p>
      </footer>
    </div>
  )
}
