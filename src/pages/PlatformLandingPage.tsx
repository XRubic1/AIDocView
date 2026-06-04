import { useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import '../styles/platformLanding.css'
import { useRevealOnScroll } from '../hooks/useRevealOnScroll'
import {
  PLATFORM_AI_NOTE,
  PLATFORM_COMPARE_ROWS,
  PLATFORM_HERO,
  PLATFORM_PRODUCTS,
  PLATFORM_WHEN_TO_USE,
} from '../data/platformLandingData'

/** Combined marketing landing for AIDocView + DocSort. */
export default function PlatformLandingPage() {
  const navigate = useNavigate()
  const rootRef = useRef<HTMLDivElement>(null)

  useRevealOnScroll(rootRef)

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <div className="platform-landing-page" ref={rootRef}>
      <nav className="pl-nav">
        <button
          type="button"
          className="pl-nav-brand"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        >
          Freight<span>Docs</span>
        </button>
        <ul className="pl-nav-links">
          <li>
            <a href="#products" onClick={(e) => { e.preventDefault(); scrollTo('products') }}>
              Products
            </a>
          </li>
          <li>
            <a href="#compare" onClick={(e) => { e.preventDefault(); scrollTo('compare') }}>
              Compare
            </a>
          </li>
          <li>
            <a href="#when" onClick={(e) => { e.preventDefault(); scrollTo('when') }}>
              When to use
            </a>
          </li>
        </ul>
      </nav>

      <div className="pl-hero-fold">
        <section className="pl-hero">
          <div className="pl-hero-grid" aria-hidden />
          <div className="pl-hero-inner">
            <div className="pl-hero-tag">{PLATFORM_HERO.tag}</div>
            <h1>
              {PLATFORM_HERO.title}
              <br />
              <span className="accent">{PLATFORM_HERO.titleAccent}</span>
            </h1>
            <p className="pl-hero-sub">{PLATFORM_HERO.sub}</p>

            <div className="pl-products reveal visible" id="products">
              {PLATFORM_PRODUCTS.map((product, i) => (
                <article
                  key={product.id}
                  className={`pl-product-card ${product.variant} reveal${i ? ' reveal-delay-1' : ''}`}
                >
                  <div className="pl-product-top">
                    <div className="pl-product-tag">{product.tagline}</div>
                    <h2 className="pl-product-name">
                      {product.name}
                      <span>{product.nameAccent}</span>
                    </h2>
                  </div>
                  <div className="pl-product-body">
                    <p className="pl-product-desc">{product.description}</p>
                    <ul className="pl-product-highlights">
                      {product.highlights.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="pl-product-actions">
                    <button
                      type="button"
                      className="pl-btn-primary"
                      onClick={() => navigate(product.primaryPath)}
                    >
                      {product.primaryCta}
                    </button>
                    <Link to={product.secondaryPath} className="pl-btn-secondary">
                      {product.secondaryCta}
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>
      </div>

      <section className="pl-section reveal" id="compare">
        <div className="pl-section-tag">Side by side</div>
        <h2 className="pl-section-title">
          Same industry.
          <br />
          Different jobs.
        </h2>
        <div className="pl-compare">
          <div className="pl-compare-row head">
            <div className="pl-compare-cell label" />
            <div className="pl-compare-cell audit">
              AI<span>Doc</span>View
            </div>
            <div className="pl-compare-cell sort">
              Doc<span>Sort</span>
            </div>
          </div>
          {PLATFORM_COMPARE_ROWS.map((row) => (
            <div className="pl-compare-row" key={row.label}>
              <div className="pl-compare-cell label">{row.label}</div>
              <div className="pl-compare-cell">{row.aidocview}</div>
              <div className="pl-compare-cell">{row.docsort}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="pl-section reveal" id="when">
        <div className="pl-section-tag">Guidance</div>
        <h2 className="pl-section-title">Pick the right tool.</h2>
        <div className="pl-when-grid">
          {PLATFORM_WHEN_TO_USE.map((item) => (
            <div className="pl-when-card" key={item.title}>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="pl-ai-note reveal" style={{ marginLeft: 28, marginRight: 28 }}>
        <strong>AI notice</strong>
        {PLATFORM_AI_NOTE}
      </div>

      <footer className="pl-footer">
        <div className="pl-footer-links">
          <Link to="/">AIDocView</Link>
          <Link to="/docsort">DocSort</Link>
          <Link to="/engine">Review engine</Link>
          <Link to="/sort">DocSort app</Link>
        </div>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--pl-muted)' }}>
          Not dispatching. Not payroll. Paperwork intelligence only.
        </p>
      </footer>
    </div>
  )
}
