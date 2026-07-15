import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { fetchClientById } from '../services/clientRegistry'
import { clearClientTenantCache } from '../data/clientDemoData'
import { getPlanForTier } from '../config/servicePlans'
import { getClientCapabilities } from '../utils/clientCapabilities'
import type { Client, ServiceTier } from '../types/client'
import type { ClientCapabilities } from '../utils/clientCapabilities'
import type { ServicePlan } from '../types/billing'
import { useAuth } from './AuthContext'

interface ClientPortalContextValue {
  client: Client | null
  clientId: string | null
  tier: ServiceTier
  capabilities: ClientCapabilities
  plan: ServicePlan
  isLoading: boolean
  refreshClient: () => void
}

const ClientPortalContext = createContext<ClientPortalContextValue | null>(null)

export function ClientPortalProvider({ children }: { children: ReactNode }) {
  const { resolved, isReady } = useAuth()
  const [client, setClient] = useState<Client | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const loadClient = useCallback(async () => {
    if (!isReady) return

    const clientId = resolved.clientId
    if (!clientId || resolved.principal !== 'client') {
      setClient(null)
      setIsLoading(false)
      return
    }

    try {
      setIsLoading(true)
      const loaded = (await fetchClientById(clientId)) ?? null
      setClient(loaded)
    } catch {
      setClient(null)
    } finally {
      setIsLoading(false)
    }
  }, [isReady, resolved.clientId, resolved.principal])

  useEffect(() => {
    void loadClient()
  }, [loadClient])

  useEffect(() => {
    if (resolved.principal !== 'client') {
      clearClientTenantCache()
    }
  }, [resolved.principal])

  const tier: ServiceTier = client?.service_tier ?? 'self_service'
  const capabilities = useMemo(() => getClientCapabilities(tier), [tier])
  const plan = useMemo(() => getPlanForTier(tier), [tier])

  const value = useMemo(
    () => ({
      client,
      clientId: client?.id ?? null,
      tier,
      capabilities,
      plan,
      isLoading: !isReady || isLoading,
      refreshClient: () => void loadClient(),
    }),
    [client, tier, capabilities, plan, isReady, isLoading, loadClient]
  )

  return (
    <ClientPortalContext.Provider value={value}>{children}</ClientPortalContext.Provider>
  )
}

export function useClientPortal(): ClientPortalContextValue {
  const ctx = useContext(ClientPortalContext)
  if (!ctx) {
    throw new Error('useClientPortal must be used within ClientPortalProvider')
  }
  return ctx
}
