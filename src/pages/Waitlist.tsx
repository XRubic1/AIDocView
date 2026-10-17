import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import '../styles/credyxMarketing.css'
import '../styles/credyxWaitlistSales.css'
import { useRevealOnScroll } from '../hooks/useRevealOnScroll'
import { useWebsiteAnalytics } from '../hooks/useWebsiteAnalytics'
import { trackWebsiteEvent } from '../services/websiteAnalytics'
import { MarketingHeader } from '../components/enroll/MarketingHeader'
import { WaitlistForm } from '../components/enroll/WaitlistForm'
import { WaitlistPricingCompare } from '../components/enroll/WaitlistPricingCompare'
import { WaitlistHeroInvoice } from '../components/enroll/WaitlistHeroInvoice'
import { WaitlistHowItWorksScene } from '../components/enroll/WaitlistHowItWorksScene'
import { getClientLoginHref } from '../utils/clientLoginRedirect'

const BENEFITS = [
  {
    n: '01',
    title: 'No in-house A/R team',
    description: 'Back office handled without payroll and turnover.',
  },
  {
    n: '02',
    title: 'Complete visibility',
    description: 'Dashboard for open A/R, holds, and payment status.',
  },
  {
    n: '03',
    title: 'Broker follow-up included',
    description: 'We chase paperwork issues and slow pay. You stay on the road.',
  },
  {
    n: '04',
    title: 'Built for carriers',
    description: 'Invoicing, collections, and reporting in one portal.',
  },
] as const

const INVOICE_ROWS = [
  { id: 'INV-4821', detail: '$2,840.00', status: 'Paid', ok: true },
  { id: 'INV-1256', detail: 'Missing POD', status: 'On hold', ok: false },
  { id: 'INV-1241', detail: 'Broker paperwork', status: 'On hold', ok: false },
] as const

const isMarketingOnly = import.meta.env.VITE_MARKETING_ONLY === 'true'

/** Public Credyx waitlist / schedule-demo marketing page. */
export default function Waitlist() {
  const navigate = useNavigate()
  const rootRef = useRef<HTMLDivElement>(null)
  const [mobCtaHide, setMobCtaHide] = useState(false)
  useRevealOnScroll(rootRef)
  useWebsiteAnalytics()

  const scrollToForm = () => {
    trackWebsiteEvent('cta_click', 'hero_join')
    document.getElementById('waitlist-form')?.scrollIntoView({ behavior: 'smooth' })
  }

  const scrollToPricing = () => {
    trackWebsiteEvent('cta_click', 'hero_pricing')
    document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' })
  }

  // Support deep links from nav (/#pricing, /#waitlist-form, /#how-it-works, etc.)
  useEffect(() => {
    const hash = window.location.hash
    const allowed = new Set([
      '#pricing',
      '#buddy',
      '#features',
      '#product',
      '#why',
      '#how-it-works',
      '#waitlist-form',
      '#demo',
    ])
    if (!allowed.has(hash)) return
    const id = hash === '#demo' ? 'waitlist-form' : hash.slice(1)
    const timer = window.setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
    }, 80)
    return () => window.clearTimeout(timer)
  }, [])

  // Hide the mobile sticky CTA near the top and near the form.
  useEffect(() => {
    const form = document.getElementById('waitlist-form')
    const onScroll = () => {
      const nearTop = window.scrollY < window.innerHeight * 0.6
      const nearForm =
        form != null && form.getBoundingClientRect().top < window.innerHeight * 0.8
      setMobCtaHide(nearTop || nearForm)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <div ref={rootRef} className="credyx-page credyx-page--waitlist credyx-page--sales">
      <MarketingHeader />

      {/* ── Hero ── */}
      <header className="cx-sales-hero" id="top">
        <svg className="cx-sales-hero-arrow" viewBox="0 0 400 400" aria-hidden>
          {/* Zigzag up-right arrow — lightning path with a pointed tip */}
          <path d="M400 0 L318 24 L352 58 L198 220 L148 170 L0 340 L42 382 L152 252 L202 302 L372 90 L400 128 Z" />
        </svg>
        <div className="cx-sales-hero2">
          <div>
            <span className="cx-sales-pill reveal">Paid on time.</span>
            <h1 className="reveal">
              Your back office,{' '}
              <span className="cx-sales-b">handled.</span>
            </h1>
            <div className="cx-sales-bar reveal" />
            <p className="cx-sales-lead reveal">
              Submit paperwork, track invoices, and follow broker payments, without hiring a full
              A/R team.
            </p>
            <div className="cx-sales-hero-actions reveal">
              <button type="button" className="cx-btn-primary" onClick={scrollToForm}>
                Schedule Demo
                <ArrowRight size={17} />
              </button>
              <button type="button" className="cx-btn-secondary" onClick={scrollToPricing}>
                See pricing
              </button>
            </div>
            <p className="cx-sales-micro reveal">
              <b>$0 monthly fees.</b> $0 startup fees.
            </p>
          </div>
          <div className="reveal">
            <WaitlistHeroInvoice />
          </div>
        </div>
      </header>

      {/* ── How it works (scroll animation) ── */}
      <WaitlistHowItWorksScene />

      {/* ── Why Credyx ── */}
      <section id="why" className="cx-sales-section cx-sales-how">
        <div className="cx-sales-wrap">
          <span className="cx-sales-pill reveal">Why Credyx</span>
          <h2 className="reveal">
            Your back office,{' '}
            <span className="cx-sales-b">without the hire.</span>
          </h2>
          <div className="cx-sales-grid5 reveal">
            {BENEFITS.map((benefit) => (
              <div key={benefit.title} className="cx-sales-card">
                <div className="n">{benefit.n}</div>
                <h3>{benefit.title}</h3>
                <p>{benefit.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Product ── */}
      <section id="product" className="cx-sales-section">
        <div className="cx-sales-wrap">
          <span className="cx-sales-pill reveal">Product</span>
          <h2 className="reveal">
            See your A/R <span className="cx-sales-b">clearly.</span>
          </h2>
          <p className="cx-sales-lead reveal">
            Track open invoices, holds, and payment status from one dashboard.
          </p>

          <div className="cx-sales-two reveal" id="buddy">
            <div className="cx-sales-inv-list" id="features">
              <div className="cx-sales-pt2">
                <span>Invoices</span>
                <span className="cx-sales-ex">Example</span>
              </div>
              {INVOICE_ROWS.map((row) => (
                <div key={row.id} className="cx-sales-ir">
                  <strong>{row.id}</strong>
                  <span>{row.detail}</span>
                  <em className={row.ok ? 'ok' : undefined}>{row.status}</em>
                </div>
              ))}
            </div>

            <div className="cx-sales-buddy">
              <div className="cx-sales-pt2">Meet Buddy · AI trucking assistant</div>
              <div className="cx-sales-bub u">What&apos;s on hold?</div>
              <div className="cx-sales-bub a">
                Two invoices need attention: INV-1256 is missing a POD, and INV-1241 is waiting on
                broker paperwork. Want me to draft a follow-up?
              </div>
              <p className="cx-sales-note">Buddy drafts. You confirm before anything is sent.</p>
            </div>
          </div>

          {!isMarketingOnly && (
            <div className="cx-sales-hero-actions reveal" style={{ marginTop: 40 }}>
              <button
                type="button"
                className="cx-btn-secondary"
                onClick={() => {
                  trackWebsiteEvent('cta_click', 'proof_tour')
                  navigate('/tour')
                }}
              >
                Take the product tour
                <ArrowRight size={17} />
              </button>
            </div>
          )}
        </div>
      </section>

      {/* ── Pricing ── */}
      <section id="pricing" className="cx-sales-section cx-sales-pricing">
        <div className="cx-sales-wrap">
          <span className="cx-sales-pill reveal">
            Pricing
          </span>
          <h2 className="reveal">
            Credyx vs. <span className="cx-sales-b">hiring in-house.</span>
          </h2>
          <div className="reveal">
            <WaitlistPricingCompare />
          </div>
        </div>
      </section>

      {/* ── Schedule demo / waitlist form ── */}
      <section id="waitlist-form" className="cx-sales-section cx-sales-cta">
        <div className="cx-sales-wrap cx-sales-cta-cols">
          <div>
            <span className="cx-sales-pill reveal">Schedule Demo</span>
            <h2 className="reveal">
              Schedule a <span className="cx-sales-b">demo.</span>
            </h2>
            <p className="cx-sales-lead reveal" style={{ margin: '24px 0 0' }}>
              Tell us about your fleet. We&apos;ll reach out to book your demo.
            </p>
            <div className="cx-sales-offer reveal">
              <div className="lbl">Limited offer · New clients</div>
              <h3>1 month free on fees</h3>
              <p>No fee on invoices you submit in your first month.</p>
            </div>
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
                trackWebsiteEvent('nav_click', 'footer_tour')
                navigate('/tour')
              }}
            >
              Product tour
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

      <button
        type="button"
        className={`cx-btn-primary cx-sales-mobcta${mobCtaHide ? ' hide' : ''}`}
        onClick={scrollToForm}
      >
        Schedule Demo
      </button>
    </div>
  )
}
