import { useState, useEffect } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { LogIn, Eye, EyeOff } from 'lucide-react'
import { signInClientAuth, getCurrentSession, requestClientPasswordReset } from '../services/clientAuthService'
import { fetchClientById } from '../services/clientRegistry'

export default function ClientLogin() {
  const navigate = useNavigate()
  const location = useLocation()
  const sessionMessage = (location.state as { message?: string } | null)?.message

  useEffect(() => {
    void (async () => {
      const session = await getCurrentSession()
      if (session.principal !== 'client' || !session.clientId) return
      const client = await fetchClientById(session.clientId)
      if (client?.status === 'active') {
        navigate('/client/dashboard', { replace: true })
      }
    })()
  }, [navigate])

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

      if (client.status === 'pending' || client.status === 'inactive') {
        setError('Your account is not active yet. We will email you when it is ready.')
        return
      }

      navigate('/client/dashboard')
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

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#F5F5F5' }}>
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-8">
          <img
            src="/credyx-nav-logo.png"
            alt="Credyx A/R Solutions"
            className="h-14 w-auto"
            style={{ maxHeight: '56px' }}
            width={360}
            height={96}
            decoding="async"
          />
        </div>

        <div className="border rounded-lg shadow-lg" style={{ backgroundColor: '#FFFFFF', borderColor: '#e2e8f0' }}>
          <div className="p-8">
            <div className="text-center mb-8">
              <h1 className="text-2xl font-bold mb-2" style={{ color: '#113543' }}>
                {showForgot ? 'Reset Password' : 'Client Login'}
              </h1>
              <p className="text-sm" style={{ color: '#64748b' }}>
                {showForgot
                  ? 'We will email you a link to set a new password'
                  : 'Sign in to access your client portal'}
              </p>
            </div>

            <form onSubmit={showForgot ? handleForgotPassword : handleSubmit} className="space-y-6">
              <div>
                <label htmlFor="email" className="block text-sm font-medium mb-2" style={{ color: '#113543' }}>
                  Email Address
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value)
                    setError('')
                  }}
                  placeholder="client@example.com"
                  className="w-full px-4 py-2.5 text-sm border rounded"
                  style={{ borderColor: error ? '#ef4444' : '#64748b', color: '#113543' }}
                  required
                  disabled={isLoading}
                />
              </div>

              {!showForgot && (
                <div>
                  <label htmlFor="password" className="block text-sm font-medium mb-2" style={{ color: '#113543' }}>
                    Password
                  </label>
                  <div className="relative">
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value)
                        setError('')
                      }}
                      placeholder="Enter your password"
                      className="w-full px-4 py-2.5 pr-10 text-sm border rounded"
                      style={{ borderColor: error ? '#ef4444' : '#64748b', color: '#113543' }}
                      required
                      disabled={isLoading}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2"
                      disabled={isLoading}
                    >
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>
              )}

              {!showForgot && (
                <label className="flex items-start gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={acceptedTerms}
                    onChange={(e) => {
                      setAcceptedTerms(e.target.checked)
                      setError('')
                    }}
                    disabled={isLoading}
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border"
                    style={{ borderColor: '#64748b', accentColor: '#113543' }}
                    required
                  />
                  <span className="text-xs leading-relaxed" style={{ color: '#64748b' }}>
                    I agree to the{' '}
                    <Link
                      to="/terms"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline font-medium"
                      style={{ color: '#113543' }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      Terms of Use
                    </Link>{' '}
                    and{' '}
                    <Link
                      to="/privacy"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline font-medium"
                      style={{ color: '#113543' }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      Privacy Policy
                    </Link>
                    .
                  </span>
                </label>
              )}

              {!showForgot && (
                <button
                  type="button"
                  onClick={() => {
                    setShowForgot(true)
                    setError('')
                  }}
                  className="text-xs underline"
                  style={{ color: '#64748b' }}
                >
                  Forgot password?
                </button>
              )}

              {(sessionMessage || error || info) && (
                <div
                  className="p-3 rounded text-sm"
                  style={{
                    backgroundColor: error ? '#FEE2E2' : info ? '#ECFDF5' : '#FEF3C7',
                    color: error ? '#DC2626' : info ? '#047857' : '#92400E',
                  }}
                >
                  {error || info || sessionMessage}
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading || (!showForgot && !acceptedTerms)}
                className="w-full flex items-center justify-center space-x-2 px-4 py-2.5 text-sm font-medium text-white rounded disabled:opacity-50"
                style={{ backgroundColor: '#113543' }}
              >
                {isLoading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>{showForgot ? 'Sending…' : 'Signing in…'}</span>
                  </>
                ) : (
                  <>
                    <LogIn className="w-4 h-4" />
                    <span>{showForgot ? 'Send reset link' : 'Sign In'}</span>
                  </>
                )}
              </button>

              {showForgot && (
                <button
                  type="button"
                  onClick={() => setShowForgot(false)}
                  className="w-full text-xs text-center"
                  style={{ color: '#64748b' }}
                >
                  Back to sign in
                </button>
              )}
            </form>

            <div className="mt-6 pt-6 border-t" style={{ borderColor: '#e2e8f0' }}>
              <p className="text-xs text-center mb-2" style={{ color: '#64748b' }}>
                New client?{' '}
                <button type="button" onClick={() => navigate('/enroll')} className="underline" style={{ color: '#113543' }}>
                  Enroll your company
                </button>
              </p>
              <button onClick={() => navigate('/login')} className="w-full text-xs text-center" style={{ color: '#64748b' }}>
                Admin Login →
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
