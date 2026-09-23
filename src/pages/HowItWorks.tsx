import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Check,
  CheckCircle2,
  Clock,
  Eye,
  FileCheck,
  FileText,
  Inbox,
  MessageSquare,
  Shield,
  Users,
} from 'lucide-react'
import '../styles/credyxMarketing.css'
import { useRevealOnScroll } from '../hooks/useRevealOnScroll'
import { useWebsiteAnalytics } from '../hooks/useWebsiteAnalytics'
import { trackWebsiteEvent } from '../services/websiteAnalytics'
import { MarketingHeader } from '../components/enroll/MarketingHeader'
import { WaitlistForm } from '../components/enroll/WaitlistForm'
import { getClientLoginHref } from '../utils/clientLoginRedirect'

const isMarketingOnly = import.meta.env.VITE_MARKETING_ONLY === 'true'

/** Correct Credyx workflow — sliding panels left → right. */
const STEPS = [
  {
    number: '01',
    icon: Inbox,
    title: 'Docs received',
    description: 'Submit your paperwork and invoice packet to Credyx through the portal.',
    details: [
      'Upload invoice packets and supporting docs',
      'POD, BOL, and rate confirmations',
      'Secure vault storage from day one',
      'Available anytime from desktop or mobile',
    ],
    benefit: 'One place to drop paperwork — no email chasing or missing attachments.',
  },
  {
    number: '02',
    icon: FileCheck,
    title: 'Paperwork verified',
    description: 'We verify documents so nothing gets missed before brokers are billed.',
    details: [
      'Completeness and accuracy checks',
      'Rate confirmation matching',
      'Missing-info flags before submit',
      'Clear alerts when something needs a fix',
    ],
    benefit: 'Fewer holds and rejections — issues get caught before the broker sees them.',
  },
  {
    number: '03',
    icon: FileText,
    title: 'Invoice submitted',
    description: 'We submit the invoice (PPW) to the broker and track acceptance.',
    details: [
      'Professional invoice packet to the broker',
      'Preferred delivery method per broker',
      'Attachments included and tracked',
      'Acceptance status in your portal',
    ],
    benefit: 'You see when the broker has the invoice — no guessing if it landed.',
  },
  {
    number: '04',
    icon: MessageSquare,
    title: 'Broker follow-up',
    description: 'We follow up, resolve holds and disputes, and keep you informed.',
    details: [
      'Status checks against payment terms',
      'Hold and dispute resolution',
      'Professional broker communication',
      'Updates visible in your portal',
    ],
    benefit: 'Credyx handles the chasing so your team can stay on the road.',
  },
  {
    number: '05',
    icon: CheckCircle2,
    title: 'Payment received',
    description: 'We confirm payment when it arrives — paid on time.',
    details: [
      'Payment confirmation in the portal',
      'Aging and outstanding visibility',
      'Clear invoice status history',
      'A/R reporting you can trust',
    ],
    benefit: 'Full visibility from docs in to paid on time — every invoice.',
  },
] as const

const FEATURES = [
  {
    icon: Eye,
    title: 'Live A/R visibility',
    description: 'See every invoice status, hold, and outstanding dollar in one portal.',
  },
  {
    icon: Clock,
    title: 'On-time follow-up',
    description: 'Broker outreach tied to payment terms — without you dialing.',
  },
  {
    icon: Shield,
    title: 'Secure document vault',
    description: 'Packets stored securely and ready whenever you need them.',
  },
  {
    icon: Users,
    title: 'Back-office team',
    description: 'Experienced ops handling verification, invoicing, and disputes.',
  },
] as const

const DIFFERENTIATORS = [
  {
    label: 'Process',
    title: 'Clear workflow',
    body: 'Docs → verified → invoiced → follow-up → paid on time. Always the same path.',
  },
  {
    label: 'People',
    title: 'Human follow-up',
    body: 'Technology tracks status; our team resolves holds, disputes, and broker questions.',
  },
  {
    label: 'Portal',
    title: 'One place to look',
    body: 'Your back office in one portal — status, docs, and updates without the chase.',
  },
] as const

/** Public How it works page with horizontal sliding process panels. */
export default function HowItWorks() {
  const navigate = useNavigate()
  const rootRef = useRef<HTMLDivElement>(null)
  const sliderRef = useRef<HTMLElement>(null)
  const isJumping = useRef(false)
  const [activeStep, setActiveStep] = useState(0)
  useRevealOnScroll(rootRef)
  useWebsiteAnalytics()

  const stepCount = STEPS.length

  /** Sync active panel from vertical scroll progress inside the slider section. */
  useEffect(() => {
    const onScroll = () => {
      if (!sliderRef.current || isJumping.current) return
      const rect = sliderRef.current.getBoundingClientRect()
      const total = sliderRef.current.offsetHeight - window.innerHeight
      if (total <= 0) return

      const scrolled = Math.min(Math.max(-rect.top, 0), total)
      const progress = scrolled / total
      const index = Math.min(stepCount - 1, Math.floor(progress * stepCount + 0.001))
      setActiveStep(index)
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => window.removeEventListener('scroll', onScroll)
  }, [stepCount])

  const goToStep = useCallback(
    (index: number) => {
      if (!sliderRef.current) return
      const next = Math.max(0, Math.min(stepCount - 1, index))
      const sectionTop = sliderRef.current.offsetTop
      const total = sliderRef.current.offsetHeight - window.innerHeight
      const targetY = sectionTop + (next / Math.max(stepCount - 1, 1)) * total

      isJumping.current = true
      setActiveStep(next)
      window.scrollTo({ top: targetY, behavior: 'smooth' })
      window.setTimeout(() => {
        isJumping.current = false
      }, 700)
    },
    [stepCount]
  )

  const scrollToDemo = (source: string) => {
    trackWebsiteEvent('cta_click', source)
    document.getElementById('waitlist-form')?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <div ref={rootRef} className="credyx-page credyx-page--waitlist credyx-page--how">
      <MarketingHeader />

      <section className="cx-hero cx-how-hero">
        <div className="cx-mesh" aria-hidden />
        <div className="cx-hero-inner">
          <p className="cx-badge hero-enter hero-enter-1">How Credyx works</p>
          <h1 className="cx-hero-headline hero-enter hero-enter-2">
            From docs to{' '}
            <span className="accent cx-hand-underline cx-hand-underline--v5">paid on time</span>
          </h1>
          <p className="cx-hero-sub hero-enter hero-enter-3">
            Credyx is your A/R back office — paperwork verified, brokers invoiced, follow-up handled,
            and payments tracked in one portal.
          </p>
          <div className="cx-hero-buttons hero-enter hero-enter-4">
            <button type="button" className="cx-btn-primary" onClick={() => scrollToDemo('how_hero_demo')}>
              Schedule Demo
              <ArrowRight size={17} />
            </button>
            <button type="button" className="cx-btn-secondary" onClick={() => navigate('/tour')}>
              See the product
            </button>
          </div>
        </div>
      </section>

      <section
        ref={sliderRef}
        className="cx-how-slider"
        style={{ height: `${stepCount * 100}vh` }}
        aria-label="Credyx process steps"
      >
        <div className="cx-how-slider__sticky">
          <div className="cx-how-slider__chrome">
            <div className="cx-section-head centered">
              <p className="cx-eyebrow" style={{ justifyContent: 'center', width: '100%' }}>
                The process
              </p>
              <h2 className="cx-section-title">
                Five steps.{' '}
                <span className="accent cx-hand-underline cx-hand-underline--v2">
                  Full visibility.
                </span>
              </h2>
              <p className="cx-section-sub">
                Scroll or use the arrows — each panel slides in from the right.
              </p>
            </div>

            <div className="cx-how-slider__nav" role="tablist" aria-label="Process steps">
              {STEPS.map((step, index) => (
                <button
                  key={step.number}
                  type="button"
                  role="tab"
                  aria-selected={activeStep === index}
                  className={`cx-how-slider__tab ${activeStep === index ? 'is-active' : ''} ${
                    activeStep > index ? 'is-done' : ''
                  }`}
                  onClick={() => goToStep(index)}
                >
                  <span className="cx-how-slider__tab-num">{step.number}</span>
                  <span className="cx-how-slider__tab-label">{step.title}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="cx-how-slider__viewport">
            <div
              className="cx-how-slider__track"
              style={{ transform: `translate3d(-${activeStep * 100}%, 0, 0)` }}
            >
              {STEPS.map((step, index) => {
                const Icon = step.icon
                return (
                  <article
                    key={step.number}
                    className={`cx-how-panel ${activeStep === index ? 'is-active' : ''}`}
                    aria-hidden={activeStep !== index}
                  >
                    <div className="cx-how-panel__aside">
                      <div className="cx-how-panel__icon" aria-hidden>
                        <Icon size={36} strokeWidth={1.75} />
                      </div>
                      <span className="cx-how-panel__step">{step.number}</span>
                    </div>

                    <div className="cx-how-panel__body">
                      <h3 className="cx-how-panel__title">{step.title}</h3>
                      <p className="cx-how-panel__desc">{step.description}</p>

                      <div className="cx-how-panel__grid">
                        <div className="cx-how-panel__card">
                          <h4>What Credyx does</h4>
                          <ul>
                            {step.details.map((detail) => (
                              <li key={detail}>
                                <Check size={15} strokeWidth={2.5} aria-hidden />
                                <span>{detail}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                        <div className="cx-how-panel__card cx-how-panel__card--benefit">
                          <h4>Your benefit</h4>
                          <p>{step.benefit}</p>
                        </div>
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
          </div>

          <div className="cx-how-slider__controls">
            <button
              type="button"
              className="cx-how-slider__arrow"
              onClick={() => goToStep(activeStep - 1)}
              disabled={activeStep === 0}
              aria-label="Previous step"
            >
              <ArrowLeft size={18} />
            </button>

            <div className="cx-how-slider__dots" aria-hidden>
              {STEPS.map((step, index) => (
                <button
                  key={step.number}
                  type="button"
                  className={`cx-how-slider__dot ${activeStep === index ? 'is-active' : ''}`}
                  onClick={() => goToStep(index)}
                  tabIndex={-1}
                />
              ))}
            </div>

            <button
              type="button"
              className="cx-how-slider__arrow"
              onClick={() => goToStep(activeStep + 1)}
              disabled={activeStep === stepCount - 1}
              aria-label="Next step"
            >
              <ArrowRight size={18} />
            </button>
          </div>
        </div>
      </section>

      <section className="cx-section bordered">
        <div className="cx-section-inner">
          <div className="cx-section-head centered reveal">
            <p className="cx-eyebrow" style={{ justifyContent: 'center', width: '100%' }}>
              Platform
            </p>
            <h2 className="cx-section-title">
              Built for carriers who want{' '}
              <span className="accent cx-hand-underline cx-hand-underline--v3">clarity</span>
            </h2>
            <p className="cx-section-sub">
              Visibility, follow-up, and a secure vault — without hiring a full A/R team.
            </p>
          </div>
          <div className="cx-card-grid reveal">
            {FEATURES.map((feature) => (
              <div key={feature.title} className="cx-card">
                <div className="cx-card-icon">
                  <feature.icon size={20} />
                </div>
                <h3 className="cx-card-title">{feature.title}</h3>
                <p className="cx-card-desc">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="cx-section bordered">
        <div className="cx-section-inner">
          <div className="cx-section-head centered reveal">
            <p className="cx-eyebrow" style={{ justifyContent: 'center', width: '100%' }}>
              Why Credyx
            </p>
            <h2 className="cx-section-title">
              What makes us{' '}
              <span className="accent cx-hand-underline cx-hand-underline--v7">different</span>
            </h2>
          </div>
          <div className="cx-how-diff reveal">
            {DIFFERENTIATORS.map((item) => (
              <div key={item.label} className="cx-how-diff__card">
                <p className="cx-how-diff__label">{item.label}</p>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="cx-section bordered">
        <div className="cx-section-inner" style={{ textAlign: 'center' }}>
          <div className="reveal">
            <BarChart3 size={28} style={{ color: 'var(--cx-blue)', margin: '0 auto 16px' }} />
            <h2 className="cx-section-title">
              Ready for a clearer{' '}
              <span className="accent cx-hand-underline cx-hand-underline--v4">A/R?</span>
            </h2>
            <p className="cx-section-sub" style={{ margin: '0 auto 28px' }}>
              Focus on the road. We&apos;ll handle the paperwork, follow-up, and status updates.
            </p>
            <button
              type="button"
              className="cx-btn-primary"
              onClick={() => scrollToDemo('how_mid_demo')}
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
    </div>
  )
}
