import { Outlet } from 'react-router-dom'
import { ClientPortalProvider, useClientPortal } from '../../context/ClientPortalContext'
import ClientLayout from '../ClientLayout'
import ClientRouteGuard from './ClientRouteGuard'

/** Persistent chrome around client routes so the sidebar does not remount on navigation. */
function ClientPortalShell() {
  const { client } = useClientPortal()

  return (
    <ClientLayout
      clientName={client?.name ?? 'Client'}
      clientId={client?.id}
      flushMain
    >
      <Outlet />
    </ClientLayout>
  )
}

/** Wraps protected client portal routes with auth context, guard, and shell. */
export default function ClientProtectedLayout() {
  return (
    <ClientPortalProvider>
      <ClientRouteGuard>
        <ClientPortalShell />
      </ClientRouteGuard>
    </ClientPortalProvider>
  )
}
