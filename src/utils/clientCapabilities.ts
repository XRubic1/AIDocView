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
}

const MANAGED: ClientCapabilities = {
  canCreateBatch: false,
  canUseAiUpload: false,
  canUseManualBatch: false,
  canSubmitDocHandoff: true,
  canUploadVault: false,
  canEditRemittance: false,
  canRunInvoiceOps: false,
  canEditProfile: true,
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
