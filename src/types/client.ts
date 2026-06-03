// Type definitions for Clients (Carriers)

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
  fee_terms?: {
    fee_percentage?: number // Percentage fee (e.g., 2.5 for 2.5%)
    fee_type?: 'percentage' | 'flat' // Type of fee calculation
    flat_fee_amount?: number // Flat fee amount if fee_type is 'flat'
  }
}


