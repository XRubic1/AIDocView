import { useClientPortal } from '../context/ClientPortalContext'

/** Convenience hook — capabilities for the logged-in client portal session. */
export function useClientCapabilities() {
  const { capabilities, tier, plan } = useClientPortal()
  return { capabilities, tier, plan }
}
