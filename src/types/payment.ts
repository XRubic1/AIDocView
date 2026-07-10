// Type definitions for Payments

/** Client dispute when posted funds were not received (managed clients). */
export interface PaymentReceiptDispute {
  id: string
  reason: string
  description: string
  status: 'open' | 'under_review' | 'resolved' | 'closed'
  created_by: string
  created_at: string
  resolved_at?: string
  resolved_by?: string
  response?: string
}

export type PaymentStatus =
  | 'pending'
  | 'awaiting_receipt'
  | 'disputed'
  | 'confirmed'
  | 'rejected'
  | 'reversed'

export type PaymentKind = 'normal' | 'short' | 'over'

/** Why a short payment was posted against a parent payment. */
export type ShortPayReason = 'wrong_amount' | 'chargeback'

export interface Payment {
  id: string
  invoice_id: string
  invoice_number: string
  broker_name: string
  amount: number
  payment_date: string
  received_date: string
  payment_method: 'check' | 'wire' | 'ach' | 'credit_card'
  payment_reference?: string
  status: PaymentStatus
  notes?: string
  batch_id?: string
  batch_number?: string
  load_number?: string
  posted_by?: string
  posted_source?: 'client' | 'credyx'
  confirmed_by?: string
  confirmed_at?: string
  /** Managed clients must confirm receipt by this date (ISO). */
  client_confirmation_deadline?: string
  client_confirmed_at?: string
  client_confirmed_by?: string
  dispute?: PaymentReceiptDispute
  rejection_reason?: string
  reversed_at?: string
  reversed_by?: string
  reversal_reason?: string
  reversal_type?: 'moved' | 'unprocessed'
  moved_to_payment_id?: string
  moved_from_payment_id?: string
  /** Parent payment when this row is a supplemental short/over correction. */
  parent_payment_id?: string
  payment_kind?: PaymentKind
  short_pay_reason?: ShortPayReason
}

export function isShortPayment(payment: Payment): boolean {
  return payment.payment_kind === 'short'
}

export function isChargebackPayment(payment: Payment): boolean {
  return payment.payment_kind === 'short' && payment.short_pay_reason === 'chargeback'
}

export interface PaymentSummary {
  total_paid: number
  pending_payments: number
  pending_amount: number
  this_month_paid: number
  last_month_paid: number
}
