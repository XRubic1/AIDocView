import { useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import '../styles/landing.css'
import { useRevealOnScroll } from '../hooks/useRevealOnScroll'
import { useCountAnimation } from '../hooks/useCountAnimation'
import {
  TICKER_ITEMS,
  WORKFLOW_STEPS,
  SAMPLE_DOCS,
  VERDICT_CARDS,
  RULE_CARDS,
  HERO_STATS,
} from '../data/landingData'

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="2" strokeLinecap="square" />
    </svg>
  )
}

function TickerRow() {
  const items = [...TICKER_ITEMS, ...TICKER_ITEMS]
  return (
    <div className="ticker">
      <div className="ticker-track">
        {items.map((item, i) => (
          <div className="ticker-item" key={`${item.loadId}-${i}`}>
            <span className={`dot ${item.status}`} />
            <span className={`status-label ${item.status}`}>{item.label}</span>
            <span className="load-id">{item.loadId}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** AIDocView marketing landing — freight document intelligence */
export default function LandingPage() {
  const navigate = useNavigate()
  const rootRef = useRef<HTMLDivElement>(null)

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

      <section className="hero">
        <div className="hero-grid-bg" aria-hidden />
        <div className="hero-accent-bar" aria-hidden />

        <div className="hero-tag">Freight Document Intelligence</div>

        <h1 className="hero-headline">
          <div>Every Load.</div>
          <div className="line2">Every Doc.</div>
          <div className="line3">
            10 Seconds<span className="cursor" />
          </div>
        </h1>

        <p className="hero-sub">
          AIDocView automatically audits your load paperwork — rate cons, BOLs, invoices, PODs — against your load
          sheet, flagging mismatches and missing pages before they become problems.
        </p>

        <div className="hero-buttons">
          <button type="button" className="btn-primary" onClick={() => navigate('/dev/load-review')}>
            <PlusIcon />
            Open Review Engine
          </button>
          <button type="button" className="btn-secondary" onClick={() => scrollTo('review')}>
            See How It Works →
          </button>
        </div>

        <div className="hero-stats">
          {HERO_STATS.map((stat) => (
            <div className="hero-stat" key={stat.label}>
              <div className="hero-stat-num">
                {stat.prefix}
                <span className="count-num" data-target={stat.target}>
                  0
                </span>
                <span className="accent">{stat.suffix}</span>
              </div>
              <div className="hero-stat-label">{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      <TickerRow />

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

          <div className="doc-panel reveal reveal-delay-1">
            <div className="panel-header">
              <span className="panel-title">LD-48294 · Kroger Distribution · 5 documents</span>
              <span className="panel-status rejected">Rejected</span>
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
              Why This Load
              <br />
              Was Rejected
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
                  Kroger DC delivery requires receiver signature on POD. Only a facility stamp was detected. Manual
                  review required.
                </div>
              </div>
            </div>
            <div className="flag-item reveal reveal-delay-2">
              <span className="flag-sev info">Info</span>
              <div>
                <div className="flag-title">Load Number Variation</div>
                <div className="flag-desc">
                  BOL references <code>KR-48294-B</code>, rate con shows <code>48294</code>. Matched via suffix rule.
                  No action needed.
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
            When a dispatcher overrides a verdict, AIDocView doesn&apos;t forget. That correction is converted into a
            permanent, named rule — specific to that shipper, broker, or lane. The system gets smarter for{' '}
            <em>your operation</em> over time.
          </p>
        </div>

        <div className="reveal reveal-delay-1">
          <div className="rules-label">Active Rules — 14 total</div>

          {RULE_CARDS.map((rule) => (
            <div key={rule.name} className={`rule-card ${rule.isNew ? 'new-rule' : ''}`}>
              <div className="rule-header">
                <span className="rule-name">{rule.name}</span>
                <span className={`rule-badge ${rule.badge}`}>{rule.badgeLabel}</span>
              </div>
              <div className="rule-body">
                {rule.name === 'Standard BOL Signature' && (
                  <>
                    Require <code>receiver_signature</code> + <code>delivery_date</code> on all BOLs
                  </>
                )}
                {rule.name === 'Walmart: Stamp Accepted' && (
                  <>
                    For <code>shipper = &quot;WALMART*&quot;</code>, facility stamp counts as valid receiver signature
                  </>
                )}
                {rule.name === 'Echo Global: Name Variants' && (
                  <>
                    Match <code>&quot;Echo Global&quot;</code>, <code>&quot;Echo Logistics&quot;</code>,{' '}
                    <code>&quot;ECHO&quot;</code> as same broker
                  </>
                )}
                {rule.name === 'Kroger: Photo POD Valid' && (
                  <>
                    For <code>shipper = &quot;KROGER*&quot;</code>, driver photo of unloaded trailer accepted as POD
                  </>
                )}
              </div>
              <div className="rule-meta">{rule.meta}</div>
            </div>
          ))}

          <div className="rules-more">+ 10 more rules active</div>
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
