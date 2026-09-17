import { getSupabase, isSupabaseConfigured } from '../lib/supabase'
import { persistOrThrow } from './persistHelper'
import {
  isAdminCustomRole,
  listAdminCustomRoles,
  setAdminCustomRoles,
} from '../data/adminCustomRoleStore'
import type { AdminCustomRole, AdminCustomRoleInput } from '../types/adminCustomRole'
import type { AdminEditPermissionKey } from '../config/adminPermissionCatalog'
import { ADMIN_EDIT_PERMISSIONS } from '../config/adminPermissionCatalog'

const CUSTOM_ROLES_KEY = 'admin_custom_roles'

const EDIT_KEYS = new Set<string>(ADMIN_EDIT_PERMISSIONS.map((p) => p.key))

/** Slugify a role name into a stable custom_ id suffix. */
export function slugifyCustomRoleName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)
  return slug || `role_${Date.now().toString(36)}`
}

function uniqueCustomRoleId(name: string, existingIds: Set<string>): string {
  const base = `custom_${slugifyCustomRoleName(name)}`
  if (!existingIds.has(base)) return base
  let i = 2
  while (existingIds.has(`${base}_${i}`)) i += 1
  return `${base}_${i}`
}

function normalizeEditPermissions(values: unknown): AdminEditPermissionKey[] {
  if (!Array.isArray(values)) return []
  return [...new Set(values.filter((v): v is AdminEditPermissionKey => EDIT_KEYS.has(String(v))))]
}

function normalizeRoles(value: unknown): AdminCustomRole[] {
  if (!Array.isArray(value)) return []
  return value
    .map((row) => {
      if (!isAdminCustomRole(row)) {
        if (!row || typeof row !== 'object') return null
        const raw = row as Record<string, unknown>
        if (typeof raw.id !== 'string' || !raw.id.startsWith('custom_')) return null
        if (typeof raw.name !== 'string') return null
        const now = new Date().toISOString()
        return {
          id: raw.id,
          name: raw.name.trim(),
          description: typeof raw.description === 'string' ? raw.description : '',
          viewPaths: Array.isArray(raw.viewPaths)
            ? raw.viewPaths.filter((p): p is string => typeof p === 'string')
            : [],
          editPermissions: normalizeEditPermissions(raw.editPermissions),
          createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : now,
          updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : now,
        } satisfies AdminCustomRole
      }
      return row
    })
    .filter((row): row is AdminCustomRole => Boolean(row))
}

/** Load custom roles from platform_settings into the local store. */
export async function loadAdminCustomRoles(): Promise<AdminCustomRole[]> {
  if (!isSupabaseConfigured()) {
    return listAdminCustomRoles()
  }

  const supabase = getSupabase()
  if (!supabase) return listAdminCustomRoles()

  const { data, error } = await supabase
    .from('platform_settings')
    .select('value')
    .eq('key', CUSTOM_ROLES_KEY)
    .maybeSingle()

  if (error || !data?.value) return listAdminCustomRoles()

  const normalized = normalizeRoles(data.value)
  setAdminCustomRoles(normalized)
  return normalized
}

/** Persist the full custom-role list. */
export async function saveAdminCustomRoles(
  next: AdminCustomRole[]
): Promise<AdminCustomRole[]> {
  const normalized = normalizeRoles(next)
  setAdminCustomRoles(normalized)

  if (!isSupabaseConfigured()) return normalized

  const supabase = getSupabase()
  if (!supabase) return normalized

  await persistOrThrow('admin_custom_roles', async () => {
    const { error } = await supabase.from('platform_settings').upsert({
      key: CUSTOM_ROLES_KEY,
      value: normalized,
      updated_at: new Date().toISOString(),
    })
    if (error) throw new Error(error.message)
  })

  return normalized
}

/** Create a custom role and persist. */
export async function createAdminCustomRole(
  input: AdminCustomRoleInput
): Promise<AdminCustomRole> {
  const name = input.name.trim()
  if (!name) throw new Error('Role name is required')
  if (input.viewPaths.length === 0) {
    throw new Error('Select at least one page the role can see')
  }

  const existing = listAdminCustomRoles()
  const now = new Date().toISOString()
  const role: AdminCustomRole = {
    id: uniqueCustomRoleId(name, new Set(existing.map((r) => r.id))),
    name,
    description: (input.description ?? '').trim(),
    viewPaths: [...new Set(input.viewPaths)],
    editPermissions: normalizeEditPermissions(input.editPermissions),
    createdAt: now,
    updatedAt: now,
  }

  await saveAdminCustomRoles([...existing, role])
  return role
}

/** Update an existing custom role and persist. */
export async function updateAdminCustomRole(
  id: string,
  input: AdminCustomRoleInput
): Promise<AdminCustomRole> {
  const name = input.name.trim()
  if (!name) throw new Error('Role name is required')
  if (input.viewPaths.length === 0) {
    throw new Error('Select at least one page the role can see')
  }

  const existing = listAdminCustomRoles()
  const index = existing.findIndex((role) => role.id === id)
  if (index < 0) throw new Error('Role not found')

  const updated: AdminCustomRole = {
    ...existing[index],
    name,
    description: (input.description ?? '').trim(),
    viewPaths: [...new Set(input.viewPaths)],
    editPermissions: normalizeEditPermissions(input.editPermissions),
    updatedAt: new Date().toISOString(),
  }

  const next = [...existing]
  next[index] = updated
  await saveAdminCustomRoles(next)
  return updated
}

/** Delete a custom role definition. */
export async function deleteAdminCustomRole(id: string): Promise<void> {
  const next = listAdminCustomRoles().filter((role) => role.id !== id)
  await saveAdminCustomRoles(next)
}

export { CUSTOM_ROLES_KEY }
