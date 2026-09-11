import type { BatchIntakeDraft, CredyxInvoiceDraft } from '../types/credyxBatch'
import type { DocSortFingerprint } from '../products/docSort/types'
import type { DraftViewDocument } from './aiDraftDocuments'

type UnmatchedBucket = 'rateCons' | 'bols' | 'other'

function unmatchedBucketForKind(kind: DocSortFingerprint['kind']): UnmatchedBucket {
  if (kind === 'rate_confirmation') return 'rateCons'
  if (kind === 'bill_of_lading') return 'bols'
  return 'other'
}

export function isGeneratedInvoicePdfDoc(draft: CredyxInvoiceDraft, docId: string): boolean {
  return docId === `invoice-pdf-${draft.groupId}`
}

export function createManualDocFingerprint(docId: string, file: File): DocSortFingerprint {
  return {
    docId,
    fileName: file.name,
    kind: 'other',
    confidence: 1,
    loadNumbers: [],
  }
}

function cloneUnmatched(unmatched: BatchIntakeDraft['unmatched']) {
  return {
    rateCons: [...unmatched.rateCons],
    bols: [...unmatched.bols],
    other: [...unmatched.other],
  }
}

function otherFps(invoice: CredyxInvoiceDraft): DocSortFingerprint[] {
  return invoice.fingerprints.other ?? []
}

/** Remove a supporting doc from an invoice draft (not the generated invoice PDF). */
export function removeDocFromInvoice(
  invoice: CredyxInvoiceDraft,
  docId: string
): { invoice: CredyxInvoiceDraft; fingerprint: DocSortFingerprint | null } {
  let fingerprint: DocSortFingerprint | null = null

  const rateCons = invoice.fingerprints.rateCons.filter((fp) => {
    if (fp.docId === docId) {
      fingerprint = fp
      return false
    }
    return true
  })

  const bols = invoice.fingerprints.bols.filter((fp) => {
    if (fp.docId === docId) {
      fingerprint = fp
      return false
    }
    return true
  })

  const other = otherFps(invoice).filter((fp) => {
    if (fp.docId === docId) {
      fingerprint = fp
      return false
    }
    return true
  })

  return {
    invoice: {
      ...invoice,
      document_doc_ids: invoice.document_doc_ids.filter((id) => id !== docId),
      fingerprints: { rateCons, bols, other },
    },
    fingerprint,
  }
}

/** Attach a fingerprint (or manual doc) to an invoice draft. */
export function addDocToInvoice(
  invoice: CredyxInvoiceDraft,
  fingerprint: DocSortFingerprint
): CredyxInvoiceDraft {
  const document_doc_ids = invoice.document_doc_ids.includes(fingerprint.docId)
    ? invoice.document_doc_ids
    : [...invoice.document_doc_ids, fingerprint.docId]

  if (fingerprint.kind === 'rate_confirmation') {
    return {
      ...invoice,
      document_doc_ids,
      fingerprints: {
        ...invoice.fingerprints,
        rateCons: [...invoice.fingerprints.rateCons, fingerprint],
        other: otherFps(invoice),
      },
    }
  }

  if (fingerprint.kind === 'bill_of_lading') {
    return {
      ...invoice,
      document_doc_ids,
      fingerprints: {
        ...invoice.fingerprints,
        bols: [...invoice.fingerprints.bols, fingerprint],
        other: otherFps(invoice),
      },
    }
  }

  return {
    ...invoice,
    document_doc_ids,
    fingerprints: {
      ...invoice.fingerprints,
      other: [...otherFps(invoice), fingerprint],
    },
  }
}

function findUnmatchedFingerprint(
  unmatched: BatchIntakeDraft['unmatched'],
  docId: string
): { bucket: UnmatchedBucket; fingerprint: DocSortFingerprint } | null {
  for (const bucket of ['rateCons', 'bols', 'other'] as const) {
    const fingerprint = unmatched[bucket].find((fp) => fp.docId === docId)
    if (fingerprint) return { bucket, fingerprint }
  }
  return null
}

function removeFromUnmatched(
  unmatched: BatchIntakeDraft['unmatched'],
  docId: string
): { unmatched: BatchIntakeDraft['unmatched']; fingerprint: DocSortFingerprint | null } {
  const next = cloneUnmatched(unmatched)
  const found = findUnmatchedFingerprint(next, docId)
  if (!found) return { unmatched: next, fingerprint: null }
  next[found.bucket] = next[found.bucket].filter((fp) => fp.docId !== docId)
  return { unmatched: next, fingerprint: found.fingerprint }
}

function resolveFingerprint(
  draft: BatchIntakeDraft,
  invoice: CredyxInvoiceDraft,
  docId: string
): DocSortFingerprint | null {
  const fromFp =
    invoice.fingerprints.rateCons.find((fp) => fp.docId === docId) ??
    invoice.fingerprints.bols.find((fp) => fp.docId === docId) ??
    otherFps(invoice).find((fp) => fp.docId === docId)
  if (fromFp) return fromFp

  const file = draft.fileById.get(docId)
  if (file) return createManualDocFingerprint(docId, file)
  return null
}

/** Move a doc between invoices, or back to the unmatched pool. */
export function moveDraftDocument(
  draft: BatchIntakeDraft,
  fromDraftId: string,
  docId: string,
  toDraftId: string | null
): BatchIntakeDraft {
  const fromInvoice = draft.invoices.find((inv) => inv.draftId === fromDraftId)
  if (!fromInvoice || isGeneratedInvoicePdfDoc(fromInvoice, docId)) return draft

  const fingerprint = resolveFingerprint(draft, fromInvoice, docId)
  if (!fingerprint) return draft

  const { invoice: updatedFrom } = removeDocFromInvoice(fromInvoice, docId)
  let invoices = draft.invoices.map((inv) =>
    inv.draftId === fromDraftId ? updatedFrom : inv
  )
  let unmatched = cloneUnmatched(draft.unmatched)

  if (toDraftId === null) {
    const bucket = unmatchedBucketForKind(fingerprint.kind)
    unmatched[bucket] = [...unmatched[bucket], fingerprint]
  } else {
    invoices = invoices.map((inv) =>
      inv.draftId === toDraftId ? addDocToInvoice(inv, fingerprint) : inv
    )
  }

  return { ...draft, invoices, unmatched }
}

/** Assign an unmatched doc to an invoice. */
export function assignUnmatchedDocument(
  draft: BatchIntakeDraft,
  docId: string,
  toDraftId: string
): BatchIntakeDraft {
  const { unmatched, fingerprint } = removeFromUnmatched(draft.unmatched, docId)
  if (!fingerprint) return draft

  const invoices = draft.invoices.map((inv) =>
    inv.draftId === toDraftId ? addDocToInvoice(inv, fingerprint) : inv
  )

  return { ...draft, unmatched, invoices }
}

/** Remove an invoice and return its supporting docs to unmatched. */
export function removeInvoiceFromDraft(
  draft: BatchIntakeDraft,
  draftId: string
): BatchIntakeDraft {
  const target = draft.invoices.find((inv) => inv.draftId === draftId)
  if (!target) return draft

  const unmatched = cloneUnmatched(draft.unmatched)
  const seen = new Set<string>()

  const pushUnmatched = (fp: DocSortFingerprint) => {
    if (seen.has(fp.docId)) return
    seen.add(fp.docId)
    const bucket = unmatchedBucketForKind(fp.kind)
    unmatched[bucket] = [...unmatched[bucket], fp]
  }

  target.fingerprints.rateCons.forEach(pushUnmatched)
  target.fingerprints.bols.forEach(pushUnmatched)
  otherFps(target).forEach(pushUnmatched)

  target.document_doc_ids.forEach((docId) => {
    if (seen.has(docId)) return
    const file = draft.fileById.get(docId)
    if (file) pushUnmatched(createManualDocFingerprint(docId, file))
  })

  return {
    ...draft,
    unmatched,
    invoices: draft.invoices.filter((inv) => inv.draftId !== draftId),
  }
}

export function docKindLabel(doc: DraftViewDocument): string {
  if (doc.kind === 'Generated invoice') return 'Invoice PDF'
  if (doc.kind === 'Rate con') return 'Rate confirmation'
  if (doc.kind === 'BOL') return 'BOL'
  return doc.kind || 'Document'
}

/** Permanently remove a supporting document from the draft (not the generated invoice page). */
export function deleteDraftDocument(
  draft: BatchIntakeDraft,
  docId: string
): BatchIntakeDraft {
  if (draft.invoices.some((inv) => isGeneratedInvoicePdfDoc(inv, docId))) return draft

  const invoices = draft.invoices.map((inv) => removeDocFromInvoice(inv, docId).invoice)
  const { unmatched } = removeFromUnmatched(draft.unmatched, docId)
  const fileById = new Map(draft.fileById)
  fileById.delete(docId)

  return { ...draft, invoices, unmatched, fileById }
}
