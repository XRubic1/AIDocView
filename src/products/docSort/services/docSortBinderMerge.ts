import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import type { DocSortFingerprint, DocSortLoadGroup } from '../types'
import { DOCSORT_AI_DISCLAIMER } from '../constants/aiDisclaimer'
import { formatExtractedRate, primaryRateCon } from '../utils/formatRate'

export interface GeneratedInvoiceRef {
  file: File
  invoiceNumber: string
}

export interface BinderCoverInfo {
  loadLabel: string
  invoiceNumber?: string
  rateDisplay: string | null
  broker?: string
  carrier?: string
  lane?: string
  documentList: string[]
}

function sanitizeFileName(name: string): string {
  const cleaned = name.replace(/[<>:"/\\|?*]/g, '_').trim()
  return cleaned || 'Binder'
}

/** Download filename: invoice # if provided, otherwise load #. */
export function resolveBinderFileName(loadLabel: string, invoiceNumber?: string): string {
  if (invoiceNumber?.trim()) {
    return `${sanitizeFileName(invoiceNumber.trim())}.pdf`
  }
  return `${sanitizeFileName(loadLabel)}.pdf`
}

function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const next = line ? `${line} ${word}` : word
    if (next.length > maxChars) {
      if (line) lines.push(line)
      line = word
    } else {
      line = next
    }
  }
  if (line) lines.push(line)
  return lines
}

/** First page: load / invoice summary + AI disclaimer. */
export async function createBinderCoverPdf(info: BinderCoverInfo): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const page = doc.addPage([612, 792])
  const regular = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const margin = 48
  let y = 720

  const title = info.invoiceNumber ? `Invoice ${info.invoiceNumber}` : `Load ${info.loadLabel}`
  page.drawText('DocSort Binder', { x: margin, y, size: 11, font: regular, color: rgb(0.45, 0.45, 0.45) })
  y -= 28
  page.drawText(title, { x: margin, y, size: 22, font: bold, color: rgb(0.1, 0.1, 0.1) })
  y -= 32

  const rows: string[] = []
  if (info.rateDisplay) rows.push(`AI-extracted rate: ${info.rateDisplay} (verify on rate con)`)
  if (info.broker) rows.push(`Broker: ${info.broker}`)
  if (info.carrier) rows.push(`Carrier: ${info.carrier}`)
  if (info.lane) rows.push(`Lane: ${info.lane}`)
  rows.push(`Documents: ${info.documentList.length}`)

  for (const row of rows) {
    page.drawText(row, { x: margin, y, size: 11, font: regular, color: rgb(0.2, 0.2, 0.2) })
    y -= 18
  }

  y -= 12
  page.drawText('Included files:', { x: margin, y, size: 10, font: bold, color: rgb(0.3, 0.3, 0.3) })
  y -= 16
  for (const name of info.documentList.slice(0, 12)) {
    page.drawText(`• ${name}`, { x: margin + 8, y, size: 9, font: regular, color: rgb(0.35, 0.35, 0.35) })
    y -= 14
  }
  if (info.documentList.length > 12) {
    page.drawText(`• + ${info.documentList.length - 12} more`, {
      x: margin + 8,
      y,
      size: 9,
      font: regular,
      color: rgb(0.35, 0.35, 0.35),
    })
    y -= 14
  }

  y -= 20
  page.drawText('Important', { x: margin, y, size: 10, font: bold, color: rgb(0.55, 0.35, 0.05) })
  y -= 16
  for (const line of wrapText(DOCSORT_AI_DISCLAIMER, 85)) {
    page.drawText(line, { x: margin, y, size: 9, font: regular, color: rgb(0.4, 0.35, 0.2) })
    y -= 13
  }

  return doc.save()
}

async function appendPdfBytes(merged: PDFDocument, bytes: Uint8Array): Promise<void> {
  const src = await PDFDocument.load(bytes, { ignoreEncryption: true })
  const pages = await merged.copyPages(src, src.getPageIndices())
  pages.forEach((p) => merged.addPage(p))
}

async function fileToBytes(file: File): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer())
}

export function buildBinderCoverInfo(
  group: DocSortLoadGroup,
  fileById: Map<string, File>,
  invoice?: GeneratedInvoiceRef
): BinderCoverInfo {
  const rateCon = primaryRateCon(group)
  const lane = [rateCon?.pickup, rateCon?.delivery].filter(Boolean).join(' → ')
  const names: string[] = []

  group.rateCons.forEach((fp) => {
    const f = fileById.get(fp.docId)
    if (f) names.push(f.name)
  })
  group.bols.forEach((fp) => {
    const f = fileById.get(fp.docId)
    if (f) names.push(f.name)
  })
  if (invoice) names.push(invoice.file.name)

  return {
    loadLabel: group.label,
    invoiceNumber: invoice?.invoiceNumber,
    rateDisplay: formatExtractedRate(rateCon),
    broker: rateCon?.broker,
    carrier: rateCon?.carrier,
    lane: lane || undefined,
    documentList: names,
  }
}

/** Ordered PDFs: rate cons → BOLs → optional invoice. */
export function collectBinderPdfFiles(
  group: DocSortLoadGroup,
  fileById: Map<string, File>,
  invoice?: GeneratedInvoiceRef
): File[] {
  const files: File[] = []
  const push = (fp: DocSortFingerprint) => {
    const f = fileById.get(fp.docId)
    if (f) files.push(f)
  }
  group.rateCons.forEach(push)
  group.bols.forEach(push)
  if (invoice) files.push(invoice.file)
  return files
}

/**
 * Merge cover + documents into one PDF binder.
 */
export async function mergeLoadBinderPdf(
  group: DocSortLoadGroup,
  fileById: Map<string, File>,
  invoice?: GeneratedInvoiceRef
): Promise<{ bytes: Uint8Array; fileName: string }> {
  const pdfs = collectBinderPdfFiles(group, fileById, invoice)
  if (pdfs.length === 0) {
    throw new Error('No PDF files available for this load.')
  }

  const merged = await PDFDocument.create()
  const cover = await createBinderCoverPdf(buildBinderCoverInfo(group, fileById, invoice))
  await appendPdfBytes(merged, cover)

  for (const file of pdfs) {
    await appendPdfBytes(merged, await fileToBytes(file))
  }

  const fileName = resolveBinderFileName(group.label, invoice?.invoiceNumber)
  return { bytes: await merged.save(), fileName }
}

export function triggerPdfDownload(bytes: Uint8Array, fileName: string): void {
  const blob = new Blob([new Uint8Array(bytes)], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(url)
}
