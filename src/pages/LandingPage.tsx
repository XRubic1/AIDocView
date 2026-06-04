import { useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import '../styles/landing.css'
import { useRevealOnScroll } from '../hooks/useRevealOnScroll'
import { useCountAnimation } from '../hooks/useCountAnimation'
import { useLandingLiveData } from '../hooks/useLandingLiveData'
import { HERO_HEADLINE_TIMING, HERO_SUB_COPY } from '../data/landingMetrics'
import {
  WORKFLOW_STEPS,
  SAMPLE_DOCS,
  VERDICT_CARDS,
  EXAMPLE_RULE_CARDS,
  DEMO_REVIEW_PANEL,
  type TickerItem,
} from '../data/landingData'

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="2" strokeLinecap="square" />
    </svg>
  )
}

function TickerRow({ items }: { items: TickerItem[] }) {
  const doubled = [...items, ...items]
  return (
    <div className="ticker-wrap">
      <div className="ticker">
        <div className="ticker-track">
          {doubled.map((item, i) => (
            <div className="ticker-item" key={`${item.loadId}-${i}`}>
              <span className={`dot ${item.status}`} />
              <span className={`status-label ${item.status}`}>{item.label}</span>
              <span className="load-id">{item.loadId}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/** AIDocView marketing landing — uses saved review history when available. */
export default function LandingPage() {
  const navigate = useNavigate()
  const rootRef = useRef<HTMLDivElement>(null)
  const live = useLandingLiveData()

  useRevealOnScroll(rootRef)
  useCountAnimation(rootRef)

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <div className="landing-page" ref={rootRef}>
      <nav>
        <button type="button" className="nav-logo" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
          AI<span>Doc</span>View
        </button>
        <ul className="nav-links">
          <li>
            <a href="#workflow" onClick={(e) => { e.preventDefault(); scrollTo('workflow') }}>
              Workflow
            </a>
          </li>
          <li>
            <a href="#review" onClick={(e) => { e.preventDefault(); scrollTo('review') }}>
              Review Engine
            </a>
          </li>
          <li>
            <a href="#verdicts" onClick={(e) => { e.preventDefault(); scrollTo('verdicts') }}>
              Verdicts
            </a>
          </li>
          <li>
            <a href="#learn" onClick={(e) => { e.preventDefault(); scrollTo('learn') }}>
              Rules
            </a>
          </li>
        </ul>
        <button type="button" className="nav-cta" onClick={() => navigate('/dev/load-review')}>
          Open Engine
        </button>
      </nav>

      <div className="hero-fold">
        <section className="hero">
          <div className="hero-grid-bg" aria-hidden />
          <div className="hero-accent-bar" aria-hidden />

          <div className="hero-main">
            <div className="hero-copy">
              <div className="hero-tag">Freight Document Intelligence</div>

              <h1 className="hero-headline">
                <div>{HERO_HEADLINE_TIMING.line1}</div>
                <div className="line2">{HERO_HEADLINE_TIMING.line2}</div>
                <div className="line3">
                  {HERO_HEADLINE_TIMING.line3}
                  <span className="cursor" />
                </div>
              </h1>

              <p className="hero-sub">{HERO_SUB_COPY}</p>

              <div className="hero-buttons">
                <button type="button" className="btn-primary" onClick={() => navigate('/dev/load-review')}>
                  <PlusIcon />
                  Open Review Engine
                </button>
                <button type="button" className="btn-secondary" onClick={() => scrollTo('review')}>
                  See How It Works →
                </button>
              </div>
            </div>

            <div className="hero-stats">
              {live.heroStats.map((stat) => (
                <div className="hero-stat" key={stat.label}>
                  <div className="hero-stat-num">
                    {stat.prefix}
                    <span className="count-num" data-target={stat.target}>
                      0
                    </span>
                    <span className="accent">{stat.suffix}</span>
                  </div>
                  <div className="hero-stat-label">{stat.label}</div>
                  {stat.footnote && <div className="hero-stat-footnote">{stat.footnote}</div>}
                </div>
              ))}
            </div>
          </div>
        </section>

        <TickerRow items={live.tickerItems} />
      </div>

      <section className="workflow" id="workflow">
        <div className="section-header reveal">
          <div className="section-tag">The Process</div>
          <h2 className="section-title">
            Seven Steps.
            <br />
            Zero Guesswork.
          </h2>
        </div>

        <div className="steps">
          {WORKFLOW_STEPS.map((step) => (
            <div key={step.num} className={`step reveal ${step.delayClass ?? ''}`.trim()}>
              <div className="step-num">{step.num}</div>
              <div className="step-title">{step.title}</div>
              <div className="step-desc">{step.desc}</div>
              <div className="step-bar" />
            </div>
          ))}
        </div>
      </section>

      <section className="review-section" id="review">
        <div>
          <div className="section-header reveal">
            <div className="section-tag">Review Engine</div>
            <h2 className="section-title">
              What the AI Reads
              <br />
              In Every Load
            </h2>
          </div>

          <p className="panel-demo-tag reveal">Illustration only</p>

          <div className="doc-panel reveal reveal-delay-1">
            <div className="panel-header">
              <span className="panel-title">{DEMO_REVIEW_PANEL.title}</span>
              <span className={`panel-status ${DEMO_REVIEW_PANEL.status}`}>Rejected</span>
            </div>
            {SAMPLE_DOCS.map((doc) => (
              <div className="doc-item" key={doc.name}>
                <span className={`doc-type ${doc.typeClass}`}>{doc.type}</span>
                <span className="doc-name">{doc.name}</span>
                <span className={`doc-check ${doc.check}`}>{doc.symbol}</span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="section-header reveal">
            <div className="section-tag">Flags Raised</div>
            <h2 className="section-title">
              Why a Load
              <br />
              Gets Rejected
            </h2>
          </div>

          <div className="flags-panel">
            <div className="flag-item reveal">
              <span className="flag-sev critical">Critical</span>
              <div>
                <div className="flag-title">Invoice Amount Mismatch</div>
                <div className="flag-desc">
                  Invoice shows <code>$4,540.00</code> but rate confirmation states <code>$4,300.00</code>. Delta of{' '}
                  <code>$240.00</code> exceeds tolerance.
                </div>
              </div>
            </div>
            <div className="flag-item reveal reveal-delay-1">
              <span className="flag-sev warning">Warning</span>
              <div>
                <div className="flag-title">POD Receiver Signature Missing</div>
                <div className="flag-desc">
                  Delivery requires receiver signature on POD. Only a facility stamp was detected — flagged for manual
                  review.
                </div>
              </div>
            </div>
            <div className="flag-item reveal reveal-delay-2">
              <span className="flag-sev info">Info</span>
              <div>
                <div className="flag-title">Load Number Variation</div>
                <div className="flag-desc">
                  BOL references <code>KR-48294-B</code>, rate con shows <code>48294</code>. Matched via suffix rule when
                  configured.
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="verdicts" id="verdicts">
        <div className="section-header reveal">
          <div className="section-tag">Output</div>
          <h2 className="section-title">
            Three Verdicts.
            <br />
            Always Clear.
          </h2>
        </div>

        <div className="verdict-grid">
          {VERDICT_CARDS.map((card) => (
            <div
              key={card.variant}
              className={`verdict-card ${card.variant} reveal ${card.delayClass ?? ''}`.trim()}
            >
              <div className="verdict-top-bar" />
              <span className="verdict-icon">{card.icon}</span>
              <div className="verdict-name">{card.name}</div>
              <div className="verdict-desc">{card.desc}</div>
              <ul className="verdict-checks">
                {card.checks.map((check) => (
                  <li key={check} className="verdict-check">
                    {check}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="learn-section" id="learn">
        <div>
          <div className="section-header reveal">
            <div className="section-tag">Human-in-the-Loop</div>
            <h2 className="section-title">
              Every Correction
              <br />
              Becomes a Rule
            </h2>
          </div>
          <p className="reveal learn-copy">
            When a dispatcher overrides a verdict, that correction becomes a permanent rule — shipper-specific
            overrides, tolerances, and custom checks. The system gets smarter for your operation over time.
          </p>
        </div>

        <div className="reveal reveal-delay-1">
          <div className="rules-label">{live.rulesCountLabel}</div>

          {EXAMPLE_RULE_CARDS.map((rule) => (
            <div key={rule.name} className="rule-card">
              <div className="rule-header">
                <span className="rule-name">{rule.name}</span>
                <span className={`rule-badge ${rule.badge}`}>{rule.badgeLabel}</span>
              </div>
              <div className="rule-body">{rule.bodyText}</div>
              <div className="rule-meta">{rule.meta}</div>
            </div>
          ))}

          {live.rulesCount > EXAMPLE_RULE_CARDS.length && (
            <div className="rules-more">+ {live.rulesCount - EXAMPLE_RULE_CARDS.length} more rules configured</div>
          )}
        </div>
      </section>

      <footer>
        <div>
          <div className="footer-logo">
            AI<span>Doc</span>View
          </div>
          <div className="footer-tagline">Freight Document Intelligence</div>
        </div>
        <div className="footer-copy">
          <div>Not dispatching. Not payroll. Not GPS.</div>
          <div className="footer-line2">
            Just one question: <em>is this load&apos;s paperwork complete?</em>
          </div>
        </div>
      </footer>
    </div>
  )
}
