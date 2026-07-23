/** Client-owned documents stored in the document vault (NOA, W-9, COI, etc.). */

export type ClientDocumentCategory = 'broker' | 'compliance' | 'other'

/** Credyx review state for client-uploaded setup docs. */
export type ClientDocumentApprovalStatus = 'pending' | 'approved' | 'rejected'

export type ClientDocumentUploaderRole = 'client' | 'admin'

export interface ClientDocument {
  id: string
  client_id: string
  name: string
  file_name: string
  category: ClientDocumentCategory
  /** Specific type label, e.g. noa, w9, coi */
  document_type: string
  notes?: string
  size: number
  mime_type: string
  uploaded_at: string
  uploaded_by: string
  expires_at?: string
  approval_status: ClientDocumentApprovalStatus
  approved_by?: string
  approved_at?: string
  rejection_reason?: string
  uploaded_by_role: ClientDocumentUploaderRole
}

export interface ClientDocumentUploadInput {
  name: string
  file: File
  category: ClientDocumentCategory
  document_type: string
  notes?: string
  expires_at?: string
  uploaded_by: string
  /** Who is uploading — client uploads start pending; admin uploads auto-approve. */
  uploaded_by_role: ClientDocumentUploaderRole
}
