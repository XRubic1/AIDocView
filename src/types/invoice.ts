// Type definitions for Invoices

export interface InvoiceNote {
  id: string
  note: string
  created_by: string
  created_at: string
  type?: 'note' | 'client_note' | 'hold_reason' | 'approval' | 'rejection' | 'dispute' | 'status_update'
  /** Omit or `client` = carrier-visible; `internal` = Credyx only. */
  visibility?: 'client' | 'internal'
}

export interface InvoiceDispute {
  id: string
  reason: string
  description: string
  status: 'open' | 'under_review' | 'resolved' | 'closed'
  created_by: string
  created_at: string
  resolved_at?: string
  /** Credyx reply visible to the client on the invoice. */
  response?: string
  responded_at?: string
  responded_by?: string
}

export interface Invoice {
  id: string
  invoice_number: string
  client_id: string
  client_name: string
  broker_id: string
  broker_name: string
  amount: number
  /** Amount the client confirmed receiving when marking paid (may differ from invoice amount). */
  paid_amount?: number
  /** Client acknowledged excess payment received (overpayment resolved). */
  overpayment_accepted_at?: string
  invoice_date: string
  /** Set from broker Due by (days); omit when Due by is 0. */
  due_date?: string
  /** Typically mirrors due_date when broker Due by is set. */
  expected_payment_date?: string
  status: 'pending' | 'review' | 'approved' | 'rejected' | 'hold' | 'paid' | 'force_closed' | 'written_off' | 'write_off_pending'
  load_number?: string
  batch_id?: string
  batch_number?: string
  /**
   * Locked fee terms inherited from the batch (trial / % / flat at create or batch edit).
   * Credyx monthly collection fees use this — not the client's live Fee Terms.
   */
  fee_terms?: import('./feeTerms').FeeTermsSnapshot
  created_at: string
  updated_at?: string
  reviewed_at?: string
  reviewed_by?: string
  approved_by?: string
  approved_at?: string
  hold_reason?: string
  notes?: string
  notes_history?: InvoiceNote[]
  disputes?: InvoiceDispute[]
  documents_count?: number
  broker_contacted?: boolean
  last_broker_contact?: string
  days_since_expected?: number
  document_send_history?: DocumentSendRecord[]
  /**
   * Normalized remittance fingerprint snapshotted when the invoice PDF was created
   * or paperwork was sent — used to detect remit-to changes vs prior invoices.
   */
  remittance_snapshot?: string
  collection_date?: string // Date for collection (payment date or callback date)
  collection_status?: 'C/B' | 'W/P' // Call Back or Will Pay
  verification_status?: 'Email' | 'Phone' | 'Web' // How the invoice was verified
  contact_persons?: string[] // List of contact persons
  selected_contact_person?: string // Selected contact person
  /** Broker did not respond to status inquiry — Credyx should call. */
  collections_needs_attention?: boolean
  collections_last_inquiry_at?: string
  collections_followup_at?: string
  /** Client confirmed AI-extracted fields before batch submit */
  ai_confirmed_at?: string
  ai_confirmed_by?: string
  /** Admin AIDocView review outcome (UI: Reviewing / OK / Needs review). */
  ai_review_status?: 'not_run' | 'running' | 'ready' | 'needs_work'
  ai_review_summary?: string
  /** JSON InvoiceAiReviewSnapshot — required checks, issues, gate (survives refresh). */
  ai_review_snapshot?: string
  /** DocSort group id + source document ids for admin AI review */
  doc_sort_group_id?: string
  document_doc_ids?: string[]
  /** Supabase storage paths keyed by document_doc_ids entry. */
  document_storage_paths?: Record<string, string>
  write_off_request?: {
    requested_by: string
    requested_at: string
    client_note: string
    received_amount: number
    shortfall: number
    resolved_at?: string
    resolved_by?: string
    resolution?: 'approved' | 'denied'
    internal_note?: string
  }
  /** Paperwork / payment chase clocks and statuses. */
  email_lifecycle?: import('./emailLifecycle').InvoiceEmailLifecycle
}

export interface DocumentSendRecord {
  email_address: string
  sent_at: string
  sent_by?: string
  status?: 'sent' | 'delivered' | 'failed'
  documents_sent?: string[]
  /** Human-readable note (e.g. multi-part split). */
  note?: string
  /** 1-based part index when the packet was split across emails. */
  part_number?: number
  /** Total parts when the packet was split across emails. */
  part_total?: number
}

export interface InvoiceFilter {
  status?: string
  client_id?: string
  broker_id?: string
  date_from?: string
  date_to?: string
  amount_min?: number
  amount_max?: number
  search?: string
}

