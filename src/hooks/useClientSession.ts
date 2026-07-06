import { useClientPortal } from '../context/ClientPortalContext'

/** Resolved client id/name for portal pages. */
export function useClientSession() {
  const { client } = useClientPortal()
  return {
    clientId: client?.id ?? '',
    clientName: client?.name ?? '',
    client,
  }
}
