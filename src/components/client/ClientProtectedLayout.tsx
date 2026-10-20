import { Outlet } from 'react-router-dom'
import { ClientPortalProvider, useClientPortal } from '../../context/ClientPortalContext'
import { OnboardingChromeProvider } from '../../context/OnboardingChromeContext'
import ClientLayout from '../ClientLayout'
import ClientRouteGuard from './ClientRouteGuard'
import TopLoadingBar from '../ui/TopLoadingBar'
import { useClientLoading } from '../ui/clientLoadingStore'

/** Persistent chrome around client routes so the sidebar does not remount on navigation. */
function ClientPortalShell() {
  const { client } = useClientPortal()
  const loading = useClientLoading()

  return (
    <OnboardingChromeProvider>
      <ClientLayout
        clientName={client?.name ?? 'Client'}
        clientId={client?.id}
        flushMain
      >
        <TopLoadingBar active={loading} fixed />
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
