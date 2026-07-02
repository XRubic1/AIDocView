export interface CanvasSurface {
  width: number
  height: number
  getContext(type: '2d'): CanvasRenderingContext2D | null
  toDataURL(mimeType?: string, quality?: number): string
}

export interface ImageSurface {
  width: number
  height: number
}

export interface ImageBitmapSurface {
  width: number
  height: number
  close(): void
}

export interface DomSurface {
  createCanvas(width: number, height: number): CanvasSurface
  loadImage(dataUrl: string): Promise<ImageSurface>
  createImageBitmap(blob: Blob): Promise<ImageBitmapSurface>
}

function browserDomSurface(): DomSurface {
  return {
    createCanvas(width, height) {
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      return canvas
    },
    loadImage(dataUrl) {
      return new Promise((resolve, reject) => {
        const img = new Image()
        img.onload = () => resolve(img)
        img.onerror = () => reject(new Error('Failed to load image for crop'))
        img.src = dataUrl
      })
    },
    createImageBitmap(blob) {
      return createImageBitmap(blob)
    },
  }
}

let surface: DomSurface | undefined

export function setDomSurface(next: DomSurface): void {
  surface = next
}

export function getDomSurface(): DomSurface {
  if (!surface) {
    if (typeof document === 'undefined') {
      throw new Error('DOM surface is not configured (eval must call setDomSurface).')
    }
    surface = browserDomSurface()
  }
  return surface
}
