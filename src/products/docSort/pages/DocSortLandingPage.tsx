import { useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import '../styles/docSortLanding.css'
import { useRevealOnScroll } from '../../../hooks/useRevealOnScroll'
import { useCountAnimation } from '../../../hooks/useCountAnimation'
import {
  DOCSORT_COMPARE,
  DOCSORT_FEATURES,
  DOCSORT_HERO,
  DOCSORT_HERO_STATS,
  DOCSORT_PREVIEW_NOTE,
  DOCSORT_SAMPLE_GROUPS,
  DOCSORT_TICKER,
  DOCSORT_WORKFLOW,
  type DocSortTickerItem,
} from '../data/docSortLandingData'

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="2" strokeLinecap="square" />
    </svg>
  )
}

function TickerRow({ items }: { items: DocSortTickerItem[] }) {
  const doubled = [...items, ...items]
  return (
    <div className="ds-lp-ticker-wrap">
      <div className="ds-lp-ticker">
        <div className="ds-lp-ticker-track">
          {doubled.map((item, i) => (
            <div className="ds-lp-ticker-item" key={`${item.loadId}-${i}`}>
              <span className={`dot ${item.status}`} />
              <span>{item.label}</span>
              <span className="load-id">{item.loadId}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/** DocSort marketing landing — separate from AIDocView `/` landing. */
export default function DocSortLandingPage() {
  const navigate = useNavigate()
  const rootRef = useRef<HTMLDivElement>(null)

  useRevealOnScroll(rootRef)
  useCountAnimation(rootRef)

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <div className="docsort-landing-page" ref={rootRef}>
      <nav className="ds-lp-nav">
        <button type="button" className="ds-lp-logo" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
          Doc<span>Sort</span>
        </button>
        <ul className="ds-lp-nav-links">
          <li>
            <a href="#workflow" onClick={(e) => { e.preventDefault(); scrollTo('workflow') }}>
              Workflow
            </a>
          </li>
          <li>
            <a href="#preview" onClick={(e) => { e.preventDefault(); scrollTo('preview') }}>
              Output
            </a>
          </li>
          <li>
            <a href="#features" onClick={(e) => { e.preventDefault(); scrollTo('features') }}>
              Features
            </a>
          </li>
          <li>
            <a href="#compare" onClick={(e) => { e.preventDefault(); scrollTo('compare') }}>
              vs AIDocView
            </a>
          </li>
        </ul>
        <div className="ds-lp-nav-right">
          <Link to="/home" className="ds-lp-nav-link-muted">
            Both products
          </Link>
          <Link to="/" className="ds-lp-nav-link-muted">
            AIDocView
          </Link>
          <button type="button" className="ds-lp-nav-cta" onClick={() => navigate('/sort')}>
            Open DocSort
          </button>
        </div>
      </nav>

      <div className="ds-lp-hero-fold">
        <section className="ds-lp-hero">
          <div className="ds-lp-hero-grid" aria-hidden />
          <div className="ds-lp-hero-accent" aria-hidden />

          <div className="ds-lp-hero-inner">
            <div>
              <div className="ds-lp-hero-tag">{DOCSORT_HERO.tag}</div>
              <h1>
                <div>{DOCSORT_HERO.line1}</div>
                <div className="line2">{DOCSORT_HERO.line2}</div>
                <div>{DOCSORT_HERO.line3}</div>
              </h1>
              <p className="ds-lp-hero-sub">{DOCSORT_HERO.sub}</p>
              <div className="ds-lp-hero-btns">
                <button type="button" className="ds-lp-btn-primary" onClick={() => navigate('/sort')}>
                  <PlusIcon />
                  Start sorting
                </button>
                <button type="button" className="ds-lp-btn-secondary" onClick={() => scrollTo('workflow')}>
                  See workflow →
                </button>
              </div>
            </div>

            <div className="ds-lp-hero-stats">
              {DOCSORT_HERO_STATS.map((stat) => (
                <div className="ds-lp-stat reveal" key={stat.label}>
                  <div className="ds-lp-stat-num">
                    <span className="count-num" data-target={stat.target}>
                      0
                    </span>
                    <span className="accent">{stat.suffix}</span>
                  </div>
                  <div className="ds-lp-stat-label">{stat.label}</div>
                  {stat.footnote && <div className="ds-lp-stat-foot">{stat.footnote}</div>}
                </div>
              ))}
            </div>
          </div>
        </section>

        <TickerRow items={DOCSORT_TICKER} />
      </div>

      <section className="ds-lp-workflow" id="workflow">
        <div className="ds-lp-workflow-inner">
          <div className="reveal">
            <div className="ds-lp-section-tag">The process</div>
            <h2 className="ds-lp-section-title">
              Six steps.
              <br />
              Sorted paperwork.
            </h2>
          </div>

          <div className="ds-lp-steps">
            {DOCSORT_WORKFLOW.map((step) => (
              <div key={step.num} className={`ds-lp-step reveal ${step.delayClass}`.trim()}>
                <div className="ds-lp-step-num">{step.num}</div>
                <div className="ds-lp-step-title">{step.title}</div>
                <div className="ds-lp-step-desc">{step.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="ds-lp-preview-section" id="preview">
        <div className="ds-lp-preview-inner">
          <div className="reveal">
            <div className="ds-lp-section-tag">Workbench output</div>
            <h2 className="ds-lp-section-title">
              Matched loads.
              <br />
              Ready to ship.
            </h2>
          </div>

          <div className="ds-lp-preview-grid">
            <div className="ds-lp-panel reveal">
              <div className="ds-lp-panel-head">
                <span>Sorted loads</span>
                <span className="ds-lp-panel-status">{DOCSORT_PREVIEW_NOTE}</span>
              </div>
              {DOCSORT_SAMPLE_GROUPS.map((g) => (
                <div
                  key={g.load}
                  className={`ds-lp-group-row${g.status === 'unmatched' ? ' unmatched' : ''}`}
                >
                  <div className="ds-lp-group-load">{g.load}</div>
                  <div className="ds-lp-doc-pill">{g.rateCon}</div>
                  <div className="ds-lp-doc-pill">{g.bol}</div>
                </div>
              ))}
            </div>

            <div className="ds-lp-panel ds-lp-actions-panel reveal reveal-delay-1">
              <div className="ds-lp-panel-head">
                <span>Per-load actions</span>
              </div>
              <div className="ds-lp-action-row">
                <span>View PDF</span>
                <span>Verify</span>
              </div>
              <div className="ds-lp-action-row">
                <span>Generate invoice</span>
                <span>PDF</span>
              </div>
              <div className="ds-lp-action-row">
                <span>Download binder</span>
                <span>ZIP</span>
              </div>
              <div className="ds-lp-action-row">
                <span>Full batch binder</span>
                <span>All loads</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <section id="features">
        <div className="reveal">
          <div className="ds-lp-section-tag">Why DocSort</div>
          <h2 className="ds-lp-section-title">
            Sorting without
            <br />
            the audit engine.
          </h2>
        </div>

        <div className="ds-lp-features">
          {DOCSORT_FEATURES.map((f, i) => (
            <div
              key={f.title}
              className={`ds-lp-feature ${f.variant} reveal${i > 0 ? ` reveal-delay-${i}` : ''}`.trim()}
            >
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="compare">
        <div className="reveal">
          <div className="ds-lp-section-tag">Product line</div>
          <h2 className="ds-lp-section-title">
            DocSort vs
            <br />
            AIDocView.
          </h2>
        </div>

        <div className="ds-lp-compare">
          <div className="ds-lp-compare-col docsort reveal">
            <h3>
              Doc<span>Sort</span>
            </h3>
            <ul>
              {DOCSORT_COMPARE.docsort.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div className="ds-lp-compare-col aidoc reveal reveal-delay-1">
            <h3>
              AI<span>Doc</span>View
            </h3>
            <ul>
              {DOCSORT_COMPARE.aidocview.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <div className="ds-lp-cta-band reveal">
        <h2>Ready to sort your next batch?</h2>
        <p>Upload rate cons and BOLs, match by load, then review, invoice, and export — no review engine required.</p>
        <button type="button" className="ds-lp-btn-primary" onClick={() => navigate('/sort')}>
          <PlusIcon />
          Open DocSort workbench
        </button>
      </div>

      <footer className="ds-lp-footer">
        <div>
          <div className="ds-lp-footer-logo">
            Doc<span>Sort</span>
          </div>
          <div className="ds-lp-footer-tag">Batch document matching</div>
        </div>
        <div className="ds-lp-footer-copy">
          <div>
            Need full paperwork audit?{' '}
            <Link to="/">AIDocView</Link>
          </div>
          <div className="ds-lp-footer-sub">Sorting only — not dispatching, not payroll.</div>
        </div>
      </footer>
    </div>
  )
}
