import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowRight,
  Eye,
  FileCheck,
  Headphones,
  CalendarDays,
  Truck,
  BarChart3,
  FolderOpen,
  AlertCircle,
  MessageSquare,
  Building2,
} from 'lucide-react'
import '../styles/credyxMarketing.css'
import { useRevealOnScroll } from '../hooks/useRevealOnScroll'
import { useWebsiteAnalytics } from '../hooks/useWebsiteAnalytics'
import { trackWebsiteEvent } from '../services/websiteAnalytics'
import { MarketingHeader } from '../components/enroll/MarketingHeader'
import { WaitlistForm } from '../components/enroll/WaitlistForm'
import { WaitlistInvoiceProgress } from '../components/enroll/WaitlistInvoiceProgress'
import { WaitlistPlatformDeck } from '../components/enroll/WaitlistPlatformDeck'
import { WaitlistPricingCompare } from '../components/enroll/WaitlistPricingCompare'

// ── Static content (aligned with WAITLIST_MARKETING_SITE.md) ──

const WORKFLOW_STEPS = [
  {
    title: 'Docs received',
    description: 'You send Credyx your paperwork for the load.',
  },
  {
    title: 'Paperwork verified',
    description: 'We check every document so nothing gets missed.',
  },
  {
    title: 'Invoice submitted',
    description: 'We invoice the broker (PPW) and track acceptance.',
  },
  {
    title: 'Broker follow-up',
    description: 'We chase holds and disputes — and keep you updated.',
  },
  {
    title: 'Payment received',
    description: 'We confirm when payment arrives — on time.',
  },
]

/** Slight path variance so each side connector feels hand-drawn, not cloned. */
const PROCESS_CONNECTORS = [
  {
    path: 'M66 6 C48 12, 12 14, 10 34 C8 52, 44 56, 46 38 C48 24, 6 58, 4 82 C2 102, 36 110, 66 116',
    head: 'M50 106 L68 116 L50 124',
  },
  {
    path: 'M66 8 C50 10, 16 18, 8 36 C2 54, 40 60, 44 40 C48 22, 10 54, 6 78 C2 100, 40 108, 66 114',
    head: 'M48 104 L68 114 L52 122',
  },
  {
    path: 'M66 4 C44 14, 10 12, 12 32 C14 50, 48 54, 42 36 C36 20, 4 62, 8 86 C12 106, 34 112, 66 118',
    head: 'M52 108 L68 118 L48 124',
  },
  {
    path: 'M66 7 C52 16, 14 10, 6 30 C0 48, 38 58, 48 42 C56 28, 8 64, 2 84 C-2 104, 38 112, 66 115',
    head: 'M50 105 L66 115 L48 122',
  },
] as const

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

/** Credyx vs factoring compare panels (copy source: docs/marketing/CREDYX_VS_FACTORING.md §5). */
const VS_FACTORING_PANELS = [
  {
    tag: 'Factoring company',
    tagline: 'You\u2019re buying cash flow',
    tone: 'factor' as const,
    points: [
      'They advance cash and own the invoice (NOA)',
      'Fees are financing fees — discount, reserves, minimums',
      'Collections protect their receivable — you see funded or not',
      'Broker doesn\u2019t pay? Chargeback plus fees',
    ],
  },
  {
    tag: 'Credyx',
    tagline: 'You\u2019re buying a back office',
    tone: 'credyx' as const,
    points: [
      'You keep your invoices — brokers pay you directly',
      'Small fee only when invoices are collected — no hidden fees',
      'We work alongside you — clear asks, shared status, holds chased',
      'No advance — nothing to claw back; uncollected means no % fee',
    ],
  },
] as const

const PLATFORM_FEATURES = [
  {
    icon: FileCheck,
    title: 'Invoice tracking',
    description: 'Follow every load from paperwork to paid — with status on the invoice.',
    points: [
      'Open A/R and holds at a glance',
      'Submitted → Verified → Invoiced → Paid',
      'Activity, notes, and docs on one screen',
    ],
  },
  {
    icon: AlertCircle,
    title: 'Holds & disputes',
    description: 'See what is blocked and why — no digging through email threads.',
    points: [
      'Hold reason shown right away',
      'Missing PPW, POD, or rate con called out',
      'We follow up with the broker for you',
    ],
  },
  {
    icon: CalendarDays,
    title: 'A/R calendar',
    description: 'Know what is due — paperwork checks and expected pay dates.',
    points: [
      'Paperwork and upload reminders',
      'Expected payment dates by invoice',
      'Jump straight to the invoice from the calendar',
    ],
  },
  {
    icon: FolderOpen,
    title: 'Document vault',
    description: 'Setup packets and load docs approved, filed, and ready.',
    points: [
      'BOL, POD, and rate cons with each load',
      'Company setup packets in one place',
      'NOAs and bank proof on file when needed',
    ],
  },
  {
    icon: BarChart3,
    title: 'Open A/R & reports',
    description: 'Aging, balances, and payment status without a spreadsheet chase.',
    points: [
      'Aging views for open invoices',
      'Paid vs outstanding at a glance',
      'Built for fleets of about 1–50 trucks',
    ],
  },
  {
    icon: Eye,
    title: 'Live status',
    description: 'Know where each invoice stands without calling around.',
    points: [
      'Real-time status on every load',
      'Clear next step when something stalls',
      'You stay informed — we handle the chase',
    ],
  },
  {
    icon: MessageSquare,
    title: 'Trucking Buddy',
    description: 'Ask about your A/R — Buddy answers from live invoice data.',
    points: [
      'Holds, aging, and payment questions',
      'Drafts you confirm before anything sends',
      'Opens the right invoice or screen',
    ],
  },
  {
    icon: Building2,
    title: 'Brokers',
    description: 'Broker context when you need it — tied to your A/R.',
    points: [
      'Directory and notes in one place',
      'Quick MC lookup',
      'Linked to the invoices you are tracking',
    ],
  },
] as const

const WAITLIST_CAP = 100
const WAITLIST_SPOTS_LEFT = 68
const WAITLIST_TAKEN = WAITLIST_CAP - WAITLIST_SPOTS_LEFT

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
  useRevealOnScroll(rootRef)
  useWebsiteAnalytics()

  const buddyExample = BUDDY_EXAMPLES[buddyExampleIndex]
  const buddyExampleCount = BUDDY_EXAMPLES.length

  const showPrevBuddyExample = () => {
    trackWebsiteEvent('cta_click', 'buddy_prev')
    setBuddyExampleIndex((index) => (index - 1 + buddyExampleCount) % buddyExampleCount)
  }

  const showNextBuddyExample = () => {
    trackWebsiteEvent('cta_click', 'buddy_next')
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
    trackWebsiteEvent('cta_click', 'hero_join')
    document.getElementById('waitlist-form')?.scrollIntoView({ behavior: 'smooth' })
  }

  const scrollToPricing = () => {
    trackWebsiteEvent('cta_click', 'hero_pricing')
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
            <div className="cx-hero-brand hero-enter hero-enter-1">
              <img
                className="cx-hero-logo"
                src="/credyx-logo-white-cred-no-bg.png"
                alt="Credyx"
              />
            </div>
            <h1 className="cx-hero-headline hero-enter hero-enter-2">
              Your back office,{' '}
              <span className="accent cx-hand-underline cx-hand-underline--draw">handled.</span>
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
          </div>
        </div>
      </section>

      {/* ── Process ── */}
      <section className="cx-section cx-section--process bordered">
        <div className="cx-section-inner">
          <div className="cx-section-head centered reveal reveal-grow">
            <p className="cx-eyebrow">
              How it works
            </p>
            <h2 className="cx-section-title">
              From{' '}
              <span className="accent cx-hand-underline cx-hand-underline--v2">paperwork</span>
              {' '}to{' '}
              <span className="accent cx-hand-underline cx-hand-underline--v3">payment</span>
            </h2>
            <p className="cx-section-sub">
              Credyx verifies documents, invoices brokers, follows up, and tracks payment —
              so you stay focused on the road.
            </p>
          </div>
          <div className="cx-process-flow reveal-stagger reveal">
            {WORKFLOW_STEPS.map((item, index) => (
              <div key={item.title} className="cx-process-step">
                <div className="cx-card cx-card--grow">
                  <div className="cx-card-num">{String(index + 1).padStart(2, '0')}</div>
                  <h3 className="cx-card-title">{item.title}</h3>
                  <p className="cx-card-desc">{item.description}</p>
                </div>
                {index < WORKFLOW_STEPS.length - 1 ? (
                  <div
                    className={`cx-process-connector cx-process-connector--${
                      index % 2 === 0 ? 'left' : 'right'
                    }`}
                    aria-hidden="true"
                  >
                    {/* Horizontal wiggle (wide desktop) */}
                    <svg
                      className="cx-process-arrow cx-process-arrow--h"
                      viewBox="0 0 44 28"
                      fill="none"
                    >
                      <path
                        className="cx-process-arrow-path"
                        pathLength="1"
                        d="M2 14 C10 4, 16 24, 22 14 S34 4, 38 14 M33 8 L40 14 L33 20"
                        stroke="currentColor"
                        strokeWidth="2.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    {/* Side connector with slight hand-drawn variance per step */}
                    <svg
                      className="cx-process-arrow cx-process-arrow--loop"
                      viewBox="0 0 80 132"
                      fill="none"
                    >
                      <path
                        className="cx-process-arrow-path"
                        pathLength="1"
                        d={PROCESS_CONNECTORS[index].path}
                        stroke="currentColor"
                        strokeWidth="4.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <path
                        className="cx-process-arrow-head"
                        pathLength="1"
                        d={PROCESS_CONNECTORS[index].head}
                        stroke="currentColor"
                        strokeWidth="4.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        fill="none"
                      />
                    </svg>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Why Credyx ── */}
      <section className="cx-section surface bordered cx-section--why">
        <div className="cx-section-inner">
          <div className="cx-section-head centered reveal reveal-grow">
            <p className="cx-eyebrow">
              Why Credyx
            </p>
            <h2 className="cx-section-title">
              Your back office,{' '}
              <span className="accent cx-hand-underline cx-hand-underline--v7">without the hire</span>
            </h2>
            <p className="cx-section-sub">
              Visibility, follow-up, and A/R tracking in one portal — built for carriers.
            </p>
          </div>
          <div className="cx-card-grid cx-why-grid reveal-stagger reveal">
            {BENEFITS.map((benefit) => (
              <div key={benefit.title} className="cx-card cx-card--grow cx-why-card">
                <div className="cx-card-icon">
                  <benefit.icon size={20} />
                </div>
                <div className="cx-why-card-copy">
                  <h3 className="cx-card-title">{benefit.title}</h3>
                  <p className="cx-card-desc">{benefit.description}</p>
                </div>
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
                  alt="Credyx desktop invoices view with paid statuses and invoice details panel"
                  width={1024}
                  height={488}
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
                    alt="Credyx invoice details on mobile with progress, dates, and activity"
                    width={534}
                    height={736}
                    loading="lazy"
                  />
                </div>
                <figcaption className="cx-proof-caption">
                  Mobile · Invoice details, activity, and payment status
                </figcaption>
              </figure>

              <WaitlistInvoiceProgress />
            </div>
          </div>

          {!isMarketingOnly && (
            <div className="cx-proof-cta reveal reveal-grow">
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

      {/* ── Trucking Buddy ── */}
      <section id="buddy" className="cx-section cx-section--buddy surface bordered">
        <div className="cx-section-inner">
          <div className="cx-buddy-head reveal reveal-grow">
            <p className="cx-eyebrow">Assistant</p>
            <h2 className="cx-section-title">
              Meet{' '}
              <span className="accent cx-hand-underline cx-hand-underline--v4">Buddy</span>
            </h2>
            <p className="cx-buddy-tagline">Your AI trucking assistant</p>
            <p className="cx-section-sub">
              Ask about holds, payments, and missing docs. Buddy answers from your live invoices.
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
                    onClick={() => {
                      trackWebsiteEvent('cta_click', `buddy_chip_${index}`)
                      setBuddyExampleIndex(index)
                    }}
                  >
                    {example.chip}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Platform ── */}
      <section id="features" className="cx-section cx-section--features surface bordered">
        <div className="cx-section-inner">
          <div className="cx-features-head reveal reveal-grow">
            <p className="cx-eyebrow">Platform</p>
            <h2 className="cx-section-title">
              What&apos;s in{' '}
              <span className="accent cx-hand-underline cx-hand-underline--v8">the portal</span>
            </h2>
          </div>

          <WaitlistPlatformDeck features={PLATFORM_FEATURES} />
        </div>
      </section>

      {/* ── Pricing ── */}
      <section id="pricing" className="cx-section cx-section--pricing bordered">
        <div className="cx-section-inner">
          <div className="cx-pricing-head reveal reveal-grow">
            <p className="cx-eyebrow">Pricing</p>
            <h2 className="cx-section-title">
              How we get paid{' '}
              <span className="accent cx-hand-underline cx-hand-underline--v5">explained simply</span>
            </h2>
            <p className="cx-section-sub">
              You get paid first. We only take a small cut after that.
            </p>
          </div>

          <div className="cx-pricing">
            <div className="reveal reveal-grow">
              <WaitlistPricingCompare />
            </div>
          </div>
        </div>
      </section>

      {/* ── Credyx vs factoring ── */}
      <section id="vs-factoring" className="cx-section cx-section--vs bordered">
        <div className="cx-section-inner">
          <div className="cx-vs-head centered reveal reveal-grow">
            <p className="cx-eyebrow">Credyx vs factoring</p>
            <h2 className="cx-section-title">
              Factoring buys your invoices.{' '}
              <span className="accent cx-hand-underline cx-hand-underline--v7">
                We work for you.
              </span>
            </h2>
            <p className="cx-section-sub">
              Good factoring companies chase paperwork and run collections too — for the invoice
              they bought. Credyx does that work for you: your invoices stay yours, brokers pay you
              directly, and we work alongside you to keep packets moving.
            </p>
          </div>

          <div className="cx-vs-grid reveal-stagger reveal">
            {VS_FACTORING_PANELS.map((panel, index) => (
              <div key={panel.tag} className="cx-vs-col">
                {index === 1 && (
                  <div className="cx-vs-divider" aria-hidden>
                    <span>vs</span>
                  </div>
                )}
                <div className={`cx-card cx-card--grow cx-vs-panel cx-vs-panel--${panel.tone}`}>
                  <div className="cx-vs-panel-head">
                    <span className="cx-vs-tag">{panel.tag}</span>
                    <p className="cx-vs-tagline">{panel.tagline}</p>
                  </div>
                  <ul className="cx-vs-list">
                    {panel.points.map((point) => (
                      <li key={point}>
                        <span className="cx-vs-mark" aria-hidden />
                        <span>{point}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>

          <div className="cx-vs-closing reveal reveal-grow">
            <p>
              Need cash flow too? Keep your factor. Credyx integrates with factoring companies —
              and your Credyx fee is <strong>lower</strong> when you use both.
            </p>
            <button
              type="button"
              className="cx-btn-primary"
              onClick={() => {
                trackWebsiteEvent('cta_click', 'vs_join')
                document.getElementById('waitlist-form')?.scrollIntoView({ behavior: 'smooth' })
              }}
            >
              Join the waitlist
              <ArrowRight size={17} />
            </button>
          </div>
        </div>
      </section>

      {/* ── Waitlist form ── */}
      <section id="waitlist-form" className="cx-section cx-section--join bordered">
        <div className="cx-section-inner">
          <div className="cx-enroll-shell">
            <div className="cx-join-head reveal reveal-grow">
              <h2 className="cx-section-title">
                Join the{' '}
                <span className="accent cx-hand-underline cx-hand-underline--v6">waitlist</span>
              </h2>
              <p className="cx-section-sub">
                Tell us about your fleet — we&apos;ll reach out when onboarding opens.
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
              </div>
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
            width={107}
            height={28}
          />
        </div>
        <div className="cx-footer-links">
          {!isMarketingOnly && (
            <>
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
              <button
                type="button"
                className="cx-footer-link"
                onClick={() => {
                  trackWebsiteEvent('nav_click', 'footer_client_login')
                  navigate('/client/login')
                }}
              >
                Client login
              </button>
            </>
          )}
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
