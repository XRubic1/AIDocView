import { useClientPortal } from '../context/ClientPortalContext'

/** Resolved client id/name for portal pages. */
export function useClientSession() {
  const { client } = useClientPortal()
  return {
    clientId: client?.id ?? 'client-1',
    clientName: client?.name ?? 'Client',
    client,
  }
}
