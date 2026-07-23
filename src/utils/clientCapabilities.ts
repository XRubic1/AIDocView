import type { ServiceTier } from '../types/client'

export interface ClientCapabilities {
  canCreateBatch: boolean
  canUseAiUpload: boolean
  canUseManualBatch: boolean
  canSubmitDocHandoff: boolean
  canUploadVault: boolean
  canEditRemittance: boolean
  canRunInvoiceOps: boolean
  canEditProfile: boolean
  canPostPayment: boolean
  canCreateAdHocInvoice: boolean
  canRequestWriteOff: boolean
  hasForceClose: boolean
  canCorrectPayments: boolean
  canOpenDispute: boolean
  canConfirmPaymentReceipt: boolean
}

export class CapabilityError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CapabilityError'
  }
}

const SELF_SERVICE: ClientCapabilities = {
  canCreateBatch: true,
  canUseAiUpload: true,
  canUseManualBatch: true,
  canSubmitDocHandoff: true,
  canUploadVault: true,
  canEditRemittance: true,
  canRunInvoiceOps: true,
  canEditProfile: true,
  canPostPayment: true,
  canCreateAdHocInvoice: true,
  canRequestWriteOff: true,
  hasForceClose: false,
  canCorrectPayments: true,
  canOpenDispute: true,
  canConfirmPaymentReceipt: false,
}

const MANAGED: ClientCapabilities = {
  canCreateBatch: false,
  canUseAiUpload: false,
  canUseManualBatch: false,
  canSubmitDocHandoff: true,
  // Managed carriers upload setup docs; Credyx approves before invoice handoff.
  canUploadVault: true,
  canEditRemittance: false,
  canRunInvoiceOps: false,
  canEditProfile: true,
  // Managed clients may post payment from Invoices (awaits Credyx approval).
  canPostPayment: true,
  canCreateAdHocInvoice: false,
  canRequestWriteOff: true,
  hasForceClose: true,
  canCorrectPayments: false,
  canOpenDispute: true,
  canConfirmPaymentReceipt: true,
}

/** Throws when the client plan does not allow an action. */
export function assertCapability(
  capabilities: Partial<ClientCapabilities>,
  flag: keyof ClientCapabilities,
  action: string
): void {
  if (!capabilities[flag]) {
    throw new CapabilityError(`${action} is not available on this service plan`)
  }
}

export function getClientCapabilities(tier: ServiceTier = 'self_service'): ClientCapabilities {
  return tier === 'managed' ? MANAGED : SELF_SERVICE
}

export function getTierLabel(tier: ServiceTier): string {
  return tier === 'managed' ? 'Managed by Credyx' : 'Self-Service'
}

export function getTierShortLabel(tier: ServiceTier): string {
  return tier === 'managed' ? 'Managed' : 'Self-Service'
}
