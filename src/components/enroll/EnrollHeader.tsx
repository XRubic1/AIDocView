import { useNavigate } from 'react-router-dom'

/** Sticky light marketing nav shared by the Credyx public pages. */
export function EnrollHeader() {
  const navigate = useNavigate()

  return (
    <header className="cx-nav">
      <button
        type="button"
        className="cx-nav-brand"
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        aria-label="Credyx A/R Solutions — back to top"
      >
        <img
          src="/credyx-nav-wordmark-light.png"
          alt="Credyx"
          className="cx-nav-logo"
          width={360}
          height={96}
          decoding="async"
        />
      </button>
      <nav className="cx-nav-links">
        <button type="button" className="cx-nav-link" onClick={() => navigate('/how-it-works')}>
          How it works
        </button>
        <button type="button" className="cx-nav-link" onClick={() => navigate('/tour')}>
          Product tour
        </button>
        <button type="button" className="cx-nav-link" onClick={() => navigate('/client/login')}>
          Client login
        </button>
        <button type="button" className="cx-nav-cta" onClick={() => navigate('/enroll')}>
          Enroll now
        </button>
      </nav>
    </header>
  )
}
