import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { LogIn, Eye, EyeOff } from 'lucide-react'
import { signInAdmin, getCurrentSession } from '../services/adminAuthService'

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
      navigate(from)
    } catch {
      setError('An error occurred during login. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#F5F5F5' }}>
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-8">
          <img
            src="/Logo.png"
            alt="CREDYX A/R SOLUTIONS"
            className="h-12 w-auto"
            style={{ maxHeight: '48px' }}
          />
        </div>

        <div className="border rounded-lg shadow-lg" style={{ backgroundColor: '#FFFFFF', borderColor: '#e2e8f0' }}>
          <div className="p-8">
            <div className="text-center mb-8">
              <h1 className="text-2xl font-bold mb-2" style={{ color: '#113543' }}>
                Admin Login
              </h1>
              <p className="text-sm" style={{ color: '#64748b' }}>
                Sign in to access the Credyx operations portal
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
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
                  placeholder="admin@credyx.net"
                  className="w-full px-4 py-2.5 text-sm border rounded focus:outline-none transition-colors"
                  style={{
                    borderColor: error ? '#ef4444' : '#64748b',
                    color: '#113543',
                    backgroundColor: '#FFFFFF',
                  }}
                  required
                  disabled={isLoading}
                />
              </div>

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
                    className="w-full px-4 py-2.5 pr-10 text-sm border rounded focus:outline-none transition-colors"
                    style={{
                      borderColor: error ? '#ef4444' : '#64748b',
                      color: '#113543',
                      backgroundColor: '#FFFFFF',
                    }}
                    required
                    disabled={isLoading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 p-1"
                    style={{ color: '#64748b' }}
                    disabled={isLoading}
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              {error && (
                <div
                  className="p-3 rounded text-sm"
                  style={{
                    backgroundColor: '#FEE2E2',
                    color: '#DC2626',
                    border: '1px solid #FECACA',
                  }}
                >
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className="w-full flex items-center justify-center space-x-2 px-4 py-2.5 text-sm font-medium text-white rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ backgroundColor: isLoading ? '#0a2529' : '#113543' }}
              >
                {isLoading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
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

            <div className="mt-6 pt-6 border-t" style={{ borderColor: '#e2e8f0' }}>
              <button
                onClick={() => navigate('/client/login')}
                className="w-full text-xs text-center transition-colors"
                style={{ color: '#64748b' }}
              >
                Client Login →
              </button>
            </div>
          </div>
        </div>

        <div className="mt-6 text-center">
          <p className="text-xs" style={{ color: '#64748b' }}>
            © {new Date().getFullYear()} CREDYX A/R SOLUTIONS. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  )
}
