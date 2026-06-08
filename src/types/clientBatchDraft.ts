import type { DocSortResult } from '../products/docSort/types'
import type { CredyxInvoiceDraft } from './credyxBatch'

export type ClientBatchDraftMode = 'ai' | 'manual'
export type AiDraftStep = 'upload' | 'processing' | 'confirm'

export interface SerializedCredyxInvoiceDraft extends Omit<CredyxInvoiceDraft, 'invoice_pdf'> {
  invoicePdfKey?: string
}

export interface SerializedBatchIntakeDraft {
  batchNumber: string
  sortResult: DocSortResult
  invoices: SerializedCredyxInvoiceDraft[]
  unmatched: {
    rateCons: CredyxInvoiceDraft['fingerprints']['rateCons']
    bols: CredyxInvoiceDraft['fingerprints']['bols']
    other: DocSortResult['otherDocuments']
  }
  /** docId → IndexedDB file key */
  fileByIdKeys: Record<string, string>
}

export interface StoredFileMeta {
  key: string
  name: string
  type: string
  size: number
}

export interface AiDraftSnapshot {
  step: AiDraftStep
  uploadFiles: StoredFileMeta[]
  intake: SerializedBatchIntakeDraft | null
}

export interface ManualDraftInvoiceSnapshot {
  invoice_number: string
  load_number: string
  broker_name: string
  broker_address: string
  amount: string
  invoice_date: string
  notes: string
  documents: StoredFileMeta[]
}

export interface ManualDraftSnapshot {
  invoiceFormData: Omit<ManualDraftInvoiceSnapshot, 'documents'>
  invoices: ManualDraftInvoiceSnapshot[]
}

export interface ClientBatchDraftRecord {
  batchId: string
  clientId: string
  mode: ClientBatchDraftMode
  updatedAt: string
  ai?: AiDraftSnapshot
  manual?: ManualDraftSnapshot
}
