import type { ServiceTier } from './client'

export type SubscriptionStatus = 'active' | 'trial' | 'past_due' | 'cancelled'

export interface ServicePlan {
  id: string
  tier: ServiceTier
  name: string
  tagline: string
  app_fee_monthly: number
  storage_quota_bytes: number
  service_fee_monthly?: number
  features: string[]
}

export interface BillingLineItem {
  id: string
  date: string
  description: string
  amount: number
  status: 'paid' | 'pending' | 'overdue'
}

export interface UsageSnapshot {
  storage_used_bytes: number
  storage_quota_bytes: number
  storage_pct: number
  document_count: number
}

export interface BillingSummary {
  plan: ServicePlan
  subscription_status: SubscriptionStatus
  app_fee_monthly: number
  service_fee_monthly: number
  total_monthly: number
  usage: UsageSnapshot
  line_items: BillingLineItem[]
}
