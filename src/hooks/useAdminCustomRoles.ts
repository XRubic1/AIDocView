import { useSyncExternalStore } from 'react'
import {
  getAdminCustomRolesVersion,
  listAdminCustomRoles,
  subscribeAdminCustomRoles,
} from '../data/adminCustomRoleStore'
import type { AdminCustomRole } from '../types/adminCustomRole'
import {
  ADMIN_STAFF_ROLES,
  ADMIN_STAFF_ROLE_DESCRIPTIONS,
  ADMIN_STAFF_ROLE_LABELS,
  type AdminStaffRole,
  type BuiltInAdminStaffRole,
  isBuiltInAdminStaffRole,
} from '../utils/adminRoles'

export type AssignableRoleOption = {
  id: AdminStaffRole
  label: string
  description: string
  kind: 'built_in' | 'custom'
}

/** Subscribe to custom role definitions for reactive nav / labels. */
export function useAdminCustomRoles(): AdminCustomRole[] {
  return useSyncExternalStore(
    subscribeAdminCustomRoles,
    listAdminCustomRoles,
    listAdminCustomRoles
  )
}

/** Force re-render when the custom-role store version changes. */
export function useAdminCustomRolesVersion(): number {
  return useSyncExternalStore(
    subscribeAdminCustomRoles,
    getAdminCustomRolesVersion,
    getAdminCustomRolesVersion
  )
}

/** Built-in + custom roles for user create/edit dropdowns. */
export function useAssignableAdminRoles(): AssignableRoleOption[] {
  const custom = useAdminCustomRoles()
  return [
    ...ADMIN_STAFF_ROLES.map((id) => ({
      id,
      label: ADMIN_STAFF_ROLE_LABELS[id],
      description: ADMIN_STAFF_ROLE_DESCRIPTIONS[id],
      kind: 'built_in' as const,
    })),
    ...custom.map((role) => ({
      id: role.id,
      label: role.name,
      description: role.description || 'Custom role',
      kind: 'custom' as const,
    })),
  ]
}

export function roleBadgeClass(role: AdminStaffRole): string {
  if (isBuiltInAdminStaffRole(role)) {
    const map: Record<BuiltInAdminStaffRole, string> = {
      super_admin: 'bg-red-100 text-red-800',
      admin: 'bg-blue-100 text-blue-800',
      reports: 'bg-emerald-100 text-emerald-800',
      billing: 'bg-amber-100 text-amber-900',
      payment_posting: 'bg-violet-100 text-violet-800',
    }
    return map[role]
  }
  return 'bg-slate-100 text-slate-800'
}
