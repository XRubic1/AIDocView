/**
 * First-login / recovery: create a portal password after the welcome or reset link.
 * This page is only for email-link sessions — create-password is not a public self-serve flow.
 */
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, KeyRound } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { updateClientPassword } from '../services/clientAuthService'
import {
  clientNeedsPasswordSetup,
  markPasswordSetupRequired,
} from '../services/sessionService'
import { fetchClientById } from '../services/clientRegistry'
import { getSupabase } from '../lib/supabase'
import '../styles/credyxAuth.css'

/** True when the URL looks like an auth recovery / invite redirect. */
function urlSuggestsPasswordSetup(): boolean {
  if (typeof window === 'undefined') return false
  const hash = window.location.hash.replace(/^#/, '')
  const hashParams = new URLSearchParams(hash)
  const query = new URLSearchParams(window.location.search)
  const type = hashParams.get('type') || query.get('type')
  if (type === 'recovery' || type === 'invite' || type === 'magiclink') return true
  if (hashParams.has('access_token') || query.has('code')) return true
  return false
}

export default function ClientSetupPassword() {
  const navigate = useNavigate()
  const { resolved, isReady, refreshSession } = useAuth()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [awaitingLinkSession, setAwaitingLinkSession] = useState(() => urlSuggestsPasswordSetup())

  const hasSession = Boolean(resolved.session)
  const needsSetup = clientNeedsPasswordSetup(resolved.user)

  useEffect(() => {
    if (!urlSuggestsPasswordSetup()) return
    markPasswordSetupRequired()
  }, [])

  // Give Supabase a moment to exchange hash/code tokens into a session.
  useEffect(() => {
    if (!awaitingLinkSession) return
    if (hasSession) {
      setAwaitingLinkSession(false)
      return
    }
    let cancelled = false
    const supabase = getSupabase()
    const trySession = async () => {
      if (!supabase) return
      const { data } = await supabase.auth.getSession()
      if (cancelled) return
      if (data.session) {
        markPasswordSetupRequired()
        await refreshSession()
        setAwaitingLinkSession(false)
      }
    }
    void trySession()
    const timer = window.setTimeout(() => {
      if (cancelled) return
      void trySession().finally(() => {
        if (!cancelled) setAwaitingLinkSession(false)
      })
    }, 2500)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [awaitingLinkSession, hasSession, refreshSession])

  useEffect(() => {
    if (!isReady || awaitingLinkSession) return
    if (hasSession && !needsSetup && resolved.principal === 'client') {
      navigate('/client/dashboard', { replace: true })
    }
  }, [isReady, hasSession, needsSetup, resolved.principal, navigate, awaitingLinkSession])

  const handleCreatePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
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

  const showPasswordForm = hasSession && (needsSetup || awaitingLinkSession || urlSuggestsPasswordSetup())
  const showWaiting = awaitingLinkSession && !hasSession
  const showLinkRequired = isReady && !awaitingLinkSession && !hasSession

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
            Account setup
          </div>
          <h2 className="credyx-auth__brand-title">
            Create your password, <em className="credyx-auth__accent">then you&apos;re in.</em>
          </h2>
          <p className="credyx-auth__brand-sub">
            Your portal is ready. Set a password from the link Credyx sent you — we&apos;ll handle paperwork and keep you updated, paid on time.
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
            <h1>
              {showPasswordForm
                ? 'Create your password'
                : showWaiting
                  ? 'Opening your setup link…'
                  : 'Use your email link'}
            </h1>
            <p>
              {showPasswordForm
                ? 'Choose a password for the Credyx client portal. You will use this on every sign-in.'
                : showWaiting
                  ? 'Hang on while we verify your link.'
                  : 'Password setup is sent by Credyx when your account is activated. If you already have a login, use Forgot password on the sign-in page.'}
            </p>
          </div>

          {showPasswordForm && (
            <form onSubmit={handleCreatePassword} className="credyx-auth__form" noValidate>
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

              {error && (
                <div className="credyx-auth__alert credyx-auth__alert--error" role="alert">
                  {error}
                </div>
              )}

              <button type="submit" className="credyx-auth__submit" disabled={isLoading || !isReady}>
                {isLoading ? (
                  <>
                    <span className="credyx-auth__spinner" aria-hidden="true" />
                    <span>Saving…</span>
                  </>
                ) : (
                  <>
                    <KeyRound className="w-4 h-4" aria-hidden="true" />
                    <span>Save password and continue</span>
                  </>
                )}
              </button>
            </form>
          )}

          {showWaiting && (
            <div className="credyx-auth__form">
              <div className="credyx-auth__alert credyx-auth__alert--info" role="status">
                Verifying your link…
              </div>
            </div>
          )}

          {showLinkRequired && (
            <div className="credyx-auth__form">
              <div className="credyx-auth__alert credyx-auth__alert--info" role="status">
                Open the welcome or reset link from your email, or use Forgot password on the sign-in
                page. Credyx sends first-time setup links from the admin portal — they are not
                requested here.
              </div>
              <Link to="/client/login" className="credyx-auth__submit" style={{ textAlign: 'center' }}>
                Back to sign in
              </Link>
            </div>
          )}

          <div className="credyx-auth__footer">
            <p>
              Already set a password?{' '}
              <Link to="/client/login" className="credyx-auth__text-btn">
                Sign in
              </Link>
              {' · '}
              <Link to="/client/login" className="credyx-auth__text-btn" state={{ forgot: true }}>
                Forgot password
              </Link>
            </p>
          </div>
        </div>
      </main>
    </div>
  )
}
