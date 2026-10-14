import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, FileText } from 'lucide-react'
import { trackWebsiteEvent } from '../../services/websiteAnalytics'

const STEPS = [
  {
    title: (
      <>
        You <span className="cx-sales-b">send</span> us your paperwork.
      </>
    ),
    badge: 'Receiving documents…',
    badgeTone: 'b',
    docs: 1,
    liveThrough: 0,
    liveCurrent: 0,
  },
  {
    title: (
      <>
        We <span className="cx-sales-b">check</span> every document.
      </>
    ),
    badge: 'Documents verified',
    badgeTone: 'b',
    docs: 3,
    liveThrough: 1,
    liveCurrent: 1,
  },
  {
    title: (
      <>
        We <span className="cx-sales-b">send the invoice</span> to the broker.
      </>
    ),
    badge: 'Sent to broker',
    badgeTone: 'b',
    docs: 3,
    liveThrough: 2,
    liveCurrent: 2,
  },
  {
    title: (
      <>
        We <span className="cx-sales-b">follow up</span> until it&apos;s resolved.
      </>
    ),
    badge: 'On hold: missing info',
    badgeTone: 'a',
    docs: 3,
    liveThrough: 3,
    liveCurrent: 3,
  },
  {
    title: (
      <>
        You get <span className="cx-sales-b">paid.</span>
      </>
    ),
    badge: 'Paid',
    badgeTone: 'p',
    docs: 3,
    liveThrough: 5,
    liveCurrent: 4,
  },
] as const

const LIVE_ROWS = [
  { label: 'Docs received', who: 'You' },
  { label: 'Verified', who: 'Credyx' },
  { label: 'Invoice sent', who: 'Credyx' },
  { label: 'Follow-up', who: 'Credyx' },
  { label: 'Paid', who: 'Credyx' },
] as const

const DOC_LABELS = ['POD', 'BOL', 'Rate con'] as const
const STEP_MS = 2800

/**
 * Simple How-it-works demo: autoplay + step controls.
 * Invoice card and live view share the page's panel styling.
 */
export function WaitlistHowItWorksScene() {
  const rootRef = useRef<HTMLElement>(null)
  const [step, setStep] = useState(0)
  const [inView, setInView] = useState(false)
  const [paused, setPaused] = useState(false)
  const current = STEPS[step]
  const paid = current.badgeTone === 'p'
  const hold = current.badgeTone === 'a'

  // Only autoplay while the section is on screen.
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const io = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting && entry.intersectionRatio > 0.35),
      { threshold: [0.35, 0.6] }
    )
    io.observe(root)
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReduced || !inView || paused) return
    const id = window.setInterval(() => {
      setStep((prev) => (prev + 1) % STEPS.length)
    }, STEP_MS)
    return () => window.clearInterval(id)
  }, [inView, paused])

  const go = (next: number) => {
    setPaused(true)
    setStep((next + STEPS.length) % STEPS.length)
    trackWebsiteEvent('cta_click', `how_step_${next}`)
  }

  return (
    <section
      id="how-it-works"
      className="cx-scene"
      ref={rootRef}
      aria-label="How Credyx works"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="cx-scene-shell">
        <span className="cx-sales-pill">How it works</span>
        <h2 className="cx-scene-ttl" key={step} aria-live="polite">
          {current.title}
        </h2>

        <div className="cx-scene-grid">
          <div className={`cx-scene-card${paid ? ' paid' : ''}`}>
            <div className="cx-scene-head">
              <span>INV-4821</span>
              <span className="cx-scene-ex">Example</span>
            </div>
            <div className="cx-scene-amt">$2,840.00</div>
            <div className="cx-scene-broker">Northline Logistics</div>

            <div className="cx-scene-docs">
              {DOC_LABELS.map((label, index) => {
                const received = index < current.docs
                return (
                  <div key={label} className={`cx-scene-doc${received ? ' on' : ''}`}>
                    {received ? (
                      <Check size={15} strokeWidth={2.75} aria-hidden />
                    ) : (
                      <FileText size={15} strokeWidth={2} aria-hidden />
                    )}
                    <span>{label}</span>
                  </div>
                )
              })}
            </div>

            <div className={`cx-scene-status ${current.badgeTone}`} key={current.badge}>
              <i aria-hidden />
              <span>{current.badge}</span>
            </div>
          </div>

          <div className="cx-scene-card">
            <div className="cx-scene-head">
              <span>Your live view</span>
              <span className="cx-scene-ex">Step {step + 1} of {STEPS.length}</span>
            </div>
            <ol className="cx-scene-tl">
              {LIVE_ROWS.map((row, index) => {
                const done = index < current.liveThrough
                const active = index === current.liveCurrent && !done
                const state = done ? ' d' : active ? (hold ? ' c hold' : ' c') : ''
                return (
                  <li key={row.label} className={`cx-scene-row${state}`}>
                    <span className="cx-scene-dot-n">
                      {done ? <Check size={14} strokeWidth={3} aria-hidden /> : index + 1}
                    </span>
                    <span className="cx-scene-label">{row.label}</span>
                    <span className="cx-scene-who">{row.who}</span>
                  </li>
                )
              })}
            </ol>
          </div>
        </div>

        <div className="cx-scene-controls">
          <button
            type="button"
            className="cx-scene-nav"
            aria-label="Previous step"
            onClick={() => go(step - 1)}
          >
            <ArrowLeft size={18} strokeWidth={2.5} />
          </button>
          <div className="cx-scene-dots" role="tablist" aria-label="How it works steps">
            {STEPS.map((_, index) => (
              <button
                key={index}
                type="button"
                role="tab"
                aria-selected={index === step}
                aria-label={`Step ${index + 1}`}
                className={`cx-scene-dot${index === step ? ' on' : ''}`}
                onClick={() => go(index)}
              />
            ))}
          </div>
          <button
            type="button"
            className="cx-scene-nav"
            aria-label="Next step"
            onClick={() => go(step + 1)}
          >
            <ArrowRight size={18} strokeWidth={2.5} />
          </button>
        </div>
      </div>
    </section>
  )
}
