import { getPlanForTier } from '../config/servicePlans'
import { useOptionalClientPortal } from '../context/ClientPortalContext'
import type { ClientCapabilities } from '../utils/clientCapabilities'
import type { ServiceTier } from '../types/client'

/** Capabilities when no client portal session is present (admin / shared panels). */
const OUTSIDE_PORTAL_CAPABILITIES: ClientCapabilities = {
  canCreateBatch: false,
  canUseAiUpload: false,
  canUseManualBatch: false,
  canSubmitDocHandoff: false,
  canUploadVault: false,
  canEditRemittance: false,
  canRunInvoiceOps: false,
  canEditProfile: false,
  canPostPayment: false,
  canCreateAdHocInvoice: false,
  canRequestWriteOff: false,
  hasForceClose: false,
  canCorrectPayments: false,
  canOpenDispute: false,
  canConfirmPaymentReceipt: false,
}

/**
 * Convenience hook — capabilities for the logged-in client portal session.
 * Outside ClientPortalProvider (admin pages), returns disabled client capabilities.
 */
export function useClientCapabilities() {
  const portal = useOptionalClientPortal()
  if (!portal) {
    const tier: ServiceTier = 'self_service'
    return {
      capabilities: OUTSIDE_PORTAL_CAPABILITIES,
      tier,
      plan: getPlanForTier(tier),
    }
  }
  return {
    capabilities: portal.capabilities,
    tier: portal.tier,
    plan: portal.plan,
  }
}
