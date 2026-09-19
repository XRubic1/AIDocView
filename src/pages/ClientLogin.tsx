import { useState, useEffect } from 'react'
import { Link, useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import { LogIn, Eye, EyeOff } from 'lucide-react'
import { signInClientAuth, requestClientPasswordReset } from '../services/clientAuthService'
import { clientNeedsPasswordSetup, getCurrentSession } from '../services/sessionService'
import { fetchClientById } from '../services/clientRegistry'
import { getSafeClientReturnPath } from '../utils/clientLoginRedirect'
import '../styles/credyxAuth.css'

export default function ClientLogin() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const sessionMessage = (location.state as { message?: string } | null)?.message
  const returnPath = getSafeClientReturnPath(
    searchParams.get('next'),
    (location.state as { from?: string } | null)?.from
  )

  useEffect(() => {
    void (async () => {
      const session = await getCurrentSession()
      if (session.principal !== 'client' || !session.clientId) return
      if (clientNeedsPasswordSetup(session.user)) {
        navigate('/client/setup-password', { replace: true })
        return
      }
      const client = await fetchClientById(session.clientId)
      if (client?.status === 'active') {
        navigate(returnPath, { replace: true })
      }
    })()
  }, [navigate, returnPath])

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [showForgot, setShowForgot] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setInfo('')
    setIsLoading(true)

    if (!email || !password) {
      setError('Please enter both email and password')
      setIsLoading(false)
      return
    }

    if (!acceptedTerms) {
      setError('Please agree to the Terms of Use and Privacy Policy to continue.')
      setIsLoading(false)
      return
    }

    try {
      const auth = await signInClientAuth(email, password)
      if (!auth.ok) {
        setError(auth.error ?? 'Invalid email or password')
        return
      }

      const client = auth.clientId ? await fetchClientById(auth.clientId) : null
      if (!client) {
        setError('No account found for that email. Enroll your company first, then sign in.')
        return
      }

      const session = await getCurrentSession()
      if (clientNeedsPasswordSetup(session.user)) {
        navigate('/client/setup-password', { replace: true })
        return
      }

      if (client.status === 'pending' || client.status === 'inactive') {
        setError('Your account is not active yet. We will email you when it is ready.')
        return
      }

      navigate(returnPath)
    } catch {
      setError('An error occurred during login. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setInfo('')
    if (!email) {
      setError('Enter your email address first.')
      return
    }
    setIsLoading(true)
    try {
      const result = await requestClientPasswordReset(email)
      if (!result.ok) {
        setError(result.error ?? 'Could not send reset email.')
        return
      }
      setInfo('If an account exists for that email, a password reset link has been sent.')
      setShowForgot(false)
    } catch {
      setError('Could not send reset email. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const inputErrorClass = error ? 'credyx-auth__input--error' : ''

  return (
    <div className="credyx-auth">
      <aside className="credyx-auth__brand" aria-hidden={false}>
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
            Client portal
          </div>
          <h2 className="credyx-auth__brand-title">
            <span className="credyx-auth__brand-title-line">Your back office,</span>
            <em className="credyx-auth__accent">In one portal.</em>
          </h2>
          <p className="credyx-auth__brand-sub">
            Focus on the road. We&apos;ll verify paperwork, invoice brokers, and keep you updated —
            paid on time.
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
            <h1>{showForgot ? 'Reset password' : 'Welcome back'}</h1>
            <p>
              {showForgot
                ? 'Enter your email and we will send a link to set a new password.'
                : 'Sign in to your Credyx client portal.'}
            </p>
          </div>

          <form
            onSubmit={showForgot ? handleForgotPassword : handleSubmit}
            className="credyx-auth__form"
            noValidate
          >
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
                placeholder="you@company.com"
                className={`credyx-auth__input ${inputErrorClass}`}
                required
                disabled={isLoading}
              />
            </div>

            {!showForgot && (
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
            )}

            {!showForgot && (
              <div className="credyx-auth__row">
                <label className="credyx-auth__terms">
                  <input
                    type="checkbox"
                    checked={acceptedTerms}
                    onChange={(e) => {
                      setAcceptedTerms(e.target.checked)
                      setError('')
                    }}
                    disabled={isLoading}
                    required
                  />
                  <span>
                    I agree to the{' '}
                    <Link to="/terms" target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                      Terms of Use
                    </Link>{' '}
                    and{' '}
                    <Link to="/privacy" target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                      Privacy Policy
                    </Link>
                    .
                  </span>
                </label>

                <button
                  type="button"
                  className="credyx-auth__link"
                  onClick={() => {
                    setShowForgot(true)
                    setError('')
                  }}
                >
                  Forgot password?
                </button>
              </div>
            )}

            {(sessionMessage || error || info) && (
              <div
                className={`credyx-auth__alert ${
                  error ? 'credyx-auth__alert--error' : info ? 'credyx-auth__alert--info' : 'credyx-auth__alert--warn'
                }`}
                role="alert"
              >
                {error || info || sessionMessage}
              </div>
            )}

            <button
              type="submit"
              className="credyx-auth__submit"
              disabled={isLoading || (!showForgot && !acceptedTerms)}
            >
              {isLoading ? (
                <>
                  <span className="credyx-auth__spinner" aria-hidden="true" />
                  <span>{showForgot ? 'Sending…' : 'Signing in…'}</span>
                </>
              ) : (
                <>
                  <LogIn className="w-4 h-4" aria-hidden="true" />
                  <span>{showForgot ? 'Send reset link' : 'Sign in'}</span>
                </>
              )}
            </button>

            {showForgot && (
              <button type="button" className="credyx-auth__back" onClick={() => setShowForgot(false)}>
                Back to sign in
              </button>
            )}
          </form>

          <div className="credyx-auth__footer">
            <p>
              New client?{' '}
              <button type="button" className="credyx-auth__text-btn" onClick={() => navigate('/enroll')}>
                Enroll your company
              </button>
              {' · '}
              First login?{' '}
              <button
                type="button"
                className="credyx-auth__text-btn"
                onClick={() => navigate('/client/setup-password')}
              >
                Create your password
              </button>
            </p>
          </div>
        </div>
      </main>
    </div>
  )
}
