import { AI_REVIEW_CONFIG, resolvePdfPagesToReview } from '../config/aiReview'
import { getDomSurface } from '../platform/domSurface'
import {
  ReviewImageRasterizer,
  getReviewImageRasterizer,
  hasReviewImageRasterizer,
  setReviewImageRasterizer,
} from '../platform/reviewImageRasterizer'
import { ReviewImageInfo } from '../types/documentReview'

type PdfJsModule = typeof import('pdfjs-dist')

let pdfjsLib: PdfJsModule | undefined

async function getPdfJs(): Promise<PdfJsModule> {
  if (!pdfjsLib) {
    pdfjsLib = await import('pdfjs-dist')
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url
    ).toString()
  }
  return pdfjsLib
}

/** PDF render scale so page raster is sharp up to MAX_IMAGE_WIDTH (letter ~612pt wide). */
function pdfRenderScale(maxWidth: number): number {
  const letterWidthPt = 612
  return Math.max(1.5, Math.min(3, maxWidth / letterWidthPt))
}

/** Resize a canvas so the longest side does not exceed maxWidth. */
function resizeCanvas(source: CanvasSurface, maxWidth: number): CanvasSurface {
  const scale = Math.min(1, maxWidth / Math.max(source.width, source.height))
  if (scale >= 1) {
    return source
  }

  const canvas = getDomSurface().createCanvas(
    Math.round(source.width * scale),
    Math.round(source.height * scale)
  )
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    return source
  }

  ctx.drawImage(source as CanvasImageSource, 0, 0, canvas.width, canvas.height)
  return canvas
}

type CanvasSurface = ReturnType<ReturnType<typeof getDomSurface>['createCanvas']>

/** Convert canvas to JPEG base64 data URL for vision API input. */
function canvasToDataUrl(canvas: CanvasSurface): string {
  return canvas.toDataURL('image/jpeg', 0.78)
}

function buildImageInfo(
  file: File,
  previewDataUrl: string,
  canvas: CanvasSurface,
  sourceType: ReviewImageInfo['sourceType'],
  pageNumber: number,
  totalPages: number
): ReviewImageInfo {
  return {
    previewDataUrl,
    sourceType,
    pageNumber,
    totalPages,
    imageWidth: canvas.width,
    imageHeight: canvas.height,
    fileName: file.name,
    fileSize: file.size,
    mimeType: file.type || 'application/octet-stream',
  }
}

async function loadPdfDocument(file: File) {
  const pdfjs = await getPdfJs()
  const buffer = await file.arrayBuffer()
  return pdfjs.getDocument({ data: buffer }).promise
}

/** Render a specific PDF page into a vision-ready image. */
async function pdfPageToReviewImage(
  file: File,
  pdf: Awaited<ReturnType<typeof loadPdfDocument>>,
  pageNumber: number
): Promise<ReviewImageInfo> {
  const page = await pdf.getPage(pageNumber)
  const viewport = page.getViewport({ scale: pdfRenderScale(AI_REVIEW_CONFIG.MAX_IMAGE_WIDTH) })
  const canvas = getDomSurface().createCanvas(viewport.width, viewport.height)
  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('Could not create canvas context for PDF rendering')
  }

  await page.render({
    canvasContext: context as unknown as CanvasRenderingContext2D,
    viewport,
    canvas: canvas as unknown as HTMLCanvasElement,
  }).promise
  const resized = resizeCanvas(canvas, AI_REVIEW_CONFIG.MAX_IMAGE_WIDTH)
  const previewDataUrl = canvasToDataUrl(resized)

  return buildImageInfo(file, previewDataUrl, resized, 'pdf_page', pageNumber, pdf.numPages)
}

function isImageFile(file: File): boolean {
  if (file.type.startsWith('image/')) return true
  const lower = file.name.toLowerCase()
  return /\.(jpe?g|png|gif|webp|tiff?|bmp)$/i.test(lower)
}

function isTiffFile(file: File): boolean {
  const lower = file.name.toLowerCase()
  return file.type === 'image/tiff' || lower.endsWith('.tif') || lower.endsWith('.tiff')
}

const browserRasterizer: ReviewImageRasterizer = {
  async getReviewPageCount(file: File): Promise<number> {
    if (isImageFile(file)) {
      return 1
    }

    if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
      const pdf = await loadPdfDocument(file)
      return resolvePdfPagesToReview(pdf.numPages)
    }

    return 1
  },

  async fileToReviewImages(file: File, maxPages?: number): Promise<ReviewImageInfo[]> {
    if (isImageFile(file)) {
      return [await imageFileToReviewImage(file)]
    }

    if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
      const pdf = await loadPdfDocument(file)
      const pagesToRender =
        maxPages !== undefined
          ? Math.min(pdf.numPages, maxPages)
          : resolvePdfPagesToReview(pdf.numPages)
      const images: ReviewImageInfo[] = []

      for (let pageNumber = 1; pageNumber <= pagesToRender; pageNumber += 1) {
        images.push(await pdfPageToReviewImage(file, pdf, pageNumber))
      }

      return images
    }

    throw new Error(`Unsupported file type for AI review: ${file.type || file.name}`)
  },
}

if (!hasReviewImageRasterizer()) {
  setReviewImageRasterizer(browserRasterizer)
}

/** Convert an image file into a vision-ready image plus metadata. */
async function imageFileToReviewImage(file: File): Promise<ReviewImageInfo> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    if (isTiffFile(file)) {
      throw new Error(
        `TIFF "${file.name}" could not be decoded in this browser. Convert to PDF or PNG, or use Chrome/Edge.`
      )
    }
    throw new Error(`Could not read image file: ${file.name}`)
  }
  const canvas = getDomSurface().createCanvas(bitmap.width, bitmap.height)
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Could not create canvas context for image')
  }
  ctx.drawImage(bitmap, 0, 0)
  bitmap.close()

  const resized = resizeCanvas(canvas, AI_REVIEW_CONFIG.MAX_IMAGE_WIDTH)
  const previewDataUrl = canvasToDataUrl(resized)

  return buildImageInfo(file, previewDataUrl, resized, 'image', 1, 1)
}

/** Page count that will be sent for AI review (all PDF pages unless env cap is set). */
export async function getReviewPageCount(file: File): Promise<number> {
  return getReviewImageRasterizer().getReviewPageCount(file)
}

/**
 * Render PDF pages for multi-page review.
 * @param maxPages Pass 1 for first-page-only; omit to review all pages (or env cap).
 */
export async function fileToReviewImages(
  file: File,
  maxPages?: number
): Promise<ReviewImageInfo[]> {
  return getReviewImageRasterizer().fileToReviewImages(file, maxPages)
}

/** Convert an uploaded file into vision input — first page only for quick classify. */
export async function fileToReviewImage(file: File): Promise<ReviewImageInfo> {
  const images = await fileToReviewImages(file, 1)
  return images[0]
}

/** Convert an uploaded file into a vision-ready image data URL. */
export async function fileToReviewImageDataUrl(file: File): Promise<string> {
  const image = await fileToReviewImage(file)
  return image.previewDataUrl
}
