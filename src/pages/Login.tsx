import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { LogIn, Eye, EyeOff } from 'lucide-react'
import { signInAdmin, getCurrentSession } from '../services/adminAuthService'
import {
  getAdminDefaultPath,
  getAdminStaffRole,
  isAdminPathAllowed,
} from '../utils/adminRoles'
import '../styles/credyxAuth.css'

export default function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/admin/dashboard'

  useEffect(() => {
    void (async () => {
      const session = await getCurrentSession()
      if (session.isAdmin) {
        navigate(from, { replace: true })
      }
    })()
  }, [navigate, from])

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)

    if (!email || !password) {
      setError('Please enter both email and password')
      setIsLoading(false)
      return
    }

    try {
      const result = await signInAdmin(email, password)
      if (!result.ok) {
        setError(result.error ?? 'Invalid email or password')
        return
      }
      const session = await getCurrentSession()
      const role = getAdminStaffRole(session.user)
      const dest =
        from && isAdminPathAllowed(from, role) ? from : getAdminDefaultPath(role)
      navigate(dest)
    } catch {
      setError('An error occurred during login. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const inputErrorClass = error ? 'credyx-auth__input--error' : ''

  return (
    <div className="credyx-auth">
      <aside className="credyx-auth__brand">
        <div className="credyx-auth__brand-photo" aria-hidden="true" />
        <div className="credyx-auth__brand-mesh" aria-hidden="true" />
        <svg className="credyx-auth__curve credyx-auth__curve--v" viewBox="0 0 72 1000" preserveAspectRatio="none" aria-hidden="true">
          <path
            className="credyx-auth__curve-fill"
            d="M0,0 C48,180 48,820 0,1000 L72,1000 L72,0 Z"
          />
          <path
            className="credyx-auth__curve-stroke"
            d="M4,0 C52,180 52,820 4,1000"
            fill="none"
          />
        </svg>
        <svg className="credyx-auth__curve credyx-auth__curve--h" viewBox="0 0 1000 48" preserveAspectRatio="none" aria-hidden="true">
          <path
            className="credyx-auth__curve-fill"
            d="M0,0 C280,40 720,40 1000,0 L1000,48 L0,48 Z"
          />
          <path
            className="credyx-auth__curve-stroke"
            d="M0,2 C280,42 720,42 1000,2"
            fill="none"
          />
        </svg>

        <div className="credyx-auth__brand-top">
          <img
            src="/credyx-logo-white-cred-no-bg.png"
            alt="Credyx A/R Solutions"
            className="credyx-auth__logo"
            width={360}
            height={96}
            decoding="async"
          />
        </div>

        <div className="credyx-auth__brand-copy">
          <div className="credyx-auth__eyebrow">
            <span className="credyx-auth__eyebrow-dot" aria-hidden="true" />
            Operations
          </div>
          <h2 className="credyx-auth__brand-title">
            Credyx ops, <em className="credyx-auth__accent">in one place.</em>
          </h2>
          <p className="credyx-auth__brand-sub">
            Manage carriers, invoices, and A/R follow-up across the Credyx platform.
          </p>
        </div>

        <p className="credyx-auth__brand-foot">Credyx · Paid on time</p>
      </aside>

      <main className="credyx-auth__panel">
        <div className="credyx-auth__panel-inner">
          <div className="credyx-auth__mobile-logo">
            <img
              src="/credyx-nav-wordmark-light.png"
              alt="Credyx A/R Solutions"
              width={360}
              height={96}
              decoding="async"
            />
          </div>

          <div className="credyx-auth__heading">
            <h1>Admin sign in</h1>
            <p>Sign in to the Credyx operations portal.</p>
          </div>

          <form onSubmit={handleSubmit} className="credyx-auth__form" noValidate>
            <div className="credyx-auth__field">
              <label htmlFor="email">Email address</label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value)
                  setError('')
                }}
                placeholder="admin@credyx.net"
                className={`credyx-auth__input ${inputErrorClass}`}
                required
                disabled={isLoading}
              />
            </div>

            <div className="credyx-auth__field">
              <label htmlFor="password">Password</label>
              <div className={`credyx-auth__input-wrap ${error ? 'credyx-auth__input-wrap--error' : ''}`}>
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value)
                    setError('')
                  }}
                  placeholder="Enter your password"
                  required
                  disabled={isLoading}
                />
                <button
                  type="button"
                  className="credyx-auth__eye"
                  onClick={() => setShowPassword(!showPassword)}
                  disabled={isLoading}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="credyx-auth__alert credyx-auth__alert--error" role="alert">
                {error}
              </div>
            )}

            <button type="submit" className="credyx-auth__submit" disabled={isLoading}>
              {isLoading ? (
                <>
                  <span className="credyx-auth__spinner" aria-hidden="true" />
                  <span>Signing in…</span>
                </>
              ) : (
                <>
                  <LogIn className="w-4 h-4" aria-hidden="true" />
                  <span>Sign in</span>
                </>
              )}
            </button>
          </form>

          <div className="credyx-auth__footer">
            <button type="button" className="credyx-auth__admin-link" onClick={() => navigate('/client/login')}>
              Client login →
            </button>
          </div>

          <p className="credyx-auth__legal">
            © {new Date().getFullYear()} Credyx A/R Solutions. All rights reserved.
          </p>
        </div>
      </main>
    </div>
  )
}
