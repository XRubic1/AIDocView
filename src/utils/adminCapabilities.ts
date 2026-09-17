import type { User } from '@supabase/supabase-js'
import {
  canManageAdminUsers,
  getAdminStaffRole,
  isBuiltInAdminStaffRole,
  isCustomAdminStaffRoleId,
  type AdminStaffRole,
} from './adminRoles'
import { getAdminCustomRole } from '../data/adminCustomRoleStore'

export interface AdminCapabilities {
  /** Staff role used for nav / route gating. */
  staffRole: AdminStaffRole
  /** Skip managed-client receipt confirmation and close invoice as Credyx. */
  canForceConfirmPayment: boolean
  /** Create / list / update backoffice users. */
  canManageUsers: boolean
  /** Permanently delete unsubmitted batches from the admin Batches queue. */
  canDeleteBatches: boolean
  canAccessPaymentPosting: boolean
  canAccessBilling: boolean
  canAccessClients: boolean
  canAccessReports: boolean
  canAccessSettings: boolean
}

const DEFAULT_CAPABILITIES: AdminCapabilities = {
  staffRole: 'admin',
  canForceConfirmPayment: false,
  canManageUsers: false,
  canDeleteBatches: false,
  canAccessPaymentPosting: false,
  canAccessBilling: false,
  canAccessClients: false,
  canAccessReports: false,
  canAccessSettings: false,
}

/** Resolve admin capabilities from Supabase app_metadata (+ custom role defs). */
export function getAdminCapabilities(user: User | null | undefined): AdminCapabilities {
  if (!user || user.app_metadata?.role !== 'admin') return DEFAULT_CAPABILITIES

  const staffRole = getAdminStaffRole(user)
  const meta = user.app_metadata ?? {}
  const tier = typeof meta.admin_tier === 'string' ? meta.admin_tier : ''
  const explicitFlag = meta.can_force_confirm_payments === true

  if (isCustomAdminStaffRoleId(staffRole)) {
    const custom = getAdminCustomRole(staffRole)
    const edits = new Set(custom?.editPermissions ?? [])
    const views = new Set(custom?.viewPaths ?? [])
    return {
      staffRole,
      canForceConfirmPayment: edits.has('force_confirm_payment') || explicitFlag,
      canManageUsers: edits.has('manage_users'),
      canDeleteBatches: edits.has('delete_batches'),
      canAccessPaymentPosting: views.has('/payment-posting'),
      canAccessBilling: views.has('/billing'),
      canAccessClients: views.has('/clients'),
      canAccessReports: views.has('/aging-ar') || views.has('/collections'),
      canAccessSettings: edits.has('access_settings'),
    }
  }

  const fullOps = staffRole === 'super_admin' || staffRole === 'admin'

  return {
    staffRole,
    canForceConfirmPayment:
      staffRole === 'super_admin' ||
      staffRole === 'admin' ||
      staffRole === 'payment_posting' ||
      tier === 'dedicated' ||
      explicitFlag,
    canManageUsers: canManageAdminUsers(staffRole),
    canDeleteBatches: fullOps,
    canAccessPaymentPosting: fullOps || staffRole === 'payment_posting',
    canAccessBilling: fullOps || staffRole === 'billing',
    canAccessClients: fullOps || staffRole === 'billing',
    canAccessReports: fullOps || staffRole === 'reports',
    canAccessSettings: staffRole === 'super_admin',
  }
}

/** Label helper that works for built-in and custom roles. */
export function isKnownAdminStaffRole(role: AdminStaffRole): boolean {
  return isBuiltInAdminStaffRole(role) || isCustomAdminStaffRoleId(role)
}
