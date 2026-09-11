/** File types accepted for AI batch paperwork (PDF + phone photos). */
export const BATCH_PAPERWORK_ACCEPT =
  '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png'

const PAPERWORK_EXT = /\.(pdf|jpe?g|png)$/i

/** Filename without .pdf / .jpg / .jpeg / .png. */
export function paperworkFileStem(fileName: string): string {
  return fileName.replace(PAPERWORK_EXT, '').trim()
}

/** True when the file can be read by DocSort (PDF or JPEG/PNG photo). */
export function isBatchPaperworkFile(file: File): boolean {
  const type = (file.type || '').toLowerCase()
  if (
    type === 'application/pdf' ||
    type === 'image/jpeg' ||
    type === 'image/jpg' ||
    type === 'image/png'
  ) {
    return true
  }
  return PAPERWORK_EXT.test(file.name)
}
