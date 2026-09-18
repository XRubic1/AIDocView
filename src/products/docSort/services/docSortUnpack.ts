/**
 * Split combined paperwork PDFs (RC + BOL + invoice in one file) into
 * separate DocSort fingerprints + Files using page classifications.
 */
import type { ExtractedDocumentData, PageDocumentType } from '../../../types/documentReview'
import { isDeliveryProofPageType } from '../../../utils/deliveryProofPages'
import {
  deriveUnpackedFileName,
  extractPdfPages,
  isPdfFile,
} from '../../../utils/pdfPageExtract'
import type { DocSortFingerprint, DocSortKind } from '../types'
import { fingerprintFromExtraction } from '../utils/docExtractJson'

export type UnpackPageGroup = {
  kind: DocSortKind
  label: string
  pageNumbers: number[]
}

function pageTypeToKind(pageType: PageDocumentType): DocSortKind | null {
  if (pageType === 'rate_confirmation') return 'rate_confirmation'
  if (isDeliveryProofPageType(pageType)) return 'bill_of_lading'
  if (pageType === 'invoice') return 'invoice'
  if (pageType === 'lumper') return 'lumper'
  if (pageType === 'blank') return null
  return 'other'
}

function kindSuffix(kind: DocSortKind): string {
  if (kind === 'rate_confirmation') return 'rc'
  if (kind === 'bill_of_lading') return 'bol'
  if (kind === 'invoice') return 'invoice'
  if (kind === 'lumper') return 'lumper'
  return 'other'
}

function kindLabel(kind: DocSortKind): string {
  if (kind === 'rate_confirmation') return 'Rate con'
  if (kind === 'bill_of_lading') return 'BOL'
  if (kind === 'invoice') return 'Invoice'
  if (kind === 'lumper') return 'Lumper'
  return 'Other'
}

/** Group classified pages by DocSort kind (skips blank pages). */
export function buildUnpackPageGroups(
  extraction: ExtractedDocumentData | undefined
): UnpackPageGroup[] {
  const pages = extraction?.pageClassifications ?? []
  const byKind = new Map<DocSortKind, number[]>()

  for (const page of pages) {
    if (page.skipped) continue
    const kind = pageTypeToKind(page.pageType)
    if (!kind) continue
    const list = byKind.get(kind) ?? []
    list.push(page.pageNumber)
    byKind.set(kind, list)
  }

  const order: DocSortKind[] = [
    'rate_confirmation',
    'bill_of_lading',
    'invoice',
    'lumper',
    'other',
  ]

  return order
    .filter((kind) => (byKind.get(kind)?.length ?? 0) > 0)
    .map((kind) => ({
      kind,
      label: kindLabel(kind),
      pageNumbers: [...new Set(byKind.get(kind)!)].sort((a, b) => a - b),
    }))
}

/** True when this fingerprint has 2+ document kinds across pages (worth unpacking). */
export function canUnpackFingerprint(
  fingerprint: DocSortFingerprint | undefined | null,
  file?: File | null
): boolean {
  if (!fingerprint?.extract) return false
  if (file && !isPdfFile(file)) return false
  if (file == null && fingerprint.fileName && !/\.pdf$/i.test(fingerprint.fileName)) {
    return false
  }
  return buildUnpackPageGroups(fingerprint.extract).length >= 2
}

/**
 * Slice extract JSON down to a page subset so the child fingerprint
 * looks like a single-document file (no second vision pass needed).
 */
export function sliceExtractForPages(
  extraction: ExtractedDocumentData,
  pageNumbers: number[],
  kind: DocSortKind
): ExtractedDocumentData {
  const pageSet = new Set(pageNumbers)
  const pageClassifications = (extraction.pageClassifications ?? []).filter((p) =>
    pageSet.has(p.pageNumber)
  )

  const documentType: ExtractedDocumentData['documentType'] =
    kind === 'rate_confirmation'
      ? 'rate_confirmation'
      : kind === 'bill_of_lading'
        ? 'bill_of_lading'
        : kind === 'lumper'
          ? 'lumper'
          : 'other'

  const next: ExtractedDocumentData = {
    ...extraction,
    documentType,
    pageClassifications,
  }

  if (kind !== 'rate_confirmation') {
    // Keep load/broker hints on BOL/invoice slices; drop RC-only page audits.
    next.rateConPageAudits = undefined
  } else {
    next.bolPageAudits = undefined
    next.bolAudit = undefined
    next.invoicePageAudits = undefined
    next.primaryInvoice = undefined
    next.lumperPageAudits = undefined
  }

  if (kind === 'bill_of_lading') {
    next.rateConParse = undefined
    next.rateConFields = undefined
    next.invoicePageAudits = undefined
    next.primaryInvoice = undefined
    next.lumperPageAudits = undefined
    if (next.bolPageAudits) {
      next.bolPageAudits = next.bolPageAudits.filter((a) => pageSet.has(a.pageNumber))
    }
  }

  if (kind === 'invoice') {
    next.rateConParse = undefined
    next.rateConFields = undefined
    next.bolAudit = undefined
    next.bolPageAudits = undefined
    next.lumperPageAudits = undefined
    if (next.invoicePageAudits) {
      next.invoicePageAudits = next.invoicePageAudits.filter((a) =>
        pageSet.has(a.pageNumber)
      )
    }
  }

  if (kind === 'lumper') {
    next.rateConParse = undefined
    next.rateConFields = undefined
    next.bolAudit = undefined
    next.bolPageAudits = undefined
    next.invoicePageAudits = undefined
    next.primaryInvoice = undefined
    if (next.lumperPageAudits) {
      next.lumperPageAudits = next.lumperPageAudits.filter((a) =>
        pageSet.has(a.pageNumber)
      )
    }
  }

  return next
}

function newUnpackedDocId(kind: DocSortKind): string {
  return `unpacked-${kindSuffix(kind)}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

export type UnpackedDocPart = {
  docId: string
  file: File
  fingerprint: DocSortFingerprint
}

/**
 * Split a combined PDF into one file per page-kind group.
 * All-or-nothing: if any page group fails, no parts are returned (caller keeps original).
 */
export async function unpackPdfDocument(
  sourceFile: File,
  sourceFingerprint: DocSortFingerprint
): Promise<UnpackedDocPart[]> {
  const groups = buildUnpackPageGroups(sourceFingerprint.extract)
  if (groups.length < 2) {
    throw new Error('This PDF does not have multiple document types to unpack.')
  }
  if (!isPdfFile(sourceFile)) {
    throw new Error('Only PDF files can be unpacked.')
  }

  const parts: UnpackedDocPart[] = []
  try {
    for (const group of groups) {
      const docId = newUnpackedDocId(group.kind)
      const fileName = deriveUnpackedFileName(sourceFile.name, kindSuffix(group.kind))
      const file = await extractPdfPages(sourceFile, group.pageNumbers, fileName)
      if (!file.size) {
        throw new Error(`Extracted ${group.label} PDF is empty`)
      }
      const extract = sourceFingerprint.extract
        ? sliceExtractForPages(sourceFingerprint.extract, group.pageNumbers, group.kind)
        : {
            documentType:
              group.kind === 'bill_of_lading'
                ? ('bill_of_lading' as const)
                : group.kind === 'rate_confirmation'
                  ? ('rate_confirmation' as const)
                  : group.kind === 'lumper'
                    ? ('lumper' as const)
                    : ('other' as const),
          }

      const fingerprint = fingerprintFromExtraction(
        docId,
        fileName,
        extract as ExtractedDocumentData
      )
      fingerprint.kind = group.kind
      // Preserve load / broker match keys from the parent when the slice is thin.
      if (fingerprint.loadNumbers.length === 0 && sourceFingerprint.loadNumbers.length > 0) {
        fingerprint.loadNumbers = [...sourceFingerprint.loadNumbers]
      }
      if (!fingerprint.broker && sourceFingerprint.broker) {
        fingerprint.broker = sourceFingerprint.broker
      }

      parts.push({ docId, file, fingerprint })
    }
  } catch (err) {
    // Do not return a partial split — caller must keep the original file.
    throw err instanceof Error ? err : new Error('PDF unpack failed')
  }

  if (parts.length < 2) {
    throw new Error('Unpack did not produce enough document parts.')
  }
  return parts
}

/**
 * During DocSort: when a PDF has BOL pages mixed with RC/invoice/etc.,
 * extract the BOL pages as a sibling file and keep the original as the primary doc.
 * Invoice pages mixed with RC are also extracted so carrier invoices become their own file.
 * Failures never remove the original file from fileById.
 */
export async function autoUnpackCombinedFingerprints(
  fingerprints: DocSortFingerprint[],
  fileById: Map<string, File>
): Promise<DocSortFingerprint[]> {
  const expanded: DocSortFingerprint[] = []

  for (const fp of fingerprints) {
    // Always keep the original fingerprint + file.
    expanded.push(fp)
    const file = fileById.get(fp.docId)
    if (!file || !isPdfFile(file) || !fp.extract) continue

    // Re-assert original file is present (defensive).
    fileById.set(fp.docId, file)

    const groups = buildUnpackPageGroups(fp.extract)
    if (groups.length < 2) continue

    const bolGroup = groups.find((g) => g.kind === 'bill_of_lading')
    const invoiceGroup = groups.find((g) => g.kind === 'invoice')
    // Only auto-split siblings off a combined packet — keep primary file intact.
    const toExtract = [bolGroup, invoiceGroup].filter(
      (g): g is UnpackPageGroup => Boolean(g) && g.kind !== fp.kind
    )

    for (const group of toExtract) {
      try {
        const docId = newUnpackedDocId(group.kind)
        const fileName = deriveUnpackedFileName(file.name, kindSuffix(group.kind))
        const partFile = await extractPdfPages(file, group.pageNumbers, fileName)
        if (!partFile.size) {
          throw new Error('Extracted PDF is empty')
        }
        const extract = sliceExtractForPages(fp.extract, group.pageNumbers, group.kind)
        const partFp = fingerprintFromExtraction(docId, fileName, extract)
        partFp.kind = group.kind
        if (partFp.loadNumbers.length === 0 && fp.loadNumbers.length > 0) {
          partFp.loadNumbers = [...fp.loadNumbers]
        }
        if (!partFp.broker && fp.broker) partFp.broker = fp.broker

        fileById.set(docId, partFile)
        // Original must still be present after sibling write.
        fileById.set(fp.docId, file)
        expanded.push(partFp)
      } catch (err) {
        console.warn(
          '[autoUnpackCombinedFingerprints] failed for',
          fp.fileName,
          group.kind,
          '— keeping original file',
          err
        )
        fileById.set(fp.docId, file)
      }
    }
  }

  return expanded
}
