import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Eye,
  FileCheck,
  Headphones,
  MessageSquare,
  CalendarDays,
  Navigation,
  FilePenLine,
  AlertCircle,
  Truck,
  Building2,
  BarChart3,
  FolderOpen,
} from 'lucide-react'
import '../styles/credyxMarketing.css'
import { useRevealOnScroll } from '../hooks/useRevealOnScroll'
import { MarketingHeader } from '../components/enroll/MarketingHeader'
import { WaitlistForm } from '../components/enroll/WaitlistForm'

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

const APP_FEATURE_TABS = [
  {
    id: 'invoices',
    label: 'Invoices',
    icon: FileCheck,
    title: 'Invoices',
    description: 'Track every invoice from paperwork to paid.',
    points: ['Open A/R & holds at a glance', 'Status progress on every load', 'Details, activity, and docs together'],
  },
  {
    id: 'calendar',
    label: 'Calendar',
    icon: CalendarDays,
    title: 'A/R calendar',
    description: 'Know what is due — paperwork, pay dates, and reminders.',
    points: ['Paperwork & upload checks', 'Expected payment dates', 'Jump straight to the invoice'],
  },
  {
    id: 'assistant',
    label: 'Assistant',
    icon: MessageSquare,
    title: 'Trucking Buddy',
    description: 'Ask about your A/R — Buddy answers from live invoices.',
    points: ['Holds, aging & payments', 'Drafts you confirm first', 'Opens the right screen'],
  },
  {
    id: 'brokers',
    label: 'Brokers',
    icon: Building2,
    title: 'Brokers',
    description: 'Broker context when you need it.',
    points: ['Directory & notes', 'Quick MC lookup', 'Tied to your A/R'],
  },
  {
    id: 'docvault',
    label: 'DocVault',
    icon: FolderOpen,
    title: 'Document Vault',
    description: 'Setup and broker docs, approved and ready.',
    points: ['Company setup packets', 'NOAs & bank proof on file', 'Load docs with each invoice'],
  },
  {
    id: 'reports',
    label: 'Reports',
    icon: BarChart3,
    title: 'Reports',
    description: 'See open, aging, and paid A/R clearly.',
    points: ['Aging views', 'Payment tracking', 'Built for 1–50 trucks'],
  },
] as const

const INVOICE_STEPS = [
  { label: 'Submitted', state: 'done' as const },
  { label: 'Verified', state: 'done' as const },
  { label: 'Invoiced', state: 'active' as const },
  { label: 'Paid', state: 'pending' as const },
]

const WAITLIST_CAP = 100
const WAITLIST_SPOTS_LEFT = 68
const WAITLIST_TAKEN = WAITLIST_CAP - WAITLIST_SPOTS_LEFT

const BUDDY_FEATURES = [
  { icon: MessageSquare, title: 'Live A/R answers', hint: 'Holds, aging, payments' },
  { icon: AlertCircle, title: 'Missing docs', hint: 'What is blocked & why' },
  { icon: FilePenLine, title: 'Drafts for you', hint: 'Notes & emails — you confirm' },
  { icon: Navigation, title: 'Takes you there', hint: 'Opens the right screen' },
] as const

const BUDDY_EXAMPLES = [
  {
    title: 'Holds',
    chip: 'On hold?',
    messages: [
      { role: 'user' as const, text: "What's on hold?" },
      {
        role: 'bot' as const,
        face: '/credyx-buddy-thinking.png',
        text: (
          <>
            Two invoices need attention: <strong>INV-1256</strong> is missing a POD, and{' '}
            <strong>INV-1241</strong> is waiting on broker paperwork. Want me to draft a follow-up?
          </>
        ),
      },
      { role: 'user' as const, text: 'Draft an email to Credyx about my holds' },
      {
        role: 'bot' as const,
        face: '/credyx-buddy-done.png',
        text: (
          <>
            Draft ready — review it, then confirm before it&apos;s sent. I never post without you.
          </>
        ),
      },
    ],
  },
  {
    title: 'Payments',
    chip: 'Payments',
    messages: [
      { role: 'user' as const, text: 'Payment status' },
      {
        role: 'bot' as const,
        face: '/credyx-buddy-thinking.png',
        text: (
          <>
            <strong>3 open invoices</strong> · <strong>$12,480</strong>. INV-1250 expected this week;
            INV-1248 is 6 days past due.
          </>
        ),
      },
      { role: 'user' as const, text: 'Show me what is past due' },
      {
        role: 'bot' as const,
        face: '/credyx-buddy-done.png',
        text: (
          <>
            <strong>INV-1248</strong> ($4,200) — open it, or I can draft a broker follow-up.
          </>
        ),
      },
    ],
  },
  {
    title: 'Attention',
    chip: 'Needs attention?',
    messages: [
      { role: 'user' as const, text: 'What needs my attention today?' },
      {
        role: 'bot' as const,
        face: '/credyx-buddy-thinking.png',
        text: (
          <>
            Today: upload POD for <strong>INV-1256</strong>, confirm expected pay on{' '}
            <strong>INV-1250</strong>, and review one broker note on <strong>INV-1241</strong>.
          </>
        ),
      },
      { role: 'user' as const, text: 'Open INV-1256 for me' },
      {
        role: 'bot' as const,
        face: '/credyx-buddy-done.png',
        text: (
          <>
            Opening <strong>INV-1256</strong> now — docs tab is ready so you can upload the POD.
          </>
        ),
      },
    ],
  },
  {
    title: 'Drafts',
    chip: 'Draft note',
    messages: [
      { role: 'user' as const, text: 'Draft a note on INV-1241 — missing rate con' },
      {
        role: 'bot' as const,
        face: '/credyx-buddy-thinking.png',
        text: (
          <>
            Draft: &ldquo;Waiting on rate confirmation before we resubmit.&rdquo; Want a short email
            too?
          </>
        ),
      },
      { role: 'user' as const, text: 'Yes — keep it short' },
      {
        role: 'bot' as const,
        face: '/credyx-buddy-done.png',
        text: (
          <>
            Both drafts are ready. Confirm and I&apos;ll post — email only sends after you approve.
          </>
        ),
      },
    ],
  },
  {
    title: 'Navigate',
    chip: 'Navigate',
    messages: [
      { role: 'user' as const, text: 'Take me to batches' },
      {
        role: 'bot' as const,
        face: '/credyx-buddy-done.png',
        text: (
          <>
            Heading to <strong>Batches</strong>. You have 1 packet ready to submit and 2 waiting on
            review.
          </>
        ),
      },
      { role: 'user' as const, text: 'What about brokers?' },
      {
        role: 'bot' as const,
        face: '/credyx-buddy-thinking.png',
        text: (
          <>
            I can open Brokers or look up an MC#. Say the MC number and I&apos;ll pull what we have.
          </>
        ),
      },
    ],
  },
] as const

const isMarketingOnly = import.meta.env.VITE_MARKETING_ONLY === 'true'

/** Public Credyx waitlist marketing page — separate from the product app shell. */
export default function Waitlist() {
  const navigate = useNavigate()
  const rootRef = useRef<HTMLDivElement>(null)
  const [buddyExampleIndex, setBuddyExampleIndex] = useState(0)
  const [buddyVisibleCount, setBuddyVisibleCount] = useState(0)
  const [buddyThinking, setBuddyThinking] = useState(false)
  const [featureTabId, setFeatureTabId] = useState<(typeof APP_FEATURE_TABS)[number]['id']>(
    'calendar'
  )
  useRevealOnScroll(rootRef)

  const buddyExample = BUDDY_EXAMPLES[buddyExampleIndex]
  const buddyExampleCount = BUDDY_EXAMPLES.length
  const activeFeatureTab =
    APP_FEATURE_TABS.find((tab) => tab.id === featureTabId) ?? APP_FEATURE_TABS[0]

  const showPrevBuddyExample = () => {
    setBuddyExampleIndex((index) => (index - 1 + buddyExampleCount) % buddyExampleCount)
  }

  const showNextBuddyExample = () => {
    setBuddyExampleIndex((index) => (index + 1) % buddyExampleCount)
  }

  // Play Buddy chat as a short conversation: ask → … → answer → ask → … → answer (5s loop).
  useEffect(() => {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReducedMotion) {
      setBuddyVisibleCount(buddyExample.messages.length)
      setBuddyThinking(false)
      return
    }

    let cancelled = false
    const timeoutIds: number[] = []

    const at = (ms: number, fn: () => void) => {
      timeoutIds.push(
        window.setTimeout(() => {
          if (!cancelled) fn()
        }, ms)
      )
    }

    const playSequence = () => {
      timeoutIds.forEach((id) => window.clearTimeout(id))
      timeoutIds.length = 0
      setBuddyVisibleCount(0)
      setBuddyThinking(false)

      // Play once (~5s): Q1 → thinking → A1 → Q2 → thinking → A2
      at(80, () => setBuddyVisibleCount(1))
      at(450, () => setBuddyThinking(true))
      at(1200, () => {
        setBuddyThinking(false)
        setBuddyVisibleCount(2)
      })
      at(2100, () => setBuddyVisibleCount(3))
      at(2500, () => setBuddyThinking(true))
      at(3200, () => {
        setBuddyThinking(false)
        setBuddyVisibleCount(4)
      })
    }

    playSequence()

    return () => {
      cancelled = true
      timeoutIds.forEach((id) => window.clearTimeout(id))
    }
  }, [buddyExampleIndex, buddyExample.messages.length])

  const scrollToForm = () => {
    document.getElementById('waitlist-form')?.scrollIntoView({ behavior: 'smooth' })
  }

  const scrollToPricing = () => {
    document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' })
  }

  // Support deep links from nav (/waitlist#pricing, #buddy, #features)
  useEffect(() => {
    const hash = window.location.hash
    if (hash !== '#pricing' && hash !== '#buddy' && hash !== '#features') return
    const id = hash.slice(1)
    const timer = window.setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
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
              <span className="accent cx-hand-underline cx-soft-wiggle">in one portal.</span>
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
        </div>
      </section>

      {/* ── Process ── */}
      <section className="cx-section bordered">
        <div className="cx-section-inner">
          <div className="cx-section-head centered reveal reveal-grow">
            <p className="cx-eyebrow">
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
            <p className="cx-eyebrow">
              Why Credyx
            </p>
            <h2 className="cx-section-title">
              Your back office,{' '}
              <span className="accent">without the hire</span>
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
            <p className="cx-eyebrow">
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
                    <div key={step.label} className="cx-invoice-step-wrap">
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
                <p className="cx-card-desc cx-proof-panel-desc">
                  You always know where each invoice stands — from paperwork to paid on time.
                </p>
              </div>
            </div>
          </div>

          {!isMarketingOnly && (
            <div className="cx-proof-cta reveal reveal-grow">
              <button type="button" className="cx-btn-secondary" onClick={() => navigate('/tour')}>
                Take the product tour
                <ArrowRight size={17} />
              </button>
            </div>
          )}
        </div>
      </section>

      {/* ── Trucking Buddy ── */}
      <section id="buddy" className="cx-section cx-section--buddy surface bordered">
        <div className="cx-section-inner">
          <div className="cx-buddy-head reveal reveal-grow">
            <p className="cx-eyebrow">Assistant</p>
            <h2 className="cx-section-title">
              Meet{' '}
              <span className="accent cx-hand-underline">Buddy</span>
            </h2>
            <p className="cx-buddy-tagline">Your AI trucking assistant</p>
            <p className="cx-section-sub">
              Ask about holds, payments, and missing docs. Buddy answers from your live invoices —
              and never sends anything until you confirm.
            </p>
          </div>

          <div className="cx-buddy-layout">
            <div className="cx-buddy-demo reveal reveal-grow" aria-label="Buddy chat examples">
              <div className="cx-buddy-demo-top">
                <div className="cx-buddy-avatar-wrap" aria-hidden>
                  <img
                    src="/credyx-buddy-waving.png"
                    alt=""
                    className="cx-buddy-avatar-head"
                    width={64}
                    height={64}
                  />
                  <img
                    src="/credyx-buddy-waving-hand.png"
                    alt=""
                    className="cx-buddy-avatar-hand"
                    width={32}
                    height={32}
                  />
                </div>
                <div>
                  <strong>Hey — I&apos;m your AI trucking buddy</strong>
                  <span>Ask me anything about your company</span>
                </div>
              </div>

              <div className="cx-buddy-example-bar">
                <button
                  type="button"
                  className="cx-buddy-nav-btn"
                  onClick={showPrevBuddyExample}
                  aria-label="Previous chat example"
                >
                  <ArrowLeft size={18} strokeWidth={2.5} />
                </button>
                <div className="cx-buddy-example-label" aria-live="polite">
                  <span className="cx-buddy-example-title">{buddyExample.title}</span>
                  <span className="cx-buddy-example-count">
                    {buddyExampleIndex + 1} / {buddyExampleCount}
                  </span>
                </div>
                <button
                  type="button"
                  className="cx-buddy-nav-btn"
                  onClick={showNextBuddyExample}
                  aria-label="Next chat example"
                >
                  <ArrowRight size={18} strokeWidth={2.5} />
                </button>
              </div>

              <div className="cx-buddy-chat" key={buddyExample.title}>
                {buddyExample.messages.slice(0, buddyVisibleCount).map((message, index) =>
                  message.role === 'user' ? (
                    <div
                      key={`${buddyExample.title}-u-${index}`}
                      className="cx-buddy-bubble cx-buddy-bubble--user"
                    >
                      {message.text}
                    </div>
                  ) : (
                    <div key={`${buddyExample.title}-b-${index}`} className="cx-buddy-row">
                      <img
                        src={message.face}
                        alt=""
                        className="cx-buddy-bubble-face"
                        width={48}
                        height={48}
                      />
                      <div className="cx-buddy-bubble cx-buddy-bubble--bot">
                        <p>{message.text}</p>
                      </div>
                    </div>
                  )
                )}

                {buddyThinking && (
                  <div className="cx-buddy-row" aria-live="polite" aria-label="Buddy is thinking">
                    <img
                      src="/credyx-buddy-thinking.png"
                      alt=""
                      className="cx-buddy-bubble-face"
                      width={48}
                      height={48}
                    />
                    <div className="cx-buddy-bubble cx-buddy-bubble--bot cx-buddy-bubble--thinking">
                      <span className="cx-buddy-dots">
                        <span />
                        <span />
                        <span />
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <div className="cx-buddy-chips" aria-label="Jump to example">
                {BUDDY_EXAMPLES.map((example, index) => (
                  <button
                    key={example.chip}
                    type="button"
                    className={`cx-buddy-chip${index === buddyExampleIndex ? ' active' : ''}`}
                    onClick={() => setBuddyExampleIndex(index)}
                  >
                    {example.chip}
                  </button>
                ))}
              </div>
            </div>

            <div className="cx-buddy-aside reveal reveal-grow">
              <p className="cx-buddy-aside-label">What Buddy can do</p>
              <p className="cx-buddy-aside-intro">
                A quick A/R helper in your portal — answers, drafts, and navigation when you need them.
              </p>
              <div className="cx-buddy-features reveal-stagger reveal">
                {BUDDY_FEATURES.map((feature) => (
                  <div key={feature.title} className="cx-buddy-feature">
                    <div className="cx-buddy-feature-icon">
                      <feature.icon size={16} strokeWidth={2} />
                    </div>
                    <div>
                      <h3>{feature.title}</h3>
                      <p>{feature.hint}</p>
                    </div>
                  </div>
                ))}
              </div>
              <p className="cx-buddy-aside-note">You confirm before anything is sent or posted.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── App features ── */}
      <section id="features" className="cx-section cx-section--features surface bordered">
        <div className="cx-section-inner">
          <div className="cx-features-head reveal reveal-grow">
            <p className="cx-eyebrow">Platform</p>
            <h2 className="cx-section-title">
              Everything your fleet{' '}
              <span className="accent">needs</span>
            </h2>
            <p className="cx-section-sub">
              Invoicing, tracking, and follow-up — all in one dashboard.
            </p>
          </div>

          <div className="cx-features-shell reveal reveal-grow">
            <div className="cx-features-tabs" role="tablist" aria-label="App features">
              {APP_FEATURE_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={featureTabId === tab.id}
                  className={`cx-features-tab${featureTabId === tab.id ? ' active' : ''}`}
                  onClick={() => setFeatureTabId(tab.id)}
                >
                  <span className="cx-features-tab-icon" aria-hidden>
                    <tab.icon size={18} strokeWidth={2} />
                  </span>
                  <span className="cx-features-tab-label">{tab.label}</span>
                </button>
              ))}
            </div>

            <div className="cx-features-panel" role="tabpanel" key={activeFeatureTab.id}>
              <div className="cx-features-panel-intro">
                <div className="cx-features-panel-icon" aria-hidden>
                  <activeFeatureTab.icon size={24} strokeWidth={1.75} />
                </div>
                <div className="cx-features-panel-copy">
                  <h3>{activeFeatureTab.title}</h3>
                  <p>{activeFeatureTab.description}</p>
                </div>
              </div>

              <ul className="cx-features-points">
                {activeFeatureTab.points.map((point) => (
                  <li key={point}>
                    <span className="cx-features-point-dot" aria-hidden />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section id="pricing" className="cx-section cx-section--pricing bordered">
        <div className="cx-section-inner">
          <div className="cx-pricing-head reveal reveal-grow">
            <p className="cx-eyebrow">Pricing</p>
            <h2 className="cx-section-title">
              How we get paid{' '}
              <span className="accent cx-hand-underline">explained simply</span>
            </h2>
            <p className="cx-section-sub">
              You get paid first. We only take a small cut after that.
            </p>
          </div>

          <div className="cx-pricing">
            <div className="cx-pricing-hero reveal reveal-grow">
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

              <ol className="cx-pricing-steps" aria-label="How Credyx pricing works">
                <li>
                  <span>1</span>
                  You send paperwork
                </li>
                <li>
                  <span>2</span>
                  You get paid
                </li>
                <li>
                  <span>3</span>
                  Then we take a small %
                </li>
              </ol>

              <p className="cx-pricing-example">
                Example: broker pays you <strong>$4,000</strong> — yours first. Not paid yet?{' '}
                <strong>You owe us nothing.</strong>
              </p>
            </div>

            <div className="cx-founding-card reveal reveal-grow">
              <div className="cx-founding-bg" aria-hidden />
              <div className="cx-founding-inner">
                <div className="cx-founding-top">
                  <div>
                    <p className="cx-founding-eyebrow">Founding waitlist offer</p>
                    <h3>First 100 · 1 month free on fees</h3>
                    <p>No fee on invoices you submit in your first month.</p>
                  </div>
                  <div className="cx-founding-spots" role="status">
                    <div className="cx-founding-spots-num">{WAITLIST_SPOTS_LEFT}</div>
                    <div className="cx-founding-spots-label">positions left</div>
                    <div className="cx-founding-meter" aria-hidden>
                      <span style={{ width: `${(WAITLIST_TAKEN / WAITLIST_CAP) * 100}%` }} />
                    </div>
                    <div className="cx-founding-meter-copy">
                      {WAITLIST_TAKEN} of {WAITLIST_CAP} claimed
                    </div>
                  </div>
                </div>
                <button type="button" className="cx-btn-primary" onClick={scrollToForm}>
                  Claim a founding spot
                  <ArrowRight size={16} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Waitlist form ── */}
      <section id="waitlist-form" className="cx-section cx-section--join surface bordered">
        <div className="cx-section-inner">
          <div className="cx-enroll-shell">
            <div className="cx-join-head reveal reveal-grow">
              <h2 className="cx-section-title">
                Join the{' '}
                <span className="accent">waitlist</span>
              </h2>
              <p className="cx-section-sub">
                Tell us about your fleet — we&apos;ll reach out when onboarding opens.
              </p>
            </div>

            <div className="reveal reveal-grow">
              <WaitlistForm />
            </div>
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
            width={320}
            height={84}
          />
        </div>
        {!isMarketingOnly && (
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
        )}
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
