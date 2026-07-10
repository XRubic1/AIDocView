/** Ledger entry when a short payment triggers client fee reimbursement. */
export interface ReimbursementLedgerEntry {
  id: string
  client_id: string
  payment_id: string
  parent_payment_id: string
  invoice_id: string
  invoice_number: string
  short_amount: number
  fee_rate_pct: number
  fee_credit_amount: number
  /** Billing period when the short payment was confirmed (YYYY-MM). */
  period: string
  /** applied = credited to a bill; pending = held on reimbursement account */
  status: 'applied' | 'pending'
  applied_to_bill_id?: string
  applied_at?: string
  created_at: string
}

export interface ReimbursementAccountSummary {
  pending_balance: number
  applied_total: number
  entries: ReimbursementLedgerEntry[]
}
