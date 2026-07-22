import { getSupabase } from '../lib/supabase'
import type { AdminStaffRole } from '../utils/adminRoles'

export interface AdminStaffUser {
  id: string
  email: string
  name: string
  admin_role: AdminStaffRole
  created_at: string
  last_sign_in_at?: string | null
  banned: boolean
}

export interface CreateAdminUserInput {
  email: string
  name: string
  admin_role: AdminStaffRole
  /** Temporary password — user can change after first login. */
  password: string
}

export interface UpdateAdminUserRoleInput {
  userId: string
  admin_role: AdminStaffRole
}

type ManageAdminUsersResponse = {
  ok?: boolean
  error?: string
  users?: AdminStaffUser[]
  user?: AdminStaffUser
  inviteLink?: string
}

async function invokeManageAdminUsers(
  body: Record<string, unknown>
): Promise<ManageAdminUsersResponse> {
  const supabase = getSupabase()
  if (!supabase) {
    throw new Error('Supabase is not configured')
  }

  const { data, error } = await supabase.functions.invoke('manage-admin-users', { body })
  if (error) {
    throw new Error(error.message || 'Admin user request failed')
  }

  const payload = (data ?? {}) as ManageAdminUsersResponse
  if (payload.error) {
    throw new Error(payload.error)
  }
  return payload
}

/** List Credyx backoffice users (Super Admin only). */
export async function listAdminStaffUsers(): Promise<AdminStaffUser[]> {
  const result = await invokeManageAdminUsers({ action: 'list' })
  return result.users ?? []
}

/** Create a backoffice user with a staff role (Super Admin only). */
export async function createAdminStaffUser(
  input: CreateAdminUserInput
): Promise<AdminStaffUser> {
  const result = await invokeManageAdminUsers({
    action: 'create',
    email: input.email.trim(),
    name: input.name.trim(),
    admin_role: input.admin_role,
    password: input.password,
  })
  if (!result.user) {
    throw new Error('User was not returned from the server')
  }
  return result.user
}

/** Update a backoffice user's staff role (Super Admin only). */
export async function updateAdminStaffUserRole(
  input: UpdateAdminUserRoleInput
): Promise<AdminStaffUser> {
  const result = await invokeManageAdminUsers({
    action: 'update_role',
    userId: input.userId,
    admin_role: input.admin_role,
  })
  if (!result.user) {
    throw new Error('User was not returned from the server')
  }
  return result.user
}
