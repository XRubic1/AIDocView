import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { LogIn, Eye, EyeOff } from 'lucide-react'
import { fetchClientByEmail, CLIENT_ID_STORAGE_KEY } from '../services/clientRegistry'
import { signInClientAuth } from '../services/clientAuthService'
import { isSupabaseConfigured } from '../lib/supabase'

export default function ClientLogin() {
  const navigate = useNavigate()
  const location = useLocation()
  const sessionMessage = (location.state as { message?: string } | null)?.message
  
  useEffect(() => {
    void (async () => {
      const isAuthenticated = localStorage.getItem('clientAuthenticated') === 'true'
      const clientId = localStorage.getItem(CLIENT_ID_STORAGE_KEY)
      if (!isAuthenticated || !clientId) return
      const client = await fetchClientByEmail(localStorage.getItem('clientEmail') ?? '')
      if (client?.status === 'active') {
        navigate('/client/dashboard', { replace: true })
      }
    })()
  }, [navigate])

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)

    // Basic validation
    if (!email || !password) {
      setError('Please enter both email and password')
      setIsLoading(false)
      return
    }

    // Mock authentication (in a real app, this would be an API call)
    // For demo purposes, accept any email/password combination
    // In production, this would validate against a backend
    try {
      if (isSupabaseConfigured()) {
        const auth = await signInClientAuth(email, password)
        if (!auth.ok) {
          setError(auth.error ?? 'Invalid email or password')
          setIsLoading(false)
          return
        }
      } else {
        await new Promise((resolve) => setTimeout(resolve, 500))
      }

      if (email && password) {
        const matched = await fetchClientByEmail(email)
        if (!matched) {
          setError('No account found for that email. Enroll your company first, then sign in.')
          setIsLoading(false)
          return
        }

        if (matched.status === 'pending' || matched.status === 'inactive') {
          setError('Your account is not active yet. We will email you when it is ready.')
          setIsLoading(false)
          return
        }

        localStorage.setItem('clientAuthenticated', 'true')
        localStorage.setItem('clientEmail', email)
        localStorage.setItem('clientRole', 'Client')
        localStorage.setItem(CLIENT_ID_STORAGE_KEY, matched.id)

        navigate('/client/dashboard')
      } else {
        setError('Invalid email or password')
      }
    } catch (err) {
      setError('An error occurred during login. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#F5F5F5' }}>
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <img 
            src="/Logo.png" 
            alt="CREDYX A/R SOLUTIONS" 
            className="h-12 w-auto"
            style={{ maxHeight: '48px' }}
          />
        </div>

        {/* Login Card */}
        <div className="border rounded-lg shadow-lg" style={{ backgroundColor: '#FFFFFF', borderColor: '#e2e8f0' }}>
          <div className="p-8">
            <div className="text-center mb-8">
              <h1 className="text-2xl font-bold mb-2" style={{ color: '#113543' }}>
                Client Login
              </h1>
              <p className="text-sm" style={{ color: '#64748b' }}>
                Sign in to access your client portal
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Email Field */}
              <div>
                <label 
                  htmlFor="email" 
                  className="block text-sm font-medium mb-2" 
                  style={{ color: '#113543' }}
                >
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
                  className="w-full px-4 py-2.5 text-sm border rounded focus:outline-none transition-colors"
                  style={{
                    borderColor: error ? '#ef4444' : '#64748b',
                    color: '#113543',
                    backgroundColor: '#FFFFFF',
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = '#0891b2'
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = error ? '#ef4444' : '#64748b'
                  }}
                  required
                  disabled={isLoading}
                />
              </div>

              {/* Password Field */}
              <div>
                <label 
                  htmlFor="password" 
                  className="block text-sm font-medium mb-2" 
                  style={{ color: '#113543' }}
                >
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
                    className="w-full px-4 py-2.5 pr-10 text-sm border rounded focus:outline-none transition-colors"
                    style={{
                      borderColor: error ? '#ef4444' : '#64748b',
                      color: '#113543',
                      backgroundColor: '#FFFFFF',
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = '#0891b2'
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = error ? '#ef4444' : '#64748b'
                    }}
                    required
                    disabled={isLoading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 p-1"
                    style={{ color: '#64748b' }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = '#113543'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = '#64748b'
                    }}
                    disabled={isLoading}
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              {(sessionMessage || error) && (
                <div
                  className="p-3 rounded text-sm"
                  style={{
                    backgroundColor: error ? '#FEE2E2' : '#FEF3C7',
                    color: error ? '#DC2626' : '#92400E',
                    border: `1px solid ${error ? '#FECACA' : '#FDE68A'}`,
                  }}
                >
                  {error || sessionMessage}
                </div>
              )}

              {/* Login Button */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full flex items-center justify-center space-x-2 px-4 py-2.5 text-sm font-medium text-white rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ backgroundColor: isLoading ? '#0a2529' : '#113543' }}
                onMouseEnter={(e) => {
                  if (!isLoading) {
                    e.currentTarget.style.backgroundColor = '#0a2529'
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isLoading) {
                    e.currentTarget.style.backgroundColor = '#113543'
                  }
                }}
              >
                {isLoading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>Signing in...</span>
                  </>
                ) : (
                  <>
                    <LogIn className="w-4 h-4" />
                    <span>Sign In</span>
                  </>
                )}
              </button>
            </form>

            {/* Link to Admin Login */}
            <div className="mt-6 pt-6 border-t" style={{ borderColor: '#e2e8f0' }}>
              <p className="text-xs text-center mb-2" style={{ color: '#64748b' }}>
                New client?{' '}
                <button
                  type="button"
                  onClick={() => navigate('/enroll')}
                  className="underline"
                  style={{ color: '#113543' }}
                >
                  Enroll your company
                </button>
              </p>
              <button
                onClick={() => navigate('/login')}
                className="w-full text-xs text-center transition-colors"
                style={{ color: '#64748b' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = '#113543'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = '#64748b'
                }}
              >
                Admin Login →
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 text-center">
          <p className="text-xs" style={{ color: '#64748b' }}>
            © {new Date().getFullYear()} CREDYX A/R SOLUTIONS. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  )
}

