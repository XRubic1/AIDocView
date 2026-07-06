// Type definitions for Invoices

export interface InvoiceNote {
  id: string
  note: string
  created_by: string
  created_at: string
  type?: 'note' | 'client_note' | 'hold_reason' | 'approval' | 'rejection' | 'dispute'
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
  due_date: string
  expected_payment_date: string
  status: 'pending' | 'approved' | 'rejected' | 'hold' | 'paid' | 'force_closed' | 'written_off'
  load_number?: string
  batch_id?: string
  batch_number?: string
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
  collection_date?: string // Date for collection (payment date or callback date)
  collection_status?: 'C/B' | 'W/P' // Call Back or Will Pay
  verification_status?: 'Email' | 'Phone' | 'Web' // How the invoice was verified
  contact_persons?: string[] // List of contact persons
  selected_contact_person?: string // Selected contact person
  /** Client confirmed AI-extracted fields before batch submit */
  ai_confirmed_at?: string
  ai_confirmed_by?: string
  /** Admin AIDocView review outcome */
  ai_review_status?: 'not_run' | 'running' | 'ready' | 'needs_work'
  ai_review_summary?: string
  /** JSON InvoiceAiReviewSnapshot — required checks, issues, gate (survives refresh). */
  ai_review_snapshot?: string
  /** DocSort group id + source document ids for admin AI review */
  doc_sort_group_id?: string
  document_doc_ids?: string[]
  /** Supabase storage paths keyed by document_doc_ids entry. */
  document_storage_paths?: Record<string, string>
}

export interface DocumentSendRecord {
  email_address: string
  sent_at: string
  sent_by?: string
  status?: 'sent' | 'delivered' | 'failed'
  documents_sent?: string[]
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

