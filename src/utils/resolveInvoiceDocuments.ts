import { getBatchFiles } from '../data/batchFileStore'
import {
  getInvoiceDocumentFile,
  getInvoiceDocuments,
} from '../services/invoiceDocumentStore'
import { downloadBatchDocument } from '../services/supabase/tenantPersist'
import { isSupabaseConfigured } from '../lib/supabase'
import type { Invoice } from '../types/invoice'

export interface ResolvedInvoiceDocument {
  id: string
  name: string
  type: string
  size: number
  file: File
}

const storageFileCache = new Map<string, File>()

/**
 * Load real PDF/files for an invoice from in-memory store or Supabase storage.
 */
export function resolveInvoiceDocuments(invoice: Invoice): ResolvedInvoiceDocument[] {
  const docs: ResolvedInvoiceDocument[] = []

  if (invoice.batch_id) {
    const fileMap = getBatchFiles(invoice.batch_id)
    const orderedIds: string[] = []

    if (fileMap.size > 0) {
      if (invoice.doc_sort_group_id) {
        const invoicePdfKey = `invoice-pdf-${invoice.doc_sort_group_id}`
        if (fileMap.has(invoicePdfKey)) {
          orderedIds.push(invoicePdfKey)
        }
      }

      for (const docId of invoice.document_doc_ids ?? []) {
        if (!orderedIds.includes(docId)) {
          orderedIds.push(docId)
        }
      }

      for (const docId of orderedIds) {
        const file = fileMap.get(docId)
        if (file) {
          docs.push({
            id: docId,
            name: file.name,
            type: file.type || 'application/pdf',
            size: file.size,
            file,
          })
        }
      }
    }
  }

  for (const clientDoc of getInvoiceDocuments(invoice.id)) {
    const file = getInvoiceDocumentFile(clientDoc.id)
    if (file) {
      docs.push({
        id: clientDoc.id,
        name: clientDoc.file_name,
        type: clientDoc.mime_type,
        size: clientDoc.size,
        file,
      })
    }
  }

  return docs
}

/** Async: includes documents restored from Supabase storage after page refresh. */
export async function resolveInvoiceDocumentsAsync(
  invoice: Invoice
): Promise<ResolvedInvoiceDocument[]> {
  const fromMemory = resolveInvoiceDocuments(invoice)
  if (fromMemory.length > 0) return fromMemory

  const paths = invoice.document_storage_paths
  if (!isSupabaseConfigured() || !paths || Object.keys(paths).length === 0) {
    return []
  }

  const docs: ResolvedInvoiceDocument[] = []
  for (const [docId, storagePath] of Object.entries(paths)) {
    const cached = storageFileCache.get(storagePath)
    if (cached) {
      docs.push({
        id: docId,
        name: cached.name,
        type: cached.type || 'application/pdf',
        size: cached.size,
        file: cached,
      })
      continue
    }

    const fileName = storagePath.split('/').pop() ?? `${docId}.pdf`
    const file = await downloadBatchDocument(storagePath, fileName, 'application/pdf')
    if (file) {
      storageFileCache.set(storagePath, file)
      docs.push({
        id: docId,
        name: file.name,
        type: file.type || 'application/pdf',
        size: file.size,
        file,
      })
    }
  }

  return docs
}

/** True when invoice expects docs but files are not available locally or in storage. */
export function invoiceDocumentsMissingFromStore(invoice: Invoice): boolean {
  const expected = invoice.documents_count ?? 0
  if (expected === 0) return false
  return resolveInvoiceDocuments(invoice).length === 0 && !invoice.document_storage_paths
}
