import type { User } from '@supabase/supabase-js'

export interface AdminCapabilities {
  /** Skip managed-client receipt confirmation and close invoice as Credyx. */
  canForceConfirmPayment: boolean
}

const DEFAULT_CAPABILITIES: AdminCapabilities = {
  canForceConfirmPayment: false,
}

/** Resolve admin capabilities from Supabase app_metadata. */
export function getAdminCapabilities(user: User | null | undefined): AdminCapabilities {
  if (!user) return DEFAULT_CAPABILITIES

  const meta = user.app_metadata ?? {}
  const tier = typeof meta.admin_tier === 'string' ? meta.admin_tier : ''
  const explicitFlag = meta.can_force_confirm_payments === true

  return {
    canForceConfirmPayment: tier === 'dedicated' || explicitFlag,
  }
}
