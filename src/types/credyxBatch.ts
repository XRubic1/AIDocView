import type { DocSortFingerprint, DocSortResult } from '../products/docSort/types'
import type { Invoice } from './invoice'

/** Client-editable draft before batch submit (AI upload path). */
export interface CredyxInvoiceDraft {
  draftId: string
  groupId: string
  invoice_number: string
  load_number: string
  broker_name: string
  broker_id: string
  amount: number
  invoice_date: string
  carrier_name?: string
  rate_missing: boolean
  confirmed: boolean
  document_doc_ids: string[]
  invoice_pdf?: File
  fingerprints: {
    rateCons: DocSortFingerprint[]
    bols: DocSortFingerprint[]
    other?: DocSortFingerprint[]
  }
}

/** Output of batchIntakePipeline before client confirms and submits. */
export interface BatchIntakeDraft {
  batchNumber: string
  sortResult: DocSortResult
  invoices: CredyxInvoiceDraft[]
  unmatched: {
    rateCons: DocSortFingerprint[]
    bols: DocSortFingerprint[]
    other: DocSortFingerprint[]
  }
  fileById: Map<string, File>
  /** Storage paths for lazy PDF fetch in Packets rework (docId → path). */
  storagePathsByDocId?: Record<string, string>
}

export type BatchUploadMode = 'ai' | 'manual'

export interface SubmitAiBatchInput {
  clientId: string
  clientName: string
  drafts: CredyxInvoiceDraft[]
  sortResult: DocSortResult
  fileById: Map<string, File>
  confirmedBy: string
  /** When submitting a saved client draft batch, reuse this batch id. */
  existingBatchId?: string
  /** Admin create-batch paths skip the vault setup gate. */
  skipSetupGate?: boolean
}

export interface SubmitAiBatchResult {
  batchId: string
  batchNumber: string
  invoices: Invoice[]
  /** Present when optional post-submit automation ran. */
  happyPath?: {
    ppwSent: number
    ppwFailed: number
    movedToVerification: boolean
    intakeErrorEmailed: boolean
  }
}
