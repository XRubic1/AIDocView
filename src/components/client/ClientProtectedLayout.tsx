import { Outlet } from 'react-router-dom'
import { ClientPortalProvider } from '../../context/ClientPortalContext'
import ClientRouteGuard from './ClientRouteGuard'

/** Wraps protected client portal routes with auth context and guard. */
export default function ClientProtectedLayout() {
  return (
    <ClientPortalProvider>
      <ClientRouteGuard>
        <Outlet />
      </ClientRouteGuard>
    </ClientPortalProvider>
  )
}
