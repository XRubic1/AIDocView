import { Navigate, useLocation } from 'react-router-dom'
import { useClientPortal } from '../../context/ClientPortalContext'
import ClientPendingApproval from './ClientPendingApproval'

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
    return <Navigate to="/client/login" state={{ from: location.pathname }} replace />
  }

  if (client.status === 'pending' || client.status === 'inactive') {
    return <ClientPendingApproval client={client} />
  }

  return <>{children}</>
}
