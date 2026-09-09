/**
 * First-login / recovery: create a portal password after the welcome or reset link.
 */
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, KeyRound } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import {
  requestClientPasswordReset,
  updateClientPassword,
} from '../services/clientAuthService'
import { clientNeedsPasswordSetup } from '../services/sessionService'
import { fetchClientById } from '../services/clientRegistry'
import '../styles/credyxAuth.css'

export default function ClientSetupPassword() {
  const navigate = useNavigate()
  const { resolved, isReady, refreshSession } = useAuth()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [email, setEmail] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const hasSession = Boolean(resolved.session)
  const needsSetup = clientNeedsPasswordSetup(resolved.user)

  useEffect(() => {
    if (!isReady) return
    if (hasSession && !needsSetup && resolved.principal === 'client') {
      navigate('/client/dashboard', { replace: true })
    }
  }, [isReady, hasSession, needsSetup, resolved.principal, navigate])

  const handleCreatePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setInfo('')
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    setIsLoading(true)
    try {
      const result = await updateClientPassword(password)
      if (!result.ok) {
        setError(result.error ?? 'Could not save password.')
        return
      }
      await refreshSession()
      const client = resolved.clientId ? await fetchClientById(resolved.clientId) : null
      if (client?.status === 'pending' || client?.status === 'inactive') {
        navigate('/client/dashboard', { replace: true })
        return
      }
      navigate('/client/dashboard', { replace: true })
    } catch {
      setError('Could not save password. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleRequestLink = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setInfo('')
    if (!email.trim()) {
      setError('Enter the email on your Credyx account.')
      return
    }
    setIsLoading(true)
    try {
      const result = await requestClientPasswordReset(email.trim())
      if (!result.ok) {
        setError(result.error ?? 'Could not send setup email.')
        return
      }
      setInfo('If an account exists for that email, we sent a link to create your password.')
    } catch {
      setError('Could not send setup email. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="credyx-auth">
      <aside className="credyx-auth__brand" aria-hidden={false}>
        <div className="credyx-auth__brand-photo" aria-hidden="true" />
        <div className="credyx-auth__brand-mesh" aria-hidden="true" />
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
            Account setup
          </div>
          <h2 className="credyx-auth__brand-title">
            Create your password, <em>then you&apos;re in.</em>
          </h2>
          <p className="credyx-auth__brand-sub">
            Your portal is ready. Set a password on first login — we&apos;ll handle paperwork and keep you updated, paid on time.
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
            <h1>{hasSession ? 'Create your password' : 'Set up your account'}</h1>
            <p>
              {hasSession
                ? 'Choose a password for the Credyx client portal. You will use this on every sign-in.'
                : 'Open the link from your welcome email, or enter your email and we will send a new setup link.'}
            </p>
          </div>

          <form
            onSubmit={hasSession ? handleCreatePassword : handleRequestLink}
            className="credyx-auth__form"
            noValidate
          >
            {!hasSession && (
              <div className="credyx-auth__field">
                <label htmlFor="setup-email">Email address</label>
                <input
                  id="setup-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value)
                    setError('')
                  }}
                  placeholder="you@company.com"
                  className="credyx-auth__input"
                  required
                  disabled={isLoading}
                />
              </div>
            )}

            {hasSession && (
              <>
                <div className="credyx-auth__field">
                  <label htmlFor="setup-password">New password</label>
                  <div className="credyx-auth__input-wrap">
                    <input
                      id="setup-password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value)
                        setError('')
                      }}
                      placeholder="At least 8 characters"
                      className="credyx-auth__input"
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
                <div className="credyx-auth__field">
                  <label htmlFor="setup-confirm">Confirm password</label>
                  <input
                    id="setup-confirm"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(e) => {
                      setConfirm(e.target.value)
                      setError('')
                    }}
                    placeholder="Re-enter password"
                    className="credyx-auth__input"
                    required
                    disabled={isLoading}
                  />
                </div>
              </>
            )}

            {(error || info) && (
              <div
                className={`credyx-auth__alert ${error ? 'credyx-auth__alert--error' : 'credyx-auth__alert--info'}`}
                role="alert"
              >
                {error || info}
              </div>
            )}

            <button type="submit" className="credyx-auth__submit" disabled={isLoading || !isReady}>
              {isLoading ? (
                <>
                  <span className="credyx-auth__spinner" aria-hidden="true" />
                  <span>{hasSession ? 'Saving…' : 'Sending…'}</span>
                </>
              ) : (
                <>
                  <KeyRound className="w-4 h-4" aria-hidden="true" />
                  <span>{hasSession ? 'Save password and continue' : 'Send setup link'}</span>
                </>
              )}
            </button>
          </form>

          <div className="credyx-auth__footer">
            <p>
              Already set a password?{' '}
              <Link to="/client/login" className="credyx-auth__text-btn">
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </main>
    </div>
  )
}
