/**
 * Detect MIME type from file name + magic bytes so Packet Rework
 * does not render PDFs as broken image placeholders.
 */

/** Extension-based MIME guess (fallback when magic bytes are unknown). */
export function mimeFromFileName(fileName: string): string {
  const lower = fileName.toLowerCase()
  if (lower.endsWith('.pdf')) return 'application/pdf'
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.webp')) return 'image/webp'
  if (lower.endsWith('.gif')) return 'image/gif'
  if (lower.endsWith('.tif') || lower.endsWith('.tiff')) return 'image/tiff'
  if (lower.endsWith('.heic') || lower.endsWith('.heif')) return 'image/heic'
  return 'application/octet-stream'
}

/** True when the first bytes look like a PDF (%PDF). */
export function headerLooksLikePdf(header: Uint8Array): boolean {
  return (
    header.length >= 4 &&
    header[0] === 0x25 &&
    header[1] === 0x50 &&
    header[2] === 0x44 &&
    header[3] === 0x46
  )
}

/** True when bytes look like JPEG / PNG / GIF / WEBP. */
export function headerLooksLikeImage(header: Uint8Array): boolean {
  if (header.length < 3) return false
  // JPEG
  if (header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) return true
  // PNG
  if (
    header.length >= 8 &&
    header[0] === 0x89 &&
    header[1] === 0x50 &&
    header[2] === 0x4e &&
    header[3] === 0x47
  ) {
    return true
  }
  // GIF
  if (header[0] === 0x47 && header[1] === 0x49 && header[2] === 0x46) return true
  // WEBP (RIFF....WEBP)
  if (
    header.length >= 12 &&
    header[0] === 0x52 &&
    header[1] === 0x49 &&
    header[2] === 0x46 &&
    header[3] === 0x46 &&
    header[8] === 0x57 &&
    header[9] === 0x45 &&
    header[10] === 0x42 &&
    header[11] === 0x50
  ) {
    return true
  }
  return false
}

function imageMimeFromHeader(header: Uint8Array): string | null {
  if (header.length < 3) return null
  if (header[0] === 0xff && header[1] === 0xd8) return 'image/jpeg'
  if (header[0] === 0x89 && header[1] === 0x50) return 'image/png'
  if (header[0] === 0x47 && header[1] === 0x49) return 'image/gif'
  if (
    header.length >= 12 &&
    header[0] === 0x52 &&
    header[8] === 0x57 &&
    header[9] === 0x45
  ) {
    return 'image/webp'
  }
  return null
}

/** Read magic bytes and return the best MIME for this blob. */
export async function sniffBlobMime(
  blob: Blob,
  fileName: string,
  hintedMime?: string | null
): Promise<string> {
  const hinted = (hintedMime || '').trim().toLowerCase()
  try {
    const header = new Uint8Array(await blob.slice(0, 16).arrayBuffer())
    if (headerLooksLikePdf(header)) return 'application/pdf'
    const imageMime = imageMimeFromHeader(header)
    if (imageMime) return imageMime
  } catch {
    /* fall through */
  }

  if (hinted && hinted !== 'application/octet-stream') return hinted
  return mimeFromFileName(fileName)
}

/** Sync check used by viewers (name + File.type). Prefer sniffFileIsPdf for downloads. */
export function isPdfFileSync(file: { type?: string; name?: string }, name?: string): boolean {
  const fileName = (name || file.name || '').toLowerCase()
  if (fileName.endsWith('.pdf')) return true
  if ((file.type || '').toLowerCase() === 'application/pdf') return true
  return false
}

/** Async: name/type or magic bytes say this is a PDF. */
export async function sniffFileIsPdf(file: File, name?: string): Promise<boolean> {
  if (isPdfFileSync(file, name || file.name)) return true
  try {
    const header = new Uint8Array(await file.slice(0, 5).arrayBuffer())
    return headerLooksLikePdf(header)
  } catch {
    return false
  }
}

/** Build a File with sniffed MIME (fixes blank Packet Rework previews). */
export async function fileWithSniffedMime(
  blob: Blob,
  fileName: string,
  hintedMime?: string | null
): Promise<File> {
  const type = await sniffBlobMime(blob, fileName, hintedMime)
  let name = fileName || 'document'
  // If content is PDF but the stored name has no .pdf, append it so viewers stay consistent.
  if (type === 'application/pdf' && !name.toLowerCase().endsWith('.pdf')) {
    name = `${name}.pdf`
  }
  return new File([blob], name, { type })
}
