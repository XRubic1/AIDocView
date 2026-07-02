import { createCanvas, loadImage, type Canvas, type Image } from 'canvas'
import type { DomSurface } from '../../../src/platform/domSurface.js'

/** Node canvas backend for PDF rasterization and signature crop verification. */
export function createNodeDomSurface(): DomSurface {
  return {
    createCanvas(width, height) {
      const canvas = createCanvas(width, height)
      return canvas as unknown as DomSurface['createCanvas'] extends (
        w: number,
        h: number
      ) => infer R
        ? R
        : never
    },
    async loadImage(dataUrl: string) {
      const image = await loadImage(dataUrl)
      return image as unknown as Image
    },
    async createImageBitmap(blob: Blob) {
      const buffer = Buffer.from(await blob.arrayBuffer())
      const image = await loadImage(buffer)
      return {
        width: image.width,
        height: image.height,
        close() {
          /* no-op */
        },
      }
    },
  }
}

export type NodeCanvas = Canvas
