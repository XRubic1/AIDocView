// Type definitions for Client Dashboard

export interface ClientDashboardData {
  client_id: string
  client_name: string
  summary: {
    total_ar: number
    pending_invoices: number
    approved_invoices: number
    on_hold_invoices: number
    paid_this_month: number
    overdue_invoices: number
  }
  aging_ar: {
    '1_15': number
    '16_30': number
    '31_45': number
    '46_60': number
    '61_90': number
    over_91: number
    total: number
  }
  recent_invoices: {
    id: string
    invoice_number: string
    broker_name: string
    amount: number
    status: string
    invoice_date: string
    due_date: string
  }[]
  recent_activity: {
    id: string
    type: string
    description: string
    timestamp: string
    invoice_id?: string
  }[]
}


