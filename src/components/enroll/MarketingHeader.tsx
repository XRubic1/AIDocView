import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Menu, X } from 'lucide-react'

/** Sticky marketing nav for the Credyx waitlist page (mobile hamburger + waitlist CTA). */
export function MarketingHeader() {
  const navigate = useNavigate()
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)

  // Close the mobile menu when the route changes.
  useEffect(() => {
    setMenuOpen(false)
  }, [location.pathname])

  const goWaitlistCta = () => {
    setMenuOpen(false)
    if (location.pathname === '/waitlist') {
      document.getElementById('waitlist-form')?.scrollIntoView({ behavior: 'smooth' })
      return
    }
    navigate('/waitlist')
  }

  const goPricing = () => {
    setMenuOpen(false)
    if (location.pathname === '/waitlist') {
      document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' })
      return
    }
    navigate('/waitlist#pricing')
  }

  const goBuddy = () => {
    setMenuOpen(false)
    if (location.pathname === '/waitlist') {
      document.getElementById('buddy')?.scrollIntoView({ behavior: 'smooth' })
      return
    }
    navigate('/waitlist#buddy')
  }

  const goFeatures = () => {
    setMenuOpen(false)
    if (location.pathname === '/waitlist') {
      document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })
      return
    }
    navigate('/waitlist#features')
  }

  const go = (path: string) => {
    setMenuOpen(false)
    navigate(path)
  }

  return (
    <header className="cx-nav">
      <button
        type="button"
        className="cx-nav-brand"
        onClick={() => {
          setMenuOpen(false)
          window.scrollTo({ top: 0, behavior: 'smooth' })
        }}
        aria-label="Credyx A/R Solutions — back to top"
      >
        <img
          src="/credyx-nav-logo.png"
          alt="Credyx"
          className="cx-nav-logo"
          width={140}
          height={36}
        />
      </button>

      <button
        type="button"
        className="cx-nav-toggle"
        aria-expanded={menuOpen}
        aria-controls="cx-marketing-nav"
        aria-label={menuOpen ? 'Close menu' : 'Open menu'}
        onClick={() => setMenuOpen((open) => !open)}
      >
        {menuOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      <nav
        id="cx-marketing-nav"
        className={`cx-nav-links${menuOpen ? ' open' : ''}`}
        aria-label="Marketing"
      >
        <button type="button" className="cx-nav-link" onClick={goPricing}>
          Pricing
        </button>
        <button type="button" className="cx-nav-link" onClick={goBuddy}>
          Buddy
        </button>
        <button type="button" className="cx-nav-link" onClick={goFeatures}>
          Features
        </button>
        <button type="button" className="cx-nav-link" onClick={() => go('/how-it-works')}>
          How it works
        </button>
        <button type="button" className="cx-nav-link" onClick={() => go('/tour')}>
          Product tour
        </button>
        <button type="button" className="cx-nav-link" onClick={() => go('/client/login')}>
          Client login
        </button>
        <button type="button" className="cx-nav-cta" onClick={goWaitlistCta}>
          Join the waitlist
        </button>
      </nav>
    </header>
  )
}
