import { PDFDocument } from 'pdf-lib'

export interface PacketSourceFile {
  name: string
  file: File
}

export interface PacketBuildResult {
  /** Single merged PDF, or null when fewer than two files could be merged. */
  packet: File | null
  /** Files that went into the packet, in order. */
  merged: PacketSourceFile[]
  /** Files that could not be merged (Word docs, unreadable PDFs, …) — kept separate. */
  rest: PacketSourceFile[]
}

function kindOf(file: File, name: string): 'pdf' | 'png' | 'jpg' | null {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (file.type === 'application/pdf' || ext === 'pdf') return 'pdf'
  if (file.type === 'image/png' || ext === 'png') return 'png'
  if (file.type === 'image/jpeg' || ext === 'jpg' || ext === 'jpeg') return 'jpg'
  return null
}

export function invoicePacketFileName(invoiceNumber: string): string {
  const safe = invoiceNumber.replace(/[<>:"/\\|?*]/g, '_').trim() || 'Invoice'
  return `Invoice ${safe} - Packet.pdf`
}

/**
 * Combine an invoice's PDFs/images (invoice, RC, BOL, other, …) into one packet PDF.
 * Anything that cannot be merged is returned in `rest` so it is never dropped.
 */
export async function buildInvoicePacket(
  sources: PacketSourceFile[],
  packetName: string
): Promise<PacketBuildResult> {
  const out = await PDFDocument.create()
  const merged: PacketSourceFile[] = []
  const rest: PacketSourceFile[] = []

  for (const source of sources) {
    const kind = kindOf(source.file, source.name)
    if (!kind) {
      rest.push(source)
      continue
    }
    try {
      const bytes = new Uint8Array(await source.file.arrayBuffer())
      if (kind === 'pdf') {
        const doc = await PDFDocument.load(bytes, { ignoreEncryption: true })
        if (doc.getPageCount() === 0) {
          rest.push(source)
          continue
        }
        const pages = await out.copyPages(doc, doc.getPageIndices())
        pages.forEach((page) => out.addPage(page))
      } else {
        const image = kind === 'png' ? await out.embedPng(bytes) : await out.embedJpg(bytes)
        const maxW = 560
        const maxH = 740
        const scale = Math.min(1, maxW / image.width, maxH / image.height)
        const page = out.addPage([612, 792])
        const w = image.width * scale
        const h = image.height * scale
        page.drawImage(image, { x: (612 - w) / 2, y: (792 - h) / 2, width: w, height: h })
      }
      merged.push(source)
    } catch {
      rest.push(source)
    }
  }

  if (merged.length < 2) {
    return { packet: null, merged: [], rest: sources }
  }

  const saved = await out.save()
  return {
    packet: new File([saved as BlobPart], packetName, { type: 'application/pdf' }),
    merged,
    rest,
  }
}
