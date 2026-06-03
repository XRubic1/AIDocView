// Type definitions for Users

export type UserRole = 'admin' | 'manager' | 'reviewer' | 'viewer'
export type UserStatus = 'active' | 'inactive' | 'suspended'

export interface User {
  id: string
  name: string
  email: string
  role: UserRole
  status: UserStatus
  phone?: string
  department?: string
  created_at: string
  last_login?: string
  created_by?: string
  notes?: string
}


