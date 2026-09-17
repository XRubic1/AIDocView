// Type definitions for Clients (Carriers)

import type { ClientAiSettings } from '../config/aiPolicy'

export type ServiceTier = 'self_service' | 'managed'

export type SubscriptionStatus = 'active' | 'trial' | 'past_due' | 'cancelled'

/** In-app bell notification toggles for the client portal. */
export interface ClientNotificationPreferences {
  /** Master switch for in-app bell notifications. */
  bellEnabled: boolean
  payment: boolean
  shortOver: boolean
  hold: boolean
  notes: boolean
  dispute: boolean
}

export interface ClientBilling {
  plan_id: string
  subscription_status: SubscriptionStatus
  storage_used_bytes: number
  storage_quota_bytes: number
  app_fee_monthly: number
  service_fee_monthly?: number
  enrolled_at: string
  /** When false, monthly Credyx bills omit the $99 platform fee (default true). */
  include_platform_fee?: boolean
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
  /** ISO timestamp when remittance/bank fields last changed. */
  remittance_updated_at?: string
  notes?: string
  status?: 'active' | 'inactive' | 'pending' | 'suspended'
  service_tier?: ServiceTier
  /** Admin-set factoring flag (informational; fee comes from fee_terms). */
  factoring?: boolean
  /** @deprecated Unused — collection fee comes from fee_terms. */
  ar_rate_override?: number
  /** Unapplied short-payment fee credits (reimbursement account). */
  reimbursement_balance?: number
  billing?: ClientBilling
  fleet_size?: string
  /** 4-letter code used in batch numbers, e.g. ABCL for ABC LOGISTICS INC */
  batch_code?: string
  /** Negotiated collection fee — source of truth for monthly Credyx billing. */
  fee_terms?: {
    fee_percentage?: number // Percentage fee (e.g., 2.5 for 2.5%)
    fee_type?: 'percentage' | 'flat' // Type of fee calculation
    flat_fee_amount?: number // Flat fee amount if fee_type is 'flat'
  }
  /** In-app bell notification toggles (also cached in localStorage). */
  notification_prefs?: ClientNotificationPreferences
  /**
   * Per-carrier AI controls (toggle + optional monthly USD cap).
   * When AI is off / capped, uploads still work — packets/review skip AI.
   */
  ai_settings?: ClientAiSettings
}


