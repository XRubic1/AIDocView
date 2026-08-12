import type { Invoice, InvoiceDispute, InvoiceNote, DocumentSendRecord } from '../../types/invoice'
import type { Payment } from '../../types/payment'
import type { Batch } from '../../data/mockBatches'
import type { FeeTermsSnapshot } from '../../types/feeTerms'

export interface InvoiceRow {
  id: string
  invoice_number: string
  client_id: string
  client_name: string
  broker_id: string | null
  broker_name: string
  amount: number | string
  paid_amount: number | string | null
  overpayment_accepted_at: string | null
  invoice_date: string
  due_date: string | null
  expected_payment_date: string | null
  status: Invoice['status']
  load_number: string | null
  batch_id: string | null
  batch_number: string | null
  reviewed_at: string | null
  reviewed_by: string | null
  approved_by: string | null
  approved_at: string | null
  hold_reason: string | null
  notes: string | null
  notes_history: InvoiceNote[] | null
  disputes: InvoiceDispute[] | null
  documents_count: number | null
  broker_contacted: boolean | null
  last_broker_contact: string | null
  days_since_expected: number | null
  document_send_history: DocumentSendRecord[] | null
  remittance_snapshot: string | null
  collection_date: string | null
  collection_status: string | null
  collections_needs_attention: boolean | null
  collections_last_inquiry_at: string | null
  collections_followup_at: string | null
  verification_status: string | null
  contact_persons: string[] | null
  selected_contact_person: string | null
  ai_confirmed_at: string | null
  ai_confirmed_by: string | null
  ai_review_status: string | null
  ai_review_summary: string | null
  ai_review_snapshot: string | null
  doc_sort_group_id: string | null
  document_doc_ids: string[] | null
  document_storage_paths: Record<string, string> | null
  write_off_request: Invoice['write_off_request'] | null
  fee_terms: FeeTermsSnapshot | null
  created_at: string
  updated_at: string | null
}

export interface PaymentRow {
  id: string
  client_id: string
  invoice_id: string
  invoice_number: string
  broker_name: string
  amount: number | string
  payment_date: string
  received_date: string
  payment_method: Payment['payment_method']
  payment_reference: string | null
  status: Payment['status']
  notes: string | null
  posted_source: string | null
  posted_by: string | null
  confirmed_by: string | null
  confirmed_at: string | null
  client_confirmation_deadline: string | null
  client_confirmed_at: string | null
  client_confirmed_by: string | null
  dispute: Payment['dispute'] | null
  rejection_reason: string | null
  reversed_at: string | null
  reversed_by: string | null
  reversal_reason: string | null
  reversal_type: string | null
  moved_to_payment_id: string | null
  moved_from_payment_id: string | null
  parent_payment_id: string | null
  payment_kind: string | null
  short_pay_reason: string | null
  batch_id: string | null
  batch_number: string | null
  load_number: string | null
  created_at?: string
}

export interface BatchRow {
  id: string
  batch_number: string
  client_id: string
  client_name: string
  total_invoices: number
  total_amount: number | string
  minutes_since_submitted: number
  status: Batch['status']
  submitted_at: string
  in_use: boolean
  in_use_by: string | null
  fee_calculation: Batch['fee_calculation'] | null
  fee_terms: FeeTermsSnapshot | null
  upload_mode: Batch['upload_mode'] | null
  sort_status: Batch['sort_status'] | null
  doc_sort_snapshot: string | null
  unmatched_doc_ids: string[] | null
  reviewed_at: string | null
  reviewed_by: string | null
  approved_count: number | null
  rejected_count: number | null
  created_at?: string
  updated_at?: string
}

function num(value: number | string | null | undefined): number {
  if (value == null) return 0
  return typeof value === 'number' ? value : Number(value)
}

export function invoiceRowToInvoice(row: InvoiceRow): Invoice {
  return {
    id: row.id,
    invoice_number: row.invoice_number,
    client_id: row.client_id,
    client_name: row.client_name,
    broker_id: row.broker_id ?? '',
    broker_name: row.broker_name,
    amount: num(row.amount),
    paid_amount: row.paid_amount != null ? num(row.paid_amount) : undefined,
    overpayment_accepted_at: row.overpayment_accepted_at ?? undefined,
    invoice_date: row.invoice_date,
    due_date: row.due_date ?? undefined,
    expected_payment_date: row.expected_payment_date ?? undefined,
    status: row.status,
    load_number: row.load_number ?? undefined,
    batch_id: row.batch_id ?? undefined,
    batch_number: row.batch_number ?? undefined,
    fee_terms: row.fee_terms ?? undefined,
    created_at: row.created_at,
    updated_at: row.updated_at ?? undefined,
    reviewed_at: row.reviewed_at ?? undefined,
    reviewed_by: row.reviewed_by ?? undefined,
    approved_by: row.approved_by ?? undefined,
    approved_at: row.approved_at ?? undefined,
    hold_reason: row.hold_reason ?? undefined,
    notes: row.notes ?? undefined,
    notes_history: row.notes_history ?? undefined,
    disputes: row.disputes ?? undefined,
    documents_count: row.documents_count ?? undefined,
    broker_contacted: row.broker_contacted ?? undefined,
    last_broker_contact: row.last_broker_contact ?? undefined,
    days_since_expected: row.days_since_expected ?? undefined,
    document_send_history: row.document_send_history ?? undefined,
    remittance_snapshot: row.remittance_snapshot ?? undefined,
    collection_date: row.collection_date ?? undefined,
    collection_status: (row.collection_status as Invoice['collection_status']) ?? undefined,
    collections_needs_attention: row.collections_needs_attention ?? undefined,
    collections_last_inquiry_at: row.collections_last_inquiry_at ?? undefined,
    collections_followup_at: row.collections_followup_at ?? undefined,
    verification_status: (row.verification_status as Invoice['verification_status']) ?? undefined,
    contact_persons: row.contact_persons ?? undefined,
    selected_contact_person: row.selected_contact_person ?? undefined,
    ai_confirmed_at: row.ai_confirmed_at ?? undefined,
    ai_confirmed_by: row.ai_confirmed_by ?? undefined,
    ai_review_status: (row.ai_review_status as Invoice['ai_review_status']) ?? undefined,
    ai_review_summary: row.ai_review_summary ?? undefined,
    ai_review_snapshot: row.ai_review_snapshot ?? undefined,
    doc_sort_group_id: row.doc_sort_group_id ?? undefined,
    document_doc_ids: row.document_doc_ids ?? undefined,
    document_storage_paths: row.document_storage_paths ?? undefined,
    write_off_request: row.write_off_request ?? undefined,
  }
}

export function paymentRowToPayment(row: PaymentRow): Payment {
  return {
    id: row.id,
    invoice_id: row.invoice_id,
    invoice_number: row.invoice_number,
    broker_name: row.broker_name,
    amount: num(row.amount),
    payment_date: row.payment_date,
    received_date: row.received_date,
    payment_method: row.payment_method,
    payment_reference: row.payment_reference ?? undefined,
    status: row.status,
    notes: row.notes ?? undefined,
    posted_source: (row.posted_source as Payment['posted_source']) ?? undefined,
    posted_by: row.posted_by ?? undefined,
    confirmed_by: row.confirmed_by ?? undefined,
    confirmed_at: row.confirmed_at ?? undefined,
    client_confirmation_deadline: row.client_confirmation_deadline ?? undefined,
    client_confirmed_at: row.client_confirmed_at ?? undefined,
    client_confirmed_by: row.client_confirmed_by ?? undefined,
    dispute: row.dispute ?? undefined,
    rejection_reason: row.rejection_reason ?? undefined,
    reversed_at: row.reversed_at ?? undefined,
    reversed_by: row.reversed_by ?? undefined,
    reversal_reason: row.reversal_reason ?? undefined,
    reversal_type: (row.reversal_type as Payment['reversal_type']) ?? undefined,
    moved_to_payment_id: row.moved_to_payment_id ?? undefined,
    moved_from_payment_id: row.moved_from_payment_id ?? undefined,
    parent_payment_id: row.parent_payment_id ?? undefined,
    payment_kind: (row.payment_kind as Payment['payment_kind']) ?? undefined,
    short_pay_reason: (row.short_pay_reason as Payment['short_pay_reason']) ?? undefined,
    batch_id: row.batch_id ?? undefined,
    batch_number: row.batch_number ?? undefined,
    load_number: row.load_number ?? undefined,
  }
}

export function batchRowToBatch(row: BatchRow): Batch {
  return {
    id: row.id,
    batch_number: row.batch_number,
    client_id: row.client_id,
    client_name: row.client_name,
    total_invoices: row.total_invoices,
    total_amount: num(row.total_amount),
    minutes_since_submitted: row.minutes_since_submitted,
    status: row.status,
    submitted_at: row.submitted_at,
    in_use: row.in_use,
    in_use_by: row.in_use_by ?? undefined,
    fee_calculation: row.fee_calculation ?? undefined,
    fee_terms: row.fee_terms ?? undefined,
    upload_mode: row.upload_mode ?? undefined,
    sort_status: row.sort_status ?? undefined,
    doc_sort_snapshot: row.doc_sort_snapshot ?? undefined,
    unmatched_doc_ids: row.unmatched_doc_ids ?? undefined,
    reviewed_at: row.reviewed_at ?? undefined,
    reviewed_by: row.reviewed_by ?? undefined,
    approved_count: row.approved_count ?? undefined,
    rejected_count: row.rejected_count ?? undefined,
  }
}

/** Map app Invoice to Supabase row for upsert. */
export function invoiceToRow(invoice: Invoice): InvoiceRow {
  return {
    id: invoice.id,
    invoice_number: invoice.invoice_number,
    client_id: invoice.client_id,
    client_name: invoice.client_name,
    broker_id: invoice.broker_id || null,
    broker_name: invoice.broker_name,
    amount: invoice.amount,
    paid_amount: invoice.paid_amount ?? null,
    overpayment_accepted_at: invoice.overpayment_accepted_at ?? null,
    invoice_date: invoice.invoice_date,
    due_date: invoice.due_date ?? null,
    expected_payment_date: invoice.expected_payment_date ?? null,
    status: invoice.status,
    load_number: invoice.load_number ?? null,
    batch_id: invoice.batch_id ?? null,
    batch_number: invoice.batch_number ?? null,
    reviewed_at: invoice.reviewed_at ?? null,
    reviewed_by: invoice.reviewed_by ?? null,
    approved_by: invoice.approved_by ?? null,
    approved_at: invoice.approved_at ?? null,
    hold_reason: invoice.hold_reason ?? null,
    notes: invoice.notes ?? null,
    notes_history: invoice.notes_history ?? [],
    disputes: invoice.disputes ?? [],
    documents_count: invoice.documents_count ?? null,
    broker_contacted: invoice.broker_contacted ?? null,
    last_broker_contact: invoice.last_broker_contact ?? null,
    days_since_expected: invoice.days_since_expected ?? null,
    document_send_history: invoice.document_send_history ?? [],
    remittance_snapshot: invoice.remittance_snapshot ?? null,
    collection_date: invoice.collection_date ?? null,
    collection_status: invoice.collection_status ?? null,
    collections_needs_attention: invoice.collections_needs_attention ?? null,
    collections_last_inquiry_at: invoice.collections_last_inquiry_at ?? null,
    collections_followup_at: invoice.collections_followup_at ?? null,
    verification_status: invoice.verification_status ?? null,
    contact_persons: invoice.contact_persons ?? null,
    selected_contact_person: invoice.selected_contact_person ?? null,
    ai_confirmed_at: invoice.ai_confirmed_at ?? null,
    ai_confirmed_by: invoice.ai_confirmed_by ?? null,
    ai_review_status: invoice.ai_review_status ?? null,
    ai_review_summary: invoice.ai_review_summary ?? null,
    ai_review_snapshot: invoice.ai_review_snapshot ?? null,
    doc_sort_group_id: invoice.doc_sort_group_id ?? null,
    document_doc_ids: invoice.document_doc_ids ?? null,
    document_storage_paths: invoice.document_storage_paths ?? null,
    write_off_request: invoice.write_off_request ?? null,
    fee_terms: invoice.fee_terms ?? null,
    created_at: invoice.created_at,
    updated_at: invoice.updated_at ?? null,
  }
}

/** Map app Batch to Supabase row for upsert. */
export function batchToRow(batch: Batch): BatchRow {
  return {
    id: batch.id,
    batch_number: batch.batch_number,
    client_id: batch.client_id,
    client_name: batch.client_name,
    total_invoices: batch.total_invoices,
    total_amount: batch.total_amount,
    minutes_since_submitted: batch.minutes_since_submitted,
    status: batch.status,
    submitted_at: batch.submitted_at,
    in_use: batch.in_use ?? false,
    in_use_by: batch.in_use_by ?? null,
    fee_calculation: batch.fee_calculation ?? null,
    fee_terms: batch.fee_terms ?? null,
    upload_mode: batch.upload_mode ?? null,
    sort_status: batch.sort_status ?? null,
    doc_sort_snapshot: batch.doc_sort_snapshot ?? null,
    unmatched_doc_ids: batch.unmatched_doc_ids ?? null,
    reviewed_at: batch.reviewed_at ?? null,
    reviewed_by: batch.reviewed_by ?? null,
    approved_count: batch.approved_count ?? null,
    rejected_count: batch.rejected_count ?? null,
  }
}

/** Map app Payment to Supabase row for upsert (client_id required for tenant scope). */
export function paymentToRow(payment: Payment, clientId: string): PaymentRow {
  return {
    id: payment.id,
    client_id: clientId,
    invoice_id: payment.invoice_id,
    invoice_number: payment.invoice_number,
    broker_name: payment.broker_name,
    amount: payment.amount,
    payment_date: payment.payment_date,
    received_date: payment.received_date,
    payment_method: payment.payment_method,
    payment_reference: payment.payment_reference ?? null,
    status: payment.status,
    notes: payment.notes ?? null,
    posted_source: payment.posted_source ?? null,
    posted_by: payment.posted_by ?? null,
    confirmed_by: payment.confirmed_by ?? null,
    confirmed_at: payment.confirmed_at ?? null,
    client_confirmation_deadline: payment.client_confirmation_deadline ?? null,
    client_confirmed_at: payment.client_confirmed_at ?? null,
    client_confirmed_by: payment.client_confirmed_by ?? null,
    dispute: payment.dispute ?? null,
    rejection_reason: payment.rejection_reason ?? null,
    reversed_at: payment.reversed_at ?? null,
    reversed_by: payment.reversed_by ?? null,
    reversal_reason: payment.reversal_reason ?? null,
    reversal_type: payment.reversal_type ?? null,
    moved_to_payment_id: payment.moved_to_payment_id ?? null,
    moved_from_payment_id: payment.moved_from_payment_id ?? null,
    parent_payment_id: payment.parent_payment_id ?? null,
    payment_kind: payment.payment_kind ?? 'normal',
    short_pay_reason: payment.short_pay_reason ?? null,
    batch_id: payment.batch_id ?? null,
    batch_number: payment.batch_number ?? null,
    load_number: payment.load_number ?? null,
  }
}
