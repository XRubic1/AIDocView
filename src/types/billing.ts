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
  /**
   * Fee terms locked at issue time — used for reversal reimbursements if terms
   * change later (e.g. 1% → 1.25%).
   */
  fee_terms_snapshot?: BillingFeeTermsSnapshot
  /** Whether the $99 platform fee was included when this bill was issued. */
  include_app_fee?: boolean
  /** Admin-entered payment URL sent to the carrier (Payoneer, bank, etc.). */
  payment_url?: string
  emailed_at?: string
  emailed_to?: string
  email_send_count?: number
}

/** Fee terms frozen onto an issued Credyx bill. */
export interface BillingFeeTermsSnapshot {
  fee_type: 'percentage' | 'flat'
  fee_percentage?: number
  flat_fee_amount?: number
  /**
   * Send/payment extras when PostgREST does not yet have dedicated columns.
   * Ignored by fee clawbacks — only fee_type / rates are used there.
   */
  send?: {
    include_app_fee?: boolean
    payment_url?: string
    emailed_at?: string
    emailed_to?: string
    email_send_count?: number
  }
}

/** Synthesized timeline event for bill payment / lifecycle history. */
export type BillHistoryEventType =
  | 'issued'
  | 'payoneer_sent'
  | 'emailed'
  | 'paid'
  | 'overdue'
  | 'credit_applied'
  | 'credit_added'

export interface BillHistoryEvent {
  id: string
  type: BillHistoryEventType
  label: string
  at: string
  amount?: number
  detail?: string
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
  /** Trial clients are not charged; line items still show waived gross fees. */
  isTrial: boolean
  /** Gross fees before trial waiver (platform + collection fee + adjustments). */
  grossSubtotal: number
  /** Display label from client fee_terms (e.g. "2.5%" or "$50 flat"). */
  feeDisplay: string
  feeType: 'percentage' | 'flat'
  /** Whether this computation includes the $99 platform fee. */
  includeAppFee: boolean
}

/** Options for monthly bill computation / issue. */
export interface ComputeMonthlyBillOptions {
  /** Override client default for including the $99 software fee. */
  includeAppFee?: boolean
  /**
   * Fee terms for this bill period. When set, every load is billed at this rate.
   * Defaults to the carrier's current Clients → Fee Terms when omitted.
   */
  feeOverride?: {
    fee_type: 'percentage' | 'flat'
    fee_percentage?: number
    flat_fee_amount?: number
  }
}

/** Carrier invoice that hit this Credyx billing period (paid and/or closed). */
export interface PeriodBilledInvoice {
  invoiceId: string
  invoiceNumber: string
  loadNumber?: string
  brokerName: string
  invoiceAmount: number
  collectedAmount: number
  fee: number
  activityAt: string
  status: string
  /** True when Credyx force-closed the load (broker did not remit). */
  closedByCredyx: boolean
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
  /** Current collection fee % from client fee_terms (0 when flat). */
  rate_pct?: number
  /** Fee terms display (e.g. "2.5%" or "$50 flat"). */
  fee_display?: string
  /** Whether factoring flag is set on the client. */
  factoring?: boolean
  /** Escalation state from unpaid bills. */
  billing_standing?: BillingStanding
}
