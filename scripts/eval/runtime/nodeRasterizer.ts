import { readFile } from 'node:fs/promises'
import path from 'node:path'
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs'
import { AI_REVIEW_CONFIG, resolvePdfPagesToReview } from '../../../src/config/aiReview.js'
import { getDomSurface } from '../../../src/platform/domSurface.js'
import type { ReviewImageRasterizer } from '../../../src/platform/reviewImageRasterizer.js'
import type { ReviewImageInfo } from '../../../src/types/documentReview.js'
import type { EvalDocumentSpec } from '../types.js'
import { createNodeDomSurface, type NodeCanvas } from './nodeDomSurface.js'

const MIN_JPEG_BASE64 =
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAB//2Q=='

function pdfRenderScale(maxWidth: number): number {
  const letterWidthPt = 612
  return Math.max(1.5, Math.min(3, maxWidth / letterWidthPt))
}

function resizeCanvas(source: NodeCanvas, maxWidth: number): NodeCanvas {
  const scale = Math.min(1, maxWidth / Math.max(source.width, source.height))
  if (scale >= 1) return source

  const canvas = getDomSurface().createCanvas(
    Math.round(source.width * scale),
    Math.round(source.height * scale)
  ) as unknown as NodeCanvas
  const ctx = canvas.getContext('2d')
  if (!ctx) return source
  ctx.drawImage(source as unknown as CanvasImageSource, 0, 0, canvas.width, canvas.height)
  return canvas
}

function canvasToDataUrl(canvas: NodeCanvas): string {
  return canvas.toDataURL('image/jpeg', 0.78)
}

function buildImageInfo(
  file: File,
  previewDataUrl: string,
  canvas: NodeCanvas,
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

async function loadPdfDocument(buffer: ArrayBuffer) {
  return pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise
}

async function pdfPageToReviewImage(
  file: File,
  pdf: pdfjsLib.PDFDocumentProxy,
  pageNumber: number
): Promise<ReviewImageInfo> {
  const page = await pdf.getPage(pageNumber)
  const viewport = page.getViewport({ scale: pdfRenderScale(AI_REVIEW_CONFIG.MAX_IMAGE_WIDTH) })
  const canvas = getDomSurface().createCanvas(viewport.width, viewport.height) as unknown as NodeCanvas
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Could not create canvas context for PDF rendering')

  await page.render({
    canvasContext: context as unknown as CanvasRenderingContext2D,
    viewport,
    canvas: canvas as unknown as HTMLCanvasElement,
  }).promise

  const resized = resizeCanvas(canvas, AI_REVIEW_CONFIG.MAX_IMAGE_WIDTH)
  return buildImageInfo(
    file,
    canvasToDataUrl(resized),
    resized,
    'pdf_page',
    pageNumber,
    pdf.numPages
  )
}

async function imageBufferToReviewImage(
  file: File,
  buffer: Buffer,
  pageNumber: number,
  totalPages: number
): Promise<ReviewImageInfo> {
  const { loadImage } = await import('canvas')
  const image = await loadImage(buffer)
  const canvas = getDomSurface().createCanvas(image.width, image.height) as unknown as NodeCanvas
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not create canvas for image')
  ctx.drawImage(image as unknown as CanvasImageSource, 0, 0)
  const resized = resizeCanvas(canvas, AI_REVIEW_CONFIG.MAX_IMAGE_WIDTH)
  return buildImageInfo(
    file,
    canvasToDataUrl(resized),
    resized,
    'image',
    pageNumber,
    totalPages
  )
}

async function fileFromPath(absolutePath: string, name: string, mimeType: string): Promise<File> {
  const buffer = await readFile(absolutePath)
  return new File([buffer], name, { type: mimeType })
}

function guessMime(fileName: string): string {
  const lower = fileName.toLowerCase()
  if (lower.endsWith('.pdf')) return 'application/pdf'
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.webp')) return 'image/webp'
  return 'image/jpeg'
}

export interface CaseDocumentInput {
  spec: EvalDocumentSpec & {
    absolutePath?: string
    absolutePagesDir?: string
  }
}

export async function loadCaseDocuments(
  inputs: CaseDocumentInput[]
): Promise<Array<{ id: string; name: string; file: File; pageImagePaths?: string[] }>> {
  const loaded: Array<{ id: string; name: string; file: File; pageImagePaths?: string[] }> = []

  for (const { spec } of inputs) {
    if (spec.absolutePagesDir && spec.pageFiles?.length) {
      const bytes = Buffer.from(MIN_JPEG_BASE64, 'base64')
      const placeholder = new File([bytes], spec.name, { type: 'application/pdf' })
      const pageImagePaths = spec.pageFiles.map((fileName) =>
        path.join(spec.absolutePagesDir!, fileName)
      )
      loaded.push({
        id: spec.id,
        name: spec.name,
        file: placeholder,
        pageImagePaths,
      })
      continue
    }

    if (!spec.absolutePath) {
      throw new Error(`Document ${spec.id} has no path or pagesDir`)
    }

    loaded.push({
      id: spec.id,
      name: spec.name,
      file: await fileFromPath(spec.absolutePath, spec.name, guessMime(spec.name)),
    })
  }

  return loaded
}

const pageImageCache = new Map<string, ReviewImageInfo[]>()

export function createNodeReviewImageRasterizer(
  caseDocuments: Array<{ id: string; name: string; file: File; pageImagePaths?: string[] }>
): ReviewImageRasterizer {
  const pagesByFileName = new Map(
    caseDocuments
      .filter((doc) => doc.pageImagePaths?.length)
      .map((doc) => [doc.name, doc.pageImagePaths!] as const)
  )

  return {
    async getReviewPageCount(file: File): Promise<number> {
      const preset = pagesByFileName.get(file.name)
      if (preset) return preset.length

      if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        const pdf = await loadPdfDocument(await file.arrayBuffer())
        return resolvePdfPagesToReview(pdf.numPages)
      }
      return 1
    },

    async fileToReviewImages(file: File, maxPages?: number): Promise<ReviewImageInfo[]> {
      const cacheKey = `${file.name}:${maxPages ?? 'all'}`
      const presetPaths = pagesByFileName.get(file.name)

      if (presetPaths) {
        if (pageImageCache.has(cacheKey)) return pageImageCache.get(cacheKey)!

        const totalPages = presetPaths.length
        const images: ReviewImageInfo[] = []
        for (let index = 0; index < presetPaths.length; index += 1) {
          const pageNumber = index + 1
          if (maxPages !== undefined && pageNumber > maxPages) break
          const buffer = await readFile(presetPaths[index])
          images.push(
            await imageBufferToReviewImage(file, buffer, pageNumber, totalPages)
          )
        }
        pageImageCache.set(cacheKey, images)
        return images
      }

      if (file.type.startsWith('image/') || /\.(jpe?g|png|webp)$/i.test(file.name)) {
        const buffer = Buffer.from(await file.arrayBuffer())
        return [await imageBufferToReviewImage(file, buffer, 1, 1)]
      }

      if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        const pdf = await loadPdfDocument(await file.arrayBuffer())
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

      throw new Error(`Unsupported file type for eval rasterizer: ${file.name}`)
    },
  }
}
