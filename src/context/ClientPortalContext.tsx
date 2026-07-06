import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  fetchClientById,
  hydrateClientRegistry,
  CLIENT_ID_STORAGE_KEY,
} from '../services/clientRegistry'
import { loadClientTenantData, clearClientTenantCache } from '../data/clientDemoData'
import { getPlanForTier } from '../config/servicePlans'
import { getClientCapabilities } from '../utils/clientCapabilities'
import type { Client, ServiceTier } from '../types/client'
import type { ClientCapabilities } from '../utils/clientCapabilities'
import type { ServicePlan } from '../types/billing'

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
  const [client, setClient] = useState<Client | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const loadClient = useCallback(async () => {
    try {
      const id = localStorage.getItem(CLIENT_ID_STORAGE_KEY)
      if (!id) {
        setClient(null)
        return
      }
      await hydrateClientRegistry()
      const loaded = (await fetchClientById(id)) ?? null
      setClient(loaded)
      if (loaded) {
        await loadClientTenantData(loaded.id, loaded.name)
      }
    } catch {
      setClient(null)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadClient()
  }, [loadClient])

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
      isLoading,
      refreshClient: loadClient,
    }),
    [client, tier, capabilities, plan, isLoading, loadClient]
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
