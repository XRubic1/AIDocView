// Type definitions for [Feature Name]

// Base entity interface
export interface BaseEntity {
  id: string
  created_at?: string
  updated_at?: string
}

// Specific type definitions
export interface ItemType extends BaseEntity {
  // Define properties
  name: string
  amount: number
  status: 'active' | 'inactive' | 'pending'
  optional_field?: string
}

// Enum-like types
export type StatusType = 'pending' | 'submitted' | 'processing' | 'completed' | 'failed'

// Union types
export type ItemStatus = 'active' | 'inactive' | 'pending'

// Main data type
export interface FeatureData {
  items: ItemType[]
  total: number
  metadata?: {
    // Additional metadata
  }
}

// API response types
export interface ApiResponse<T> {
  data: T
  message?: string
  error?: string
}

// Form types
export interface FormData {
  field1: string
  field2?: number
  field3: boolean
}

