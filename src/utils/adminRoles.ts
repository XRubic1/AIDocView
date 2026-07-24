import type { User } from '@supabase/supabase-js'
import { adminNavSections, type AdminNavSection } from '../config/adminNav'

/** Fine-grained Credyx backoffice roles (stored in app_metadata.admin_role). */
export type AdminStaffRole =
  | 'super_admin'
  | 'admin'
  | 'reports'
  | 'billing'
  | 'payment_posting'

export const ADMIN_STAFF_ROLES: AdminStaffRole[] = [
  'super_admin',
  'admin',
  'reports',
  'billing',
  'payment_posting',
]

export const ADMIN_STAFF_ROLE_LABELS: Record<AdminStaffRole, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  reports: 'Reports',
  billing: 'Billing (Clients)',
  payment_posting: 'Payment Posting',
}

export const ADMIN_STAFF_ROLE_DESCRIPTIONS: Record<AdminStaffRole, string> = {
  super_admin: 'Full access, including user management and settings',
  admin: 'Full operations access — no user management or settings',
  reports: 'Dashboard, aging A/R, invoices, collections, docs, and audit logs',
  billing: 'Clients, brokers, and billing',
  payment_posting: 'Payment posting and related invoice tools',
}

/** Prefixes each role may open (first match wins; order does not matter). */
const ROLE_PATH_PREFIXES: Record<AdminStaffRole, string[]> = {
  super_admin: ['/'],
  admin: [
    '/admin/dashboard',
    '/batches',
    '/invoices',
    '/invoice-search',
    '/aging-ar',
    '/collections',
    '/admin/calendar',
    '/admin/assistant',
    '/docs',
    '/force-close',
    '/accounting',
    '/payment-posting',
    '/billing',
    '/Audit',
    '/brokers',
    '/clients',
  ],
  reports: [
    '/admin/dashboard',
    '/invoices',
    '/invoice-search',
    '/aging-ar',
    '/collections',
    '/admin/calendar',
    '/admin/assistant',
    '/docs',
    '/force-close',
    '/Audit',
  ],
  billing: [
    '/admin/dashboard',
    '/clients',
    '/brokers',
    '/billing',
    '/admin/calendar',
    '/admin/assistant',
  ],
  payment_posting: [
    '/admin/dashboard',
    '/payment-posting',
    '/invoices',
    '/invoice-search',
    '/batches',
  ],
}

function isAdminStaffRole(value: unknown): value is AdminStaffRole {
  return typeof value === 'string' && (ADMIN_STAFF_ROLES as string[]).includes(value)
}

/**
 * Resolve staff role from JWT app_metadata.
 * Legacy admins without `admin_role` keep Super Admin access.
 */
export function getAdminStaffRole(user: User | null | undefined): AdminStaffRole {
  if (!user || user.app_metadata?.role !== 'admin') return 'admin'
  const raw = user.app_metadata?.admin_role
  if (isAdminStaffRole(raw)) return raw
  return 'super_admin'
}

export function getAdminStaffRoleLabel(role: AdminStaffRole): string {
  return ADMIN_STAFF_ROLE_LABELS[role]
}

/** True when the path is allowed for this staff role. */
export function isAdminPathAllowed(pathname: string, role: AdminStaffRole): boolean {
  const path = pathname.split('?')[0] || '/'
  const prefixes = ROLE_PATH_PREFIXES[role] ?? []

  if (role === 'super_admin') return true

  // Engine / load-review workbench — Super Admin only
  if (path.startsWith('/engine')) return false

  // Users + Settings — Super Admin only
  if (path.startsWith('/users') || path.startsWith('/settings')) return false

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
  return role === 'super_admin'
}
