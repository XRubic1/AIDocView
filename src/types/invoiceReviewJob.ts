/** Per-uploaded-PDF review progress for FactorFox-style invoice cards. */
export type InvoiceReviewJobStatus = 'queued' | 'reviewing' | 'complete' | 'error'

export interface InvoiceReviewJob {
  docId: string
  fileName: string
  status: InvoiceReviewJobStatus
  /** 0–100 */
  progress: number
  stepLabel: string
  error?: string
}
