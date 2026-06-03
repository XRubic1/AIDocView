// Type definitions for Client Collections

export interface ClientCollectionItem {
  invoice_id: string
  invoice_number: string
  broker_name: string
  broker_id: string
  amount: number
  expected_payment_date: string
  days_since_expected: number
  payment_status: 'not_received' | 'paid' | 'review'
  broker_contacted: boolean
  last_broker_contact: string | null
  load_number?: string
  batch_number?: string
  invoice_date: string
}

