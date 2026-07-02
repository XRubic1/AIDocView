import { ReviewImageInfo } from '../types/documentReview'

export interface ReviewImageRasterizer {
  fileToReviewImages(file: File, maxPages?: number): Promise<ReviewImageInfo[]>
  getReviewPageCount(file: File): Promise<number>
}

let rasterizer: ReviewImageRasterizer | undefined

export function setReviewImageRasterizer(next: ReviewImageRasterizer | undefined): void {
  rasterizer = next
}

export function hasReviewImageRasterizer(): boolean {
  return Boolean(rasterizer)
}

export function getReviewImageRasterizer(): ReviewImageRasterizer {
  if (!rasterizer) {
    throw new Error('Review image rasterizer is not configured.')
  }
  return rasterizer
}
