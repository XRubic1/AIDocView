import { useEffect } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useClientPortal } from '../../context/ClientPortalContext'
import { useAuth } from '../../context/AuthContext'
import ClientPendingApproval from './ClientPendingApproval'
import ClientBillingLockScreen from './ClientBillingLockScreen'
import { clearClientSession } from '../../utils/clearClientSession'
import { getBillingStanding } from '../../services/arBillingService'
import { updateClient } from '../../services/clientRegistry'
import PageLoader from '../ui/PageLoader'

interface ClientRouteGuardProps {
  children: React.ReactNode
}

/** Protects client portal routes — Supabase session + billing lock check. */
export default function ClientRouteGuard({ children }: ClientRouteGuardProps) {
  const location = useLocation()
  const { resolved, isReady, hydrationError, bootMessage } = useAuth()
  const { client, isLoading } = useClientPortal()

  const isAuthenticated = resolved.principal === 'client' && resolved.session !== null

  const standing = client ? getBillingStanding(client) : 'ok'
  const isLocked = client?.status === 'suspended' || standing === 'locked'

  useEffect(() => {
    if (!client || !isLocked) return
    if (client.status !== 'suspended' && standing === 'locked') {
      void updateClient(client.id, { status: 'suspended' }).catch(console.error)
    }
  }, [client, isLocked, standing])

  if (!isReady || isLoading) {
    return <PageLoader message={bootMessage} />
  }

  if (hydrationError) {
    return (
      <div className="client-portal flex items-center justify-center min-h-screen p-6">
        <div className="max-w-lg rounded-lg border border-amber-200 bg-white p-6 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900 mb-2">Data load issue</h2>
          <p className="text-sm text-slate-600">{hydrationError}</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated || !client) {
    if (isAuthenticated && !client) {
      void clearClientSession()
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

  if (isLocked) {
    return <ClientBillingLockScreen client={client} />
  }

  return <>{children}</>
}
