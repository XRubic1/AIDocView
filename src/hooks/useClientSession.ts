import { useOptionalClientPortal } from '../context/ClientPortalContext'

/**
 * Resolved client id/name for portal pages.
 * Safe on Credyx admin routes (returns empty session outside ClientPortalProvider).
 */
export function useClientSession() {
  const portal = useOptionalClientPortal()
  const client = portal?.client ?? null
  return {
    clientId: client?.id ?? '',
    clientName: client?.name ?? '',
    client,
  }
}
