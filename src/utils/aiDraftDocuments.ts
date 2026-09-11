import type { CredyxInvoiceDraft } from '../types/credyxBatch'
import { classifyPacketDoc, draftViewKindForCategory, invoiceFingerprints } from './batchPacketDocs'

export interface DraftViewDocument {
  id: string
  name: string
  file: File
  kind?: string
}

import { classifyPacketDoc, draftViewKindForCategory, invoiceFingerprints } from './batchPacketDocs'

/** Resolve uploaded + generated files for a load draft. Invoice page is always first. */
export function getDraftViewDocuments(
  draft: CredyxInvoiceDraft,
  fileById: Map<string, File>
): DraftViewDocument[] {
  const docs: DraftViewDocument[] = []
  const seen = new Set<string>()

  const addFile = (id: string, name: string, file: File, kind?: string) => {
    if (seen.has(id)) return
    seen.add(id)
    docs.push({ id, name, file, kind })
  }

  if (draft.invoice_pdf) {
    addFile(
      `invoice-pdf-${draft.groupId}`,
      draft.invoice_pdf.name || `Invoice-${draft.invoice_number}.pdf`,
      draft.invoice_pdf,
      'Generated invoice'
    )
  }

  for (const fp of invoiceFingerprints(draft)) {
    const file = fileById.get(fp.docId)
    if (file) {
      addFile(
        fp.docId,
        fp.fileName || file.name,
        file,
        draftViewKindForCategory(classifyPacketDoc(fp))
      )
    }
  }

  draft.document_doc_ids.forEach((docId) => {
    const file = fileById.get(docId)
    if (file) {
      addFile(
        docId,
        file.name,
        file,
        draftViewKindForCategory(classifyPacketDoc({ fileName: file.name, kind: 'other' }))
      )
    }
  })

  return docs
}
