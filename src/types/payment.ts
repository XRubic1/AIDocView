// Type definitions for Payments

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
  status: 'pending' | 'confirmed' | 'rejected' | 'reversed'
  notes?: string
  batch_id?: string
  batch_number?: string
  load_number?: string
  posted_by?: string
  posted_source?: 'client' | 'credyx'
  confirmed_by?: string
  confirmed_at?: string
  rejection_reason?: string
  reversed_at?: string
  reversed_by?: string
  reversal_reason?: string
  reversal_type?: 'moved' | 'unprocessed'
  moved_to_payment_id?: string
  moved_from_payment_id?: string
}

export interface PaymentSummary {
  total_paid: number
  pending_payments: number
  pending_amount: number
  this_month_paid: number
  last_month_paid: number
}
