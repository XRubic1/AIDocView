import type { AdminEditPermissionKey } from '../config/adminPermissionCatalog'

/** Custom backoffice role (id always starts with custom_). */
export type AdminCustomRole = {
  id: string
  name: string
  description: string
  /** Nav page paths the role may open. */
  viewPaths: string[]
  /** Action permissions beyond page access. */
  editPermissions: AdminEditPermissionKey[]
  createdAt: string
  updatedAt: string
}

export type AdminCustomRoleInput = {
  name: string
  description?: string
  viewPaths: string[]
  editPermissions: AdminEditPermissionKey[]
}
