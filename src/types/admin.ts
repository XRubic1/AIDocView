// Type definitions for Admin Dashboard

export interface BaseEntity {
  id: string
  created_at?: string
  updated_at?: string
}

export interface PendingBatch {
  id: string
  batch_number: string
  client_name: string
  client_id: string
  total_invoices: number
  total_amount: number
  minutes_since_submitted: number
  status: 'draft' | 'ready_to_post' | 'verification' | 'approval' | 'submitted' | 'processing' | 'documents_uploaded'
  submitted_at: string
  in_use?: boolean
  in_use_by?: string
  fee_calculation?: {
    fee_type?: 'percentage' | 'flat'
    fee_percentage?: number
    flat_fee_amount?: number
    total_fee?: number
    net_amount?: number // total_amount - total_fee
  }
  /**
   * Locked fee terms for this batch (from client at create, or manual edit).
   * Invoices inherit these; monthly billing reads invoice/batch locks — not live client terms.
   */
  fee_terms?: import('./feeTerms').FeeTermsSnapshot
  /** How the client created this batch */
  upload_mode?: 'ai' | 'manual' | 'handoff'
  /** DocSort pipeline status for AI uploads */
  sort_status?: 'pending' | 'sorting' | 'ready' | 'failed'
  /** JSON-safe DocSort result snapshot (no File blobs) */
  doc_sort_snapshot?: string
  /** Unmatched document ids from DocSort (admin visibility) */
  unmatched_doc_ids?: string[]
}

export interface CollectionsAlert {
  invoice_id: string
  inv_number: string
  client_name: string
  broker_name: string
  amount: number
  expected_payment_date: string
  days_since_expected: number
  client_response: 'received' | 'not_received' | 'no_response'
  broker_contacted: boolean
  last_broker_contact: string | null
}

export interface AgingAR {
  '1_15': number
  '16_30': number
  '31_45': number
  '46_60': number
  '61_90': number
  over_91: number
  total: number
}

export interface RecentActivity {
  id: string
  type: 'batch_submitted' | 'invoice_status_changed' | 'force_close' | 'document_uploaded' | 'broker_contacted'
  description: string
  timestamp: string
  user_name: string
  related_id: string
  related_type: 'batch' | 'invoice' | 'document'
}

export interface PerformanceMetrics {
  batches_processed_30d: number
  avg_review_time_hours: number
  hold_rate_percent: number
  avg_payment_time_days: number
  trends: {
    batches_processed: 'up' | 'down' | 'stable'
    avg_review_time: 'up' | 'down' | 'stable'
    hold_rate: 'up' | 'down' | 'stable'
    avg_payment_time: 'up' | 'down' | 'stable'
  }
}

export interface AdminDashboardData {
  summary: {
    total_batches_pending: number
    total_invoices_hld: number
    total_ar_all_clients: number
    collections_alerts: number
    force_close_rate_30d: number
    avg_review_time_hours: number
  }
  pending_batches: PendingBatch[]
  collections_queue: CollectionsAlert[]
  aging_ar: AgingAR
  recent_activity: RecentActivity[]
  performance_metrics: PerformanceMetrics
}

