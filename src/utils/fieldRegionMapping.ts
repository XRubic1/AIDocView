import { FieldRegionBox } from '../types/documentReview'

/**
 * Map a model region page index to the PDF packet page number.
 * Models often return 1..N relative to the images in the request, not the full upload.
 */
export function remapRegionToPacketPage(
  region: FieldRegionBox | undefined,
  packetPageNumbers: number[],
  defaultPage: number
): FieldRegionBox | undefined {
  if (!region) return undefined
  if (packetPageNumbers.length === 0) {
    return { ...region, pageNumber: defaultPage }
  }
  if (packetPageNumbers.includes(region.pageNumber)) {
    return region
  }

  const relativeIndex = Math.trunc(region.pageNumber) - 1
  if (relativeIndex >= 0 && relativeIndex < packetPageNumbers.length) {
    return { ...region, pageNumber: packetPageNumbers[relativeIndex] }
  }

  return { ...region, pageNumber: defaultPage }
}

export function packetPageNumbersFromImages(
  pages: Array<{ pageNumber: number }>
): number[] {
  return pages.map((page) => page.pageNumber)
}
