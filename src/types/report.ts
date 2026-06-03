// Type definitions for Reports

export interface Report {
  id: string
  name: string
  description: string
  type: 'aging' | 'payment' | 'invoice' | 'broker' | 'monthly' | 'yearly'
  generated_at: string
  date_range?: {
    start_date: string
    end_date: string
  }
}

export interface AgingReport {
  period: string
  amount: number
  invoice_count: number
}

export interface PaymentReport {
  period: string
  total_paid: number
  payment_count: number
  average_payment: number
  payment_methods: {
    method: string
    amount: number
    count: number
  }[]
}

export interface InvoiceReport {
  period: string
  total_invoices: number
  total_amount: number
  by_status: {
    status: string
    count: number
    amount: number
  }[]
}

export interface BrokerReport {
  broker_name: string
  total_invoices: number
  total_amount: number
  paid_amount: number
  pending_amount: number
  average_days_to_pay: number
}


