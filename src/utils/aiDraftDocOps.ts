import type { BatchIntakeDraft, CredyxInvoiceDraft } from '../types/credyxBatch'
import type { DocSortFingerprint } from '../products/docSort/types'
import type { DraftViewDocument } from './aiDraftDocuments'
import {
  canUnpackFingerprint,
  unpackPdfDocument,
} from '../products/docSort/services/docSortUnpack'
import { isPdfFile, splitPdfIntoSinglePageFiles } from './pdfPageExtract'

type UnmatchedBucket = 'rateCons' | 'bols' | 'other'

function unmatchedBucketForKind(kind: DocSortFingerprint['kind']): UnmatchedBucket {
  if (kind === 'rate_confirmation') return 'rateCons'
  if (kind === 'bill_of_lading') return 'bols'
  return 'other'
}

export function isGeneratedInvoicePdfDoc(draft: CredyxInvoiceDraft, docId: string): boolean {
  return docId === `invoice-pdf-${draft.groupId}`
}

/** Guess DocSort kind from file name when AI has not classified the doc yet. */
export function guessDocSortKindFromFileName(
  fileName: string
): DocSortFingerprint['kind'] {
  const lower = fileName.toLowerCase()
  if (/rate\s*con|rate\s*sheet|rate\s*conf|\brc\b/.test(lower)) {
    return 'rate_confirmation'
  }
  if (/\bbol\b|bill\s*of\s*lad|pod\b|proof\s*of\s*deliv/.test(lower)) {
    return 'bill_of_lading'
  }
  if (/\binvoice\b/.test(lower)) return 'invoice'
  if (/lumper/.test(lower)) return 'lumper'
  return 'other'
}

export function createManualDocFingerprint(docId: string, file: File): DocSortFingerprint {
  return {
    docId,
    fileName: file.name,
    kind: guessDocSortKindFromFileName(file.name),
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

/** Lowercase basename; strip path + extension so UUID.pdf ≈ UUID ≈ path/UUID.png. */
function packetNameKeys(raw: string): string[] {
  const trimmed = raw.trim().toLowerCase()
  if (!trimmed) return []
  const base = trimmed.split(/[/\\]/).pop() || trimmed
  const noExt = base.replace(/\.[a-z0-9]{1,8}$/i, '')
  return [...new Set([trimmed, base, noExt].filter(Boolean))]
}

function addPacketNameKeys(target: Set<string>, raw: string) {
  for (const key of packetNameKeys(raw)) target.add(key)
}

/** Collect every doc id currently sitting on invoice packets. */
export function assignedPacketDocIds(invoices: CredyxInvoiceDraft[]): Set<string> {
  const ids = new Set<string>()
  for (const inv of invoices) {
    for (const id of inv.document_doc_ids) ids.add(id)
    for (const fp of inv.fingerprints.rateCons) ids.add(fp.docId)
    for (const fp of inv.fingerprints.bols) ids.add(fp.docId)
    for (const fp of inv.fingerprints.other ?? []) ids.add(fp.docId)
    if (inv.invoice_pdf) {
      ids.add(`invoice-pdf-${inv.groupId}`)
      ids.add(`invoice-pdf-${inv.draftId}`)
    }
  }
  return ids
}

/** File-name keys already used on invoice packets (path/ext insensitive). */
export function assignedPacketFileNames(invoices: CredyxInvoiceDraft[]): Set<string> {
  const names = new Set<string>()
  for (const inv of invoices) {
    for (const fp of [
      ...inv.fingerprints.rateCons,
      ...inv.fingerprints.bols,
      ...(inv.fingerprints.other ?? []),
    ]) {
      addPacketNameKeys(names, fp.fileName)
      // Storage often uses the UUID as the object key / display name interchangeably.
      addPacketNameKeys(names, fp.docId)
    }
    for (const id of inv.document_doc_ids) addPacketNameKeys(names, id)
  }
  return names
}

/**
 * Drop unmatched pool entries that are already on a packet (by doc id or file name).
 * Fixes stale unmatched_doc_ids and duplicate intake copies showing as "Unassigned".
 */
export function pruneUnmatchedAgainstAssigned(
  unmatched: BatchIntakeDraft['unmatched'],
  invoices: CredyxInvoiceDraft[]
): BatchIntakeDraft['unmatched'] {
  const assignedIds = assignedPacketDocIds(invoices)
  const assignedNames = assignedPacketFileNames(invoices)
  const keep = (fp: DocSortFingerprint) => {
    if (assignedIds.has(fp.docId) || fp.docId.startsWith('invoice-pdf-')) return false
    // Same file under a different doc id (common after re-upload / page-split).
    for (const key of packetNameKeys(fp.fileName)) {
      if (assignedNames.has(key)) return false
    }
    for (const key of packetNameKeys(fp.docId)) {
      if (assignedNames.has(key)) return false
    }
    return true
  }
  return {
    rateCons: unmatched.rateCons.filter(keep),
    bols: unmatched.bols.filter(keep),
    other: unmatched.other.filter(keep),
  }
}

/** Keep draft.unmatched in sync after any assign / place / hydrate. */
export function withPrunedUnmatched(draft: BatchIntakeDraft): BatchIntakeDraft {
  return {
    ...draft,
    unmatched: pruneUnmatchedAgainstAssigned(draft.unmatched, draft.invoices),
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

  return withPrunedUnmatched({ ...draft, invoices, unmatched })
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

  return withPrunedUnmatched({ ...draft, unmatched, invoices })
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

/**
 * Remove a supporting doc from wherever it lives (invoice or unmatched pool).
 * Returns null fingerprint when the doc is the generated invoice PDF or missing.
 */
export function extractDraftDocument(
  draft: BatchIntakeDraft,
  docId: string
): {
  draft: BatchIntakeDraft
  fingerprint: DocSortFingerprint | null
  fromDraftId: string | null
} {
  if (draft.invoices.some((inv) => isGeneratedInvoicePdfDoc(inv, docId))) {
    return { draft, fingerprint: null, fromDraftId: null }
  }

  for (const inv of draft.invoices) {
    const fingerprint = resolveFingerprint(draft, inv, docId)
    if (!fingerprint) continue
    const inInvoice =
      inv.fingerprints.rateCons.some((fp) => fp.docId === docId) ||
      inv.fingerprints.bols.some((fp) => fp.docId === docId) ||
      otherFps(inv).some((fp) => fp.docId === docId) ||
      inv.document_doc_ids.includes(docId)
    if (!inInvoice) continue

    const { invoice } = removeDocFromInvoice(inv, docId)
    return {
      draft: {
        ...draft,
        invoices: draft.invoices.map((row) => (row.draftId === inv.draftId ? invoice : row)),
      },
      fingerprint,
      fromDraftId: inv.draftId,
    }
  }

  const { unmatched, fingerprint } = removeFromUnmatched(draft.unmatched, docId)
  if (!fingerprint) return { draft, fingerprint: null, fromDraftId: null }
  return {
    draft: { ...draft, unmatched },
    fingerprint,
    fromDraftId: null,
  }
}

/**
 * Place a supporting doc onto an invoice (or unmatched) with an explicit kind.
 * Pass `preserve` to keep the document's current RC/BOL/other classification.
 */
export function placeDraftDocument(
  draft: BatchIntakeDraft,
  docId: string,
  toDraftId: string | null,
  kind: DocSortFingerprint['kind'] | 'preserve'
): BatchIntakeDraft {
  const extracted = extractDraftDocument(draft, docId)
  if (!extracted.fingerprint) return draft

  const nextKind: DocSortFingerprint['kind'] =
    kind === 'preserve' ? extracted.fingerprint.kind : kind

  const fingerprint: DocSortFingerprint = {
    ...extracted.fingerprint,
    kind: nextKind,
  }

  if (toDraftId === null) {
    const unmatched = cloneUnmatched(extracted.draft.unmatched)
    const bucket = unmatchedBucketForKind(nextKind)
    unmatched[bucket] = [...unmatched[bucket], fingerprint]
    return { ...extracted.draft, unmatched }
  }

  const invoices = extracted.draft.invoices.map((inv) =>
    inv.draftId === toDraftId ? addDocToInvoice(inv, fingerprint) : inv
  )
  return withPrunedUnmatched({ ...extracted.draft, invoices })
}

/** Locate a draft doc without removing it. */
export function locateDraftDocument(
  draft: BatchIntakeDraft,
  docId: string
): { fingerprint: DocSortFingerprint; fromDraftId: string | null } | null {
  if (draft.invoices.some((inv) => isGeneratedInvoicePdfDoc(inv, docId))) return null

  for (const inv of draft.invoices) {
    const fingerprint = resolveFingerprint(draft, inv, docId)
    if (!fingerprint) continue
    const inInvoice =
      inv.fingerprints.rateCons.some((fp) => fp.docId === docId) ||
      inv.fingerprints.bols.some((fp) => fp.docId === docId) ||
      otherFps(inv).some((fp) => fp.docId === docId) ||
      inv.document_doc_ids.includes(docId)
    if (!inInvoice) continue
    return { fingerprint, fromDraftId: inv.draftId }
  }

  const found = findUnmatchedFingerprint(draft.unmatched, docId)
  if (found) return { fingerprint: found.fingerprint, fromDraftId: null }

  const file = draft.fileById.get(docId)
  if (file) return { fingerprint: createManualDocFingerprint(docId, file), fromDraftId: null }
  return null
}

/**
 * Park a document in Unassigned and keep its File in the map.
 * Used when unpack / AI split fails so paperwork is never lost.
 */
export function ensureDocumentUnassigned(
  draft: BatchIntakeDraft,
  docId: string,
  fingerprint?: DocSortFingerprint | null
): BatchIntakeDraft {
  if (draft.invoices.some((inv) => isGeneratedInvoicePdfDoc(inv, docId))) return draft

  const file = draft.fileById.get(docId)
  const extracted = extractDraftDocument(draft, docId)
  const fp =
    extracted.fingerprint ??
    fingerprint ??
    (file ? createManualDocFingerprint(docId, file) : null)
  if (!fp) return draft

  const unmatched = cloneUnmatched(extracted.draft.unmatched)
  const already = findUnmatchedFingerprint(unmatched, docId)
  if (!already) {
    const bucket = unmatchedBucketForKind(fp.kind)
    unmatched[bucket] = [...unmatched[bucket], fp]
  }

  const fileById = new Map(extracted.draft.fileById)
  if (file) fileById.set(docId, file)

  // Do not prune here — pruning by file-name can drop the doc we just rescued.
  return { ...extracted.draft, unmatched, fileById }
}

function parkPartsInUnassigned(
  draft: BatchIntakeDraft,
  originalDocId: string,
  originalFingerprint: DocSortFingerprint,
  parts: Awaited<ReturnType<typeof unpackPdfDocument>>
): BatchIntakeDraft {
  let next = ensureDocumentUnassigned(draft, originalDocId, originalFingerprint)
  const fileById = new Map(next.fileById)
  const unmatched = cloneUnmatched(next.unmatched)

  for (const part of parts) {
    fileById.set(part.docId, part.file)
    if (!findUnmatchedFingerprint(unmatched, part.docId)) {
      const bucket = unmatchedBucketForKind(part.fingerprint.kind)
      unmatched[bucket] = [...unmatched[bucket], part.fingerprint]
    }
  }

  return { ...next, unmatched, fileById }
}

/** Whether a draft doc can be split into RC / BOL / invoice page groups. */
export function canUnpackDraftDocument(
  draft: BatchIntakeDraft,
  docId: string
): boolean {
  const file = draft.fileById.get(docId)
  if (!isPdfFile(file)) return false
  const located = locateDraftDocument(draft, docId)
  return canUnpackFingerprint(located?.fingerprint, file)
}

export type UnpackDraftResult = {
  draft: BatchIntakeDraft
  /** `unpacked` = split ok; `rescued_unassigned` = split failed, file kept in Unassigned. */
  status: 'unpacked' | 'rescued_unassigned'
  message?: string
}

/**
 * Split a multi-page PDF into one pending page file each (kind `other`).
 * Used in Doc Splitter when AI did not detect RC/BOL/INV page groups.
 */
export async function splitDraftPdfIntoPages(
  draft: BatchIntakeDraft,
  docId: string
): Promise<UnpackDraftResult> {
  const file = draft.fileById.get(docId)
  if (!file || !isPdfFile(file)) {
    throw new Error('Only PDF files can be split into pages.')
  }

  const located = locateDraftDocument(draft, docId)
  if (!located) {
    throw new Error('Document not found in this batch.')
  }

  let parts: Awaited<ReturnType<typeof splitPdfIntoSinglePageFiles>>
  try {
    parts = await splitPdfIntoSinglePageFiles(file)
    if (parts.length < 2) {
      return {
        draft: ensureDocumentUnassigned(draft, docId, located.fingerprint),
        status: 'rescued_unassigned',
        message: 'This PDF is already a single page — mark it as RC / BOL / INV.',
      }
    }
  } catch (err) {
    console.warn('[splitDraftPdfIntoPages] failed', docId, err)
    return {
      draft: ensureDocumentUnassigned(draft, docId, located.fingerprint),
      status: 'rescued_unassigned',
      message:
        err instanceof Error
          ? `Page split failed (${err.message}). File kept in Unassigned.`
          : 'Page split failed. File kept in Unassigned.',
    }
  }

  const extracted = extractDraftDocument(draft, docId)
  const fileById = new Map(extracted.draft.fileById)
  const unmatched = cloneUnmatched(extracted.draft.unmatched)
  fileById.delete(docId)

  for (const part of parts) {
    fileById.set(part.docId, part.file)
    const fingerprint: DocSortFingerprint = {
      docId: part.docId,
      fileName: part.file.name,
      kind: 'other',
      confidence: 1,
      loadNumbers: located.fingerprint.loadNumbers ?? [],
      broker: located.fingerprint.broker,
    }
    unmatched.other = [...unmatched.other, fingerprint]
  }

  return {
    draft: withPrunedUnmatched({ ...extracted.draft, unmatched, fileById }),
    status: 'unpacked',
  }
}

/**
 * One-click unpack: replace a combined PDF with separate RC / BOL / invoice files.
 * On any failure, the original (and any extracted parts) go to Unassigned — files are kept.
 */
export async function unpackDraftDocument(
  draft: BatchIntakeDraft,
  docId: string
): Promise<UnpackDraftResult> {
  const file = draft.fileById.get(docId)
  if (!file || !isPdfFile(file)) {
    throw new Error('Only PDF files can be unpacked.')
  }

  const located = locateDraftDocument(draft, docId)
  if (!located) {
    throw new Error('Document not found in this batch.')
  }
  if (!canUnpackFingerprint(located.fingerprint, file)) {
    return {
      draft: ensureDocumentUnassigned(draft, docId, located.fingerprint),
      status: 'rescued_unassigned',
      message:
        'Could not split this PDF (missing page types). It was moved to Unassigned so the file is not lost.',
    }
  }

  let parts: Awaited<ReturnType<typeof unpackPdfDocument>>
  try {
    parts = await unpackPdfDocument(file, located.fingerprint)
    if (parts.length < 2) {
      throw new Error('Unpack did not produce enough document parts.')
    }
    for (const part of parts) {
      if (!part.file || part.file.size <= 0) {
        throw new Error(`Unpack produced an empty file for ${part.fingerprint.fileName}`)
      }
    }
  } catch (err) {
    console.warn('[unpackDraftDocument] split failed — moving original to unassigned', docId, err)
    return {
      draft: ensureDocumentUnassigned(draft, docId, located.fingerprint),
      status: 'rescued_unassigned',
      message:
        err instanceof Error
          ? `Split failed (${err.message}). File moved to Unassigned.`
          : 'Split failed. File moved to Unassigned.',
    }
  }

  try {
    // Only remove the original from its packet after parts are ready.
    const extracted = extractDraftDocument(draft, docId)
    const fileById = new Map(extracted.draft.fileById)
    for (const part of parts) {
      fileById.set(part.docId, part.file)
    }
    // Drop the combined original only after siblings are stored.
    fileById.delete(docId)

    const fromDraftId = extracted.fromDraftId ?? located.fromDraftId

    if (fromDraftId == null) {
      const unmatched = cloneUnmatched(extracted.draft.unmatched)
      for (const part of parts) {
        const bucket = unmatchedBucketForKind(part.fingerprint.kind)
        unmatched[bucket] = [...unmatched[bucket], part.fingerprint]
      }
      return {
        draft: withPrunedUnmatched({ ...extracted.draft, unmatched, fileById }),
        status: 'unpacked',
      }
    }

    let invoices = extracted.draft.invoices
    for (const part of parts) {
      invoices = invoices.map((inv) =>
        inv.draftId === fromDraftId ? addDocToInvoice(inv, part.fingerprint) : inv
      )
    }

    return {
      draft: withPrunedUnmatched({ ...extracted.draft, invoices, fileById }),
      status: 'unpacked',
    }
  } catch (err) {
    console.warn(
      '[unpackDraftDocument] apply failed — parking original + parts in unassigned',
      docId,
      err
    )
    return {
      draft: parkPartsInUnassigned(draft, docId, located.fingerprint, parts),
      status: 'rescued_unassigned',
      message:
        'Split partially failed. Original and any extracted pages were moved to Unassigned.',
    }
  }
}
