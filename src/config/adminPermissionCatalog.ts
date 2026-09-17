import { adminNavSections } from './adminNav'

/** Edit/action permissions beyond page access. */
export const ADMIN_EDIT_PERMISSIONS = [
  {
    key: 'delete_batches',
    label: 'Delete batches',
    description: 'Permanently delete unsubmitted batches from the queue',
  },
  {
    key: 'force_confirm_payment',
    label: 'Force-confirm payments',
    description: 'Close invoices as Credyx without carrier receipt confirmation',
  },
  {
    key: 'manage_users',
    label: 'Manage users & roles',
    description: 'Create users and edit custom roles (Users tab)',
  },
  {
    key: 'access_settings',
    label: 'Platform settings',
    description: 'Open Settings and change platform configuration',
  },
] as const

export type AdminEditPermissionKey = (typeof ADMIN_EDIT_PERMISSIONS)[number]['key']

export type AdminViewPermission = {
  path: string
  label: string
  section: string
  /** Extra related routes unlocked with this page. */
  relatedPaths?: string[]
}

/**
 * Pages a role can be granted access to.
 * Built from the admin sidebar, plus a few companion routes.
 */
export function listAdminViewPermissions(): AdminViewPermission[] {
  const rows: AdminViewPermission[] = []
  for (const section of adminNavSections) {
    for (const item of section.items) {
      const relatedPaths: string[] = []
      if (item.path === '/invoices') {
        relatedPaths.push('/invoice-search', '/force-close')
      }
      rows.push({
        path: item.path,
        label: item.label,
        section: section.title,
        relatedPaths: relatedPaths.length > 0 ? relatedPaths : undefined,
      })
    }
  }
  return rows
}

/** Expand selected page paths into full allowlist prefixes. */
export function expandViewPathsToPrefixes(viewPaths: string[]): string[] {
  const catalog = listAdminViewPermissions()
  const prefixes = new Set<string>()
  for (const path of viewPaths) {
    prefixes.add(path)
    const match = catalog.find((row) => row.path === path)
    for (const related of match?.relatedPaths ?? []) {
      prefixes.add(related)
    }
  }
  return [...prefixes]
}
