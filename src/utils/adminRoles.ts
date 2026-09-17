import type { User } from '@supabase/supabase-js'
import { adminNavSections, type AdminNavSection } from '../config/adminNav'
import { expandViewPathsToPrefixes } from '../config/adminPermissionCatalog'
import { getAdminCustomRole } from '../data/adminCustomRoleStore'

/** Built-in Credyx backoffice roles (JWT app_metadata.admin_role). */
export type BuiltInAdminStaffRole =
  | 'super_admin'
  | 'admin'
  | 'reports'
  | 'billing'
  | 'payment_posting'

/** Built-in role id, or a custom role id (`custom_…`). */
export type AdminStaffRole = BuiltInAdminStaffRole | string

export const ADMIN_STAFF_ROLES: BuiltInAdminStaffRole[] = [
  'super_admin',
  'admin',
  'reports',
  'billing',
  'payment_posting',
]

export const ADMIN_STAFF_ROLE_LABELS: Record<BuiltInAdminStaffRole, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  reports: 'Reports',
  billing: 'Billing (Clients)',
  payment_posting: 'Payment Posting',
}

export const ADMIN_STAFF_ROLE_DESCRIPTIONS: Record<BuiltInAdminStaffRole, string> = {
  super_admin: 'Full access, including user management and settings',
  admin: 'Full operations access — no user management or settings',
  reports: 'Dashboard, aging A/R, invoices, collections, docs, and audit logs',
  billing: 'Clients, brokers, and billing',
  payment_posting: 'Payment posting and related invoice tools',
}

/** Prefixes each built-in role may open. */
const ROLE_PATH_PREFIXES: Record<BuiltInAdminStaffRole, string[]> = {
  super_admin: ['/'],
  admin: [
    '/admin/dashboard',
    '/batches',
    '/invoices',
    '/invoice-search',
    '/aging-ar',
    '/collections',
    '/admin/broker-risk',
    '/admin/broker-snapshot',
    '/admin/inbox',
    '/admin/calendar',
    '/admin/assistant',
    '/admin/work-queue',
    '/admin/notifications',
    '/docs',
    '/force-close',
    '/accounting',
    '/payment-posting',
    '/billing',
    '/Audit',
    '/brokers',
    '/clients',
    '/admin/waitlist',
  ],
  reports: [
    '/admin/dashboard',
    '/invoices',
    '/invoice-search',
    '/aging-ar',
    '/collections',
    '/admin/broker-risk',
    '/admin/calendar',
    '/admin/assistant',
    '/admin/work-queue',
    '/admin/notifications',
    '/docs',
    '/force-close',
    '/Audit',
    '/admin/waitlist',
  ],
  billing: [
    '/admin/dashboard',
    '/clients',
    '/brokers',
    '/billing',
    '/admin/calendar',
    '/admin/assistant',
    '/admin/work-queue',
    '/admin/notifications',
  ],
  payment_posting: [
    '/admin/dashboard',
    '/payment-posting',
    '/invoices',
    '/invoice-search',
    '/batches',
    '/admin/work-queue',
    '/admin/notifications',
  ],
}

export function isBuiltInAdminStaffRole(value: unknown): value is BuiltInAdminStaffRole {
  return typeof value === 'string' && (ADMIN_STAFF_ROLES as string[]).includes(value)
}

export function isCustomAdminStaffRoleId(value: unknown): value is string {
  return typeof value === 'string' && /^custom_[a-z0-9_]+$/.test(value)
}

/** True when a JWT role value is assignable (built-in or custom_*). */
export function isAssignableAdminStaffRole(value: unknown): value is AdminStaffRole {
  return isBuiltInAdminStaffRole(value) || isCustomAdminStaffRoleId(value)
}

/**
 * Resolve staff role from JWT app_metadata.
 * Legacy admins without `admin_role` keep Super Admin access.
 */
export function getAdminStaffRole(user: User | null | undefined): AdminStaffRole {
  if (!user || user.app_metadata?.role !== 'admin') return 'admin'
  const raw = user.app_metadata?.admin_role
  if (isAssignableAdminStaffRole(raw)) return raw
  return 'super_admin'
}

export function getAdminStaffRoleLabel(role: AdminStaffRole): string {
  if (isBuiltInAdminStaffRole(role)) return ADMIN_STAFF_ROLE_LABELS[role]
  const custom = getAdminCustomRole(role)
  return custom?.name ?? role.replace(/^custom_/, '').replace(/_/g, ' ')
}

export function getAdminStaffRoleDescription(role: AdminStaffRole): string {
  if (isBuiltInAdminStaffRole(role)) return ADMIN_STAFF_ROLE_DESCRIPTIONS[role]
  const custom = getAdminCustomRole(role)
  return custom?.description || 'Custom role'
}

/** Path prefixes for a role (built-in table or custom definition). */
export function getAdminRolePathPrefixes(role: AdminStaffRole): string[] {
  if (isBuiltInAdminStaffRole(role)) return ROLE_PATH_PREFIXES[role] ?? []
  const custom = getAdminCustomRole(role)
  if (!custom) return []
  return expandViewPathsToPrefixes(custom.viewPaths)
}

/** True when the path is allowed for this staff role. */
export function isAdminPathAllowed(pathname: string, role: AdminStaffRole): boolean {
  const path = pathname.split('?')[0] || '/'

  if (role === 'super_admin') return true

  // Engine / load-review workbench — Super Admin only
  if (path.startsWith('/engine')) return false

  const custom = isCustomAdminStaffRoleId(role) ? getAdminCustomRole(role) : null
  const canManageUsers =
    role === 'super_admin' || Boolean(custom?.editPermissions.includes('manage_users'))
  const canAccessSettings =
    role === 'super_admin' || Boolean(custom?.editPermissions.includes('access_settings'))

  if (path.startsWith('/users') && !canManageUsers) return false
  if (path.startsWith('/settings') && !canAccessSettings) return false

  // Built-in non–super roles never get Users / Settings.
  if (
    isBuiltInAdminStaffRole(role) &&
    role !== 'super_admin' &&
    (path.startsWith('/users') || path.startsWith('/settings'))
  ) {
    return false
  }

  const prefixes = [...getAdminRolePathPrefixes(role)]
  if (canManageUsers && !prefixes.includes('/users')) prefixes.push('/users')
  if (canAccessSettings && !prefixes.includes('/settings')) prefixes.push('/settings')

  return prefixes.some((prefix) => {
    if (prefix === '/') return true
    return path === prefix || path.startsWith(`${prefix}/`)
  })
}

/** First allowed landing path for a role. */
export function getAdminDefaultPath(role: AdminStaffRole): string {
  if (role === 'payment_posting') return '/payment-posting'
  if (role === 'billing') return '/clients'
  if (role === 'reports') return '/aging-ar'
  if (isCustomAdminStaffRoleId(role)) {
    const prefixes = getAdminRolePathPrefixes(role)
    const preferred = [
      '/admin/dashboard',
      '/admin/work-queue',
      '/invoices',
      '/batches',
      '/clients',
      '/payment-posting',
    ]
    for (const path of preferred) {
      if (prefixes.some((p) => path === p || path.startsWith(`${p}/`))) return path
    }
    return prefixes[0] ?? '/admin/dashboard'
  }
  return '/admin/dashboard'
}

/** Filter sidebar sections to what the role can open. */
export function filterAdminNavSections(role: AdminStaffRole): AdminNavSection[] {
  return adminNavSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => isAdminPathAllowed(item.path, role)),
    }))
    .filter((section) => section.items.length > 0)
}

export function canManageAdminUsers(role: AdminStaffRole): boolean {
  if (role === 'super_admin') return true
  const custom = isCustomAdminStaffRoleId(role) ? getAdminCustomRole(role) : null
  return Boolean(custom?.editPermissions.includes('manage_users'))
}
