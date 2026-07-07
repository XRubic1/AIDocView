import type { Invoice } from '../types/invoice'
import { getInvoiceById } from '../data/mockInvoices'
import { isSupabaseConfigured } from '../lib/supabase'
import { saveInvoiceDocuments } from '../services/supabase/tenantPersist'

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
  storage_path?: string
}

const fileStore = new Map<string, File>()
const documentsByInvoice = new Map<string, StoredInvoiceDocument[]>()

/** Persist uploaded files for an invoice; uploads to batch-documents when Supabase is configured. */
export async function addInvoiceDocuments(
  invoiceId: string,
  files: File[],
  uploadedBy: string,
  source: StoredInvoiceDocument['source'] = 'client'
): Promise<StoredInvoiceDocument[]> {
  const invoice = getInvoiceById(invoiceId)
  if (!invoice) throw new Error('Invoice not found')

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
  const merged = [...existing, ...added]
  documentsByInvoice.set(invoiceId, merged)

  if (isSupabaseConfigured() && invoice.batch_id) {
    const filesByDocId = new Map<string, File>()
    added.forEach((doc) => {
      const file = fileStore.get(doc.id)
      if (file) filesByDocId.set(doc.id, file)
    })
    const docIds = merged.map((d) => d.id)
    const updated = await saveInvoiceDocuments(invoice, filesByDocId, docIds, merged.length)
    const paths = updated.document_storage_paths ?? {}
    merged.forEach((doc) => {
      if (paths[doc.id]) doc.storage_path = paths[doc.id]
    })
  }

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
    size: 0,
  }))
}
