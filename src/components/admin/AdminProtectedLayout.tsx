import { useEffect, useState } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { isAdminAuthenticated } from '../../services/adminAuthService'
import { useAdminCapabilities } from '../../hooks/useAdminCapabilities'
import {
  getAdminDefaultPath,
  isAdminPathAllowed,
} from '../../utils/adminRoles'
import PageLoader from '../ui/PageLoader'

/** Protects admin/ops routes — requires Supabase admin session + role path access. */
export default function AdminProtectedLayout() {
  const location = useLocation()
  const { isReady, resolved, hydrationError, bootMessage } = useAuth()
  const { capabilities } = useAdminCapabilities()
  const [allowed, setAllowed] = useState<boolean | null>(null)

  useEffect(() => {
    if (!isReady) return
    void (async () => {
      const ok = resolved.isAdmin && (await isAdminAuthenticated())
      setAllowed(ok)
    })()
  }, [isReady, resolved.isAdmin, resolved.session])

  if (!isReady || allowed === null) {
    return <PageLoader message={bootMessage} />
  }

  if (!allowed) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />
  }

  if (hydrationError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="max-w-lg rounded-lg border border-amber-200 bg-white p-6 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900 mb-2">Data load issue</h2>
          <p className="text-sm text-slate-600">{hydrationError}</p>
        </div>
      </div>
    )
  }

  if (!isAdminPathAllowed(location.pathname, capabilities.staffRole)) {
    return <Navigate to={getAdminDefaultPath(capabilities.staffRole)} replace />
  }

  return (
    <div className="page-enter">
      <Outlet />
    </div>
  )
}
