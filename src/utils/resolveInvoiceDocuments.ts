import { getBatchFiles } from '../data/batchFileStore'
import {
  getInvoiceDocumentFile,
  getInvoiceDocuments,
} from '../services/invoiceDocumentStore'
import type { Invoice } from '../types/invoice'

export interface ResolvedInvoiceDocument {
  id: string
  name: string
  type: string
  size: number
  file: File
}

/**
 * Load real PDF/files for an invoice from the in-memory batch file store.
 * Used by admin invoice detail (AI/manual batch uploads).
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

/** True when invoice expects docs but in-memory files were cleared (e.g. page refresh). */
export function invoiceDocumentsMissingFromStore(invoice: Invoice): boolean {
  const expected = invoice.documents_count ?? 0
  if (expected === 0) return false
  return resolveInvoiceDocuments(invoice).length === 0
}
