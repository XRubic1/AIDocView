import type { AdminCustomRole } from '../types/adminCustomRole'
import type { AdminEditPermissionKey } from '../config/adminPermissionCatalog'
import { ADMIN_EDIT_PERMISSIONS } from '../config/adminPermissionCatalog'

const STORAGE_KEY = 'credyx_admin_custom_roles_v1'

let roles: AdminCustomRole[] = []
let version = 0
const listeners = new Set<() => void>()

function notify(): void {
  version += 1
  for (const listener of listeners) listener()
}

function readLocal(): AdminCustomRole[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isAdminCustomRole)
  } catch {
    return []
  }
}

function writeLocal(next: AdminCustomRole[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Ignore quota / private mode.
  }
}

const EDIT_KEYS = new Set<string>(ADMIN_EDIT_PERMISSIONS.map((p) => p.key))

function isEditKey(value: unknown): value is AdminEditPermissionKey {
  return typeof value === 'string' && EDIT_KEYS.has(value)
}

/** Type guard for persisted custom role rows. */
export function isAdminCustomRole(value: unknown): value is AdminCustomRole {
  if (!value || typeof value !== 'object') return false
  const row = value as Record<string, unknown>
  if (typeof row.id !== 'string' || !row.id.startsWith('custom_')) return false
  if (typeof row.name !== 'string' || !row.name.trim()) return false
  if (!Array.isArray(row.viewPaths) || !row.viewPaths.every((p) => typeof p === 'string')) {
    return false
  }
  if (!Array.isArray(row.editPermissions) || !row.editPermissions.every(isEditKey)) {
    return false
  }
  return true
}

/** Subscribe to custom-role store changes (for React). */
export function subscribeAdminCustomRoles(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getAdminCustomRolesVersion(): number {
  return version
}

/** All custom roles currently in memory. */
export function listAdminCustomRoles(): AdminCustomRole[] {
  return roles
}

export function getAdminCustomRole(id: string): AdminCustomRole | null {
  return roles.find((role) => role.id === id) ?? null
}

/** Replace in-memory roles (hydration / save). Also mirrors to localStorage. */
export function setAdminCustomRoles(next: AdminCustomRole[]): void {
  roles = next.map((role) => ({
    ...role,
    viewPaths: [...new Set(role.viewPaths)],
    editPermissions: [...new Set(role.editPermissions)],
  }))
  writeLocal(roles)
  notify()
}

/** Seed from localStorage before network hydrate (fast first paint). */
export function hydrateAdminCustomRolesFromLocal(): void {
  const local = readLocal()
  if (local.length === 0) return
  roles = local
  notify()
}

hydrateAdminCustomRolesFromLocal()
