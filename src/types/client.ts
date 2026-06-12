// Type definitions for Clients (Carriers)

export type ServiceTier = 'self_service' | 'managed'

export type SubscriptionStatus = 'active' | 'trial' | 'past_due' | 'cancelled'

export interface ClientBilling {
  plan_id: string
  subscription_status: SubscriptionStatus
  storage_used_bytes: number
  storage_quota_bytes: number
  app_fee_monthly: number
  service_fee_monthly?: number
  enrolled_at: string
}

export interface Client {
  id: string
  name: string
  contact_person?: string
  email?: string
  phone?: string
  fax?: string
  address?: string
  city?: string
  state?: string
  zip?: string
  mc_number?: string
  dot_number?: string
  remittance_info?: string
  bank_name?: string
  account_number?: string
  routing_number?: string
  notes?: string
  status?: 'active' | 'inactive' | 'pending'
  service_tier?: ServiceTier
  billing?: ClientBilling
  fleet_size?: string
  fee_terms?: {
    fee_percentage?: number // Percentage fee (e.g., 2.5 for 2.5%)
    fee_type?: 'percentage' | 'flat' // Type of fee calculation
    flat_fee_amount?: number // Flat fee amount if fee_type is 'flat'
  }
}


