/** Ledger entry for fee credits held on the client reimbursement account. */
export type ReimbursementCreditType =
  | 'short_payment'
  | 'invoice_fee_reimbursement'
  | 'manual_discount'
  | 'reversal_fee_reimbursement'

export interface ReimbursementLedgerEntry {
  id: string
  client_id: string
  /** Present for short-payment credits only. */
  payment_id?: string
  parent_payment_id?: string
  invoice_id?: string
  invoice_number?: string
  short_amount?: number
  fee_rate_pct?: number
  fee_credit_amount: number
  /** Billing period when the credit was recorded (YYYY-MM). */
  period: string
  credit_type: ReimbursementCreditType
  /** Human-readable reason (required for manual / invoice reimbursements). */
  reason?: string
  note?: string
  created_by?: string
  /** applied = credited to a bill; pending = held on account; voided = cancelled */
  status: 'applied' | 'pending' | 'voided'
  applied_to_bill_id?: string
  applied_at?: string
  voided_at?: string
  voided_by?: string
  void_reason?: string
  created_at: string
}

export interface ReimbursementAccountSummary {
  pending_balance: number
  applied_total: number
  entries: ReimbursementLedgerEntry[]
}

/** Input for admin manual discount / invoice fee reimbursement. */
export interface ManualBillingCreditInput {
  clientId: string
  amount: number
  creditType: 'invoice_fee_reimbursement' | 'manual_discount' | 'reversal_fee_reimbursement'
  reason: string
  note?: string
  invoiceId?: string
  invoiceNumber?: string
  /** Link to reversed payment for clawback reimbursements. */
  paymentId?: string
  createdBy?: string
}
