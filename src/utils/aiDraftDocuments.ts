import type { CredyxInvoiceDraft } from '../types/credyxBatch'
import type { DocSortFingerprint } from '../products/docSort/types'

export interface DraftViewDocument {
  id: string
  name: string
  file: File
  kind?: string
}

/** Resolve uploaded + generated files for a load draft. */
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

  const addFingerprint = (fp: DocSortFingerprint, kind: string) => {
    const file = fileById.get(fp.docId)
    if (file) {
      addFile(fp.docId, fp.fileName || file.name, file, kind)
    }
  }

  draft.fingerprints.rateCons.forEach((fp) => addFingerprint(fp, 'Rate con'))
  draft.fingerprints.bols.forEach((fp) => addFingerprint(fp, 'BOL'))

  draft.document_doc_ids.forEach((docId) => {
    const file = fileById.get(docId)
    if (file) {
      addFile(docId, file.name, file, 'Document')
    }
  })

  return docs
}
