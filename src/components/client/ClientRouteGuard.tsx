import { Navigate, useLocation } from 'react-router-dom'
import { useClientPortal } from '../../context/ClientPortalContext'
import ClientPendingApproval from './ClientPendingApproval'
import { clearClientSession } from '../../utils/clearClientSession'
import { clearClientTenantCache } from '../../data/clientDemoData'

interface ClientRouteGuardProps {
  children: React.ReactNode
}

/** Protects client portal routes — auth + pending approval check. */
export default function ClientRouteGuard({ children }: ClientRouteGuardProps) {
  const location = useLocation()
  const { client, isLoading } = useClientPortal()

  const isAuthenticated = localStorage.getItem('clientAuthenticated') === 'true'

  if (isLoading) {
    return (
      <div className="client-portal flex items-center justify-center min-h-screen">
        <p className="text-sm text-slate-500">Loading…</p>
      </div>
    )
  }

  if (!isAuthenticated || !client) {
    if (isAuthenticated && !client) {
      clearClientSession()
      clearClientTenantCache()
    }
    return (
      <Navigate
        to="/client/login"
        state={{
          from: location.pathname,
          message:
            isAuthenticated && !client
              ? 'Your session is no longer valid. Please sign in again.'
              : undefined,
        }}
        replace
      />
    )
  }

  if (client.status === 'pending' || client.status === 'inactive') {
    return <ClientPendingApproval client={client} />
  }

  return <>{children}</>
}
