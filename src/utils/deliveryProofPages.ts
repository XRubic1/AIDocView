import { PageClassification, PageDocumentType, ReviewImageInfo } from '../types/documentReview'

/** Page types that count as delivery proof and require BOL signature audit. */
export const DELIVERY_PROOF_PAGE_TYPES: readonly PageDocumentType[] = [
  'bill_of_lading',
  'proof_of_delivery',
  'delivery_confirmation',
] as const

export function isDeliveryProofPageType(pageType: PageDocumentType): boolean {
  return (DELIVERY_PROOF_PAGE_TYPES as readonly string[]).includes(pageType)
}

export function countDeliveryProofPages(pages: PageClassification[] | undefined): number {
  return pages?.filter((page) => isDeliveryProofPageType(page.pageType) && !page.skipped).length ?? 0
}

/** Delivery-proof pages from a classified upload (BOL, POD, stamped BOL, delivery confirmation). */
export function filterDeliveryProofPages(
  pages: ReviewImageInfo[],
  classifications: PageClassification[]
): ReviewImageInfo[] {
  const pageNumbers = new Set(
    classifications
      .filter((c) => isDeliveryProofPageType(c.pageType) && !c.skipped)
      .map((c) => c.pageNumber)
  )
  return pages.filter((page) => pageNumbers.has(page.pageNumber))
}
