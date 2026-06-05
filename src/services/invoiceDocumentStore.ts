import type { Invoice } from '../types/invoice'

export interface StoredInvoiceDocument {
  id: string
  invoice_id: string
  name: string
  file_name: string
  size: number
  mime_type: string
  uploaded_at: string
  uploaded_by: string
  source: 'client' | 'batch'
}

const fileStore = new Map<string, File>()
const documentsByInvoice = new Map<string, StoredInvoiceDocument[]>()

/** Persist uploaded files for an invoice (in-memory mock store). */
export function addInvoiceDocuments(
  invoiceId: string,
  files: File[],
  uploadedBy: string,
  source: StoredInvoiceDocument['source'] = 'client'
): StoredInvoiceDocument[] {
  const added: StoredInvoiceDocument[] = files.map((file, index) => {
    const doc: StoredInvoiceDocument = {
      id: `inv-doc-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`,
      invoice_id: invoiceId,
      name: file.name.replace(/\.[^.]+$/, '') || file.name,
      file_name: file.name,
      size: file.size,
      mime_type: file.type || 'application/octet-stream',
      uploaded_at: new Date().toISOString(),
      uploaded_by: uploadedBy,
      source,
    }
    fileStore.set(doc.id, file)
    return doc
  })

  const existing = documentsByInvoice.get(invoiceId) ?? []
  documentsByInvoice.set(invoiceId, [...existing, ...added])
  return added
}

export function getInvoiceDocuments(invoiceId: string): StoredInvoiceDocument[] {
  return [...(documentsByInvoice.get(invoiceId) ?? [])]
}

export function getInvoiceDocumentFile(documentId: string): File | undefined {
  return fileStore.get(documentId)
}

export interface InvoiceDocumentViewerItem {
  id: string
  name: string
  type: string
  size: number
  file?: File
}

/** Documents available for client document viewer (store + legacy count fallback). */
export function getInvoiceDocumentsForViewer(invoice: Invoice): InvoiceDocumentViewerItem[] {
  const stored = getInvoiceDocuments(invoice.id)
  if (stored.length > 0) {
    return stored.map((doc) => ({
      id: doc.id,
      name: doc.file_name,
      type: doc.mime_type,
      size: doc.size,
      file: getInvoiceDocumentFile(doc.id),
    }))
  }

  const expected = invoice.documents_count ?? 0
  if (expected === 0) return []

  return Array.from({ length: expected }).map((_, idx) => ({
    id: `doc-${invoice.id}-${idx}`,
    name: `Document ${idx + 1}.pdf`,
    type: 'application/pdf',
    size: 1024 * 500,
  }))
}
