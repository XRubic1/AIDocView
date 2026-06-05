/** Client-owned documents stored in the document vault (NOA, W-9, COI, etc.). */

export type ClientDocumentCategory = 'broker' | 'compliance' | 'other'

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
}

export interface ClientDocumentUploadInput {
  name: string
  file: File
  category: ClientDocumentCategory
  document_type: string
  notes?: string
  expires_at?: string
  uploaded_by: string
}
