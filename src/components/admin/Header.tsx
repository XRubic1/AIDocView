
import { LogOut } from 'lucide-react'
import { useNavigate, useLocation } from 'react-router-dom'

interface HeaderProps {
  userName: string
  userRole?: string
}

export function Header({ userName, userRole = 'Admin' }: HeaderProps) {
  const navigate = useNavigate()
  const location = useLocation()

  const navItems = [
    { label: 'Dashboard', path: '/admin/dashboard' },
    { label: 'Batches', path: '/batches' },
    { label: 'Aging A/R', path: '/aging-ar' },
    { label: 'Invoice Search', path: '/invoice-search' },
    { label: 'Collections', path: '/collections' },
    { label: 'Accounting', path: '/accounting' },
    { label: 'Audit Logs', path: '/Audit/dashboard' },
    { label: 'Brokers', path: '/brokers' },
    { label: 'Clients', path: '/clients' },
    { label: 'Users', path: '/users' },
    { label: 'Settings', path: '/settings' },
  ]

  const isActive = (path: string) => {
    if (path === '#') return false
    return location.pathname === path || location.pathname.startsWith(path + '/')
  }

  return (
    <header className="border-b" style={{ backgroundColor: '#FFFFFF', borderColor: '#819291' }}>
      <div className="w-full mx-auto px-6">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center space-x-8">
            <div className="flex items-center">
              <img 
                src="/Logo.png" 
                alt="CREDYX A/R SOLUTIONS" 
                className="h-10 w-auto"
                style={{ maxHeight: '40px' }}
              />
            </div>
            <nav className="hidden md:flex space-x-1">
              {navItems.map((item) => (
                <button
                  key={item.path}
                  onClick={() => item.path !== '#' && navigate(item.path)}
                  className="px-4 py-2 text-sm font-medium transition-colors"
                  style={{
                    color: isActive(item.path) ? '#113543' : '#819291',
                    borderBottom: isActive(item.path) ? '2px solid #C2A558' : 'none',
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive(item.path)) {
                      e.currentTarget.style.color = '#113543'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive(item.path)) {
                      e.currentTarget.style.color = '#819291'
                    }
                  }}
                >
                  {item.label}
                </button>
              ))}
            </nav>
          </div>

          <div className="flex items-center space-x-4">
            <div className="text-right hidden sm:block">
              <div className="text-sm font-medium" style={{ color: '#113543' }}>{userName}</div>
              <div className="text-xs" style={{ color: '#819291' }}>{userRole}</div>
            </div>
            <button
              onClick={() => {
                localStorage.removeItem('isAuthenticated')
                localStorage.removeItem('userEmail')
                localStorage.removeItem('userRole')
                navigate('/login')
              }}
              className="flex items-center space-x-2 px-3 py-2 text-sm transition-colors"
              style={{ color: '#819291' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = '#113543'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = '#819291'
              }}
              aria-label="Logout"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  )
}

