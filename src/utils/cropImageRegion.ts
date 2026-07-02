import { FieldRegionBox } from '../types/documentReview'
import { getDomSurface } from '../platform/domSurface'

/** Crop a JPEG/PNG data URL to a normalized bounding box. */
export async function cropImageToDataUrl(
  dataUrl: string,
  region: FieldRegionBox,
  imageWidth: number,
  imageHeight: number
): Promise<string> {
  const image = await getDomSurface().loadImage(dataUrl)
  const sx = Math.round(region.x * imageWidth)
  const sy = Math.round(region.y * imageHeight)
  const sw = Math.max(1, Math.round(region.width * imageWidth))
  const sh = Math.max(1, Math.round(region.height * imageHeight))

  const canvas = getDomSurface().createCanvas(sw, sh)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not create canvas for crop')

  ctx.drawImage(image as CanvasImageSource, sx, sy, sw, sh, 0, 0, sw, sh)
  return canvas.toDataURL('image/jpeg', 0.92)
}

/** Build a vision-ready image from a marked region on a page. */
export async function buildRegionReviewImage(
  pageImage: {
    previewDataUrl: string
    imageWidth: number
    imageHeight: number
    pageNumber: number
    fileName: string
  },
  region: FieldRegionBox
) {
  const previewDataUrl = await cropImageToDataUrl(
    pageImage.previewDataUrl,
    region,
    pageImage.imageWidth,
    pageImage.imageHeight
  )

  const bitmap = await getDomSurface().createImageBitmap(await (await fetch(previewDataUrl)).blob())
  const width = bitmap.width
  const height = bitmap.height
  bitmap.close()

  return {
    previewDataUrl,
    sourceType: 'image' as const,
    pageNumber: pageImage.pageNumber,
    totalPages: 1,
    imageWidth: width,
    imageHeight: height,
    fileName: `${pageImage.fileName}-region-p${pageImage.pageNumber}`,
    fileSize: 0,
    mimeType: 'image/jpeg',
  }
}
