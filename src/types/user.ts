import type { AdminStaffRole } from '../utils/adminRoles'

export type { AdminStaffRole }

/** @deprecated Prefer AdminStaffRole — kept for older mock data. */
export type UserRole = AdminStaffRole | 'manager' | 'reviewer' | 'viewer'

export type UserStatus = 'active' | 'inactive' | 'suspended'

export interface User {
  id: string
  name: string
  email: string
  role: AdminStaffRole
  status: UserStatus
  phone?: string
  department?: string
  created_at: string
  last_login?: string
  created_by?: string
  notes?: string
}
