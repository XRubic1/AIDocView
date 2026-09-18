import { PDFDocument } from 'pdf-lib'

/**
 * Extract 1-based page numbers from a PDF into a new File.
 * Used to split combined RC+BOL (and invoice) uploads into separate documents.
 */
export async function extractPdfPages(
  source: File | ArrayBuffer | Uint8Array,
  pageNumbers: number[],
  outFileName: string
): Promise<File> {
  const uniquePages = [...new Set(pageNumbers)]
    .filter((n) => Number.isFinite(n) && n >= 1)
    .sort((a, b) => a - b)

  if (uniquePages.length === 0) {
    throw new Error('No pages selected to extract.')
  }

  const bytes =
    source instanceof File
      ? new Uint8Array(await source.arrayBuffer())
      : source instanceof ArrayBuffer
        ? new Uint8Array(source)
        : source

  const src = await PDFDocument.load(bytes, { ignoreEncryption: true })
  const pageCount = src.getPageCount()
  const zeroBased = uniquePages
    .map((n) => n - 1)
    .filter((i) => i >= 0 && i < pageCount)

  if (zeroBased.length === 0) {
    throw new Error('Selected pages are outside this PDF.')
  }

  const out = await PDFDocument.create()
  const copied = await out.copyPages(src, zeroBased)
  copied.forEach((page) => out.addPage(page))
  const saved = await out.save()

  const name = outFileName.toLowerCase().endsWith('.pdf')
    ? outFileName
    : `${outFileName}.pdf`

  return new File([saved], name, { type: 'application/pdf' })
}

/** Page count for a PDF File (0 when unreadable). */
export async function getPdfPageCount(source: File | ArrayBuffer | Uint8Array): Promise<number> {
  try {
    const bytes =
      source instanceof File
        ? new Uint8Array(await source.arrayBuffer())
        : source instanceof ArrayBuffer
          ? new Uint8Array(source)
          : source
    const src = await PDFDocument.load(bytes, { ignoreEncryption: true })
    return src.getPageCount()
  } catch {
    return 0
  }
}

export type SinglePagePdfPart = {
  docId: string
  file: File
  pageNumber: number
}

/**
 * Split a multi-page PDF into one File per page (for manual RC/BOL/INV marking).
 * Returns [] when the PDF has 0–1 pages.
 */
export async function splitPdfIntoSinglePageFiles(
  sourceFile: File
): Promise<SinglePagePdfPart[]> {
  if (!isPdfFile(sourceFile)) {
    throw new Error('Only PDF files can be split into pages.')
  }
  const pageCount = await getPdfPageCount(sourceFile)
  if (pageCount <= 1) return []

  const parts: SinglePagePdfPart[] = []
  for (let page = 1; page <= pageCount; page++) {
    const docId = `page-split-${Date.now()}-p${page}-${Math.random().toString(36).slice(2, 7)}`
    const fileName = deriveUnpackedFileName(sourceFile.name, `p${page}`)
    const file = await extractPdfPages(sourceFile, [page], fileName)
    if (!file.size) {
      throw new Error(`Extracted page ${page} is empty`)
    }
    parts.push({ docId, file, pageNumber: page })
  }
  return parts
}

/** True when the file looks like a PDF we can split. */
export function isPdfFile(file: File | undefined | null): boolean {
  if (!file) return false
  if (file.type === 'application/pdf') return true
  return /\.pdf$/i.test(file.name)
}

/** Build a derived filename: `packet.pdf` → `packet-bol.pdf`. */
export function deriveUnpackedFileName(sourceName: string, suffix: string): string {
  const base = sourceName.replace(/\.pdf$/i, '').trim() || 'document'
  const cleanSuffix = suffix.replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '') || 'part'
  return `${base}-${cleanSuffix}.pdf`
}
