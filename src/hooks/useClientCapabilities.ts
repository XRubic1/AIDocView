import { useClientPortal, useOptionalClientPortal } from '../context/ClientPortalContext'
import type { ServiceTier } from '../types/client'
import type { ClientCapabilities } from '../utils/clientCapabilities'
import { getClientCapabilities } from '../utils/clientCapabilities'
import { getPlanForTier } from '../config/servicePlans'
import type { ServicePlan } from '../types/billing'

/** Convenience hook — capabilities for the logged-in client portal session. */
export function useClientCapabilities() {
  const { capabilities, tier, plan } = useClientPortal()
  return { capabilities, tier, plan }
}

/**
 * Capabilities when available; admin-safe defaults outside ClientPortalProvider
 * (status indicators on, client action flags off).
 */
export function useOptionalClientCapabilities(): {
  capabilities: ClientCapabilities
  tier: ServiceTier
  plan: ServicePlan
  fromPortal: boolean
} {
  const portal = useOptionalClientPortal()
  if (portal) {
    return {
      capabilities: portal.capabilities,
      tier: portal.tier,
      plan: portal.plan,
      fromPortal: true,
    }
  }

  const tier: ServiceTier = 'self_service'
  return {
    capabilities: {
      ...getClientCapabilities(tier),
      canPostPayment: false,
      canCreateAdHocInvoice: false,
      canRequestWriteOff: false,
      canOpenDispute: false,
      canCorrectPayments: false,
      canConfirmPaymentReceipt: true,
      hasForceClose: true,
    },
    tier,
    plan: getPlanForTier(tier),
    fromPortal: false,
  }
}
