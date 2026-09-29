import { getPdfJs } from './getPdfJs'

/** A digital rate con page has far more than a few stray characters. */
const MIN_TEXT_CHARS = 40

type TextItemLike = { str?: string; transform?: number[] }

/** True when the PDF text layer is enough to extract from, instead of a page image. */
export function isUsablePdfText(text: string | null | undefined): boolean {
  if (!text) return false
  const letters = text.replace(/[^A-Za-z0-9]/g, '')
  return letters.length >= MIN_TEXT_CHARS
}

/** Put PDF.js text items back into reading order (top to bottom, left to right). */
export function layoutPdfTextItems(items: unknown[]): string {
  const placed: { y: number; x: number; str: string }[] = []
  for (const item of items) {
    if (!item || typeof item !== 'object' || !('str' in item)) continue
    const row = item as TextItemLike
    const str = typeof row.str === 'string' ? row.str : ''
    if (!str.trim()) continue
    const transform = row.transform ?? []
    placed.push({
      y: typeof transform[5] === 'number' ? transform[5] : 0,
      x: typeof transform[4] === 'number' ? transform[4] : 0,
      str,
    })
  }
  placed.sort((a, b) => b.y - a.y || a.x - b.x)

  const lines: string[] = []
  let currentY: number | null = null
  let parts: string[] = []
  for (const row of placed) {
    if (currentY == null || Math.abs(row.y - currentY) > 3) {
      if (parts.length > 0) lines.push(parts.join(' '))
      parts = [row.str]
      currentY = row.y
    } else {
      parts.push(row.str)
    }
  }
  if (parts.length > 0) lines.push(parts.join(' '))
  return lines.join('\n').replace(/[ \t]+\n/g, '\n').trim()
}

function isPdfFile(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
}

/** One string per page, in page order. Empty when the file is not a PDF. */
export async function readPdfPageTexts(file: File): Promise<string[]> {
  if (!isPdfFile(file)) return []
  try {
    const pdfjs = await getPdfJs()
    const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise
    const pages: string[] = []
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber)
      const content = await page.getTextContent()
      pages.push(layoutPdfTextItems(content.items))
    }
    return pages
  } catch (err) {
    console.warn('[readPdfPageTexts]', file.name, err)
    return []
  }
}
