import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Menu, X } from 'lucide-react'
import { trackWebsiteEvent } from '../../services/websiteAnalytics'
import { getClientLoginHref } from '../../utils/clientLoginRedirect'

const isMarketingOnly = import.meta.env.VITE_MARKETING_ONLY === 'true'

/** Home path for the public marketing page (never /waitlist). */
const marketingHomePath = '/'

/** True when the current page is the public marketing / demo surface. */
function isMarketingHomePath(pathname: string) {
  return pathname === '/' || pathname === '/demo'
}

/** Sticky marketing nav for the Credyx marketing page (mobile hamburger + Schedule Demo CTA). */
export function MarketingHeader() {
  const navigate = useNavigate()
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)

  // Close the mobile menu when the route changes.
  useEffect(() => {
    setMenuOpen(false)
  }, [location.pathname])

  const onMarketingHome = isMarketingHomePath(location.pathname)

  const goDemoCta = () => {
    trackWebsiteEvent('cta_click', 'nav_schedule_demo')
    setMenuOpen(false)
    const localForm = document.getElementById('waitlist-form')
    if (localForm) {
      localForm.scrollIntoView({ behavior: 'smooth' })
      return
    }
    navigate(`${marketingHomePath}#waitlist-form`)
  }

  const goSection = (id: string) => {
    trackWebsiteEvent('nav_click', `nav_${id}`)
    setMenuOpen(false)
    if (onMarketingHome) {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
      return
    }
    navigate(`${marketingHomePath}#${id}`)
  }

  const go = (path: string, target: string) => {
    trackWebsiteEvent('nav_click', target)
    setMenuOpen(false)
    navigate(path)
  }

  /** Client login: in-app on full product; absolute app URL on marketing-only. */
  const goClientLogin = () => {
    trackWebsiteEvent('nav_click', 'nav_client_login')
    setMenuOpen(false)
    if (isMarketingOnly) {
      window.location.assign(getClientLoginHref())
      return
    }
    navigate('/client/login')
  }

  return (
    <header className="cx-nav">
      <button
        type="button"
        className="cx-nav-brand"
        onClick={() => {
          trackWebsiteEvent('nav_click', 'nav_logo')
          setMenuOpen(false)
          if (onMarketingHome) {
            window.scrollTo({ top: 0, behavior: 'smooth' })
            return
          }
          navigate(marketingHomePath)
        }}
        aria-label="Credyx A/R Solutions — back to top"
      >
        <img
          src="/credyx-logo-white-cred-no-bg.png"
          alt="Credyx"
          className="cx-nav-logo"
          width={360}
          height={96}
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
        <button type="button" className="cx-nav-link" onClick={() => goSection('how-it-works')}>
          How it works
        </button>
        <button type="button" className="cx-nav-link" onClick={() => goSection('why')}>
          Why Credyx
        </button>
        <button type="button" className="cx-nav-link" onClick={() => goSection('product')}>
          Product
        </button>
        <button type="button" className="cx-nav-link" onClick={() => goSection('pricing')}>
          Pricing
        </button>
        {!isMarketingOnly && (
          <button type="button" className="cx-nav-link" onClick={() => go('/tour', 'nav_tour')}>
            Product tour
          </button>
        )}
        <button
          type="button"
          className="cx-nav-link"
          onClick={() => {
            trackWebsiteEvent('nav_click', 'nav_mc_check')
            setMenuOpen(false)
            if (isMarketingOnly) {
              window.location.assign(`${getClientLoginHref().replace(/\/client\/login$/, '')}/MC`)
              return
            }
            navigate('/MC')
          }}
        >
          MC Check
        </button>
        <button type="button" className="cx-nav-link" onClick={goClientLogin}>
          Client login
        </button>
        <button type="button" className="cx-nav-cta" onClick={goDemoCta}>
          Schedule Demo
        </button>
      </nav>
    </header>
  )
}
