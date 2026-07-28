import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  Check,
  CheckCircle2,
  Eye,
  FileCheck,
  Headphones,
  Percent,
  ShieldCheck,
  Truck,
} from 'lucide-react'
import '../styles/credyxMarketing.css'
import { useRevealOnScroll } from '../hooks/useRevealOnScroll'
import { MarketingHeader } from '../components/enroll/MarketingHeader'
import { WaitlistForm } from '../components/enroll/WaitlistForm'
import { WaitlistInvoicePhone } from '../components/enroll/WaitlistInvoicePhone'

// ── Static content (aligned with WAITLIST_MARKETING_SITE.md) ──

const HERO_STATS = [
  { value: 'Real-time', label: 'A/R visibility' },
  { value: '1–50', label: 'Trucks supported' },
  { value: 'On time', label: 'Payment tracking' },
]

const WORKFLOW_STEPS = [
  {
    title: 'Docs received',
    description: 'Carrier submits paperwork and invoice packet to Credyx.',
  },
  {
    title: 'Paperwork verified',
    description: 'We verify documents so nothing gets missed.',
  },
  {
    title: 'Invoice submitted',
    description: 'We submit your invoice (PPW) to the broker and track acceptance.',
  },
  {
    title: 'Broker follow-up',
    description: 'We follow up, resolve holds and disputes, and keep you informed.',
  },
  {
    title: 'Payment received',
    description: 'We confirm payment when it arrives — on time.',
  },
]

const BENEFITS = [
  {
    icon: Truck,
    title: 'No in-house A/R team',
    description: 'Back office handled without payroll and turnover.',
  },
  {
    icon: Eye,
    title: 'Complete visibility',
    description: 'Dashboard for open A/R, holds, and payment status.',
  },
  {
    icon: Headphones,
    title: 'Broker follow-up included',
    description: 'We chase paperwork issues and slow pay — you stay on the road.',
  },
  {
    icon: FileCheck,
    title: 'Built for carriers',
    description: 'Invoicing, collections, and reporting in one portal.',
  },
]

const COVERAGE = [
  'Invoice creation and broker submission (PPW)',
  'Paperwork verification (BOL, POD, rate con)',
  'Collections and A/R follow-up',
  'Payment status tracking and reconciliation',
  'Held / disputed invoice visibility',
  'Secure document storage',
  'A/R aging and reporting',
]

const INVOICE_STEPS = [
  { label: 'Submitted', state: 'done' as const },
  { label: 'Verified', state: 'done' as const },
  { label: 'Invoiced', state: 'active' as const },
  { label: 'Paid', state: 'pending' as const },
]

const WAITLIST_CAP = 100
const WAITLIST_SPOTS_LEFT = 68
const WAITLIST_TAKEN = WAITLIST_CAP - WAITLIST_SPOTS_LEFT

const PRICING_POINTS = [
  {
    icon: ShieldCheck,
    title: 'You pay $0 to start',
    description: 'No signup fee. No monthly bill. Opening an account costs nothing.',
  },
  {
    icon: Percent,
    title: 'We get paid last',
    description:
      'First the broker pays you. Only after that money is yours do we take a small percent. Not before.',
  },
] as const

/** Public Credyx waitlist marketing page — separate from the product app shell. */
export default function Waitlist() {
  const navigate = useNavigate()
  const rootRef = useRef<HTMLDivElement>(null)
  useRevealOnScroll(rootRef)

  const scrollToForm = () => {
    document.getElementById('waitlist-form')?.scrollIntoView({ behavior: 'smooth' })
  }

  const scrollToPricing = () => {
    document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' })
  }

  // Support /waitlist#pricing deep links from nav
  useEffect(() => {
    if (window.location.hash !== '#pricing') return
    const timer = window.setTimeout(() => {
      document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' })
    }, 80)
    return () => window.clearTimeout(timer)
  }, [])

  return (
    <div ref={rootRef} className="credyx-page credyx-page--waitlist">
      <MarketingHeader />

      {/* ── Hero ── */}
      <section className="cx-hero cx-hero--waitlist">
        <div className="cx-hero-photo" aria-hidden>
          <img src="/credyx-hero-truck.jpg" alt="" />
        </div>
        <div className="cx-mesh" aria-hidden />

        <div className="cx-hero-layout">
          <div className="cx-hero-copy">
            <p className="cx-badge hero-enter hero-enter-1">A/R back office for carriers</p>
            <h1 className="cx-hero-headline hero-enter hero-enter-2">
              Your back office,{' '}
              <span className="accent cx-hand-underline">in one portal.</span>
            </h1>
            <p className="cx-hero-sub hero-enter hero-enter-3">
              Submit paperwork, track invoices, and follow broker payments — without hiring a
              full A/R team. <strong>Paid on time.</strong>
            </p>
            <div className="cx-hero-buttons hero-enter hero-enter-4">
              <button type="button" className="cx-btn-primary" onClick={scrollToForm}>
                Join the waitlist
                <ArrowRight size={17} />
              </button>
              <button type="button" className="cx-btn-secondary" onClick={scrollToPricing}>
                See pricing
              </button>
            </div>

            <div className="cx-hero-stats hero-enter hero-enter-5">
              {HERO_STATS.map((stat) => (
                <div key={stat.label} className="cx-hero-stat">
                  <div className="cx-hero-stat-num">{stat.value}</div>
                  <div className="cx-hero-stat-label">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="cx-hero-visual hero-enter hero-enter-6">
            <div className="cx-hero-visual-frame">
              <div className="cx-browser cx-hero-dash">
                <div className="cx-browser-bar" aria-hidden>
                  <span />
                  <span />
                  <span />
                  <div className="cx-browser-url">app.credyx.com / invoices</div>
                </div>
                <img
                  src="/credyx-waitlist-dashboard.jpg"
                  alt="Credyx invoices dashboard with summary cards, status table, and invoice details"
                  width={1440}
                  height={900}
                  loading="eager"
                />
              </div>

              <div className="cx-hero-phone-wrap">
                <WaitlistInvoicePhone />
              </div>

              <div className="cx-hero-float-chip">
                <CheckCircle2 size={16} />
                Paid on time
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Process ── */}
      <section className="cx-section bordered">
        <div className="cx-section-inner">
          <div className="cx-section-head centered reveal reveal-grow">
            <p className="cx-eyebrow" style={{ justifyContent: 'center', width: '100%' }}>
              How it works
            </p>
            <h2 className="cx-section-title">From paperwork to paid on time</h2>
            <p className="cx-section-sub">
              Credyx verifies documents, invoices brokers, follows up, and tracks payment —
              so you stay focused on the road.
            </p>
          </div>
          <div className="cx-card-grid cx-card-grid--process reveal-stagger reveal">
            {WORKFLOW_STEPS.map((item, index) => (
              <div key={item.title} className="cx-card cx-card--grow">
                <div className="cx-card-num">{String(index + 1).padStart(2, '0')}</div>
                <h3 className="cx-card-title">{item.title}</h3>
                <p className="cx-card-desc">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Why Credyx ── */}
      <section className="cx-section surface bordered">
        <div className="cx-section-inner">
          <div className="cx-section-head centered reveal reveal-grow">
            <p className="cx-eyebrow" style={{ justifyContent: 'center', width: '100%' }}>
              Why Credyx
            </p>
            <h2 className="cx-section-title">
              Your back office,{' '}
              <span className="accent cx-hand-underline">without the hire</span>
            </h2>
            <p className="cx-section-sub">
              Visibility, follow-up, and A/R tracking in one portal — built for carriers.
            </p>
          </div>
          <div className="cx-card-grid reveal-stagger reveal">
            {BENEFITS.map((benefit) => (
              <div key={benefit.title} className="cx-card cx-card--grow">
                <div className="cx-card-icon">
                  <benefit.icon size={20} />
                </div>
                <h3 className="cx-card-title">{benefit.title}</h3>
                <p className="cx-card-desc">{benefit.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Product proof ── */}
      <section className="cx-section bordered">
        <div className="cx-section-inner">
          <div className="cx-section-head centered reveal reveal-grow">
            <p className="cx-eyebrow" style={{ justifyContent: 'center', width: '100%' }}>
              Product
            </p>
            <h2 className="cx-section-title">See your A/R clearly</h2>
            <p className="cx-section-sub">
              Track open invoices, holds, and payment status from one dashboard.
            </p>
          </div>

          <div className="cx-proof reveal-stagger reveal">
            <figure className="cx-proof-shot cx-card--grow">
              <div className="cx-browser">
                <div className="cx-browser-bar" aria-hidden>
                  <span />
                  <span />
                  <span />
                  <div className="cx-browser-url">app.credyx.com / invoices</div>
                </div>
                <img
                  src="/credyx-waitlist-dashboard.jpg"
                  alt="Credyx desktop invoices view with open A/R, holds, and paid statuses"
                  width={1440}
                  height={900}
                  loading="lazy"
                />
              </div>
              <figcaption className="cx-proof-caption">
                Desktop · Invoices, statuses, and details in one view
              </figcaption>
            </figure>

            <div className="cx-proof-side">
              <figure className="cx-proof-shot cx-proof-shot--phone cx-card--grow">
                <div className="cx-phone-frame">
                  <img
                    src="/credyx-waitlist-invoice.png"
                    alt="Credyx invoice details on mobile with totals, dates, and activity"
                    width={480}
                    height={900}
                    loading="lazy"
                  />
                </div>
                <figcaption className="cx-proof-caption">
                  Mobile · Invoice details, activity, and payment status
                </figcaption>
              </figure>

              <div className="cx-proof-panel cx-card--grow" aria-label="Demo invoice progress">
                <p className="cx-proof-panel-title">Invoice progress</p>
                <div className="cx-invoice-stepper">
                  {INVOICE_STEPS.map((step, index) => (
                    <div key={step.label} style={{ display: 'contents' }}>
                      {index > 0 && (
                        <div
                          className={`cx-invoice-step-line${
                            INVOICE_STEPS[index - 1].state === 'done' ? ' done' : ''
                          }`}
                          aria-hidden
                        />
                      )}
                      <div className={`cx-invoice-step ${step.state}`}>
                        <span className="cx-invoice-step-dot">
                          {step.state === 'done' ? (
                            <CheckCircle2 size={14} strokeWidth={2.5} />
                          ) : (
                            index + 1
                          )}
                        </span>
                        <span className="cx-invoice-step-label">{step.label}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="cx-card-desc" style={{ marginTop: 18 }}>
                  You always know where each invoice stands — from paperwork to paid on time.
                </p>
              </div>
            </div>
          </div>

          <div className="cx-proof-cta reveal reveal-grow">
            <button type="button" className="cx-btn-secondary" onClick={() => navigate('/tour')}>
              Take the product tour
              <ArrowRight size={17} />
            </button>
          </div>
        </div>
      </section>

      {/* ── Scope of service ── */}
      <section className="cx-section surface bordered">
        <div className="cx-section-inner">
          <div className="cx-section-head centered reveal reveal-grow">
            <p className="cx-eyebrow" style={{ justifyContent: 'center', width: '100%' }}>
              Scope of service
            </p>
            <h2 className="cx-section-title">What we handle for you</h2>
            <p className="cx-section-sub">Focus on the road. We&apos;ll handle the rest.</p>
          </div>
          <div className="cx-coverage reveal-stagger reveal">
            {COVERAGE.map((item) => (
              <div key={item} className="cx-coverage-item cx-card--grow">
                <Check size={16} />
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section id="pricing" className="cx-section bordered">
        <div className="cx-section-inner">
          <div className="cx-section-head centered reveal reveal-grow">
            <p className="cx-eyebrow" style={{ justifyContent: 'center', width: '100%' }}>
              Pricing
            </p>
            <h2 className="cx-section-title">
              How we get paid{' '}
              <span className="accent cx-hand-underline">explained simply</span>
            </h2>
            <p className="cx-section-sub">
              Think of it like this: you get the money first. We only take a small cut after that.
            </p>
          </div>

          <div className="cx-pricing">
            <div className="cx-pricing-hero reveal reveal-grow">
              <p className="cx-pricing-plain">
                Example: a broker pays you <strong>$4,000</strong>. That money goes to{' '}
                <strong>you</strong>. Then Credyx takes a small percent.
                <br />
                If the invoice is not paid yet — <strong>you owe us nothing</strong>.
              </p>

              <div className="cx-pricing-flow" aria-label="How Credyx pricing works">
                <div className="cx-pricing-step">
                  <span className="cx-pricing-step-num">1</span>
                  <strong>You send paperwork</strong>
                  <p>We handle the invoice work</p>
                </div>
                <div className="cx-pricing-connector" aria-hidden>
                  <span className="cx-pricing-connector-line" />
                  <ArrowRight size={16} strokeWidth={2.25} />
                </div>
                <div className="cx-pricing-step">
                  <span className="cx-pricing-step-num">2</span>
                  <strong>You get paid</strong>
                  <p>Broker pays your company</p>
                </div>
                <div className="cx-pricing-connector" aria-hidden>
                  <span className="cx-pricing-connector-line" />
                  <ArrowRight size={16} strokeWidth={2.25} />
                </div>
                <div className="cx-pricing-step">
                  <span className="cx-pricing-step-num">3</span>
                  <strong>Then we get a small %</strong>
                  <p>Only from that paid invoice</p>
                </div>
              </div>

              <div className="cx-pricing-zeros">
                <div>
                  <span>$0</span>
                  <small>To start</small>
                </div>
                <div>
                  <span>$0</span>
                  <small>No monthly fee</small>
                </div>
                <div>
                  <span>%</span>
                  <small>Only after you&apos;re paid</small>
                </div>
              </div>
            </div>

            <div className="cx-pricing-points reveal-stagger reveal">
              {PRICING_POINTS.map((point) => (
                <div key={point.title} className="cx-pricing-point cx-card--grow">
                  <div className="cx-card-icon">
                    <point.icon size={20} />
                  </div>
                  <h3 className="cx-card-title">{point.title}</h3>
                  <p className="cx-card-desc">{point.description}</p>
                </div>
              ))}
            </div>

            <div className="cx-founding-card reveal reveal-grow">
              <div className="cx-founding-bg" aria-hidden />
              <div className="cx-founding-inner">
                <div className="cx-founding-top">
                  <div>
                    <p className="cx-founding-eyebrow">Founding waitlist offer</p>
                    <h3>First 100 carriers · 1 month free on fees</h3>
                    <p>
                      Get in early and use Credyx for <strong>one full month</strong> with{' '}
                      <strong>no fee</strong> on invoices you submit in that first month. After
                      that, normal pricing kicks in — still only a small % after you&apos;re paid.
                    </p>
                  </div>
                  <div className="cx-founding-spots" role="status">
                    <div className="cx-founding-spots-num">{WAITLIST_SPOTS_LEFT}</div>
                    <div className="cx-founding-spots-label">positions left</div>
                    <div className="cx-founding-meter" aria-hidden>
                      <span style={{ width: `${(WAITLIST_TAKEN / WAITLIST_CAP) * 100}%` }} />
                    </div>
                    <div className="cx-founding-meter-copy">
                      {WAITLIST_TAKEN} of {WAITLIST_CAP} founding spots claimed
                    </div>
                  </div>
                </div>
                <button type="button" className="cx-btn-primary" onClick={scrollToForm}>
                  Claim a founding spot
                  <ArrowRight size={17} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Waitlist form ── */}
      <section id="waitlist-form" className="cx-section surface bordered">
        <div className="cx-section-inner">
          <div className="cx-enroll-shell">
            <div className="cx-section-head centered reveal reveal-grow" style={{ margin: '0 auto 28px' }}>
              <p className="cx-eyebrow" style={{ justifyContent: 'center', width: '100%' }}>
                Waitlist
              </p>
              <h2 className="cx-section-title">Join the waitlist</h2>
              <p className="cx-section-sub">
                {WAITLIST_SPOTS_LEFT} founding positions left. Tell us about your fleet — we&apos;ll
                reach out when onboarding opens.
              </p>
            </div>

            <div className="cx-spots-banner reveal reveal-grow" role="status">
              <span className="cx-spots-count">{WAITLIST_SPOTS_LEFT}</span>
              <span className="cx-spots-copy">
                more positions left
                <small>First 100 carriers · 1-month fee-free trial included</small>
              </span>
            </div>

            <div className="reveal reveal-grow" style={{ marginTop: 16 }}>
              <WaitlistForm />
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="cx-footer">
        <div className="cx-footer-brand">
          <img
            src="/credyx-nav-logo.png"
            alt="Credyx"
            className="cx-footer-logo"
            width={120}
            height={32}
          />
        </div>
        <div className="cx-footer-links">
          <button type="button" className="cx-footer-link" onClick={() => navigate('/tour')}>
            Product tour
          </button>
          <button
            type="button"
            className="cx-footer-link"
            onClick={() => navigate('/client/login')}
          >
            Client login
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
