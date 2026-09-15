import type { CredyxInvoiceDraft } from '../types/credyxBatch'
import type { DocSortFingerprint } from '../products/docSort/types'
import type { DraftViewDocument } from './aiDraftDocuments'

export type PacketDocCategory =
  | 'invoice'
  | 'rate_confirmation'
  | 'bol'
  | 'pod'
  | 'lumper'
  | 'scale'
  | 'other'

export const PACKET_CATEGORY_LABEL: Record<PacketDocCategory, string> = {
  invoice: 'Invoice',
  rate_confirmation: 'Rate confirmation',
  bol: 'BOL',
  pod: 'POD',
  lumper: 'Lumper',
  scale: 'Scale ticket',
  other: 'Other / unknown',
}

const OTHER_HINTS: { category: PacketDocCategory; pattern: RegExp }[] = [
  { category: 'invoice', pattern: /\binvoice\b/i },
  { category: 'lumper', pattern: /lumper/i },
  { category: 'scale', pattern: /scale\s*tick|scale.?ticket|weight.?ticket/i },
  { category: 'pod', pattern: /\bpod\b|proof\s*of\s*deliv|delivery\s*receipt/i },
  { category: 'rate_confirmation', pattern: /rate\s*con|rate\s*sheet|rate\s*conf/i },
  { category: 'bol', pattern: /\bbol\b|bill\s*of\s*lad/i },
]

/** Classify a fingerprint or file name into a packet category. */
export function classifyPacketDoc(input: {
  kind?: string
  fileName?: string
  notes?: string
  isGeneratedInvoice?: boolean
}): PacketDocCategory {
  if (input.isGeneratedInvoice || input.kind === 'Generated invoice' || input.kind === 'invoice') {
    return 'invoice'
  }
  if (input.kind === 'rate_confirmation' || input.kind === 'Rate con') return 'rate_confirmation'
  if (input.kind === 'bill_of_lading' || input.kind === 'BOL') return 'bol'
  if (input.kind === 'lumper') return 'lumper'

  const haystack = `${input.fileName ?? ''} ${input.notes ?? ''}`
  for (const hint of OTHER_HINTS) {
    if (hint.pattern.test(haystack)) return hint.category
  }
  return 'other'
}

export function packetCategoryLabel(category: PacketDocCategory): string {
  return PACKET_CATEGORY_LABEL[category]
}

export function invoiceFingerprints(inv: CredyxInvoiceDraft): DocSortFingerprint[] {
  return [
    ...inv.fingerprints.rateCons,
    ...inv.fingerprints.bols,
    ...(inv.fingerprints.other ?? []),
  ]
}

export interface PacketDocRow {
  docId: string
  fileName: string
  category: PacketDocCategory
  file?: File
  generated?: boolean
}

export interface PacketDocGroup {
  category: PacketDocCategory
  label: string
  docs: PacketDocRow[]
}

const CATEGORY_ORDER: PacketDocCategory[] = [
  'invoice',
  'rate_confirmation',
  'bol',
  'pod',
  'lumper',
  'scale',
  'other',
]

/** Group supporting docs for one invoice packet (invoice page first). */
export function groupPacketDocuments(
  inv: CredyxInvoiceDraft,
  fileById: Map<string, File>
): PacketDocGroup[] {
  const rows: PacketDocRow[] = []
  const seen = new Set<string>()

  const push = (row: PacketDocRow) => {
    if (seen.has(row.docId)) return
    seen.add(row.docId)
    rows.push(row)
  }

  if (inv.invoice_pdf) {
    push({
      docId: `invoice-pdf-${inv.groupId}`,
      fileName: inv.invoice_pdf.name || `Invoice-${inv.invoice_number}.pdf`,
      category: 'invoice',
      file: inv.invoice_pdf,
      generated: true,
    })
  }

  for (const fp of invoiceFingerprints(inv)) {
    push({
      docId: fp.docId,
      fileName: fp.fileName,
      category: classifyPacketDoc(fp),
      file: fileById.get(fp.docId),
    })
  }

  for (const docId of inv.document_doc_ids) {
    const file = fileById.get(docId)
    if (!file) continue
    push({
      docId,
      fileName: file.name,
      category: classifyPacketDoc({ fileName: file.name, kind: 'other' }),
      file,
    })
  }

  return CATEGORY_ORDER.map((category) => ({
    category,
    label: PACKET_CATEGORY_LABEL[category],
    docs: rows.filter((row) => row.category === category),
  })).filter((group) => group.docs.length > 0)
}

export function draftViewKindForCategory(category: PacketDocCategory): string {
  return PACKET_CATEGORY_LABEL[category]
}

export function categoryForViewDoc(doc: DraftViewDocument): PacketDocCategory {
  return classifyPacketDoc({
    kind: doc.kind,
    fileName: doc.name,
    isGeneratedInvoice: doc.kind === 'Generated invoice',
  })
}
