import JSZip from 'jszip'
import type { DocSortFingerprint, DocSortLoadGroup, DocSortResult } from '../types'
import {
  type GeneratedInvoiceRef,
  mergeLoadBinderPdf,
  triggerPdfDownload,
} from './docSortBinderMerge'

function triggerZipDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(url)
}

/**
 * Single merged PDF binder — named by invoice # if provided, else load #.
 */
export async function downloadLoadBinderPdf(
  group: DocSortLoadGroup,
  fileById: Map<string, File>,
  invoice?: GeneratedInvoiceRef
): Promise<void> {
  const { bytes, fileName } = await mergeLoadBinderPdf(group, fileById, invoice)
  triggerPdfDownload(bytes, fileName)
}

/** @deprecated Use downloadLoadBinderPdf — kept as alias for imports. */
export const downloadLoadBinderZip = downloadLoadBinderPdf

/** ZIP of one PDF binder per matched load (each named by load # or invoice #). */
export async function downloadFullBinderZip(
  result: DocSortResult,
  fileById: Map<string, File>,
  invoicesByGroupId?: Map<string, GeneratedInvoiceRef>
): Promise<void> {
  if (result.groups.length === 0) {
    throw new Error('No matched loads to export.')
  }

  const zip = new JSZip()
  const root = zip.folder('DocSort_Binders') ?? zip

  for (const group of result.groups) {
    const invoice = invoicesByGroupId?.get(group.groupId)
    const { bytes, fileName } = await mergeLoadBinderPdf(group, fileById, invoice)
    root.file(fileName, bytes)
  }

  for (const fp of result.unmatchedRateCons) {
    const file = fileById.get(fp.docId)
    if (file) root.file(`Unmatched/${file.name}`, file)
  }
  for (const fp of result.unmatchedBols) {
    const file = fileById.get(fp.docId)
    if (file) {
      root.file(`Unmatched/${file.name}`, file)
    }
  }
  for (const fp of result.otherDocuments) {
    const file = fileById.get(fp.docId)
    if (file) root.file(`Other/${file.name}`, file)
  }

  const blob = await zip.generateAsync({ type: 'blob' })
  const stamp = new Date().toISOString().slice(0, 10)
  triggerZipDownload(blob, `DocSort_Binders_${stamp}.zip`)
}

export function collectGroupFiles(group: DocSortLoadGroup): DocSortFingerprint[] {
  return [...group.rateCons, ...group.bols]
}
