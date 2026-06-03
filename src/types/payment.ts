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
  status: 'pending' | 'confirmed'
  notes?: string
  batch_id?: string
  batch_number?: string
  load_number?: string
}

export interface PaymentSummary {
  total_paid: number
  pending_payments: number
  pending_amount: number
  this_month_paid: number
  last_month_paid: number
}

