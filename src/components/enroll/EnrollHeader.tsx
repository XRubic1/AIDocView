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
        Cred<span>yx</span>
      </button>
      <nav className="cx-nav-links">
        <button className="cx-nav-link" onClick={() => navigate('/how-it-works')}>
          How It Works
        </button>
        <button className="cx-nav-link" onClick={() => navigate('/tour')}>
          Product Tour
        </button>
        <button className="cx-nav-link" onClick={() => navigate('/client/login')}>
          Client Login
        </button>
        <button className="cx-nav-cta" onClick={() => navigate('/enroll')}>
          Get Started
        </button>
      </nav>
    </header>
  )
}
