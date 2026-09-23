import { useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  BarChart3,
  FileText,
  FolderOpen,
  LayoutDashboard,
  Shield,
  Truck,
  Wallet,
} from 'lucide-react'
import '../styles/credyxMarketing.css'
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

/** Credyx product tour — marketing walkthrough of the client portal. */
export default function Tour() {
  const navigate = useNavigate()
  const pageRef = useRef<HTMLDivElement>(null)
  useRevealOnScroll(pageRef)
  useWebsiteAnalytics()

  const scrollToDemo = (source: string) => {
    trackWebsiteEvent('cta_click', source)
    document.getElementById('waitlist-form')?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <div ref={pageRef} className="credyx-page credyx-page--waitlist">
      <MarketingHeader />

      <section className="cx-hero">
        <div className="cx-mesh" aria-hidden />
        <div className="cx-hero-inner">
          <p className="cx-badge hero-enter hero-enter-1">Product tour</p>
          <h1 className="cx-hero-headline hero-enter hero-enter-2">
            Your back office,{' '}
            <span className="accent cx-hand-underline cx-hand-underline--v8">in one portal</span>
          </h1>
          <p className="cx-hero-sub hero-enter hero-enter-3">
            Credyx gives carriers a single place to submit documents, track invoices, monitor
            collections, and understand cash flow —{' '}
            <strong>without spreadsheets or guesswork.</strong>
          </p>
          <div className="cx-hero-buttons hero-enter hero-enter-4">
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
              onClick={() => {
                trackWebsiteEvent('cta_click', 'tour_hero_login')
                if (isMarketingOnly) {
                  window.location.assign(getClientLoginHref())
                  return
                }
                navigate('/client/login')
              }}
            >
              Client login
            </button>
          </div>

          <div className="cx-hero-stats hero-enter hero-enter-5">
            {PORTAL_STATS.map((stat) => (
              <div key={stat.label} className="cx-hero-stat">
                <div className="cx-hero-stat-num">{stat.value}</div>
                <div className="cx-hero-stat-label">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="cx-section bordered">
        <div className="cx-section-inner">
          <div className="cx-section-head centered reveal">
            <p className="cx-eyebrow" style={{ justifyContent: 'center', width: '100%' }}>
              Inside the portal
            </p>
            <h2 className="cx-section-title">
              Six areas.{' '}
              <span className="accent cx-hand-underline cx-hand-underline--v2">
                Complete control.
              </span>
            </h2>
            <p className="cx-section-sub">
              Walk through what your team sees after onboarding — from the dashboard to reports.
            </p>
          </div>

          <div className="cx-card-grid reveal">
            {TOUR_STOPS.map((stop, index) => (
              <article key={stop.title} className="cx-card">
                <div className="cx-card-icon">
                  <stop.icon size={20} />
                </div>
                <div className="cx-card-num">{index + 1}</div>
                <h3 className="cx-card-title">{stop.title}</h3>
                <p className="cx-card-desc">{stop.description}</p>
                <ul className="cx-tour-highlights">
                  {stop.highlights.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="cx-section bordered">
        <div className="cx-section-inner">
          <div className="cx-tour-cta reveal">
            <div className="cx-tour-cta-icon" aria-hidden>
              <Truck size={28} />
            </div>
            <div className="cx-tour-cta-body">
              <h2 className="cx-section-title" style={{ marginBottom: 8 }}>
                Ready to see it with your{' '}
                <span className="accent cx-hand-underline cx-hand-underline--v4">freight?</span>
              </h2>
              <p className="cx-section-sub" style={{ margin: 0 }}>
                Schedule a demo. We&apos;ll walk through the portal with your operation in mind.
              </p>
            </div>
            <button
              type="button"
              className="cx-btn-primary"
              onClick={() => scrollToDemo('tour_mid_demo')}
            >
              Schedule Demo
              <ArrowRight size={17} />
            </button>
          </div>
        </div>
      </section>

      <section id="waitlist-form" className="cx-section cx-section--join bordered">
        <div className="cx-section-inner">
          <div className="cx-enroll-shell">
            <div className="cx-join-head reveal reveal-grow">
              <h2 className="cx-section-title">
                Schedule a{' '}
                <span className="accent cx-hand-underline cx-hand-underline--v6">demo</span>
              </h2>
              <p className="cx-section-sub">
                Tell us about your fleet — we&apos;ll reach out to book your demo.
              </p>
            </div>
            <div className="reveal reveal-grow">
              <WaitlistForm />
            </div>
          </div>
        </div>
      </section>

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
            onClick={() => {
              trackWebsiteEvent('nav_click', 'footer_client_login')
              if (isMarketingOnly) {
                window.location.assign(getClientLoginHref())
                return
              }
              navigate('/client/login')
            }}
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
