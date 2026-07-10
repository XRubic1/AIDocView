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

/** Calendar month for A/R billing (e.g. July 2026 → { year: 2026, month: 7 }). */
export interface BillingPeriod {
  year: number
  month: number
}

export type ClientBillStatus = 'open' | 'paid' | 'overdue' | 'written_off'

/** Escalation state from unpaid bill ages (spec §3b). */
export type BillingStanding = 'ok' | 'overdue' | 'warning' | 'locked'

export interface ClientBill {
  id: string
  client_id: string
  period: string
  issued_at: string
  due_at: string
  amount: number
  status: ClientBillStatus
  paid_at?: string
  payoneer_reference?: string
  line_items: BillingLineItem[]
}

export interface ComputedMonthlyBill {
  appFee: number
  collectedVolume: number
  ratePct: number
  arFee: number
  adjustments: BillingLineItem[]
  total: number
  lineItems: BillingLineItem[]
  /** Short-payment fee credits this period (reporting). */
  reimbursementCredits: BillingLineItem[]
  /** Client reimbursement account balance before bill issue. */
  reimbursementBalance: number
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
  /** Current period collected volume (A/R billing). */
  collected_volume?: number
  /** Current A/R rate %. */
  rate_pct?: number
  /** Whether factoring discount applies. */
  factoring?: boolean
  /** Escalation state from unpaid bills. */
  billing_standing?: BillingStanding
}
