import { Outlet } from 'react-router-dom'
import { ClientPortalProvider, useClientPortal } from '../../context/ClientPortalContext'
import { OnboardingChromeProvider } from '../../context/OnboardingChromeContext'
import ClientLayout from '../ClientLayout'
import ClientRouteGuard from './ClientRouteGuard'

/** Persistent chrome around client routes so the sidebar does not remount on navigation. */
function ClientPortalShell() {
  const { client } = useClientPortal()

  return (
    <OnboardingChromeProvider>
      <ClientLayout
        clientName={client?.name ?? 'Client'}
        clientId={client?.id}
        flushMain
      >
        <Outlet />
      </ClientLayout>
    </OnboardingChromeProvider>
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
